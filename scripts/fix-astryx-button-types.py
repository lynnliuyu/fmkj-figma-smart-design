#!/usr/bin/env python3
"""
类型错误驱动的 <Button> 收尾器。

为什么这么写：手写「形状规则」猜测式替换已经失败过多次（箭头函数、download=、
asChild={expr} 都被误伤）。改成**读 tsc 的真实错误 → 精确到行 → 只修那一个标签**，
每一轮都由类型检查验证，不会改坏其它地方。

处理的两类（覆盖全仓剩余错误）：
  1. Property 'label' is missing        → 从 children 提文字补 label；提不出来就用现有 aria-label
  2. Property 'asChild' does not exist  → <Button asChild><Link href=X>…</Link></Button>
                                          → <Button href={X} as={Link} … />

用法：
  python3 scripts/fix-astryx-button-types.py --tsc /tmp/tsc.log [--write]
"""
import argparse
import json
import re
from pathlib import Path


def tag_end(s: str, start: int) -> int:
    """从 `<Button` 的 `<` 起，找属性区结束的 `>`（跨行、跳过字符串与嵌套括号）。"""
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


def close_of(s: str, after: int) -> int:
    m = re.search(r"</Button>", s[after:])
    return after + m.start() if m else -1


def readable(body: str):
    """从 children 里提取可读文字。含动态表达式时只取字面量部分。"""
    t = body
    t = re.sub(r"<[A-Z][A-Za-z0-9]*\b[^>]*?/>", " ", t)          # 自闭合图标
    for _ in range(4):
        t = re.sub(r"</?[A-Z][A-Za-z0-9]*\b[^>]*>", " ", t)      # 组件标签
    t = re.sub(r"</?(span|div|strong|b|em|p|br)\b[^>]*>", " ", t)
    # 先取 {……} 之外的字面量
    literal = re.sub(r"\{[^{}]*\}", " ", t)
    literal = re.sub(r"\s+", " ", literal).strip()
    if literal:
        return literal
    return None


def fix_missing_label(src: str, line_no: int, log) :
    pos = 0
    while True:
        m = re.search(r"<Button\b", src[pos:])
        if not m:
            return src, False
        st = pos + m.start()
        if src[:st].count("\n") + 1 != line_no:
            te = tag_end(src, st)
            if te == -1:
                return src, False
            pos = te + 1
            continue
        te = tag_end(src, st)
        if te == -1:
            return src, False
        tag = src[st : te + 1]
        if "label=" in tag:
            return src, False

        if tag.rstrip().endswith("/>"):
            return src, False  # 自闭合：没有 children 可提，留给人工

        ci = close_of(src, te + 1)
        if ci == -1:
            return src, False
        body = src[te + 1 : ci]

        lab = readable(body)
        if lab:
            new_tag = tag[:-1].rstrip() + f" label={json.dumps(lab, ensure_ascii=False)}>"
        else:
            # 纯图标按钮：用现有 aria-label 作 label
            am = re.search(r'aria-label="([^"]*)"', tag)
            if not am:
                log.append(f"行 {line_no}: 既提不出文字也没有 aria-label，跳过")
                return src, False
            lab = am.group(1)
            new_tag = tag[:-1].rstrip() + f" label={json.dumps(lab, ensure_ascii=False)}>"
            new_tag = re.sub(r'\s*aria-label="[^"]*"', "", new_tag)

        return src[:st] + new_tag + src[te + 1 :], True


def fix_aschild(src: str, line_no: int, log) :
    pos = 0
    while True:
        m = re.search(r"<Button\b", src[pos:])
        if not m:
            return src, False
        st = pos + m.start()
        te = tag_end(src, st)
        if te == -1:
            return src, False
        if src[:st].count("\n") + 1 != line_no:
            pos = te + 1
            continue
        tag = src[st : te + 1]
        if not re.search(r"\basChild(?:\s*=|\s|>|/)", tag):
            return src, False
        ci = close_of(src, te + 1)
        if ci == -1:
            return src, False
        body = src[te + 1 : ci]

        lm = re.search(r"<(Link|a)\b([^>]*)>([\s\S]*?)</\1>", body)
        if not lm:
            log.append(f"行 {line_no}: asChild 内不是 Link/a，跳过")
            return src, False

        a_attrs = lm.group(2)
        hm = re.search(r"href=(\{[^}]*\}|\"[^\"]*\")", a_attrs)
        if not hm:
            log.append(f"行 {line_no}: Link 无 href，跳过")
            return src, False

        href = hm.group(1)
        comp = lm.group(1)

        # Button 自身属性：去掉 asChild，加 href（Link → as={Link}）
        attrs = re.sub(r"\s*\basChild(?:\s*=\s*\{[^}]*\}|\b)", "", tag[len("<Button") : -1])
        hook = f"href={href}" + ("" if comp == "a" else " as={Link}")

        inner = lm.group(3)
        lab = readable(inner)
        parts = [attrs.strip(), hook]
        # 图标也提出来
        im = re.search(r"<([A-Z][A-Za-z0-9]*)\b[^>]*?/>", inner)
        if im and "icon=" not in attrs:
            parts.append(f"icon={{<{im.group(1)} />}}")
        if lab and "label=" not in attrs:
            parts.append(f"label={json.dumps(lab, ensure_ascii=False)}")

        new_tag = "<Button " + " ".join(p for p in parts if p) + " />"
        return src[:st] + new_tag + src[ci + len("</Button>") :], True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tsc", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    log_text = Path(args.tsc).read_text(errors="ignore")
    errors = []
    for m in re.finditer(
        r"^(src/\S+?)\((\d+),\d+\): error TS\d+: "
        r"(Property 'label' is missing|Property 'asChild' does not exist)",
        log_text,
        re.M,
    ):
        errors.append((m.group(1), int(m.group(2)), m.group(3)))

    print(f"  待修错误: {len(errors)}")
    skipped = []
    changed_files = {}
    for f, line, kind in errors:
        p = Path(f)
        if not p.exists():
            skipped.append(f"{f}: 文件不存在")
            continue
        src = p.read_text(encoding="utf-8")
        if "label" in kind:
            new, ok = fix_missing_label(src, line, skipped)
        else:
            new, ok = fix_aschild(src, line, skipped)
        if ok:
            if args.write:
                p.write_text(new, encoding="utf-8")
            changed_files[f] = changed_files.get(f, 0) + 1

    print(f"  已修: {sum(changed_files.values())} 处 / {len(changed_files)} 文件")
    for f, n in changed_files.items():
        print(f"    {n:2d}  {f}")
    if skipped:
        print(f"  跳过: {len(skipped)}")
        for s in skipped[:10]:
            print(f"    {s}")


if __name__ == "__main__":
    main()
