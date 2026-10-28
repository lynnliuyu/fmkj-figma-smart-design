#!/usr/bin/env python3
"""生成“总关系图”页：把 11 张分图收拢成一张总览，放到流程图最前面。

用途：分图各说一条线，总图回答“它们怎么串起来、谁影响谁”。
- 中间一条主线：客户需求 → 设计布点 → 报价 → 固定版本交付；
- 上下两侧是支撑线（账号/产品/CAD/数据保存）与保障线（部署/更新/同步/备份），用虚线连回主线；
- 每个方框标注对应分图页名和主要代码入口，便于 Agent 定位后再读分图；
- 虚线框+`planned` 表示规划，与现有代码区分（与其它页同一约定）。

只改“总关系图”这一页，其它页原样保留；写回前在 .local/architecture-editor/backups/ 留一份旧文件。
再次运行会替换旧的“总关系图”页，方便跟着分图一起演进。

用法：
    python3 scripts/build-architecture-overview.py            # 写回数据目录里的主文件
    python3 scripts/build-architecture-overview.py --dry-run  # 只看会生成什么，不写文件

写完请在 Docker 编辑器里打开 http://127.0.0.1:8767/ 点“保存到项目”，或直接运行
    node scripts/architecture-graph.mjs --registry <数据目录>/projects/<项目>/system-map.drawio
验证节点与连线都能被 Agent 读到。
"""
from pathlib import Path
from datetime import datetime
from xml.sax.saxutils import escape
import argparse
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
PAGE_NAME = '总关系图'
EVIDENCE_AS_OF = datetime.now().strftime('%Y-%m-%d')

# 配色与现有页一致：现有=白底实线，规划=浅底虚线，主线强调=蓝。
CURRENT = 'strokeColor=#647188;fillColor=#ffffff;'
PLANNED = 'strokeColor=#9c3d20;fillColor=#fdf6f2;dashed=1;'
ACCENT = 'strokeColor=#2e5aa8;fillColor=#dbe5f6;'
MUTED = 'strokeColor=#94a3b8;fillColor=#f8fafc;'

FONT = 'fontFamily=PingFang SC;fontColor=#2d3142;'
ATTR_ESCAPES = {'"': '&quot;'}  # draw.io 属性里必须转义的字符


def label(title, desc='', size=19, desc_size=14):
    html = f'<div style="font-size:{size}px;font-weight:600">{escape(title)}</div>'
    if desc:
        html += f'<div style="font-size:{desc_size}px;line-height:1.45;margin-top:7px">{escape(desc)}</div>'
    return html


