import Link from 'next/link'
import { Blocks, ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { PluginId } from '@/plugins/types'

import { PLUGIN_ICONS } from './plugin-icons'

export type PluginViewItem = {
  id: string
  name: string
  tagline: string
  description: string
  status: 'ready' | 'coming-soon'
  /** 在项目里的入口说明（待开发功能为 null） */
  entry: string | null
  provides: string[]
}

/** 能力中心的一段（AI 能力 / 模板 / 工具） */
export type PluginViewSection = {
  key: string
  label: string
  hint: string
  items: PluginViewItem[]
}

/**
 * 能力中心列表：按分类分段展示，卡片只展示信息并点进详情页。
 * 普通用户不安装、不启停，因此这里没有任何开关。
 */
export function PluginList({
  sections,
  selectedId,
}: {
  sections: PluginViewSection[]
  selectedId: string | null
}) {
  const renderCard = (p: PluginViewItem) => {
    const pending = p.status === 'coming-soon'
    const selected = selectedId === p.id
    const Icon = PLUGIN_ICONS[p.id as PluginId] ?? Blocks
    return (
      <Card
        key={p.id}
        id={p.id}
        className={cn(
          'flex flex-col justify-between gap-4 py-4 transition-shadow hover:shadow-md',
          pending && 'bg-muted/25',
          selected && 'ring-2 ring-primary',
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl border',
                pending
                  ? 'bg-muted text-muted-foreground'
                  : 'border-primary/20 bg-primary/10 text-primary',
              )}
            >
              <Icon className="size-4.5" />
            </div>
            <CardTitle className="min-w-0 truncate text-base leading-snug">
              <Link
                href={`/plugins/${p.id}`}
                className={cn(
                  'underline-offset-4 hover:underline',
                  pending && 'text-muted-foreground',
                )}
              >
                {p.name}
              </Link>
            </CardTitle>
          </div>
          {pending ? (
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              规划中
            </Badge>
          ) : null}
        </CardHeader>

        <CardContent className="flex-1 py-0">
          <p className="text-sm leading-relaxed text-muted-foreground">{p.tagline}</p>
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2 border-t pt-3 pb-0 text-xs text-muted-foreground">
          <span className="truncate">{p.entry ? `入口：${p.entry}` : null}</span>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 shrink-0 text-muted-foreground hover:text-foreground"
            href={`/plugins/${p.id}`}
            icon={<ChevronRight />}
            label="详情"
          />
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-sm font-medium text-foreground">{section.label}</h2>
            {section.hint ? <p className="text-xs text-muted-foreground">{section.hint}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map(renderCard)}
          </div>
        </section>
      ))}
    </div>
  )
}
