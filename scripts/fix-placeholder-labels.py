#!/usr/bin/env python3
"""
修 P1 遗留的占位 label「操作」。

## 问题

P1 迁移时，有些 `<Button>` 的 children 含 JSX 表达式（`{loading ? <Loader2/> : '登录'}`），
自动提取文字失败，于是脚本落了一个占位值 `label="操作"`。

结果：**用户界面上真的显示「操作」** —— 登录按钮写着「操作」、导出按钮写着「操作」。
这是 P1 的真实遗留缺陷（全仓 40 处），tsc / eslint / 构建全都发现不了。

## 修法

从 git 历史（P1 合并前的提交）取回每个 `<Button>` 的原始 children，
用它重新生成 label；取不到就保留但打印出来留人工判断。

真值来源：`d9ab12d~1`（P1 合并前）的同一文件同一位置。

    python3 scripts/fix-placeholder-labels.py            # 试运行
    python3 scripts/fix-placeholder-labels.py --write
"""
import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

BASE_REV = 'd9ab12d~1'   # P1 合并前的 main

# 这些是官方组件，不能当图标剥（它们有语义）
TIER_COMPONENTS = {
    'Badge', 'Button', 'IconButton', 'Card', 'Input', 'Label', 'Select',
    'Textarea', 'Checkbox', 'Switch', 'Dialog', 'Tooltip', 'Tabs',
}


