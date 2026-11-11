#!/usr/bin/env python3
"""
P2：展示型组件迁到 Astryx 官方（Badge / Card / Skeleton / Avatar / Separator / Progress）。

与 P1 的关键差异 —— 这批的**调用形态和官方 API 差别更大**，所以先写清规则再动手。

## 实测出来的三条（每条都做了对照）

### 1. Badge：官方用 `label`，本仓用 children

```jsx
本仓：  <Badge variant="secondary">已保存</Badge>
官方：  <Badge variant="neutral" label="已保存" />
```
本仓 163 处里 Badge 占 71 处，**全都要把 children 挪进 `label`**。

### 2. Badge / Card 的 `variant` 语义完全不同

| 本仓旧值 | 官方值 | 依据 |
|---|---|---|
| default / secondary / ghost / outline | `neutral` | 强调层级归中性 |
| destructive | `error` | 语义色 |
| success / warning | 同名 | 语义色 |
| brand / link | `info` | 品牌色 = 信息色 |

官方共 14 个值：neutral / info / success / warning / error / blue / cyan / green /
orange / pink / purple / red / teal / yellow。
（另有 4 处本仓自定义色 `purple` / `neutral` / `muted`，直接同名可用。）

### 3. 🔴 适配层正在踩 P0 的同一个坑

```jsx
<AstryxBadge variant={映射后的值} data-variant={v} />   // v 还是旧名
```
官方主题 CSS 是 `.astryx-badge[data-variant="neutral"]` 这种选择器；
适配层又写了一遍**旧名**（`secondary` / `outline` / `ghost`）把它覆盖掉 →
官方选择器选不中 → **Badge 样式整条失效**。

与 2026-11-10 那 37 个隐形按钮是**同一个 bug 模式**（两套命名写同一元素）。
修法同样：**删掉 `data-variant`，让官方自己写**。

## 用法

    python3 scripts/codemod-astryx-p2.py            # 试运行
    python3 scripts/codemod-astryx-p2.py --write
"""
import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

BADGE_VARIANT = {
    'default': 'neutral', 'secondary': 'neutral', 'ghost': 'neutral', 'outline': 'neutral',
    'destructive': 'error',
    'success': 'success', 'warning': 'warning',
    'brand': 'info', 'link': 'info',
    # 官方本来就有的色名，同名直传
    'purple': 'purple', 'red': 'red', 'teal': 'teal', 'blue': 'blue', 'green': 'green',
    'orange': 'orange', 'yellow': 'yellow', 'pink': 'pink', 'cyan': 'cyan',
    'neutral': 'neutral', 'muted': 'neutral', 'info': 'info', 'error': 'error',
}


def tag_end(s: str, start: int) -> int:
    """JSX 标签的属性区结束位置（跳过字符串与 {} 嵌套）。"""
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
    """从 after 起找配对的 </tag>（跳过自闭合与同名嵌套）。"""
    i, n, depth = after, len(s), 0
    pat = re.compile(r'<(/?)' + tag + r'\b')
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
    """去掉标签壳，留下内容（含 {表达式}）。"""
    t = body
    t = re.sub(r'<[A-Z][A-Za-z0-9]*\b[^>]*?/>', '', t)      # 自闭合图标 → 丢弃
    for _ in range(4):
        t = re.sub(r'</?[A-Z][A-Za-z0-9]*\b[^>]*>', '', t)  # 组件壳
    t = re.sub(r'</?(span|div|strong|b|em|p|br)\b[^>]*>', '', t)
    return t


