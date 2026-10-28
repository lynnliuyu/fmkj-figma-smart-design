#!/usr/bin/env python3
"""生成「设备更新操作卡」：一页 A4，给站在设备前面的人照着做。

用法：
    python3 scripts/deploy/make-device-card.py --version v0.2.0 \
        --repository 10.0.0.235:5443/fmkj-v3 --out docs/设备更新操作卡.docx

生成的 docx 再用 LibreOffice 转 PDF 打印。版本号与仓库地址都从参数来，换版本重跑一次即可。
"""
import argparse
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

INK = RGBColor(0x2D, 0x31, 0x42)
MUTED = RGBColor(0x5A, 0x63, 0x74)
ACCENT = RGBColor(0x2E, 0x5A, 0xA8)
WARN = RGBColor(0x9C, 0x3D, 0x20)


def set_font(run, size=10.5, bold=False, color=INK, mono=False):
    """中英文都设字体；中文必须单独设 eastAsia，否则 Word 会用默认宋体。"""
    name = "Menlo" if mono else "PingFang SC"
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "PingFang SC" if not mono else "Menlo")


def paragraph(doc, text="", size=10.5, bold=False, color=INK, space_before=0, space_after=4, align=None, mono=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.15
    if align is not None:
        p.alignment = align
    if text:
        set_font(p.add_run(text), size=size, bold=bold, color=color, mono=mono)
    return p


def code_block(doc, lines, shade="F2F4F7"):
    """等宽命令块：白底灰框，方便照着敲。"""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    cell.width = Cm(17.4)
    tcPr = cell._tc.get_or_add_tcPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:val"), "clear")
    shading.set(qn("w:fill"), shade)
    tcPr.append(shading)
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "6")
        element.set(qn("w:color"), "D5DAE1")
        borders.append(element)
    tcPr.append(borders)

    first = cell.paragraphs[0]
    for index, line in enumerate(lines):
        p = first if index == 0 else cell.add_paragraph()
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.line_spacing = 1.1
        set_font(p.add_run(line), size=8.5, color=INK, mono=True)
    return table


def rule(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    pPr = p._p.get_or_add_pPr()
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "DFE3E8")
    border.append(bottom)
    pPr.append(border)


def build(version: str, repository: str):
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Cm(21), Cm(29.7)          # A4
    section.left_margin = section.right_margin = Cm(1.8)
    section.top_margin = Cm(1.4)
    section.bottom_margin = Cm(1.2)

    paragraph(doc, "设备软件更新 · 操作卡", size=18, bold=True, space_after=1)
    paragraph(doc, f"目标版本 {version}　·　每台设备执行一次　·　约 1–3 分钟，期间网页打不开是正常的",
              size=9.5, color=MUTED, space_after=4)
    rule(doc)

    # 1
    paragraph(doc, "① 更新前，先看一眼现在是哪一版", size=11, bold=True, color=ACCENT, space_before=0)
    paragraph(doc, "浏览器打开设备页面 → 右上角进「管理员」 → 系统 → 系统健康，记下「版本」那一格。更新完再回来比对。", size=9.5)

    # 2
    paragraph(doc, "② 更新（正常情况下在页面上点按钮，不用敲命令）", size=11, bold=True, color=ACCENT, space_before=2)
    paragraph(doc, "打开设备页面 → 管理员 → 系统健康 → 先点「检查有没有新版本」，再点「立即更新到 vX」。"
                   "进度会显示在同一页上，等它跑完（约一两分钟）就行。", size=9.5)
    paragraph(doc, "万一页面打不开、或者提示「更新管家没有响应」，才用下面这条保底命令（在设备的终端里执行）：",
              size=9.5, color=MUTED, space_before=2)
    code_block(doc, [
        "cd /opt/fmkj/app",
        f"/opt/fmkj/tools/node/bin/node scripts/deploy/update-local.mjs --to {version} \\",
        f"  --repository {repository} --compose-file docker-compose.appliance.yml",
    ])
    paragraph(doc, "两种方式做的事完全一样：检查环境 → 拉新镜像 → 自动备份 → 升级数据库 → 切换版本 → 自检。"
                   f"命令方式看到最后一行「更新完成：{version}」就是做完了。", size=9.5, color=MUTED, space_before=2)

    # 3
    paragraph(doc, "③ 怎么算成功", size=11, bold=True, color=ACCENT, space_before=4)
    for line in [
        f"终端最后一行是「更新完成：{version}」。",
        f"刷新浏览器，系统健康页的「版本」变成 {version}；项目和产品库能正常打开。",
    ]:
        p = paragraph(doc, f"· {line}", size=9.5, space_after=1)

    # 4
    paragraph(doc, "④ 如果失败（按提示对号入座，别自己乱动）", size=11, bold=True, color=ACCENT, space_before=4)
    rows = [
        ("处置：abort", "什么都还没改，旧版照常服务。按「更新失败：」后面那句话修好（多是网络或版本号），重跑一次。", "安全"),
        ("处置：restart-previous", "新版本没装成，旧版继续服务。看一眼「更新失败：」的原因再重跑。", "安全"),
        ("处置：stop-for-restore", "数据库已经升级过，绝对不要切回旧版本。把「备份位置：」那行目录记下来，联系我。", "要人处理"),
    ]
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header = table.rows[0].cells
    for index, (title, width) in enumerate([("看到什么", Cm(4.6)), ("怎么办", Cm(9.4)), ("风险", Cm(2.8))]):
        header[index].width = width
        p = header[index].paragraphs[0]
        set_font(p.add_run(title), size=9, bold=True)
    for symptom, action, risk in rows:
        cells = table.add_row().cells
        cells[0].width, cells[1].width, cells[2].width = Cm(4.6), Cm(9.4), Cm(2.8)
        set_font(cells[0].paragraphs[0].add_run(symptom), size=9, bold=True)
        action_p = cells[1].paragraphs[0]
        set_font(action_p.add_run(action.replace("**", "")), size=9)
        set_font(cells[2].paragraphs[0].add_run(risk), size=9, color=WARN if risk != "安全" else MUTED)

    # 5
    paragraph(doc, "⑤ 更新期间不要做的事", size=11, bold=True, color=ACCENT, space_before=4)
    for line in [
        "不要关终端、关机、拔电源——中途断电只能靠备份恢复。",
        "不要手动改 .env 或 compose 文件；脚本会自己把版本号写回去；也不要在别的窗口手动切版本。",
    ]:
        paragraph(doc, f"· {line}", size=9.5, space_after=1)

    # 6
    paragraph(doc, "⑥ 出事时的救命材料放哪", size=11, bold=True, color=ACCENT, space_before=4)
    paragraph(doc, "每次更新前都会自动在 /opt/fmkj/app/backups/appliance/ 留一份完整备份（数据库 + 全部上传文件）。"
                   "要恢复就把那份目录交给技术支持，不要自己删或移动。", size=9.5)

    rule(doc)
    paragraph(doc, "页面打不开 / 登录后又跳回登录页 / 数据看起来不对：先重启一次应用容器"
                   "（cd /opt/fmkj/app && docker compose restart app），还不行就把现象和屏幕拍照发给技术支持。",
              size=9, color=MUTED, space_before=2)
    return doc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--out", default="docs/设备更新操作卡.docx")
    args = parser.parse_args()

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    build(args.version, args.repository).save(args.out)
    print(f"已生成 {args.out}")


if __name__ == "__main__":
    main()
