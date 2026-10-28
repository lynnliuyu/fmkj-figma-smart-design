#!/usr/bin/env python3
"""可编辑流程图服务：本机直跑或容器运行，只读写自己数据目录里的流程图。

用法（本机，沿用原行为）：
    python3 scripts/architecture-editor-server.py
    python3 scripts/architecture-editor-server.py --port 8769
打开 http://127.0.0.1:8767/

用法（Docker / 其他项目复用）：
    framework 镜像见 docker/architecture-editor/，数据目录 /data 挂卷。

数据目录结构：
    /data/projects/<项目>/system-map.drawio                编辑主文件（唯一权威内容）
    /data/projects/<项目>/system-map.editable.registry.json 保存时自动生成的节点/连线清单
    /data/projects/<项目>/作品/                             可选：同项目的静态架构阅读版等
    /data/backups/<项目>/<时间戳>.drawio                    每次保存前的上一版

安全边界：
- 只绑定容器内 0.0.0.0（由 compose 限制成宿主机 127.0.0.1）；
- 未设置令牌 = 只读模式：能浏览、下载，不能保存或新建项目；
- 只绑本机时只读免令牌（页面令牌过期也能看图）；绑到网络地址时只读也要令牌；
- 保存必须同时带本页令牌 + 同源 Origin + 允许的 Host；
- 只写数据目录，不读取宿主机任何其他路径。
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from datetime import datetime, timezone
import argparse
import base64
import hashlib
import html
import json
import os
import re
import secrets
import tempfile
import threading
import xml.etree.ElementTree as ET
import zlib
from urllib.parse import parse_qs

MAX_BYTES = 8 * 1024 * 1024
MAX_PROJECTS = 40
PROJECT_NAME = re.compile(r'^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff_ .-]{0,47}$')
LOCK = threading.Lock()
# 页面令牌：/api/handoff（项目列表页）与启动参数 --handoff-token 共用。
# 有效期 7 天，并落盘在数据目录：容器重启后，已经打开的页面仍然能继续保存
# （重启会清空内存；以前令牌只存在内存里，重启后所有页面的保存都会被拒）。
HANDOFF_TTL = 7 * 24 * 3600
HANDOFF = {}  # token -> 过期时间（epoch 秒）
HANDOFF_FILE = None  # 由 main() 指向数据目录下的令牌文件；None 表示不落盘

# 由 main() 设置
DATA = Path('/data')
ASSETS = None
TOKEN_HASHES = []  # 主令牌只保存 SHA-256
ROOT_DIR = Path('.')
MIRROR = {}  # 项目名 -> 仓库内相对路径；保存成功后同步一份过去
# 只读浏览是否免令牌：只绑本机时为 True（令牌失效也能看图、下载），绑到网络时为 False。
READ_OPEN = True
ALLOWED_HOSTS = set()
PUBLIC_PREFIXES = ('/drawio/', '/architecture/styles/', '/architecture/assets/', '/assets/')


# ---------------------------------------------------------------------------
# .drawio 处理
# ---------------------------------------------------------------------------

def normalize(xml):
    if '<!DOCTYPE' in xml.upper() or '<!ENTITY' in xml.upper():
        raise ValueError('不支持包含 DTD 的文件')
    root = ET.fromstring(xml)
    if root.tag != 'mxfile' or not 1 <= len(root.findall('diagram')) <= 32:
        raise ValueError('需要包含 1–32 页的 draw.io 文件')
    for page in root.findall('diagram'):
        model = page.find('mxGraphModel')
        if model is None:
            raw = base64.b64decode(page.text or '', validate=True)
            decoder = zlib.decompressobj(-15)
            content = decoder.decompress(raw, MAX_BYTES + 1)
            if len(content) > MAX_BYTES or not decoder.eof:
                raise ValueError('图页解压后过大')
            decoded = unquote(content.decode())
            if '<!DOCTYPE' in decoded.upper() or '<!ENTITY' in decoded.upper():
                raise ValueError('不支持包含 DTD 的图页')
            model = ET.fromstring(decoded)
            if model.tag != 'mxGraphModel':
                raise ValueError('图页格式错误')
            page.text = None
            page.append(model)
        if model.find('root') is None or len(model.findall('.//mxCell')) > 20000:
            raise ValueError('图页结构或大小不受支持')
    root.set('compressed', 'false')
    ET.indent(root, space='  ')
    data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    if len(data) > MAX_BYTES:
        raise ValueError('文件超过 8 MiB')
    return root, data


def registry(root):
    pages = []
    for page in root.findall('diagram'):
        nodes, edges = [], []
        for obj in page.findall('./mxGraphModel/root/*'):
            cell = obj if obj.tag == 'mxCell' else obj.find('mxCell')
            if cell is not None and cell.get('vertex') == '1' and obj.get('id') not in ('title', 'subtitle', 'note'):
                entry = dict(obj.attrib)
                geometry = cell.find('mxGeometry')
                entry['geometry'] = dict(geometry.attrib) if geometry is not None else {}
                nodes.append(entry)
        for cell in page.findall('.//mxCell[@edge="1"]'):
            edges.append({k: cell.get(k, '') for k in ['id', 'source', 'target', 'value']})
        pages.append({'id': page.get('id'), 'name': page.get('name'), 'nodes': nodes, 'edges': edges})
    return dict(schemaVersion=1, document='system-map.drawio',
                savedAt=datetime.now(timezone.utc).isoformat(),
                interpretation='User-editable architecture intent. Status and code references are declarations, not an implementation audit.',
                pages=pages)


def load_handoff():
    """启动时读回未过期的页面令牌，让重启前打开的页面还能保存。"""
    global HANDOFF
    if not HANDOFF_FILE:
        return
    now = datetime.now().timestamp()
    try:
        stored = json.loads(Path(HANDOFF_FILE).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return
    if isinstance(stored, dict):
        HANDOFF = {token: expiry for token, expiry in stored.items()
                   if isinstance(expiry, (int, float)) and expiry > now}


def save_handoff():
    """把未过期的页面令牌写回数据目录；失败只影响重启后的续用，不影响当前保存。"""
    if not HANDOFF_FILE:
        return
    now = datetime.now().timestamp()
    live = {token: expiry for token, expiry in HANDOFF.items() if expiry > now}
    try:
        path = Path(HANDOFF_FILE)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(path.name + '.tmp')
        temp.write_text(json.dumps(live), encoding='utf-8')
        os.chmod(temp, 0o600)
        os.replace(temp, path)
    except OSError as error:
        print(f'页面令牌暂存失败（不影响本次使用）：{error}', flush=True)


def new_handoff():
    """生成页面令牌：只有拿到它的浏览器页面能用它保存；有效期见 HANDOFF_TTL。"""
    now = datetime.now().timestamp()
    with LOCK:
        for key in [k for k, expiry in HANDOFF.items() if expiry < now]:
            HANDOFF.pop(key, None)
        token = secrets.token_urlsafe(32)
        HANDOFF[token] = now + HANDOFF_TTL
    save_handoff()
    return token


def token_ok(value):
    """保存校验：主令牌（只存哈希）或未过期的一次性页面令牌。"""
    if not value:
        return False
    if TOKEN_HASHES:
        digest = hashlib.sha256(value.encode()).hexdigest()
        if any(secrets.compare_digest(digest, known) for known in TOKEN_HASHES):
            return True
    expiry = HANDOFF.get(value)
    return expiry is not None and expiry > datetime.now().timestamp()


def session_token(query):
    """页面注入用的令牌：先看一次性令牌，没有则退回主令牌。"""
    if token_ok(query.get('t', '')):
        return query['t']
    return ''


def mirror_target(project):
    """仓库里的架构文档副本（只读镜像）。由环境变量或数据目录下的 sync.json 指定。

    目的：Docker 里的编辑主文件在数据目录，仓库里的 docs/architecture/system-map.drawio 是 Agent 读取的 Git 版本；
    保存成功后再复制过去，Agent 就不必换路径。失败不影响保存本身。
    """
    if not MIRROR:
        return None
    target = (ROOT_DIR / MIRROR.get(project, '')).resolve() if MIRROR.get(project) else None
    if target is None or not target.is_relative_to(ROOT_DIR.resolve()):
        return None
    return target


def mirror_index_target(document_target):
    """派生清单的镜像路径：与 .drawio 同名的 .editable.registry.json。

    之前只镜像 .drawio，仓库里的 registry 副本会一直停在旧版本，而 pnpm arch:read 读的
    是数据目录那份，两边内容对不上；这里让两者一起同步。
    """
    if document_target is None:
        return None
    name = document_target.name
    if name.endswith('.drawio'):
        return document_target.with_name(name[: -len('.drawio')] + '.editable.registry.json')
    return document_target.with_name(name + '.editable.registry.json')


def rebuild_registry(project):
    """按编辑主文件重建派生清单，并同步仓库副本；不修改 .drawio 本身。

    给 Agent 和离线编辑用：直接改了主文件的 XML（例如批量改 status/notes）之后，
    不需要打开浏览器保存一次也能让清单与镜像跟上。
    """
    folder = project_dir(project)
    if folder is None:
        raise SystemExit(f'项目不存在：{project}')
    document = folder / 'system-map.drawio'
    if not document.exists():
        raise SystemExit(f'找不到编辑主文件：{document}')
    root, data = normalize(document.read_text(encoding='utf-8'))
    index = json.dumps(registry(root), ensure_ascii=False, indent=2).encode() + b'\n'
    target = folder / 'system-map.editable.registry.json'
    atomic_write(target, index)
    print(f'已重建派生清单：{target}')
    mirror = mirror_target(project)
    if mirror is not None:
        # 主文件是权威：离线改过主文件后，仓库副本也一起跟上，否则两边的图不一致。
        atomic_write(mirror, data)
        print(f'已同步仓库副本：{mirror}')
    mirror_index = mirror_index_target(mirror)
    if mirror_index is not None:
        atomic_write(mirror_index, index)
        print(f'已同步仓库副本：{mirror_index}')
    return 0


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp.write(data)
        name = temp.name
    os.replace(name, path)


# ---------------------------------------------------------------------------
# 项目目录
# ---------------------------------------------------------------------------

def projects():
    """返回 [{'name','doc','title','mtime'}]，按名称排序；无数据目录时返回空表。"""
    base = DATA / 'projects'
    if not base.is_dir():
        return []
    found = []
    for child in sorted(base.iterdir()):
        if not child.is_dir() or child.name.startswith('.'):
            continue
        doc = child / 'system-map.drawio'
        if not doc.is_file():
            continue
        try:
            stat = doc.stat()
        except OSError:
            continue
        found.append({'name': child.name, 'doc': doc, 'title': title_of(doc),
                      'mtime': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M'),
                      'size': stat.st_size})
    return found[:MAX_PROJECTS]


def title_of(doc):
    try:
        root = ET.fromstring(doc.read_bytes())
        return root.get('host') or doc.parent.name
    except (ET.ParseError, OSError):
        return doc.parent.name


def project_dir(name):
    if not name or not PROJECT_NAME.match(name) or name in ('.', '..'):
        return None
    base = (DATA / 'projects').resolve()
    target = (base / name).resolve()
    if not target.is_relative_to(base) or target == base:
        return None
    return target if target.is_dir() else None


def landing_page(selected=None, offers=None):
    """项目列表。offers 为 [(项目名, 页面令牌)]：每行“编辑”链接带一次性令牌，供页面注入使用。"""
    offers = dict(offers or {})
    rows = []
    for item in projects():
        name = html.escape(item['name'])
        token = offers.get(item['name'], '')
        link = f"/architecture?project={quote(item['name'])}" + (f"&t={token}" if token else '')
        rows.append(
            f'<tr{" class=selected" if item["name"] == selected else ""}>'
            f'<td><a href="{link}">{name}</a></td>'
            f'<td>{html.escape(item["title"])}</td>'
            f'<td>{item["mtime"]}</td>'
            f'<td><a href="{link}">编辑</a> · <a href="/architecture/{quote(item["name"])}/">阅读版</a>'
            f' · <a href="/architecture/{quote(item["name"])}/system-map.drawio" download>下载</a></td></tr>')
    if not rows:
        rows.append('<tr><td colspan="4" class="empty">还没有流程图。把 .drawio 文件放进数据目录的 '
                    '<code>projects/&lt;项目名&gt;/system-map.drawio</code>，刷新本页即可编辑；'
                    '也可以在下方新建。</td></tr>')
    return f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>流程图工具 · 项目列表</title>
<style>body{{font:14px/1.6 'PingFang SC','Microsoft YaHei',system-ui,sans-serif;color:#2d3142;background:#f5f5f5;margin:0;padding:24px}}
main{{max-width:960px;margin:0 auto}}h1{{font-size:20px;margin:0 0 4px}}p.hint{{color:#4f5d75;font-size:12px;margin:0 0 20px}}
table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d3d5dc}}th,td{{padding:8px 12px;text-align:left;border-bottom:1px solid #e8e9ee;vertical-align:top}}
th{{background:#f0f1f5;font-weight:600;font-size:12px;color:#4f5d75}}tr.selected{{background:#dbe5f6}}td.empty{{color:#4f5d75}}
a{{color:#2e5aa8;text-underline-offset:3px}}a:hover{{color:#173a79}}code{{background:#eceef3;padding:1px 4px;border-radius:3px}}
form{{margin-top:20px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}}input,button{{font:inherit;padding:6px 10px;border:1px solid #d3d5dc;border-radius:4px;background:#fff}}
button{{background:#2e5aa8;border-color:#2e5aa8;color:#fff;cursor:pointer}}button:hover{{background:#173a79}}</style></head>
<body><main><h1>流程图工具</h1>
<p class="hint">本页只在本机提供：编辑 draw.io 流程图并写回数据目录。每个项目一个文件夹，保存前自动备份上一版。</p>
<table><thead><tr><th>项目</th><th>标题</th><th>最后保存</th><th>操作</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<form method="post" action="/api/projects"><label>新建空流程图项目 <input name="name" required maxlength="48" placeholder="例如 我的新项目"></label>
<button type="submit">新建</button></form>
</main></body></html>'''.encode()


BLANK_DRAWIO = '''<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="{host}" compressed="false" pages="1">
  <diagram id="blank" name="流程图">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="start" value="开始" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dbe5f6;strokeColor=#2e5aa8;" vertex="1" parent="1">
          <mxGeometry x="480" y="120" width="160" height="60" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
'''


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    server_version = 'ArchitectureEditor/1.0'
    sys_version = ''

    # -- 通用 -------------------------------------------------------------
    def host_ok(self):
        return bool(self.allowed_name(self.headers.get('Host', '')))

    @staticmethod
    def allowed_name(value):
        """完整 host:port 或只写主机名（启动参数 --allow-host 允许只写主机名）。"""
        for allowed in ALLOWED_HOSTS:
            name, _, port = allowed.rpartition(':')
            if value == allowed or (not port and value.split(':', 1)[0] == allowed):
                return True
        return False

    def origin_ok(self, origin):
        """Origin 的主机名必须在白名单里；端口须是监听端口或映射端口之一。

        容器里监听 8767、宿主机映射成 18767 时浏览器 Host 是 `127.0.0.1:18767`，
        不能把容器里的端口号硬编码当成唯一合法值；反过来也不允许任意端口。
        表单提交可能带不带 `http://` 前缀，两种都要识别。
        """
        if not origin:
            return False
        host = origin.split('//', 1)[-1].rstrip('/')
        if any(':' not in h for h in ALLOWED_HOSTS):
            # 只写了主机名（例如反代域名 diagram.example.com）：匹配主机名，端口不限。
            return host.split(':', 1)[0] in ALLOWED_HOSTS or host in ALLOWED_HOSTS
        hostname, _, port = host.rpartition(':')
        if not hostname or not port.isdigit():
            return False
        return any(h.rsplit(':', 1)[0] == hostname and h.rsplit(':', 1)[1] == port
                   for h in ALLOWED_HOSTS)

    def public(self):
        """静态资源与编辑器页面：只读，带不带令牌都能访问。

        页面本身只用查询参数里的一次性令牌做保存；没带令牌就是只读模式。
        """
        route = unquote(urlsplit(self.path).path)
        return (route in ('/', '/projects', '/editor', '/editor.html', '/architecture', '/architecture-delta-zh.html')
                or route.startswith(PUBLIC_PREFIXES))

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy',
                         "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                         "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
                         "connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'")
        super().end_headers()

    def json_response(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def bytes_response(self, data, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def drop_public_prefix(self, route):
        if route.startswith('/architecture/'):
            return route[len('/architecture/'):]
        return route

    # -- GET --------------------------------------------------------------
    def do_GET(self):
        if not self.host_ok():
            return self.send_error(403)
        # 读取：本机部署免令牌（页面令牌失效、或只拿到链接时仍能看图与下载）；
        # 绑定到网络的部署仍要求令牌。写入永远要求令牌（见 check_write）。
        if not self.public() and not READ_OPEN and not token_ok(self.headers.get('X-Editor-Token', '')):
            # 接口用 JSON 回原因，页面才能显示人话；（页面的读取失败提示见 editor.html）
            if urlsplit(self.path).path.startswith('/api/'):
                return self.json_response(403, {'error': '编辑凭证已过期（编辑器重启过，或页面开得太久）。'
                                                         '请回到项目列表重新点「编辑」进入。'})
            return self.send_error(403)
        route = self.drop_public_prefix(unquote(urlsplit(self.path).path))
        if route in ('', '/', '/projects'):
            offers = [(item['name'], new_handoff()) for item in projects()] if TOKEN_HASHES else []
            return self.bytes_response(landing_page(offers=offers), 'text/html; charset=utf-8')
        if route in ('/editor', '/editor.html', '/architecture', '/architecture-delta-zh.html'):
            page = (Path(__file__).resolve().parent.parent / 'docs/architecture/editor.html').read_text()
            query = self.params()
            project = query.get('project', '')
            if project_dir(project) is None:
                project = ''
            session = session_token(query)
            if session:
                page = page.replace('__EDITOR_TOKEN__', session)
            else:
                page = page.replace("const token='__EDITOR_TOKEN__';", "const token='';")
            head = f'<script>window.__PROJECT__={json.dumps(project)}</script>'
            page = page.replace('<script>\nconst frame=', head + '\n<script>\nconst frame=', 1)
            return self.bytes_response(page.encode(), 'text/html; charset=utf-8')
        if route == '/api/projects':
            return self.json_response(200, {'projects': [
                {k: item[k] for k in ('name', 'title', 'mtime', 'size')} for item in projects()]})
        if route == '/api/diagram':
            folder = project_dir(self.params().get('project'))
            if folder is None:
                return self.json_response(404, {'error': '项目不存在'})
            try:
                data = (folder / 'system-map.drawio').read_bytes()
            except OSError:
                return self.json_response(404, {'error': '该项目还没有 system-map.drawio'})
            return self.json_response(200, {'project': folder.name, 'xml': data.decode(),
                                            'revision': hashlib.sha256(data).hexdigest()})
        return super().do_GET()

    def translate_path(self, path):
        route = unquote(urlsplit(path).path)
        if route.startswith('/drawio/'):
            base, relative = ASSETS, route[len('/drawio/'):]
        else:
            route = self.drop_public_prefix(route)
            parts = route.lstrip('/').split('/', 1)
            name = parts[0]
            if name in ('', 'editor', 'editor.html', 'api', 'architecture-delta-zh.html', 'projects',
                        'styles', 'assets') or name.startswith('assets-'):
                return str(ASSETS / '__not_found__')
            folder = project_dir(name)
            if folder is None:
                return str(ASSETS / '__not_found__')
            base, relative = folder, parts[1] if len(parts) > 1 else 'index.html'
        target = (base / relative).resolve()
        if not target.is_relative_to(base.resolve()):
            return str(ASSETS / '__not_found__')
        return str(target)

    # -- POST -------------------------------------------------------------
    def check_write(self):
        """写操作必须同源 + 令牌。通过返回空字符串，否则返回可以直接显示给用户的原因。"""
        if not self.host_ok():
            print('拒绝写入：Host 不在白名单', self.headers.get('Host'), flush=True)
            return '这个地址不在允许名单里，请从项目列表页面进入。'
        if not self.origin_ok(self.headers.get('Origin', '')):
            print('拒绝写入：Origin 不在允许范围', self.headers.get('Origin'), flush=True)
            return '页面来源和编辑器地址不一致，请重新从项目列表进入。'
        if not TOKEN_HASHES:
            print('拒绝写入：服务未启用令牌，只允许只读浏览', flush=True)
            return '编辑器没有启用编辑令牌，当前只能浏览和下载。'
        if not token_ok(self.headers.get('X-Editor-Token', '')):
            print('拒绝写入：页面令牌不匹配或已过期（请重新打开项目列表）', flush=True)
            return ('编辑凭证已过期（编辑器重启过，或页面开得太久）。'
                    '请回到项目列表重新点「编辑」进入；当前修改先点「下载副本」保留。')
        return ''

    def drain_body(self):
        """回错误前先把请求体读完。

        否则服务器在浏览器还在上传时就断开连接，浏览器只会显示笼统的
        “Failed to fetch”，用户看不到真正的原因。
        """
        try:
            length = int(self.headers.get('Content-Length', '0') or '0')
        except ValueError:
            return
        remaining = min(max(length, 0), MAX_BYTES)
        while remaining > 0:
            chunk = self.rfile.read(min(65536, remaining))
            if not chunk:
                return
            remaining -= len(chunk)

    def read_payload(self):
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 < length <= MAX_BYTES:
            raise ValueError('请求体为空或超过大小限制')
        return json.loads(self.rfile.read(length))

    def do_POST(self):
        route = self.drop_public_prefix(unquote(urlsplit(self.path).path))
        reason = self.check_write()
        if reason:
            self.drain_body()
            return self.json_response(403, {'error': reason})
        if route == '/api/projects':
            return self.create_project()
        if route == '/api/handoff':
            try:
                payload = self.read_payload()
            except (ValueError, UnicodeDecodeError) as error:
                return self.json_response(400, {'error': str(error)})
            if project_dir(payload.get('project')) is None:
                return self.json_response(404, {'error': '项目不存在'})
            return self.json_response(200, {'token': new_handoff(), 'project': payload['project']})
        if route != '/api/diagram':
            return self.send_error(404)
        try:
            payload = self.read_payload()
            folder = project_dir(payload.get('project'))
            if folder is None:
                return self.json_response(404, {'error': '项目不存在'})
            root, data = normalize(payload['xml'])
            index = json.dumps(registry(root), ensure_ascii=False, indent=2).encode() + b'\n'
            doc = folder / 'system-map.drawio'
            with LOCK:
                previous = doc.read_bytes() if doc.exists() else b''
                if payload.get('revision') not in (None, '') and \
                        payload.get('revision') != hashlib.sha256(previous).hexdigest():
                    return self.json_response(409, {'error': '项目文件已被其他窗口或 Agent 修改。'
                                                    '请先下载当前编辑副本，再刷新对照；本次未覆盖文件。'})
                if previous:
                    backup_dir = DATA / 'backups' / folder.name
                    backup_dir.mkdir(parents=True, exist_ok=True)
                    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
                    (backup_dir / f'{stamp}.drawio').write_bytes(previous)
                # 先写派生清单，再写 .drawio：.drawio 始终是唯一权威内容。
                atomic_write(folder / 'system-map.editable.registry.json', index)
                atomic_write(doc, data)
            mirror = mirror_target(folder.name)
            mirrored = ''
            mirrored_index = ''
            if mirror is not None:
                try:
                    atomic_write(mirror, data)
                    mirrored = str(mirror)
                    index_mirror = mirror_index_target(mirror)
                    if index_mirror is not None:
                        atomic_write(index_mirror, index)
                        mirrored_index = str(index_mirror)
                except OSError as error:
                    print('仓库副本同步失败：', mirror, error, flush=True)
            return self.json_response(200, {'revision': hashlib.sha256(data).hexdigest(),
                                            'mirrored': mirrored,
                                            'mirroredIndex': mirrored_index,
                                            'savedAt': datetime.now().strftime('%H:%M:%S')})
        except (ValueError, KeyError, TypeError, ET.ParseError, zlib.error) as error:
            return self.json_response(400, {'error': '无法保存：' + str(error)})
        except OSError:
            return self.json_response(500, {'error': '文件写入失败，编辑内容仍在页面中，请下载副本后重试'})

    def create_project(self):
        try:
            if (self.headers.get('Content-Type') or '').startswith('application/x-www-form-urlencoded'):
                body = self.rfile.read(int(self.headers.get('Content-Length', '0'))).decode()
                name = (parse_qs(body).get('name') or [''])[0].strip()
            else:
                name = (self.read_payload().get('name') or '').strip()
        except (ValueError, UnicodeDecodeError) as error:
            return self.json_response(400, {'error': str(error)})
        if not PROJECT_NAME.match(name):
            return self.json_response(400, {'error': '项目名需为 1–48 个中英文、数字、空格、点、横线或下划线'})
        folder = DATA / 'projects' / name
        doc = folder / 'system-map.drawio'
        with LOCK:
            if doc.exists():
                return self.json_response(409, {'error': '同名项目已存在'})
            atomic_write(doc, (BLANK_DRAWIO.format(host=html.escape(name))).encode())
        wants_html = 'text/html' in (self.headers.get('Accept') or '')
        if wants_html:
            self.send_response(303)
            self.send_header('Location', '/architecture?project=' + quote(name))
            self.end_headers()
            return
        return self.json_response(201, {'project': name})

    def params(self):
        return {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}

    def log_message(self, fmt, *args):
        path = args[0] if args else ''
        if isinstance(path, str) and any(s in path for s in ('/api/', '/editor', 'GET / ')):
            print(f'{self.address_string()} {path}', flush=True)


def main():
    global DATA, ASSETS, ALLOWED_HOSTS, ROOT_DIR, MIRROR, READ_OPEN
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--bind', default='127.0.0.1', help='监听地址；容器内用 0.0.0.0')
    parser.add_argument('--data-dir', default=str(DATA))
    parser.add_argument('--drawio-assets', default=str(ASSETS) if ASSETS else '')
    parser.add_argument('--token-hash', default=os.environ.get('ARCH_EDITOR_TOKEN_SHA256', ''),
                        help='主令牌的 SHA-256 十六进制（不传明文：容器启动日志会记录命令行）')
    parser.add_argument('--read-open', action='store_true',
                        help='只读浏览免令牌（只绑本机时用；局域网部署不要开）')
    parser.add_argument('--read-token-only', action='store_true',
                        help='只读也要求令牌（绑定到网络地址时用）')
    parser.add_argument('--mirror', action='append', default=[], metavar='项目=相对路径',
                        help='保存成功后同步一份到仓库内路径，如 繁梦空间设计站=docs/architecture/system-map.drawio')
    parser.add_argument('--rebuild-registry', default='', metavar='项目',
                        help='按编辑主文件重建节点清单并同步仓库副本，然后退出（不改 .drawio）')
    parser.add_argument('--root', default='',
                        help='仓库根目录，--mirror 的相对路径基于它')
    parser.add_argument('--token-file', default='',
                        help='主令牌哈希文件（每行一个 sha256，容器里默认 /data/.editor-token.sha256）')
    parser.add_argument('--allow-host', action='append', default=[],
                        help='允许的 Host（host:port，或只写主机名表示任意端口），可重复')
    parser.add_argument('--allow-port-range', default=None, metavar='MIN-MAX',
                        help='端口映射时把宿主端口也加进 Host 白名单（如 18767-8767）')
    parser.add_argument('--handoff-token', action='append', default=[],
                        help='启动时预置一次性页面令牌（容器里只放哈希文件，不把主令牌写进页面）')
    args = parser.parse_args()

    DATA = Path(args.data_dir)
    ASSETS = Path(args.drawio_assets) if args.drawio_assets else None
    global ROOT_DIR, MIRROR, HANDOFF_FILE
    HANDOFF_FILE = DATA / '.editor-handoff.json'
    # 默认：只绑本机时开放只读，绑到其他地址时必须带令牌。
    loopback = args.bind in ('127.0.0.1', 'localhost', '::1')
    READ_OPEN = (args.read_open or loopback) and not args.read_token_only
    ROOT_DIR = Path(args.root).resolve() if args.root else Path('.')
    MIRROR = dict(item.split('=', 1) for item in args.mirror if '=' in item)

    # 维护命令：只重建派生清单与镜像，不起服务。
    if args.rebuild_registry:
        raise SystemExit(rebuild_registry(args.rebuild_registry) or 0)

    TOKEN_HASHES.clear()
    if args.token_hash:
        value = args.token_hash.strip().lower()
        if not re.fullmatch(r'[0-9a-f]{64}', value):
            raise SystemExit('--token-hash 需要 64 位十六进制 SHA-256')
        TOKEN_HASHES.append(value)
    if args.token_file:
        path = Path(args.token_file)
        if not path.exists():
            raise SystemExit(f'令牌文件不存在：{path}（先在宿主机执行 docker/architecture-editor/set-token.sh）')
        for line in path.read_text().splitlines():
            value = line.strip().lower()
            if not value or value.startswith('#'):
                continue
            if not re.fullmatch(r'[0-9a-f]{64}', value):
                raise SystemExit(f'令牌文件格式错误：{path}（每行应为 SHA-256 十六进制）')
            TOKEN_HASHES.append(value)
        if not TOKEN_HASHES:
            raise SystemExit(f'令牌文件为空：{path}')
    # Host 白名单：容器里监听 8767、宿主机映射成别的端口时，浏览器带的是宿主机 host:port，
    # 所以默认同时接受映射端口与容器端口。
    hosts = set(args.allow_host)
    if not hosts:
        names = ['127.0.0.1', 'localhost'] + (['0.0.0.0'] if args.bind == '0.0.0.0' else [])
        ports = {args.port}
        if args.allow_port_range:
            low, _, high = args.allow_port_range.partition('-')
            ports |= set(range(int(low), int(high or low) + 1))
        hosts = {f'{name}:{port}' for name in names for port in ports}
    ALLOWED_HOSTS = hosts

    for handoff in args.handoff_token:
        HANDOFF[handoff] = datetime.now().timestamp() + HANDOFF_TTL
    load_handoff()          # 重启前发出去的页面令牌继续有效（7 天内）
    save_handoff()          # 顺手清掉已过期条目

    if ASSETS is None or not (ASSETS / 'index.html').exists():
        raise SystemExit('缺少 draw.io 编辑器资源，安装步骤见 docs/architecture/README.md')
    if not (DATA / 'projects').is_dir():
        (DATA / 'projects').mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer((args.bind, args.port), Handler)
    server.daemon_threads = True
    print(f'流程图工具：http://127.0.0.1:{server.server_port}/  （数据目录 {DATA}；'
          f'只读浏览{"免令牌" if READ_OPEN else "需要令牌"}，写入始终需要令牌）', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == '__main__':
    main()
