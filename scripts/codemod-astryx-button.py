#!/usr/bin/env python3
"""
P1：把 <Button> 从本仓适配层迁到 Astryx 官方 Button。

⚠️ 为什么不用正则匹配整块
早先用正则 `<Button\b([^>]*?)>` 匹配属性，遇到箭头函数就崩：

    <Button onClick={() => setX(null)}>文字</Button>
                      ↑ 属性值里的 `}` 让 `[^>]*?` 提前收尾

全仓有 224 处 `onClick={() => …}`，正则方案必然大面积出错。
所以这里改成**写一个真正的扫描器**：按引号、括号、大括号配对找属性边界。

规则均经本地实测确认（详见 ASTRYX-MIGRATION.md「全量原生化」）：

  ① 属性改名
     variant: default→primary, outline→secondary, ghost→ghost, destructive→destructive, link→ghost
     size:    default→md, xs→sm, sm→sm, lg→lg
     disabled → isDisabled
     删掉 data-slot/data-variant/data-size（写了会覆盖官方样式）

  ② asChild + <Link href={X}> → href={X} as={Link}

  ③ children 图标 → icon 插槽；文字 → label；末尾图标 → endContent

  ④ size="icon*" → IconButton（本脚本跳过，留给人工）

不做（留给人工）：图标是变量、children 里有 map / 多块 JSX。

用法：
  python3 scripts/codemod-astryx-button.py            # 试运行
  python3 scripts/codemod-astryx-button.py --write
  python3 scripts/codemod-astryx-button.py --write --file <路径>
"""
import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

VARIANT = {
    "default": "primary", "outline": "secondary", "secondary": "secondary",
    "ghost": "ghost", "destructive": "destructive", "link": "ghost",
}
SIZE = {"default": "md", "xs": "sm", "sm": "sm", "lg": "lg"}
ICON_SIZES = {"icon", "icon-xs", "icon-sm", "icon-lg"}


# ─────────────────────────── JSX 扫描器 ───────────────────────────

def find_tag_end(src: str, start: int) -> int:
    """从 `<Button` 的 `<` 起，找到属性区结束的 `>`（跳过字符串/嵌套括号）。"""
    i = start
    n = len(src)
    depth = 0          # {} 深度
    while i < n:
        c = src[i]
        if c in "\"'`":
            quote = c
            i += 1
            while i < n and src[i] != quote:
                if src[i] == "\\":
                    i += 1
                i += 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == ">" and depth == 0:
            return i
        i += 1
    return -1


def find_matching_close(src: str, open_start: int, tag: str) -> int:
    """从 `<Button ...>` 的位置起，找配对的 `</Button>`（考虑同名嵌套与自闭合）。"""
    # 简化：TypeScript/JSX 里 <Button> 极少嵌套自身；按出现顺序找最近的 </Button>
    # 但必须跳过自闭合的 <Button ... />
    i = open_start
    n = len(src)
    depth = 0
    while i < n:
        m = re.compile(r"<(/?)Button\b").search(src, i)
        if not m:
            return -1
        if m.group(1) == "/":
            if depth == 0:
                return m.start()
            depth -= 1
            i = m.end()
        else:
            end = find_tag_end(src, m.start())
            if end == -1:
                return -1
            self_closing = src[end - 1] == "/"
            if not self_closing:
                depth += 1
            i = end + 1
    return -1


# ─────────────────────────── children 解析 ───────────────────────────

def plain_text(s: str):
    """去掉纯装饰标签取文字；含 JSX/表达式时返回 None。"""
    t = re.sub(r"</?(span|strong|b|em)\b[^>]*>", "", s)
    if "<" in t:
        return None
    t = re.sub(r"\s+", " ", t).strip()
    return t or None


def split_children(body: str):
    """→ (leading_icon, label, trailing_icon) ；无法判定时返回 None。"""
    t = body.strip()
    if not t:
        return None

    # ① <Icon />  文字
    m = re.match(r"^<([A-Z][A-Za-z0-9]*)\b[^>]*?/>\s*([\s\S]+)$", t)
    if m:
        txt = plain_text(m.group(2))
        if txt:
            return (f"<{m.group(1)} />", txt, None)

    # ② 文字  <Icon />
    m = re.match(r"^([\s\S]+?)\s*<([A-Z][A-Za-z0-9]*)\b[^>]*?/>\s*$", t)
    if m:
        txt = plain_text(m.group(1))
        if txt:
            return (None, txt, f"<{m.group(2)} />")

    # ③ 纯文字
    txt = plain_text(t)
    if txt:
        return (None, txt, None)

    return None


# ─────────────────────────── 属性改写 ───────────────────────────

def convert_attrs(attrs: str) -> str:
    a = attrs
    a = re.sub(r'variant="(\w+)"',
               lambda m: f'variant="{VARIANT[m.group(1)]}"' if m.group(1) in VARIANT else m.group(0), a)
    a = re.sub(r'size="([\w-]+)"',
               lambda m: f'size="{SIZE[m.group(1)]}"' if m.group(1) in SIZE else m.group(0), a)
    a = re.sub(r"\bdisabled=(\{[^}]*\})", r"isDisabled=\1", a)
        # 只在属性位置匹配：前一个字符必须是空白（避免误伤 download= 之类）
    a = re.sub(r"(?<=[\s])disabled(?=[\s/>]|$)", "isDisabled", a)
    a = re.sub(r"^disabled(?=[\s/>]|$)", "isDisabled", a.lstrip())
    a = re.sub(r'\s+data-slot="button"', "", a)
    a = re.sub(r"\s+data-variant=\{[^}]*\}", "", a)
    a = re.sub(r"\s+data-size=\{[^}]*\}", "", a)
    return a


