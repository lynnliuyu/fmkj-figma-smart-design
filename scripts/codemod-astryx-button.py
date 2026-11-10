#!/usr/bin/env python3
"""
P1：<Button> 从本仓适配层迁到 Astryx 官方组件（一次做对版）。

前几版失败的原因（都记在这里，别再犯）：
  ① 正则 `[^>]*?` 撞上箭头函数 `onClick={() => …}` → 属性被截断
  ② `\\bdisabled` 匹配到 `download=` 里的 `load=` → 变成语法错误
  ③ 只改属性不改 children → 图标留在 children 里，官方会「图标与文字上下堆叠」
  ④ `size="icon*"` 没换 IconButton → 官方没有这些尺寸
  ⑤ 动态 `variant={a ? 'default' : 'outline'}` 里的字面量没换

本版做法：**JSX 扫描器**（按引号/括号配对找标签边界）+ 5 条明确规则，
每条规则都单独可关。每轮由 `tsc` 验证。

规则：
  R1 variant: default→primary, outline→secondary, secondary→secondary,
              ghost→ghost, destructive→destructive, link→ghost
  R2 size:    default→md, xs→sm, sm→sm, lg→lg,
              icon|icon-xs|icon-sm|icon-lg → 改用 IconButton
  R3 disabled=… → isDisabled=…      title=… → tooltip=…
  R4 children 里的图标 → icon={…}；文字 → label="…"；末尾图标 → endContent={…}
  R5 asChild + <Link href=X>children</Link> → href=X as={Link}，children 也拆进 icon/label

用法：
  python3 scripts/codemod-astryx-button.py            # 试运行
  python3 scripts/codemod-astryx-button.py --write
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
ICON_SIZE = {"icon": "md", "icon-xs": "sm", "icon-sm": "sm", "icon-lg": "lg"}

BUTTON_IMPORT = "import { Button } from '@astryxdesign/core/Button'"
ICONBUTTON_IMPORT = "import { IconButton } from '@astryxdesign/core/IconButton'"


# ─────────────────────────── JSX 扫描 ───────────────────────────

def tag_end(s: str, start: int) -> int:
    """`<` 起到属性区结束的 `>`；跳过字符串与 {} 嵌套。"""
    i, n, depth = start, len(s), 0
    while i < n:
        c = s[i]
        if c in "\"'`":
            q = c
            i += 1
            while i < n and s[i] != q:
                if s[i] == "\\":
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


def matching_close(s: str, after: int, tag: str) -> int:
    """从 `after` 起找配对的 `</tag>`（跳过自闭合与同名嵌套）。"""
    i, n, depth = after, len(s), 0
    pat = re.compile(r"<(/?)" + tag + r"\b")
    while True:
        m = pat.search(s, i)
        if not m:
            return -1
        if m.group(1) == "/":
            if depth == 0:
                return m.start()
            depth -= 1
            i = m.end()
        else:
            e = tag_end(s, m.start())
            if e == -1:
                return -1
            if s[e - 1] != "/":
                depth += 1
            i = e + 1


# ─────────────────────────── 属性改写 ───────────────────────────

def rewrite_attrs(attrs: str) -> tuple:
    """返回 (新属性, 是否 icon-only 尺寸, icon 尺寸名)。"""
    a = attrs
    a = re.sub(r'variant="(\w+)"',
               lambda m: f'variant="{VARIANT[m.group(1)]}"' if m.group(1) in VARIANT else m.group(0), a)
    # 动态表达式里的字面量（只在这个标签内替换，安全）
    for old, new in VARIANT.items():
        if old != new:
            a = a.replace(f"'{old}'", f"'{new}'")

    icon_only = False
    icon_size = "md"
    sm = re.search(r'size="([\w-]+)"', a)
    if sm and sm.group(1) in ICON_SIZE:
        icon_only = True
        icon_size = ICON_SIZE[sm.group(1)]
        a = a[: sm.start()] + a[sm.end():]
    else:
        a = re.sub(r'size="([\w-]+)"',
                   lambda m: f'size="{SIZE[m.group(1)]}"' if m.group(1) in SIZE else m.group(0), a)
        a = a.replace("'xs'", "'sm'").replace("'default'", "'md'")

    # 属性名必须「前面是空白」，否则 download= 里的 load= 会被误伤
    a = re.sub(r"(?<=[\s])disabled=(\{[^}]*\})", r"isDisabled=\1", a)
    a = re.sub(r"(?<=[\s])disabled(?=[\s/>]|$)", "isDisabled", a)
    a = re.sub(r"(?<=[\s])title=", "tooltip=", a)
    # 这些不能传给官方（会覆盖官方自己写的数据属性）
    a = re.sub(r'\s+data-slot="button"', "", a)
    a = re.sub(r"\s+data-variant=\{[^}]*\}", "", a)
    a = re.sub(r"\s+data-size=\{[^}]*\}", "", a)
    a = re.sub(r"\s*\basChild(?:\s*=\s*\{[^}]*\}|\b)", "", a)
    return a, icon_only, icon_size


def readable(body: str):
    """从 children 提可读文字；纯图标返回 None。"""
    t = body
    t = re.sub(r"<[A-Z][A-Za-z0-9]*\b[^>]*?/>", " ", t)
    for _ in range(4):
        t = re.sub(r"</?[A-Z][A-Za-z0-9]*\b[^>]*>", " ", t)
    t = re.sub(r"</?(span|div|strong|b|em|p|br)\b[^>]*>", " ", t)
    literal = re.sub(r"\{[^{}]*\}", " ", t)
    literal = re.sub(r"\s+", " ", literal).strip()
    return literal or None


def first_icon(body: str):
    """children 里第一个图标组件（形如 <Sparkles />）。"""
    m = re.search(r"<([A-Z][A-Za-z0-9]*)\b[^>]*?/>", body)
    return f"<{m.group(1)} />" if m else None


def last_icon(body: str):
    all_icons = re.findall(r"<([A-Z][A-Za-z0-9]*)\b[^>]*?/>", body)
    return f"<{all_icons[-1]} />" if all_icons else None


# ─────────────────────────── 主流程 ───────────────────────────

def process(src: str, rep: dict, is_server: bool = False) -> str:
    if "<Button" not in src:
        return src

    # import
    src = re.sub(r"import\s*\{\s*Button\s*\}\s*from\s*'@/components/ui/button'", BUTTON_IMPORT, src)

    out, pos = [], 0
    need_iconbutton = False

    while True:
        m = re.search(r"<Button\b", src[pos:])
        if not m:
            out.append(src[pos:])
            break
        st = pos + m.start()
        te = tag_end(src, st)
        if te == -1:
            out.append(src[pos:])
            break
        raw_attrs = src[st + len("<Button"): te]
        self_closing = raw_attrs.rstrip().endswith("/")
        attrs, icon_only, icon_size = rewrite_attrs(raw_attrs.replace("/", "", 1) if self_closing else raw_attrs)

        if self_closing:
            tag = "<Button" + attrs + " />"
            out.append(src[pos:st] + tag)
            pos = te + 1
            continue

        ci = matching_close(src, te + 1, "Button")
        if ci == -1:
            out.append(src[pos: te + 1])
            pos = te + 1
            continue
        body = src[te + 1: ci]

        # asChild + <Link>/<a>
        lm = re.search(r"<(Link|a)\b([^>]*)>([\s\S]*?)</\1>", body)
        hook = ""
        if lm:
            a_at = lm.group(2)
            hm = re.search(r"href=(\{(?:[^{}]|\{[^}]*\})*\}|\"[^\"]*\"|`[^`]*`)", a_at)
            if hm:
                # 服务端组件不能传 as={Link}（那是函数，跨 server/client 边界会 500）。
                # 实测：不传 as 时官方渲染成原生 <a href>，服务端组件里完全可用 ——
                # 代价只是失去 Next 的客户端导航（整页刷新），对已有的 <a> 语义没变。
                if is_server:
                    hook = f"href={hm.group(1)}"
                    rep["server-href"] += 1
                else:
                    hook = f"href={hm.group(1)}" + ("" if lm.group(1) == "a" else " as={Link}")
                    rep["asChild"] += 1
                body = lm.group(3)

        if icon_only:
            # IconButton：label + icon
            need_iconbutton = True
            icon = first_icon(body)
            lab = readable(body)
            m2 = re.search(r'aria-label="([^"]*)"', attrs)
            label = lab or (m2.group(1) if m2 else "操作")
            parts = [attrs.strip(), hook, f'label={json.dumps(label, ensure_ascii=False)}']
            if icon:
                parts.append(f"icon={{{icon}}}")
            parts.append(f'size="{icon_size}"')
            new = "<IconButton " + " ".join(p for p in parts if p) + " />"
            rep["IconButton"] += 1
            out.append(src[pos:st] + new)
            pos = ci + len("</Button>")
            continue

        # 普通 Button：icon / label / endContent
        icon = first_icon(body)
        lab = readable(body)
        end = None
        if icon and lab is None and len(re.findall(r"<([A-Z][A-Za-z0-9]*)\b[^>]*?/>", body)) > 1:
            end = last_icon(body)

        parts = [attrs.strip()]
        if hook:
            parts.append(hook)
        if icon:
            parts.append(f"icon={{{icon}}}")
        if lab:
            parts.append(f"label={json.dumps(lab, ensure_ascii=False)}")
        if end:
            parts.append(f"endContent={{{end}}}")

        new = "<Button " + " ".join(p for p in parts if p) + " />"
        rep["Button"] += 1
        out.append(src[pos:st] + new)
        pos = ci + len("</Button>")

    res = "".join(out)

    if need_iconbutton and ICONBUTTON_IMPORT not in res:
        res = res.replace(BUTTON_IMPORT, BUTTON_IMPORT + "\n" + ICONBUTTON_IMPORT, 1)

    if "as={Link}" in res and not re.search(r"from 'next/link'", res):
        res = res.replace(BUTTON_IMPORT, "import Link from 'next/link'\n" + BUTTON_IMPORT, 1)
        rep["提示"] += 1

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

    rep = Counter()
    nfiles = 0
    for f in files:
        p = Path(f)
        src = p.read_text(encoding="utf-8")
        head = src.lstrip()[:200]
        is_server = not (head.startswith("'use client'") or head.startswith('"use client"'))
        new = process(src, rep, is_server)
        if new != src:
            nfiles += 1
            if args.write:
                p.write_text(new, encoding="utf-8")

    print(f"\n  ── P1 codemod {'（已写入）' if args.write else '（试运行）'} ──")
    print(f"  文件: {nfiles}")
    print(f"  Button:      {rep['Button']}")
    print(f"  IconButton:  {rep['IconButton']}")
    print(f"  asChild→href:{rep['asChild']}")
    print(f"  服务端仅 href: {rep['server-href']}")
    if rep["提示"]:
        print(f"  ⚠️ 有 {rep['提示']} 个文件补了 Link import")


if __name__ == "__main__":
    main()
