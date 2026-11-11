#!/usr/bin/env python3
"""
P3：本仓 `<Input>` → 官方 `<TextInput>`。

## 映射规则（每条都在 login-form 上真机验证过）

| 本仓 | 官方 |
|---|---|
| `<Input>` | `<TextInput>` |
| `className="…"` | `controlClassName="…"`（官方不收 className） |
| `onChange={(e) => setX(e.target.value)}` | `onChange={(v) => setX(v)}` |
| `autoFocus` | `hasAutoFocus` |
| `maxLength={N}` | 删掉（官方不支持；调用点通常已在 onChange 里截断） |
| 无 label | 补 `label={…}` + `isLabelHidden`（官方 label 必填） |

label 来源优先级：`aria-label` → `placeholder` → `id` → `"输入框"`。

## 不处理的两类（留给人工）

1. **`type` 不在官方白名单**（text/password/email/search/tel/url）——
   如 `number` / `date` / `file`。这些要保留原生 input（本仓适配层也是这么做的）。
2. **`onChange` 里拿 `e` 做别的事**（`e.preventDefault()` / `e.target.selectionStart`）——
   官方只给值，这些拿不到。

用法：
    python3 scripts/codemod-astryx-p3-input.py            # 试运行
    python3 scripts/codemod-astryx-p3-input.py --write
"""
import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