# (id, 标题, 描述, x, y, w, h, 状态, 代码, 分图页, 形状)
NODES = [
    # ── 主线：现有业务 ────────────────────────────────────────────────
    ('OV-START', '收到客户需求', '项目、户型、楼层资料', 60, 360, 220, 86, 'current-workflow',
     '', '业务流程图', 'rounded=1;arcSize=50'),
    ('OV-DESIGN', '设计布点', '选型、布点、场景与报价预览', 340, 360, 220, 86, 'current-workflow',
     'lib/point-map-quote-refresh.ts', '业务流程图 / 点位设计与保存', 'rounded=1;arcSize=5'),
    ('OV-QUOTE', '报价保存', '独立保存、来源行联动删除', 620, 360, 220, 86, 'current-workflow',
     'lib/quote-save.ts', '报价保存与固定交付', 'rounded=1;arcSize=5'),
    ('OV-FREEZE', '固定 V 版本', '交付检查通过后生成', 900, 360, 220, 86, 'current-workflow',
     'lib/project-delivery-service.ts', '报价保存与固定交付', 'rounded=1;arcSize=5'),
    ('OV-END', '导出并交付', '逐页检查实际文件', 1180, 360, 220, 86, 'current-workflow',
     'lib/project-delivery-client.ts', '业务流程图', 'rounded=1;arcSize=50'),
    # ── 支撑线：每条业务都经过 ────────────────────────────────────────
    ('OV-AUTH', '账号与项目权限', '登录、业务空间隔离', 60, 205, 220, 76, 'current-workflow',
     'lib/account-team-service.ts', '账号登录与项目访问', 'rounded=1;arcSize=5'),
    ('OV-CATALOG', '产品与选型', 'SKU 资料、点位选型', 340, 205, 220, 76, 'current-workflow',
     'lib/product-selection.ts', '产品维护与点位选型', 'rounded=1;arcSize=5'),
    ('OV-DATA', '数据与文件保存', '权限/版本校验后写入', 620, 205, 220, 76, 'current-workflow',
     'lib/*-service.ts', '业务数据与文件保存', 'rounded=1;arcSize=5'),
    ('OV-CAD', 'CAD 上传导出', '受限队列、人工复核', 900, 205, 220, 76, 'current-workflow',
     'scripts/cad-export-server.mjs', 'CAD 上传、导出与复核', 'rounded=1;arcSize=5'),
    # ── 保障线：目标部署 ─────────────────────────────────────────────
    ('OV-DEPLOY', '本地与线上部署', '本地设备版已真机验收；线上托管待实施', 620, 540, 220, 76, 'current-workflow',
     'docker-compose.appliance.yml', '线上与本地部署交付', 'rounded=1;arcSize=5'),
    ('OV-UPDATE', '软件检查更新', '每日检查只提醒；更新仍由管理员在设备上手动执行', 900, 540, 220, 76, 'current-workflow',
     'scripts/deploy/update-local.mjs;scripts/deploy/check-update.mjs', '软件检查与更新', 'rounded=1;arcSize=5'),
    ('OV-SYNC', '官方产品同步', '表格导入与服务器定时同步已实现；验签与增量游标待补', 1180, 540, 220, 76, 'current-workflow',
     'lib/catalog-sync.ts;lib/product-import.ts', '官方产品资料同步', 'rounded=1;arcSize=5'),
    ('OV-BACKUP', '备份与恢复', '宿主机备份 + 客户网页自助导出 / 还原', 1460, 540, 220, 76, 'current-workflow',
     'scripts/deploy/backup-local.mjs;lib/backup-service.ts', '业务备份与恢复', 'rounded=1;arcSize=5'),
]

# (id, source, target, 文字, 是否规划, 颜色, 走向)
# 走向：down=从上方方框竖直落到主线；up=从下方方框竖直连到主线；side=从左到右横连
EDGES = [
    ('ov-e-main-1', 'OV-START', 'OV-DESIGN', '', False, '#647188', 'side'),
    ('ov-e-main-2', 'OV-DESIGN', 'OV-QUOTE', '', False, '#647188', 'side'),
    ('ov-e-main-3', 'OV-QUOTE', 'OV-FREEZE', '', False, '#647188', 'side'),
    ('ov-e-main-4', 'OV-FREEZE', 'OV-END', '', False, '#647188', 'side'),
    ('ov-e-auth', 'OV-AUTH', 'OV-START', '', False, '#94a3b8', 'down'),
    ('ov-e-catalog', 'OV-CATALOG', 'OV-DESIGN', '选型依据', False, '#94a3b8', 'down'),
    ('ov-e-data', 'OV-DATA', 'OV-QUOTE', '保存落库', False, '#94a3b8', 'down'),
    ('ov-e-cad', 'OV-CAD', 'OV-FREEZE', '底图导入', False, '#94a3b8', 'down'),
    ('ov-e-deploy', 'OV-DEPLOY', 'OV-QUOTE', '', False, '#94a3b8', 'up'),
    ('ov-e-update', 'OV-DEPLOY', 'OV-UPDATE', '', False, '#94a3b8', 'side'),
    ('ov-e-sync', 'OV-UPDATE', 'OV-SYNC', '', True, '#9c3d20', 'side'),
    ('ov-e-backup', 'OV-SYNC', 'OV-BACKUP', '', False, '#94a3b8', 'side'),
]

