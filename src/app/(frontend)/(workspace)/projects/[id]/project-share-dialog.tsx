'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  Copy,
  Eye,
  Link2,
  Loader2,
  LogOut,
  PencilLine,
  RefreshCw,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { CollaboratorRole, ProjectRole, ShareConfig } from '@/lib/project-access'
import { cn } from '@/lib/utils'

type CollaboratorView = {
  userId: string
  name: string
  email: string
  role: CollaboratorRole
  joinedAt: string | null
}

type ShareState = {
  role: ProjectRole
  owner: { id: string | null; name: string; email: string }
  shareConfig: ShareConfig
  collaborators: CollaboratorView[]
}

export function ProjectShareDialog({
  projectId,
  projectName,
  initialRole,
  initialCollaboratorCount = 0,
}: {
  projectId: string
  projectName: string
  initialRole: ProjectRole
  initialCollaboratorCount?: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [state, setState] = useState<ShareState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/projects/${projectId}/share`)
      const data = (await res.json().catch(() => null)) as (ShareState & { ok?: boolean }) | null
      if (res.ok && data?.ok) setState(data)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const shareUrl =
    typeof window !== 'undefined' && state?.shareConfig?.token
      ? `${window.location.origin}/join/${projectId}?token=${state.shareConfig.token}`
      : ''

  const updateConfig = async (patch: {
    enabled?: boolean
    role?: CollaboratorRole
    resetToken?: boolean
  }) => {
    if (!state || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/projects/${projectId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', ...patch }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        shareConfig?: ShareConfig
        error?: string
      } | null
      if (!res.ok || !data?.ok || !data.shareConfig) {
        toast.error(data?.error ?? '修改失败')
        return
      }
      setState((prev) => (prev ? { ...prev, shareConfig: data.shareConfig! } : prev))
      if (patch.resetToken) toast.success('已重置协作链接，旧链接已失效')
      else if (patch.role)
        toast.success(`协作链接权限已设为「${patch.role === 'edit' ? '可编辑' : '仅查看'}」`)
    } finally {
      setBusy(false)
    }
  }

  const updateCollaborator = async (
    userId: string,
    patch: { role?: CollaboratorRole; remove?: boolean },
  ) => {
    if (!state || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/projects/${projectId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'collaborator', userId, ...patch }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        collaborators?: CollaboratorView[]
        error?: string
      } | null
      if (!res.ok || !data?.ok || !data.collaborators) {
        toast.error(data?.error ?? '操作失败')
        return
      }
      setState((prev) => (prev ? { ...prev, collaborators: data.collaborators! } : prev))
      toast.success(patch.remove ? '已移除协作者' : '已更新协作者权限')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const leaveProject = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/projects/${projectId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leave' }),
      })
      if (res.ok) {
        toast.success('已退出该项目协作')
        setOpen(false)
        router.push('/projects')
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('协作链接已复制，可直接发给微信好友或同事')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败，请手动复制输入框中的链接')
    }
  }

  const count = state ? state.collaborators.length : initialCollaboratorCount
  const isOwner = (state?.role ?? initialRole) === 'owner'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          icon={<Users />}
          label={count > 0 ? `协作（${count}）` : '协作'}
        />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            项目协作 · {projectName}
          </DialogTitle>
          <DialogDescription>
            {isOwner ? '通过分享链接邀请同事或客户查看、编辑此项目' : '当前项目的协作权限与成员'}
          </DialogDescription>
        </DialogHeader>

        {loading || !state ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            正在读取协作信息…
          </div>
        ) : (
          <div className="space-y-4">
            {/* 链接分享区（仅项目管理员可见） */}
            {isOwner ? (
              <div className="space-y-3 rounded-xl border bg-muted/30 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 text-primary" />
                    <Label htmlFor="share-enabled" className="text-sm font-medium">
                      开启链接邀请协作
                    </Label>
                  </div>
                  <Switch
                    id="share-enabled"
                    checked={state.shareConfig.enabled}
                    disabled={busy}
                    onCheckedChange={(checked) => void updateConfig({ enabled: checked })}
                  />
                </div>

                {state.shareConfig.enabled ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void updateConfig({ role: 'read' })}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border bg-background p-2.5 text-left text-xs transition-colors',
                          state.shareConfig.role === 'read' &&
                            'border-primary bg-primary/5 ring-1 ring-primary',
                        )}
                      >
                        <Eye className="size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="font-medium">仅查看</div>
                          <div className="text-xs text-muted-foreground">查看点位、报价与导出</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void updateConfig({ role: 'edit' })}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border bg-background p-2.5 text-left text-xs transition-colors',
                          state.shareConfig.role === 'edit' &&
                            'border-primary bg-primary/5 ring-1 ring-primary',
                        )}
                      >
                        <PencilLine className="size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="font-medium">可编辑</div>
                          <div className="text-xs text-muted-foreground">
                            共同编辑点位、报价与合同
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={shareUrl}
                        className="h-8 bg-background font-mono text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => void copyLink()}
                        icon={<Check />}
                        endContent={<Copy />}
                        label={copied ? '已复制' : '复制链接'}
                      />
                      <IconButton
                        type="button"
                        variant="ghost"

                        tooltip="重置链接（旧链接立即失效）"
                        isDisabled={busy}
                        onClick={() => void updateConfig({ resetToken: true })}
                        label="重置链接"
                        icon={<RefreshCw />}
                        size="sm"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">链接已关闭，仅已加入成员可访问。</p>
                )}
              </div>
            ) : null}

            {/* 成员与权限列表 */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                项目成员（{state.collaborators.length + 1}）
              </div>
              <div className="divide-y rounded-xl border">
                {/* 创建者 */}
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{state.owner.name}</div>
                    {state.owner.email ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {state.owner.email}
                      </div>
                    ) : null}
                  </div>
                  <Badge variant="neutral" className="shrink-0 gap-1 text-xs" label={'创建者'} />
                </div>

                {/* 协作者列表 */}
                {state.collaborators.map((c) => (
                  <div
                    key={c.userId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      {c.email ? (
                        <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                      ) : null}
                    </div>
                    {isOwner ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Select
                          value={c.role}
                          disabled={busy}
                          onValueChange={(v) =>
                            void updateCollaborator(c.userId, { role: v as CollaboratorRole })
                          }
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="read">仅查看</SelectItem>
                            <SelectItem value="edit">可编辑</SelectItem>
                          </SelectContent>
                        </Select>
                        <IconButton
                          type="button"
                          variant="ghost"

                          aria-label={`移除 ${c.name}`}
                          isDisabled={busy}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => void updateCollaborator(c.userId, { remove: true })}
                          label={`移除 ${c.name}`}
                          icon={<Trash2 />}
                          size="sm"
                        />
                      </div>
                    ) : (
                      <Badge
                        variant="neutral"
                        className="text-xs"
                        label={c.role === 'edit' ? '可编辑' : '仅查看'}
                      />
                    )}
                  </div>
                ))}

                {state.collaborators.length === 0 ? (
                  <div className="px-3.5 py-4 text-center text-xs text-muted-foreground">
                    暂无协作者
                  </div>
                ) : null}
              </div>
            </div>

            {!isOwner ? (
              <div className="flex justify-end border-t pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isDisabled={busy}
                  onClick={() => void leaveProject()}
                  icon={<LogOut />}
                  label="退出该项目协作"
                />
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
