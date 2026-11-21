import Link from 'next/link'
import { Blocks, ChevronRight } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { List, ListItem } from '@astryxdesign/core/List'
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
 * 能力中心列表：按分类分段，每段是一组 edge-to-edge 行（List + ListItem），
 * 不再是卡片网格 —— 这些条目是同构的可选能力，适合行式扫描。
 * 普通用户不安装、不启停，因此这里没有任何开关。
 */
export function PluginList({
  sections,
  selectedId,
}: {
  sections: PluginViewSection[]
  selectedId: string | null
}) {
  const renderRow = (p: PluginViewItem) => {
    const pending = p.status === 'coming-soon'
    const selected = selectedId === p.id
    const Icon = PLUGIN_ICONS[p.id as PluginId] ?? Blocks
    return (
      <ListItem
        key={p.id}
        id={p.id}
        href={`/plugins/${p.id}`}
        isSelected={selected}
        startContent={
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg border',
              pending
                ? 'bg-muted text-muted-foreground'
                : 'border-primary/20 bg-primary/10 text-primary',
            )}
          >
            <Icon className="size-4" />
          </span>
        }
        label={p.name}
        description={
          <span className="block">
            {p.tagline}
            {p.entry ? (
              <span className={cn('block text-xs', pending ? 'text-muted-foreground' : '')}>
                入口：{p.entry}
              </span>
            ) : null}
          </span>
        }
        endContent={
          pending ? (
            <Badge variant="neutral" className="shrink-0 text-xs" label="规划中" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )
        }
      />
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
          <List hasDividers density="balanced" edge="flush">
            {section.items.map(renderRow)}
          </List>
        </section>
      ))}
    </div>
  )
}