TITLE = ('从客户需求到交付：总关系', '上方支撑线贯穿每条业务；下方保障线为部署、更新、同步与备份。实线=已实现（含真机验证），虚线=规划。'
                                  '每个方框标注对应分图页，点进去看细节。')


def obj_xml(node_id, title, desc, x, y, w, h, status, code, pages, shape):
    planned = status == 'planned'
    fill = PLANNED if planned else CURRENT
    label_html = label(title, desc, size=18, desc_size=13)
    page_hint = f'分图：{pages}'
    props = {
        'moduleId': node_id,
        'title': title,
        'description': desc,
        'status': status,
        'code': code,
        'rules': '',
        'evidenceAsOf': EVIDENCE_AS_OF,
        'notes': page_hint,
        'id': node_id,
        'label': label_html,
    }
    # 属性里的引号必须转义，否则 XML 不合法。
    attrs = ' '.join(f'{k}="{escape(str(v), ATTR_ESCAPES)}"' for k, v in props.items())
    style = (f'{shape};html=1;whiteSpace=wrap;align=center;verticalAlign=middle;'
             f'spacing=10;{FONT}strokeWidth=1.3;{fill}')
    return f'''<object {attrs}>
  <mxCell style="{style}" vertex="1" parent="1">
    <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />
  </mxCell>
</object>'''


def edge_xml(edge_id, source, target, text, planned, color, direction='side'):
    dashed = 'dashed=1;' if planned else ''
    terminal = {
        'down': 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;',
        'up': 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;',
        'side': 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;',
    }[direction]
    # 竖直连线不用 orthogonalEdgeStyle，否则 draw.io 会为避让方框绕出折线；直线更清楚。
    routing = '' if direction in ('down', 'up') else 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;'
    style = (f'{routing}html=1;'
             f'endArrow=block;endFill=1;strokeColor={color};strokeWidth=1.5;{dashed}'
             'fontColor=#4f5d75;fontSize=14;labelBackgroundColor=#f5f5f5;fontFamily=PingFang SC;'
             + terminal)
    return f'''<mxCell id="{edge_id}" edge="1" parent="1" source="{source}" target="{target}" style="{style}" value="{escape(text)}">
  <mxGeometry relative="1" as="geometry" />
</mxCell>'''


def legend_xml():
    items = [
        ('现有代码流程', CURRENT, False),
        ('规划（尚待实施与验收）', PLANNED, False),
        ('支撑 / 保障关系', 'strokeColor=#94a3b8;fillColor=none;', False),
    ]
    cells = []
    x = 60
    for index, (text, fill, _) in enumerate(items):
        cid = f'ov-legend-{index}'
        cells.append(f'''<mxCell id="{cid}-box" value="" style="rounded=1;whiteSpace=wrap;html=1;{fill}strokeWidth=1.3;" vertex="1" parent="1">
  <mxGeometry x="{x}" y="780" width="34" height="22" as="geometry" />
</mxCell>
<mxCell id="{cid}-text" value="{escape(text)}" style="text;html=1;align=left;verticalAlign=middle;{FONT}fontSize=15;" vertex="1" parent="1">
  <mxGeometry x="{x + 42}" y="780" width="230" height="22" as="geometry" />
</mxCell>''')
        x += 300
    return cells