def to_label_expr(body: str):
    """
    把 children 转成可以放进 `label={...}` 的**合法 JSX 表达式**。

    三种情况（都实测过）：
      ① 纯文字          `已保存`        → '"已保存"'
      ② 纯表达式        `{item}`        → '{item}'  （注意不要写成 {{item}}）
      ③ 文字 + 表达式    `项目阶段 · {stage.label}`
                                       → '`项目阶段 · ${stage.label}`'

    情况 ③ 最容易出错：直接把 children 塞进 label={...} 会变成
    `label={项目阶段 · {stage.label}}` —— 这不是合法 JS，且中文字面量会被当标识符。
    """
    t = strip_tags(body).strip()
    if not t:
        return None

    # 整个 children 就是一个表达式（可能跨行）
    whole = re.fullmatch(r'\{([\s\S]*)\}', t.strip())
    if whole:
        inner = whole.group(1).strip()
        # 排掉「里面还含花括号的复杂结构」——那交给人工
        if '{' not in inner and '}' not in inner:
            return inner

    parts = re.split(r'(\{[^{}]*\})', t)      # 按 {…} 切开
    pieces = [p for p in parts if p.strip()]
    has_literal = any(not p.startswith('{') for p in pieces)
    expr_count = sum(1 for p in pieces if p.startswith('{'))

    # ① 纯文字
    if expr_count == 0:
        # 字符串字面量（本身就合法）
        return json.dumps(re.sub(r'\s+', ' ', t).strip(), ensure_ascii=False)

    # ② 只有一个表达式、没有别的文字
    if expr_count == 1 and not has_literal:
        p0 = pieces[0]
        return p0[1:-1].strip() if p0.startswith('{') else p0

    # ③ 混合：拼成模板字符串
    tpl = ''
    for p in pieces:
        if p.startswith('{'):
            tpl += '${' + p[1:-1].strip() + '}'
        else:
            tpl += p.replace('`', '\\`')
    return '`' + re.sub(r'\s+', ' ', tpl).strip() + '`'


def convert_badge_attrs(attrs: str) -> str:
    a = attrs
    a = re.sub(
        r'variant="(\w+)"',
        lambda m: f'variant="{BADGE_VARIANT.get(m.group(1), m.group(1))}"',
        a,
    )
    # 静态表达式里的字面量也换
    for old, new in BADGE_VARIANT.items():
        if old != new:
            a = a.replace(f"'{old}'", f"'{new}'")
    # ⚠️ 删掉覆盖官方选择器的那行（P0 同一 bug）
    a = re.sub(r'\s+data-variant=\{[^}]*\}', '', a)
    a = re.sub(r'\s+data-slot="badge"', '', a)
    return a


def process(src: str, rep: Counter) -> str:
    # ── Badge ──────────────────────────────────────────────────────────
    if '<Badge' in src:
        src = re.sub(r"import\s*\{\s*Badge\s*\}\s*from\s*'@/components/ui/badge'",
                     "import { Badge } from '@astryxdesign/core/Badge'", src)

        out, pos = [], 0
        while True:
            m = re.search(r'<Badge(?![A-Za-z])', src[pos:])
            if not m:
                out.append(src[pos:])
                break
            st = pos + m.start()
            te = tag_end(src, st)
            if te == -1:
                out.append(src[pos:])
                break
            raw = src[st + len('<Badge'): te]
            self_closing = raw.rstrip().endswith('/')
            attrs = convert_badge_attrs(raw.replace('/', '', 1) if self_closing else raw)

            if self_closing:
                out.append(src[pos:st] + '<Badge' + attrs + ' />')
                pos = te + 1
                continue

            ci = matching_close(src, te + 1, 'Badge')
            if ci == -1:
                out.append(src[pos:te + 1])
                pos = te + 1
                continue
            body = src[te + 1:ci]

            if 'label=' in attrs:
                out.append(src[pos:st] + '<Badge' + attrs.rstrip() + ' />')
                rep['Badge(已有label)'] += 1
            else:
                expr = to_label_expr(body)
                if expr:
                    out.append(src[pos:st] + '<Badge' + attrs.rstrip() + f' label={{{expr}}} />')
                    rep['Badge'] += 1
                else:
                    out.append(src[pos:st] + '<Badge' + attrs.rstrip() + ' />')
                    rep['Badge(空)'] += 1
            pos = ci + len('</Badge>')

        src = ''.join(out)

    return src


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    files = subprocess.run(
        ['grep', '-rl', 'components/ui/badge', 'src', '--include=*.tsx'],
        capture_output=True, text=True,
    ).stdout.strip().split('\n')
    files = [f for f in files if f]

    rep = Counter()
    changed = 0
    for f in files:
        p = Path(f)
        src = p.read_text(encoding='utf-8')
        new = process(src, rep)
        if new != src:
            changed += 1
            if args.write:
                p.write_text(new, encoding='utf-8')

    print(f"\n  ── P2 codemod（{'已写入' if args.write else '试运行'}）──")
    print(f"  文件: {changed}")
    for k, v in rep.most_common():
        print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