SUPPORTED_TYPES = {'text', 'password', 'email', 'search', 'tel', 'url'}


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
    if '<Input' not in src:
        return src

    # 先把 import 备好（只在真的改了之后加）
    changed = False
    out, pos = [], 0
    while True:
        m = re.search(r'<Input(?![A-Za-z])', src[pos:])
        if not m:
            out.append(src[pos:])
            break
        st = pos + m.start()
        te = tag_end(src, st)
        if te == -1:
            out.append(src[pos:])
            break
        raw = src[st + len('<Input'): te]
        stripped = raw.rstrip()
        if not stripped.endswith('/'):
            # 非自闭合的 <Input>…</Input>：罕见，跳过留给人工
            rep['跳过（非自闭合）'] += 1
            out.append(src[pos:te + 1])
            pos = te + 1
            continue
        attrs = stripped[:-1]

        mt = re.search(r'type="([^"]+)"', attrs)
        typ = mt.group(1) if mt else 'text'
        if typ not in SUPPORTED_TYPES:
            rep[f'跳过（type={typ} 需原生）'] += 1
            out.append(src[pos:te + 1])
            pos = te + 1
            continue

        # ① 官方不支持非受控（defaultValue）—— 这层转译留在适配层更安全
        if re.search(r'(?<![\w-])defaultValue=', attrs):
            rep['跳过（defaultValue 非受控）'] += 1
            out.append(src[pos:te + 1])
            pos = te + 1
            continue

        # ② onBlur / onKeyDown 里用 e.target 之类 → 官方只给值，拿不到
        if re.search(r'on(Blur|Focus|KeyDown|KeyUp)=\{\((\w+)\) =>[^}]*\1\.target', attrs):
            rep['跳过（onBlur/onKeyDown 依赖事件）'] += 1
            out.append(src[pos:te + 1])
            pos = te + 1
            continue

        # onChange 里有 e.preventDefault / selectionStart 之类 → 跳过
        onch = re.search(r'onChange=\{(.*?)\}(?=\s|\n|$)', attrs, re.S)
        if onch and re.search(r'e\.(preventDefault|stopPropagation|target\.selection)', onch.group(1)):
            rep['跳过（onChange 依赖事件对象）'] += 1
            out.append(src[pos:te + 1])
            pos = te + 1
            continue

        mid = re.search(r'id="([^"]+)"', attrs)
        mal = re.search(r'aria-label="([^"]*)"', attrs)
        mpl = re.search(r'placeholder="([^"]*)"', attrs)
        # label 必须是可读的中文；拿不到就退回字段名（至少能区分解屏阅读）
        label = (mal.group(1) if mal else '') or (mpl.group(1) if mpl else '')
        if not label and mid:
            label = mid.group(1)
        if not label:
            rep['⚠️ 无可用 label（用「表单字段」兜底，需人工）'] += 1
            label = '表单字段'

        new_attrs = attrs
        # ① id → 保留（实现里支持）
        # ② className → controlClassName
        new_attrs = re.sub(r'(?<![\w-])className=', 'controlClassName=', new_attrs)
        # ③ autoFocus → hasAutoFocus
        new_attrs = re.sub(r'(?<![\w-])autoFocus(?==)', 'hasAutoFocus', new_attrs)
        new_attrs = re.sub(r'(?<![\w-])autoFocus(?=\s|$)', 'hasAutoFocus', new_attrs)
        # ③.5 布尔属性名映射（官方统一 is* 前缀）
        for old, new in [('disabled', 'isDisabled'), ('readOnly', 'isReadOnly'),
                         ('required', 'isRequired')]:
            new_attrs = re.sub(rf'(?<![\w-]){old}(?=[\s/>=])', new, new_attrs)

        # ④ maxLength 删掉
        new_attrs = re.sub(r'\s*maxLength=\{[^}]*\}', '', new_attrs)
        new_attrs = re.sub(r'\s*maxLength="[^"]*"', '', new_attrs)
        # ⑤ onChange 的 e.target.value → v（不限于 setX，也包括 patchForm({...}) 这类）
        new_attrs = new_attrs.replace('(e) =>', '(v) =>')
        new_attrs = new_attrs.replace('e.target.value', 'v')

        # ⑥ 补 label + isLabelHidden（若没有 label）
        # ⚠️ 不能用 `'label=' in attrs` 判断 —— `aria-label=` 里也含 'label='
        if not re.search(r'(?<![\w-])label=', new_attrs):
            new_attrs = f' label={{{json.dumps(label, ensure_ascii=False)}}} isLabelHidden' + new_attrs

        line_start = src[:st].rfind('\n') + 1
        indent = src[line_start:st]
        # 保留原有的换行结构（属性多时逐行读更清楚），只补统一的缩进
        body_lines = [ln.strip() for ln in new_attrs.split('\n') if ln.strip()]
        sep = '\n' + indent + '  '
        new_tag = '<TextInput' + sep + sep.join(body_lines) + '\n' + indent + '/>'

        out.append(src[pos:st] + new_tag)
        pos = te + 1
        changed = True
        rep['Input → TextInput'] += 1

    result = ''.join(out)
    if changed:
        # ⚠️ 如果这个文件里还有被跳过的 <Input>（type 不支持），必须保留原 import，
        # 否则那些地方会「Cannot find name 'Input'」。
        still_has_input = bool(re.search(r'<Input(?![A-Za-z])', result))
        if still_has_input:
            result = re.sub(
                r"import\s*\{\s*Input\s*\}\s*from\s*'@/components/ui/input'",
                "import { TextInput } from '@astryxdesign/core/TextInput'\n"
                "import { Input } from '@/components/ui/input'", result,
            )
        else:
            result = re.sub(
                r"import\s*\{\s*Input\s*\}\s*from\s*'@/components/ui/input'",
                "import { TextInput } from '@astryxdesign/core/TextInput'", result,
            )
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()

    files = subprocess.run(
        ['grep', '-rl', 'components/ui/input', 'src', '--include=*.tsx'],
        capture_output=True, text=True,
    ).stdout.strip().split('\n')
    files = [f for f in files if f and 'components/ui/input.tsx' not in f and
             'components/ui/input-group.tsx' not in f]

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

    print(f"\n  ── P3 Input codemod（{'已写入' if args.write else '试运行'}）──")
    print(f"  文件: {changed}")
    for k, v in rep.most_common():
        print(f"  {k}: {v}")


if __name__ == '__main__':
    main()