def overview_page_xml():
    title = f'''<mxCell id="title" value="{escape(TITLE[0])}" style="text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=34;{FONT}" vertex="1" parent="1">
  <mxGeometry x="60" y="26" width="1100" height="50" as="geometry" />
</mxCell>'''
    subtitle = f'''<mxCell id="subtitle" value="{escape(TITLE[1])}" style="text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=17;fontColor=#4f5d75;fontFamily=PingFang SC;" vertex="1" parent="1">
  <mxGeometry x="60" y="80" width="1100" height="52" as="geometry" />
</mxCell>'''
    stage_main = f'''<mxCell id="ov-stage-main" value="主业务线（现有）" style="text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=22;fontColor=#9c3d20;fontFamily=PingFang SC;" vertex="1" parent="1">
  <mxGeometry x="1440" y="385" width="300" height="36" as="geometry" />
</mxCell>'''
    stage_support = f'''<mxCell id="ov-stage-support" value="支撑线（每条业务都经过）" style="text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=19;fontColor=#4f5d75;fontFamily=PingFang SC;" vertex="1" parent="1">
  <mxGeometry x="1440" y="225" width="300" height="36" as="geometry" />
</mxCell>'''
    stage_guard = f'''<mxCell id="ov-stage-guard" value="保障线（本地设备版、官方同步与客户自助备份已实现；线上托管待实施）" style="text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=19;fontColor=#9c3d20;fontFamily=PingFang SC;" vertex="1" parent="1">
  <mxGeometry x="1440" y="480" width="300" height="56" as="geometry" />
</mxCell>'''
    note = f'''<mxCell id="note" value="{escape("图下注释：本图为关系索引，不替代各分图的判断与失败处理；" + "现有/规划为人工声明，附代码引用日期 " + EVIDENCE_AS_OF + "，不代表验收结论。")}" style="text;html=1;align=left;verticalAlign=middle;whiteSpace=wrap;fontSize=15;fontColor=#4f5d75;fontFamily=PingFang SC;" vertex="1" parent="1">
  <mxGeometry x="60" y="710" width="1340" height="40" as="geometry" />
</mxCell>'''

    body = [title, subtitle, stage_support, stage_main, stage_guard]
    body += [obj_xml(*node) for node in NODES]
    body += [edge_xml(*edge) for edge in EDGES]
    body += legend_xml()
    body.append(note)

    model = f'''<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1760" pageHeight="1360" background="#f5f5f5" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        {chr(10).join("        " + line for cell in body for line in cell.splitlines()).strip()}
      </root>
    </mxGraphModel>'''
    return f'<diagram id="overview-relations" name="{PAGE_NAME}">\n    {model}\n  </diagram>'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--data-dir', default=str(ROOT / 'docs/architecture-data'))
    parser.add_argument('--project', default='繁梦空间设计站')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    doc = Path(args.data_dir) / 'projects' / args.project / 'system-map.drawio'
    if not doc.exists():
        raise SystemExit(f'找不到主文件：{doc}')
    xml = doc.read_text(encoding='utf-8')

    # 删掉旧的总关系图页，新的插到第 1 页。
    xml = re.sub(r'\s*<diagram\b[^>]*name="' + re.escape(PAGE_NAME) + r'"[\s\S]*?</diagram>', '', xml)
    if '<diagram' not in xml:
        raise SystemExit('主文件里没有任何图页，拒绝写入')
    xml = xml.replace('<diagram', overview_page_xml() + '\n  <diagram', 1)
    pages = len(re.findall(r'<diagram\b', xml))
    xml = re.sub(r'pages="\d+"', f'pages="{pages}"', xml, count=1)

    # 校验：能被 ElementTree 解析，且每页的 object/cell/edge 数量可读。
    root = ET.fromstring(xml)
    page = root.find(f'./diagram[@name="{PAGE_NAME}"]')
    if page is None:
        raise SystemExit('总关系图页生成失败')
    vertices = len(page.findall('.//mxCell[@vertex="1"]'))
    edges = len(page.findall('.//mxCell[@edge="1"]'))
    print(f'总关系图：{vertices} 个节点、{edges} 条连线；总页数 {pages}')

    if args.dry_run:
        print('--dry-run：不写文件')
        return
    backup = ROOT / '.local/architecture-editor/backups'
    backup.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    shutil.copy2(doc, backup / f'{stamp}-before-overview.drawio')
    doc.write_text(xml, encoding='utf-8')
    print(f'已写回 {doc}')
    print(f'旧版备份：{backup / (stamp + "-before-overview.drawio")}')


if __name__ == '__main__':
    main()
