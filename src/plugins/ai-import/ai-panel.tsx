'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileJson,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { SheetInfo } from '@/lib/point-scene'

/**
 * AI 识别导入插件的面板：复制提示词 → 粘贴 AI 返回的 JSON → 导入成点位；也可导出当前点位。
 * 解析规则见 ./point-import.ts，写入画布由点位图编辑器提供的 onImport 完成。
 */
export type ImportOutcome =
  | { ok: true; points: number; areas: number; warnings: string[] }
  | { ok: false; error: string }

export function AiPanel({
  sheet,
  onCopyPrompt,
  onImport,
  onExport,
  readOnly,
}: {
  sheet: SheetInfo | null
  onCopyPrompt: () => void
  onImport: (text: string, replace: boolean) => Promise<ImportOutcome>
  onExport: () => void
  readOnly: boolean
}) {
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportOutcome | null>(null)
  const run = async () => {
    setBusy(true)
    const r = await onImport(text, replace)
    setResult(r)
    setBusy(false)
    if (r.ok) setText('')
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-4 p-4">
        <ol className="space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
              1
            </span>
            下载当前图纸的标准图，连同识别提示词一起发给 AI（豆包、通义千问、Kimi、DeepSeek 等）。
          </li>
          <li className="flex gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
              2
            </span>
            把 AI 返回的 JSON 粘贴到下面，点位会自动换成平台图标放到对应位置。
          </li>
        </ol>
        <div className="rounded-lg border p-3 text-xs">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-muted-foreground">当前图纸</span>
            <span className="truncate font-medium">{sheet?.name ?? '未添加图纸'}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" asChild={!!sheet?.url} disabled={!sheet?.url}>
              {sheet?.url ? (
                <a href={sheet.url} download={`${sheet.name}.png`}>
                  <Download className="size-4" />
                  标准图纸
                </a>
              ) : (
                <span>
                  <Download className="size-4" />
                  标准图纸
                </span>
              )}
            </Button>
            <Button variant="outline" size="sm" disabled={!sheet} onClick={onCopyPrompt}>
              <ClipboardCopy className="size-4" />
              复制提示词
            </Button>
          </div>
        </div>
        {readOnly ? null : (
          <div className="space-y-2">
            <Label htmlFor="ai-json" className="text-xs">
              AI 识别结果（JSON）
            </Label>
            <Textarea
              id="ai-json"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={
                '{ "format": "fmkj-points", "sheets": [{ "name": "…", "points": [{ "type": "downlight", "x": 0.41, "y": 0.23 }] }] }'
              }
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-replace"
                checked={replace}
                onCheckedChange={(v) => setReplace(v === true)}
              />
              <Label htmlFor="ai-replace" className="text-xs font-normal">
                导入前清空对应图纸上的点位和区域
              </Label>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Button
                size="sm"
                disabled={!text.trim() || busy || !sheet}
                onClick={() => void run()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                导入并生成点位
              </Button>
              <Button size="sm" variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload className="size-4" />
                  文件
                  <input
                    type="file"
                    accept=".json,application/json,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void f.text().then(setText)
                      e.target.value = ''
                    }}
                  />
                </label>
              </Button>
            </div>
          </div>
        )}
        {result ? (
          result.ok ? (
            <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-success">
                <CheckCircle2 className="size-4" />
                已生成 {result.points} 个点位{result.areas ? `、${result.areas} 个区域` : ''}
              </p>
              {result.warnings.map((w) => (
                <p key={w} className="text-muted-foreground">
                  {w}
                </p>
              ))}
              <p className="text-muted-foreground">
                位置有偏差时直接拖动即可；按 Ctrl/⌘ + Z 可撤销整次导入。
              </p>
            </div>
          ) : (
            <p className="flex gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive-strong">
              <AlertTriangle className="size-4 shrink-0" />
              {result.error}
            </p>
          )
        ) : null}
        <div className="border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={onExport}
          >
            <FileJson className="size-4" />
            导出当前点位（同一格式）
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}