def git_show(path: str) -> str:
    try:
        return subprocess.run(
            ['git', 'show', f'{BASE_REV}:{path}'],
            capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return ''


def tag_end(s: str, start: int) -> int:
    i, n, depth = start, len(s), 0
    while i < n:
        c = s[i]
        if c in "\"'`":
            q = c
            i += 1
            while i < n and s[i] != q:
                if s[i] == '\\':
                    i += 1
                i += 1
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        elif c == '>' and depth == 0:
            return i
        i += 1
    return -1


def matching_close(s: str, after: int, tag: str) -> int:
    i, n, depth = after, len(s), 0
    pat = re.compile(r'<(/?)' + tag + r'(?![A-Za-z])')
    while True:
        m = pat.search(s, i)
        if not m:
            return -1
        if m.group(1) == '/':
            if depth == 0:
                return m.start()
            depth -= 1
            i = m.end()
        else:
            e = tag_end(s, m.start())
            if e == -1:
                return -1
            if s[e - 1] != '/':
                depth += 1
            i = e + 1


def strip_tags(body: str) -> str:
    t = body
    t = re.sub(r'<[A-Z][A-Za-z0-9]*\b[^>]*?/>', '', t)
    for _ in range(4):
        t = re.sub(r'</?[A-Z][A-Za-z0-9]*\b[^>]*>', '', t)
    t = re.sub(r'</?(span|div|strong|b|em|p|br)\b[^>]*>', '', t)
    return t


ICON_RE = re.compile(r'<([A-Z][A-Za-z0-9]*)\b([^>]*?)/>')


def extract_icons(body: str):
    """
    把 children 里的图标组件抽出来，并**用 undefined 占位**保结构。

    为什么不能直接删：`{loading ? <Loader2/> : '登录'}` 删掉图标会变成
    `{loading ? : '登录'}` —— 三元的一个分支空了，语法错。
    所以用 `undefined` 顶替，得到 `{loading ? undefined : '登录'}`，语法合法；
    图标本身另走 `icon={...}` prop。
    """
    icons = []

    def repl(m: re.Match) -> str:
        name = m.group(1)
        if name in TIER_COMPONENTS:
            return m.group(0)          # 不碰官方组件
        icons.append(name)
        return '__FMKJ_ICON__'

    return ICON_RE.sub(repl, body), icons


def simplify_icon_ternary(t: str) -> str:
    """
    把「图标三元」简化成文字三元。

    输入形态（实测）：
      {loading ? <Loader2/> : null}          → 整段丢弃（纯图标判断）
      {loading ? <Loader2/> : <Check/>}      → 整段丢弃
      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                                             → 保留（有真实文字）

    判据：三元里出现 __FMKJ_ICON__ 且**没有任何字符串字面量**，就是纯图标，丢掉。
    """
    def repl(m: re.Match) -> str:
        expr = m.group(1)
        if '__FMKJ_ICON__' not in expr:
            return m.group(0)
        # 有三元里的字符串字面量吗？
        if re.search(r"'[^']+'|\"[^\"]+\"|`[^`]*[^$`][^`]*`", expr.replace('__FMKJ_ICON__', '')):
            # 有文字 → 去掉图标部分，保留文字
            cleaned = re.sub(r'__FMKJ_ICON__(\s*className="[^"]*")?', '', expr)
            cleaned = re.sub(r'\?\s*:', "? '':", cleaned)   # 空分支给空字符串
            return '{' + cleaned + '}'
        return ''      # 纯图标，整段丢弃

    for _ in range(3):
        t = re.sub(r'\{([^{}]*__FMKJ_ICON__[^{}]*)\}', repl, t)
    return t


def to_label_expr(body: str):
    """children → 裸 JS 表达式（不含外层 {}）。"""
    body, _icons = extract_icons(body)
    t = strip_tags(body)
    t = simplify_icon_ternary(t)
    t = re.sub(r'\s+', ' ', t).strip()
    if not t:
        return None

    whole = re.fullmatch(r'\{([\s\S]*)\}', t)
    if whole:
        inner = whole.group(1).strip()
        if '{' not in inner and '}' not in inner:
            return inner

    # 清掉图标占位残留（连同不必要的空格）
    t = re.sub(r'__FMKJ_ICON__\s*', '', t).strip()

    parts = re.split(r'(\{[^{}]*\})', t)
    pieces = [p for p in parts if p.strip()]
    has_literal = any(not p.startswith('{') for p in pieces)
    expr_count = sum(1 for p in pieces if p.startswith('{'))

    if expr_count == 0:
        return json.dumps(t, ensure_ascii=False)
    if expr_count == 1 and not has_literal:
        p0 = pieces[0]
        return p0[1:-1].strip() if p0.startswith('{') else p0

    tpl = ''
    for p in pieces:
        if p.startswith('{'):
            tpl += '${' + p[1:-1].strip() + '}'
        else:
            tpl += p.replace('`', '\\`')
    return '`' + re.sub(r'\s+', ' ', tpl).strip() + '`'


def collect_old_buttons(src: str):
    """从旧文件里按出现顺序收集所有 <Button> 的 children 文本。"""
    out, pos = [], 0
    while True:
        m = re.search(r'<Button(?![A-Za-z])', src[pos:])
        if not m:
            break
        st = pos + m.start()
        te = tag_end(src, st)
        if te == -1:
            break
        raw = src[st + len('<Button'): te]
        if raw.rstrip().endswith('/'):
            out.append('')
            pos = te + 1
            continue
        ci = matching_close(src, te + 1, 'Button')
        if ci == -1:
            break
        out.append(src[te + 1:ci])
        pos = ci + len('</Button>')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    files = subprocess.run(
        ['grep', '-rl', 'label="操作"', 'src', '--include=*.tsx'],
        capture_output=True, text=True,
    ).stdout.strip().split('\n')
    files = [f for f in files if f]

    rep = Counter()
    fixed_total = 0
    for f in files:
        cur = Path(f).read_text(encoding='utf-8')
        if 'label="操作"' not in cur:
            continue
        old = git_show(f)
        if not old:
            print(f'  ⚠️ {f}: 取不到历史版本，跳过')
            continue

        old_bodies = collect_old_buttons(old)

        # 按出现顺序，把当前文件里的占位 label 一一替换
        out, pos, idx = [], 0, 0
        changed = 0
        while True:
            m = re.search(r'<Button(?![A-Za-z])', cur[pos:])
            if not m:
                out.append(cur[pos:])
                break
            st = pos + m.start()
            te = tag_end(cur, st)
            if te == -1:
                out.append(cur[pos:])
                break
            tag = cur[st:te + 1]
            body = old_bodies[idx] if idx < len(old_bodies) else ''
            idx += 1

            if 'label="操作"' in tag:
                expr = to_label_expr(body) if body else None
                # 只自动处理「无嵌套模板串」的简单情况；复杂的留给人工
                safe = bool(expr) and '`' not in expr and '__FMKJ_ICON__' not in expr
                if safe:
                    new_tag = tag.replace('label="操作"', f'label={{{expr}}}')
                    out.append(cur[pos:st] + new_tag)
                    pos = te + 1
                    changed += 1
                    rep['替换成功'] += 1
                    continue
                rep['保留（历史也对不上）'] += 1
            out.append(cur[pos:te + 1])
            pos = te + 1

        new = ''.join(out)
        if changed:
            fixed_total += changed
            if args.write:
                Path(f).write_text(new, encoding='utf-8')

    print(f"\n  ── 修占位 label（{'已写入' if args.write else '试运行'}）──")
    print(f"  修掉: {fixed_total}")
    for k, v in rep.most_common():
        print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
