'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function PluginDetailToggle({
  id,
  name,
  status,
  initialEnabled,
}: {
  id: string
  name: string
  status: 'ready' | 'coming-soon'
  initialEnabled: boolean
  /** 严格模式下会员等级不够：不能开启（可以关闭） */
}) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [busy, setBusy] = useState(false)

  if (status === 'coming-soon') {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-muted-foreground">
          规划中
        </Badge>
      </div>
    )
  }

  async function handleChange(next: boolean) {
    if (busy) return
    setBusy(true)
    setEnabled(next)
    try {
      const res = await fetch('/plugins/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setEnabled(!next)
        toast.error(data.error ?? '保存失败，请稍后重试')
        return
      }
      toast.success(next ? `已开启「${name}」` : `已关闭「${name}」`)
      router.refresh()
    } catch {
      setEnabled(!next)
      toast.error('网络错误，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Badge variant={enabled ? 'success' : 'outline'}>{enabled ? '已开启' : '已关闭'}</Badge>
      <div className="flex items-center gap-2">
        <Label htmlFor="plugin-detail-switch" className="text-xs text-muted-foreground">
          启用插件
        </Label>
        <Switch
          id="plugin-detail-switch"
          checked={enabled}
          disabled={busy}
          onCheckedChange={(next) => void handleChange(next)}
        />
      </div>
    </div>
  )
}
