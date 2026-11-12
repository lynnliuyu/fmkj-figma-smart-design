'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import { Field } from '@astryxdesign/core/Field'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { CollaboratorRole } from '@/lib/project-access'

export function JoinCard({
  projectId,
  token,
  role,
  currentUser,
}: {
  projectId: string
  token: string
  role: CollaboratorRole
  currentUser: { name: string; email: string } | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(mode: 'current' | 'login') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/join/${projectId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mode, email, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? '加入失败，请稍后重试')
        return
      }
      toast.success(role === 'edit' ? '已加入项目协作（可编辑）' : '已加入项目协作（仅查看）')
      router.push(`/projects/${projectId}`)
      router.refresh()
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  if (currentUser) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-xs">
          <div className="text-muted-foreground">当前登录账号</div>
          <div className="mt-0.5 font-medium text-foreground">
            {currentUser.name}（{currentUser.email}）
          </div>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button
          className="w-full"
          isDisabled={busy}
          onClick={() => void submit('current')}
          icon={<Loader2 />}
          label="接受邀请并进入项目"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit('login')
        }}
      >
        <Field label="成员邮箱" inputID="join-email">
          <TextInput
            label={'name@example.com'}
            isLabelHidden
            id="join-email"
            type="email"
            isRequired
            value={email}
            onChange={(v) => setEmail(v)}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="密码" inputID="join-password">
          <TextInput
            label={'••••••'}
            isLabelHidden
            id="join-password"
            type="password"
            isRequired
            value={password}
            onChange={(v) => setPassword(v)}
            placeholder="••••••"
          />
        </Field>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button
          type="submit"
          className="w-full"
          isDisabled={busy}
          icon={<Loader2 />}
          label="登录并加入项目"
        />
        <p className="text-center text-xs text-muted-foreground">
          请使用管理员为您开通的成员账号登录
        </p>
      </form>
    </div>
  )
}