def emit(attrs: str, icon, label, end) -> str:
    parts = [attrs.strip()]
    if icon:
        parts.append(f"icon={{{icon}}}")
    if label is not None:
        parts.append(f"label={json.dumps(label, ensure_ascii=False)}")
    if end:
        parts.append(f"endContent={{{end}}}")
    return "<Button " + " ".join(p for p in parts if p) + " />"


def process(src: str, report: dict) -> str:
    if "<Button" not in src:
        return src

    # import
    src = re.sub(r"import\s*\{\s*Button\s*\}\s*from\s*'@/components/ui/button'",
                 "import { Button } from '@astryxdesign/core/Button'", src)

    out = []
    pos = 0
    while True:
        m = re.compile(r"<Button\b").search(src, pos)
        if not m:
            out.append(src[pos:])
            break
        # 自闭合的 <Button ... /> 直接跳过（本仓原先没有，但转换后会产出）
        tag_end = find_tag_end(src, m.start())
        if tag_end == -1:
            out.append(src[pos:])
            break

        attrs = src[m.start() + len("<Button"): tag_end]
        if attrs.rstrip().endswith("/"):
            out.append(src[pos:tag_end + 1])
            pos = tag_end + 1
            continue

        close = find_matching_close(src, tag_end + 1, "Button")
        if close == -1:
            out.append(src[pos:tag_end + 1])
            pos = tag_end + 1
            continue

        body = src[tag_end + 1: close]

        # asChild（<Link> 或原生 <a> 都认）
        if re.search(r"\basChild\b", attrs):
            lm = re.search(r"<(Link|a)\s+([^>]*?)>([\s\S]*?)</\1>", body)
            if lm and lm.group(1) == "a":
                # 原生 <a href=… download>：href 提出来，其余属性丢给官方（官方支持 href/target/rel）
                a_at = lm.group(2)
                hm = re.search(r"href=(\{[^}]*\}|\"[^\"]*\")", a_at)
                if hm:
                    href = hm.group(1)
                    # download 这类原生属性官方 Button 不声明，改走 onClick 触发下载；
                    # 这里保守处理：只保留 href，其余交给人工。
                    a = re.sub(r"\basChild\b", f"href={href}", convert_attrs(attrs))
                    got = split_children(lm.group(3))
                    if got:
                        report["改了"] += 1
                        out.append(src[pos:m.start()] + emit(a, *got))
                    else:
                        report["需人工"].append("asChild+a 内容复杂")
                        out.append(src[pos:close + len("</Button>")])
                    pos = close + len("</Button>")
                    continue
            lm = re.search(r"<Link\s+href=(\{[^}]*\}|\"[^\"]*\")\s*>([\s\S]*?)</Link>", body)
            if lm:
                href, inner = lm.group(1), lm.group(2)
                a = re.sub(r"\basChild\b", f"href={href} as={{Link}}", convert_attrs(attrs))
                got = split_children(inner)
                if got:
                    report["改了"] += 1
                    out.append(src[pos:m.start()] + emit(a, *got))
                else:
                    report["需人工"].append("asChild+Link 内容复杂")
                    out.append(src[pos:close + len("</Button>")])
                pos = close + len("</Button>")
                continue
            report["需人工"].append("asChild 非 Link")
            out.append(src[pos:close + len("</Button>")])
            pos = close + len("</Button>")
            continue

        # icon-only
        sm = re.search(r'size="([\w-]+)"', attrs)
        if sm and sm.group(1) in ICON_SIZES:
            report["需人工"].append(f'size="{sm.group(1)}"→IconButton')
            out.append(src[pos:close + len("</Button>")])
            pos = close + len("</Button>")
            continue

        got = split_children(body)
        if not got:
            report["需人工"].append("children 复杂")
            out.append(src[pos:close + len("</Button>")])
            pos = close + len("</Button>")
            continue

        report["改了"] += 1
        out.append(src[pos:m.start()] + emit(convert_attrs(attrs), *got))
        pos = close + len("</Button>")

    res = "".join(out)
    if "as={Link}" in res and not re.search(r"from 'next/link'", res):
        report["提示"].add("补 import Link from 'next/link'")
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--file")
    args = ap.parse_args()

    if args.file:
        files = [args.file]
    else:
        out = subprocess.run(["grep", "-rl", "components/ui/button", "src", "--include=*.tsx"],
                             capture_output=True, text=True).stdout.strip().split("\n")
        files = [f for f in out if f]

    report = {"改了": 0, "文件数": 0, "需人工": [], "提示": set()}
    for f in files:
        p = Path(f)
        src = p.read_text(encoding="utf-8")
        new = process(src, report)
        if new != src:
            report["文件数"] += 1
            if args.write:
                p.write_text(new, encoding="utf-8")

    print(f"\n  ── P1 codemod {'（已写入）' if args.write else '（试运行）'} ──")
    print(f"  改动处数: {report['改了']}    涉及文件: {report['文件数']}    需人工: {len(report['需人工'])}")
    for k, v in Counter(report["需人工"]).most_common():
        print(f"    {k}: {v}")
    for t in report["提示"]:
        print(f"  ⚠️  {t}")


if __name__ == "__main__":
    main()
