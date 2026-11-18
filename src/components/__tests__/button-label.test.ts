import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * 防回归：`label` 里不能出现「JSX 表达式被当成文字」的残骸。
 *
 * 背景：Astryx Button 的 `label` 是必填字符串。机械把 `<Button>{icon}{n ? ... : null}</Button>`
 * 转成 `label="{n ? ( ): null}"` 时，表达式会被抽成「看起来像代码、实际是文字」的字符串 ——
 * **tsc、ESLint、构建都不会报错**，只有真渲染出来才看得见（表现：界面上显示 `{n ? ( ): null}`）。
 *
 * 这个测试用静态扫描兜住它。
 */
const BAD_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /label="[^"]*\{[^}]*\}"/, why: 'JSX 表达式被当成了 label 字符串' },
  { re: /label=\{\{/, why: '双大括号 label={{...}}' },
  { re: /label="[^"]*[（(]\s*[）)]/, why: 'label 里有空括号（表达式被吃掉）' },
  { re: /label="[^"]*「」/, why: 'label 里有空直角引号（表达式被吃掉）' },
  { re: /label="[^"]*\$\s/, why: 'label 里有孤立 $（模板串 ${} 被吃掉）' },
  { re: /label=\{[^}]*`[^`]*\$\s[^`]*`/, why: 'label 模板串里有空占位 ${}' },
  { re: /label="[^"]*onOpenChange/, why: 'label 里混进了事件处理器片段' },
]

describe('Button label 不含表达式残骸', () => {
  it('全仓 label 通过静态扫描', () => {
    const files = execSync('grep -rl "@astryxdesign/core/Button" src --include=*.tsx', {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    expect(files.length).toBeGreaterThan(10)

    const hits: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const { re, why } of BAD_PATTERNS) {
        for (const line of src.split('\n')) {
          if (!line.includes('label=') || line.includes('aria-label')) continue
          if (re.test(line)) hits.push(`${f}: ${why} → ${line.trim().slice(0, 80)}`)
        }
      }
    }
    expect(hits, `发现 ${hits.length} 处 label 残骸：\n${hits.join('\n')}`).toEqual([])
  })
})
