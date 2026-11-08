'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Blocks, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { PluginId } from '@/plugins/types'

import { PLUGIN_ICONS } from './plugin-icons'

export type PluginViewItem = {
  id: string
  name: string
  tagline: string
  description: string
  status: 'ready' | 'coming-soon'
  stage: string
  /** 在项目里的入口说明（待开发插件为 null） */
  entry: string | null
  provides: string[]
  enabled: boolean
}

type StageGroup = { key: string; label: string; hint: string; step: number | null }


export function PluginList({ items, selectedId }: { items: PluginViewItem[]; selectedId: string | null }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})

  async function toggle(item: PluginViewItem, next: boolean) {
    if (item.status !== 'ready' || busyId) return
    setBusyId(item.id)
    setOptimistic((prev) => ({ ...prev, [item.id]: next }))
    try {
      const res = await fetch('/plugins/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, enabled: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setOptimistic((prev) => ({ ...prev, [item.id]: item.enabled }))
        toast.error(data.error ?? '操作失败，请稍后重试')
        return
      }
      toast.success(next ? `已开启「${item.name}」` : `已关闭「${item.name}」`)
      router.refresh()
    } catch {
      setOptimistic((prev) => ({ ...prev, [item.id]: item.enabled }))
      toast.error('网络错误，请稍后重试')
    } finally {
      setBusyId(null)
    }
  }


  const renderCard = (p: PluginViewItem) => {
    const enabled = optimistic[p.id] ?? p.enabled
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
                  : enabled
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'bg-muted/60 text-muted-foreground',
              )}
            >
              <Icon className="size-4.5" />
            </div>
            <CardTitle className="min-w-0 truncate text-base leading-snug">
              <Link
                href={`/plugins/${p.id}`}
                className={cn('underline-offset-4 hover:underline', pending && 'text-muted-foreground')}
              >
                {p.name}
              </Link>
            </CardTitle>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {pending ? (
              <Badge variant="outline" className="text-xs text-muted-foreground">规划中</Badge>
            ) : (
              <Switch
                id={`plugin-${p.id}`}
                checked={enabled}
                disabled={busyId === p.id}
                onCheckedChange={(next) => void toggle(p, next)}
                aria-label={`切换${p.name}`}
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 py-0">
          <p className="text-sm leading-relaxed text-muted-foreground">{p.tagline}</p>
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2 border-t pt-3 pb-0 text-xs text-muted-foreground">
          <span className="truncate">{p.entry ? `入口：${p.entry}` : null}</span>
          <Button asChild variant="ghost" size="xs" className="-mr-2 shrink-0 text-muted-foreground hover:text-foreground">
            <Link href={`/plugins/${p.id}`}>
              详情
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(renderCard)}</div>
}
