import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * AI 回复的轻量 Markdown 渲染（不注入 HTML，杜绝 XSS）：
 * 标题、段落、粗体/斜体/删除线、行内代码、代码块、有序/无序列表、引用、分隔线、表格与链接。
 * 流式输出时未闭合的代码块按代码块渲染，不会闪烁成原始符号。
 */

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]*\))|(\*[^*\s\n][^*\n]*\*)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`
    if (m[1])
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    else if (m[2])
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(token.slice(2, -2), key)}
        </strong>,
      )
    else if (m[3]) out.push(<del key={key}>{token.slice(2, -2)}</del>)
    else if (m[4]) {
      const label = token.slice(1, token.indexOf(']'))
      const href = token.slice(token.indexOf('](') + 2, -1)
      out.push(
        href.startsWith('/') && !href.startsWith('//') ? (
          <Link key={key} href={href} className="text-primary underline-offset-4 hover:underline">
            {label}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {label}
          </a>
        ),
      )
    } else if (m[5]) out.push(<em key={key}>{token.slice(1, -1)}</em>)
    last = idx + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function withBreaks(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, i) =>
    i === 0
      ? renderInline(line, `${keyPrefix}-${i}`)
      : [<br key={`${keyPrefix}-br-${i}`} />, ...renderInline(line, `${keyPrefix}-${i}`)],
  )
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  const key = () => `b${k++}`

  while (i < lines.length) {
    const line = lines[i]
    // 代码块
    const fence = /^\s*```(\S*)/.exec(line)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
      i++
      blocks.push(
        <pre
          key={key()}
          className="overflow-x-auto rounded-lg bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed"
        >
          <code>{code.join('\n')}</code>
        </pre>,
      )
      continue
    }
    if (!line.trim()) {
      i++
      continue
    }
    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        <p
          key={key()}
          className={cn(
            'font-semibold text-foreground',
            level <= 2 ? 'mt-1 text-[0.95rem]' : 'text-sm',
          )}
        >
          {renderInline(heading[2], `h${k}`)}
        </p>,
      )
      i++
      continue
    }
    // 分隔线
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key()} className="my-1 border-border" />)
      i++
      continue
    }
    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim())
        rows.push(splitRow(lines[i++]))
      blocks.push(
        <div key={key()} className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/60">
              <tr>
                {header.map((h, hi) => (
                  <th
                    key={hi}
                    className="border-b px-2.5 py-1.5 text-left font-medium whitespace-nowrap"
                  >
                    {renderInline(h, `th${k}-${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-0">
                  {header.map((_, ci) => (
                    <td key={ci} className="px-2.5 py-1.5 align-top">
                      {renderInline(r[ci] ?? '', `td${k}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    // 引用
    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]))
        quote.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(
        <blockquote key={key()} className="border-l-2 border-primary/40 pl-3 text-muted-foreground">
          {withBreaks(quote, `q${k}`)}
        </blockquote>,
      )
      continue
    }
    // 列表（支持一级缩进）
    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
    if (listItem.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line)
      const items: { text: string; depth: number }[] = []
      while (i < lines.length) {
        const m = listItem.exec(lines[i])
        if (m) {
          items.push({ text: m[3], depth: m[1].length >= 2 ? 1 : 0 })
          i++
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1].text += `\n${lines[i].trim()}`
          i++
        } else break
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag
          key={key()}
          className={cn('space-y-1 pl-5', ordered ? 'list-decimal' : 'list-disc')}
        >
          {items.map((it, ii) => (
            <li key={ii} className={cn(it.depth ? 'ml-4 list-[circle]' : '')}>
              {withBreaks(it.text.split('\n'), `li${k}-${ii}`)}
            </li>
          ))}
        </ListTag>,
      )
      continue
    }
    // 段落：连续的普通行合并
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*```/.test(lines[i]) &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i++])
    }
    if (!para.length) {
      i++
      continue
    }
    blocks.push(<p key={key()}>{withBreaks(para, `p${k}`)}</p>)
  }

  return (
    <div className={cn('space-y-2 text-sm leading-relaxed break-words', className)}>
      {blocks.map((b, bi) => (
        <Fragment key={bi}>{b}</Fragment>
      ))}
    </div>
  )
}
