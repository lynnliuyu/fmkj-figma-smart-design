#!/usr/bin/env python3
"""
P3b：本仓 `Switch` / `Checkbox` → 官方 `Switch` / `CheckboxInput`。

## 映射（两条都在官方 d.ts + 适配层注释里确认过）

| 本仓（radix 风格） | 官方 |
|---|---|
| `<Switch checked={x} onCheckedChange={f} />` | `<Switch value={x} onChange={(c) => f(c)} />` |
| `<Checkbox checked={x} onCheckedChange={f} />` | `<CheckboxInput value={x} onChange={(c) => f(c)} />` |
| `disabled` | `isDisabled` |
| 无 label | 补 `label={…}` + `isLabelHidden`（官方必填） |

`onCheckedChange` 的回调签名一致（都收 boolean），所以直接改名即可。

## 跳过条件（转过去会丢东西）

1. `defaultChecked` —— 官方是受控组件（`value` 必填），没有非受控形态
2. `onCheckedChange` 里用了第二个参数或 `e` —— 官方给 `(checked, e)`，但本仓惯用单参
   （这条一般没问题；只要回调里没有 `e.` 就安全）

用法：
    python3 scripts/codemod-astryx-p3b.py            # 试运行
    python3 scripts/codemod-astryx-p3b.py --write
"""
import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

CONFIG = {
    'Switch': {
        'import_src': 'components/ui/switch',
        'import_dst': "import { Switch } from '@astryxdesign/core/Switch'",
        'val_prop': 'value',
    },
    'Checkbox': {
        'import_src': 'components/ui/checkbox',
        'import_dst': "import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'",
        'val_prop': 'value',
        'rename_to': 'CheckboxInput',
    },
}


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


def process(src: str, rep: Counter) -> str:
    for comp, cfg in CONFIG.items():
        if f'<{comp}' not in src:
            continue

        # import 先按需替换（最后统一处理，这里只标记）
        out, pos = [], 0
        while True:
            m = re.search(rf'<{comp}(?![A-Za-z])', src[pos:])
            if not m:
                out.append(src[pos:])
                break
            st = pos + m.start()
            te = tag_end(src, st)
            if te == -1:
                out.append(src[pos:])
                break
            raw = src[st + len(f'<{comp}'): te]
            stripped = raw.rstrip()
            if not stripped.endswith('/'):
                rep[f'跳过（{comp} 非自闭合）'] += 1
                out.append(src[pos:te + 1])
                pos = te + 1
                continue
            attrs = stripped[:-1]

            # 跳过非受控
            if re.search(r'(?<![\w-])defaultChecked=', attrs):
                rep[f'跳过（{comp} defaultChecked 非受控）'] += 1
                out.append(src[pos:te + 1])
                pos = te + 1
                continue

            new_attrs = attrs
            # checked → value
            new_attrs = re.sub(r'(?<![\w-])checked=', 'value=', new_attrs)
            # onCheckedChange → onChange（签名兼容，直接改名）
            new_attrs = re.sub(r'(?<![\w-])onCheckedChange=', 'onChange=', new_attrs)
            # disabled → isDisabled
            new_attrs = re.sub(r'(?<![\w-])disabled(?=[\s/>=])', 'isDisabled', new_attrs)

            # 补 label
            if not re.search(r'(?<![\w-])label=', new_attrs):
                # label 只是给屏幕阅读器用的名称（isLabelHidden 会隐藏可视标签）。
                # 优先用调用点已有的 aria-label；没有就按组件类型给个中性词。
                mal = re.search(r'aria-label="([^"]*)"', new_attrs)
                if mal:
                    label = mal.group(1)
                    # 已有 aria-label 就不必再带 label（官方会用它做可访问名称）
                    new_attrs = f' label={{{json.dumps(label, ensure_ascii=False)}}} isLabelHidden' + new_attrs
                else:
                    rep[f'⚠️ {comp} 无 aria-label（用中性名兜底，建议人工核对）'] += 1
                    neutral = '开关' if comp == 'Switch' else '选择'
                    new_attrs = f' label={{{json.dumps(neutral, ensure_ascii=False)}}} isLabelHidden' + new_attrs

            new_name = cfg.get('rename_to', comp)
            line_start = src[:st].rfind('\n') + 1
            indent = src[line_start:st]
            body_lines = [ln.strip() for ln in new_attrs.split('\n') if ln.strip()]
            sep = '\n' + indent + '  '
            new_tag = f'<{new_name}' + sep + sep.join(body_lines) + '\n' + indent + '/>'

            out.append(src[pos:st] + new_tag)
            pos = te + 1
            rep[f'{comp} → {new_name}'] += 1

        src = ''.join(out)

    # import 替换：只有该组件**在该文件里已完全不再出现**时才换来源。
    # （否则被跳过的那些会「import 指向官方、但用法是适配层」，类型对不上）
    for comp, cfg in CONFIG.items():
        pattern = rf"import\s*\{{\s*{comp}\s*\}}\s*from\s*'@/{cfg['import_src']}'"
        if not re.search(pattern, src):
            continue
        # 判断「还有没有走适配层的用法」：跳过的那些保留了 checked / onCheckedChange
        still_adapter = bool(re.search(
            rf'<{comp}(?![A-Za-z])[\s\S]{{0,400}}?(?:\bchecked=|\bonCheckedChange=|\bdefaultChecked=)',
            src))
        if still_adapter:
            # 同名的（Switch）不能重复 import；改名的（Checkbox）两个都引
            if comp != cfg.get('rename_to', comp):
                src = re.sub(pattern, cfg['import_dst'] + '\n' +
                             f"import {{ {comp} }} from '@/{cfg['import_src']}'", src)
            continue
        src = re.sub(pattern, cfg['import_dst'], src)

    return src


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    files = set()
    for cfg in CONFIG.values():
        r = subprocess.run(['grep', '-rl', cfg['import_src'], 'src', '--include=*.tsx'],
                           capture_output=True, text=True).stdout.strip().split('\n')
        files.update(f for f in r if f and f'ui/{cfg["import_src"].split("/")[-1]}.tsx' not in f)

    rep = Counter()
    changed = 0
    for f in sorted(files):
        p = Path(f)
        src = p.read_text(encoding='utf-8')
        new = process(src, rep)
        if new != src:
            changed += 1
            if args.write:
                p.write_text(new, encoding='utf-8')

    print(f"\n  ── P3b codemod（{'已写入' if args.write else '试运行'}）──")
    print(f"  文件: {changed}")
    for k, v in rep.most_common():
        print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
