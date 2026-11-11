#!/usr/bin/env python3
"""
P2b：Skeleton / Avatar 迁到 Astryx 官方。

## Skeleton

本仓适配层（`src/components/ui/skeleton.tsx`）已经只剩 10 行，内部就是官方 Skeleton
加两样东西：

```jsx
<AstryxSkeleton data-slot="skeleton" width={…} height={…} radius={…} index={…}
                className={cn('block', className)} />
```

所以「原生化」= 把这两样搬到调用点：

1. **`data-slot="skeleton"` 必须保留** —— `e2e/smoke.mjs` 靠它统计「还没消失的骨架块」，
   少了它「页面卡在加载态」这类问题就再也抓不到。
2. **`block` 类** —— 官方 Skeleton 默认是 inline，调用点全部按块级尺寸写（`h-8 w-32`），
   不加 `block` 会全部塌成一行。

调用点形态统一（实测 41 处全是这个形状）：`<Skeleton className="h-4 w-48" />`
→ `<AstryxSkeleton data-slot="skeleton" className="block h-4 w-48" />`

## Avatar

本仓是 radix 三段式（`Avatar` + `AvatarImage` + `AvatarFallback`），官方是单组件
（`src` + `name` + 内置兜底）。适配层已经做了转译，这里把调用点改成官方形态。

**但三段式里有 `className` 定制兜底样式**（如 `bg-sidebar-primary/12 text-xs`），
官方 Avatar 只接受 `name` 不带样式钩子 —— 这类保留适配层，不硬转。

用法：
    python3 scripts/codemod-astryx-p2b.py            # 试运行
    python3 scripts/codemod-astryx-p2b.py --write
"""
import argparse
import re
import subprocess
from collections import Counter
from pathlib import Path

SKELETON_IMPORT = "import { Skeleton } from '@astryxdesign/core/Skeleton'"


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


def merge_class(attrs: str) -> str:
    """把 'block' 合并进已有的 className；没有 className 就加一个。"""
    m = re.search(r'className="([^"]*)"', attrs)
    if m:
        cls = m.group(1)
        if re.search(r'(^|\s)block(\s|$)', cls):
            return attrs
        return attrs.replace(m.group(0), f'className="block {cls}"', 1)
    m2 = re.search(r'className=\{cn\(([^)]*)\)\}', attrs)
    if m2:
        return attrs.replace(m2.group(0), f'className={{cn(\'block\', {m2.group(1)}))}}', 1)
    return attrs.rstrip() + ' className="block"'


def process_skeleton(src: str, rep: Counter) -> str:
    if '<Skeleton' not in src:
        return src

    src = re.sub(
        r"import\s*\{\s*Skeleton\s*\}\s*from\s*'@/components/ui/skeleton'",
        SKELETON_IMPORT, src,
    )

    out, pos = [], 0
    while True:
        m = re.search(r'<Skeleton(?![A-Za-z])', src[pos:])
        if not m:
            out.append(src[pos:])
            break
        st = pos + m.start()
        te = tag_end(src, st)
        if te == -1:
            out.append(src[pos:])
            break
        raw = src[st + len('<Skeleton'): te]
        stripped = raw.rstrip()
        self_closing = stripped.endswith('/')
        # 只剥掉末尾那个自闭合斜杠 —— 属性值里也可能有 '/'（如 aspect-[4/3]）
        attrs = stripped[:-1] if self_closing else raw

        if 'data-slot=' not in attrs:
            attrs = ' data-slot="skeleton"' + attrs
        attrs = merge_class(attrs)

        out.append(src[pos:st] + '<Skeleton' + attrs.rstrip() + ' />')
        rep['Skeleton'] += 1
        if self_closing:
            pos = te + 1
        else:
            close = src.find('</Skeleton>', te)
            pos = (close + len('</Skeleton>')) if close != -1 else te + 1

    return ''.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    files = subprocess.run(
        ['grep', '-rl', 'components/ui/skeleton', 'src', '--include=*.tsx'],
        capture_output=True, text=True,
    ).stdout.strip().split('\n')
    files = [f for f in files if f and 'components/ui/skeleton.tsx' not in f]

    rep = Counter()
    changed = 0
    for f in files:
        p = Path(f)
        src = p.read_text(encoding='utf-8')
        new = process_skeleton(src, rep)
        if new != src:
            changed += 1
            if args.write:
                p.write_text(new, encoding='utf-8')

    print(f"\n  ── P2b codemod（{'已写入' if args.write else '试运行'}）──")
    print(f"  文件: {changed}")
    for k, v in rep.most_common():
        print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
