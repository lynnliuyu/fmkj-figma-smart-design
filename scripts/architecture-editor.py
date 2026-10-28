#!/usr/bin/env python3
"""Local-only draw.io editor; writes only the architecture document and its index."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
from datetime import datetime, timezone
import argparse
import base64
import hashlib
import json
import os
import secrets
import tempfile
import threading
import xml.etree.ElementTree as ET
import zlib

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs/architecture'
DIAGRAM = DOCS / 'system-map.drawio'
INDEX = DOCS / 'system-map.editable.registry.json'
ASSETS = ROOT / '.local/architecture-tools/drawio-source/src/main/webapp'
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
MAX_BYTES = 4 * 1024 * 1024


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
        if model.find('root') is None or len(model.findall('.//mxCell')) > 10000:
            raise ValueError('图页结构或大小不受支持')
    root.set('compressed', 'false')
    ET.indent(root, space='  ')
    data = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    if len(data) > MAX_BYTES:
        raise ValueError('文件超过 4 MiB')
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
    return dict(schemaVersion=1, document='system-map.drawio', savedAt=datetime.now(timezone.utc).isoformat(),
                interpretation='User-editable architecture intent. Status and code references are declarations, not an implementation audit.',
                pages=pages)


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp.write(data)
        name = temp.name
    os.replace(name, path)


class Handler(SimpleHTTPRequestHandler):
    def host_ok(self):
        return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'")
        super().end_headers()

    def json_response(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.host_ok():
            return self.send_error(403)
        route = urlsplit(self.path).path
        if route == '/api/diagram':
            with LOCK:
                data = DIAGRAM.read_bytes()
            return self.json_response(200, {'xml': data.decode(), 'revision': hashlib.sha256(data).hexdigest()})
        if route in ('/', '/editor.html', '/architecture-delta-zh.html'):
            data = (DOCS / 'editor.html').read_text().replace('__EDITOR_TOKEN__', TOKEN).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return super().do_GET()

    def translate_path(self, path):
        route = unquote(urlsplit(path).path)
        if route.startswith('/drawio/'):
            base, relative = ASSETS, route[len('/drawio/'):]
        else:
            base, relative = DOCS, route.lstrip('/')
        target = (base / relative).resolve()
        if not target.is_relative_to(base.resolve()):
            return str(DOCS / '__not_found__')
        return str(target)

    def do_POST(self):
        expected = f'http://127.0.0.1:{self.server.server_port}'
        if (not self.host_ok() or self.headers.get('Origin') != expected or
                not secrets.compare_digest(self.headers.get('X-Editor-Token', ''), TOKEN)):
            return self.json_response(403, {'error': '仅允许当前本机编辑页面保存'})
        if urlsplit(self.path).path != '/api/diagram':
            return self.send_error(404)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BYTES:
                return self.json_response(413, {'error': '文件超过大小限制'})
            payload = json.loads(self.rfile.read(length))
            root, data = normalize(payload['xml'])
            index = json.dumps(registry(root), ensure_ascii=False, indent=2).encode() + b'\n'
            with LOCK:
                previous = DIAGRAM.read_bytes()
                if payload.get('revision') != hashlib.sha256(previous).hexdigest():
                    return self.json_response(409, {'error': '项目文件已被其他窗口或 Agent 修改。请先下载当前编辑副本，再刷新对照；本次未覆盖文件。'})
                backup_dir = ROOT / '.local/architecture-editor/backups'
                backup_dir.mkdir(parents=True, exist_ok=True)
                stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
                (backup_dir / f'{stamp}.drawio').write_bytes(previous)
                # Write the derived index first; the .drawio remains authoritative.
                atomic_write(INDEX, index)
                atomic_write(DIAGRAM, data)
            return self.json_response(200, {'revision': hashlib.sha256(data).hexdigest(), 'savedAt': datetime.now().strftime('%H:%M:%S')})
        except (ValueError, KeyError, TypeError, ET.ParseError, zlib.error) as error:
            return self.json_response(400, {'error': '无法保存：' + str(error)})
        except OSError:
            return self.json_response(500, {'error': '文件写入失败，编辑内容仍在页面中，请下载副本后重试'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8767)
    args = parser.parse_args()
    if not (ASSETS / 'index.html').exists():
        raise SystemExit('缺少本机 draw.io 编辑器资源，安装步骤见 docs/architecture/README.md')
    if not DIAGRAM.exists():
        raise SystemExit('找不到 docs/architecture/system-map.drawio')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'中文可编辑架构图：http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
