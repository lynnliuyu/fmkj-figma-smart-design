'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type DocKindOption = {
  kind: string
  label: string
  layouts: { value: string; label: string }[]
}
export type DocStyleOption = {
  id: string
  name: string
  description: string
  swatch: string[]
  enabled: boolean
}

function Swatch({ colors }: { colors: string[] }) {
  return (
    <span
      className="flex shrink-0 overflow-hidden rounded-sm ring-1 ring-foreground/10"
      aria-hidden
    >
      {colors.map((c) => (
        <span key={c} className="size-3" style={{ backgroundColor: c }} />
      ))}
    </span>
  )
}

/** 文档模板：每类文档的默认风格和版式（打印页仍可临时切换）。 */
export function DocumentTemplateSettings({
  kinds,
  styles,
  defaults,
}: {
  kinds: DocKindOption[]
  styles: DocStyleOption[]
  defaults: Record<string, { style?: string; layout?: string }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>文档模板</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {kinds.map((k) => {
          const d = defaults[k.kind] ?? {}
          const style = styles.some((s) => s.id === d.style) ? d.style! : styles[0]?.id
          const layout = k.layouts.some((l) => l.value === d.layout)
            ? d.layout!
            : k.layouts[0]?.value
          return (
            <div key={k.kind} className="grid items-center gap-2 sm:grid-cols-[7rem_1fr_1fr]">
              <Label className="text-sm">{k.label}</Label>
              <Select name={`doc-${k.kind}-style`} defaultValue={style}>
                <SelectTrigger className="w-full" aria-label={`${k.label}风格`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {styles.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <Swatch colors={s.swatch} />
                      {s.name}
                      {s.enabled ? null : (
                        <span className="text-xs text-muted-foreground">
                          （插件已关闭，暂用简约）
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select name={`doc-${k.kind}-layout`} defaultValue={layout}>
                <SelectTrigger className="w-full" aria-label={`${k.label}版式`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {k.layouts.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
