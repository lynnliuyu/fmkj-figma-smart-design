'use client'

import { useState, useTransition } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Label } from '@/components/ui/label'

import { unlockShareLink } from './actions'

/**
 * 分享链接的访问密码输入屏。
 *
 * 密码校验在 server action 里做（明文不经过客户端日志），成功后服务端写一个
 * httpOnly cookie，下次直接放行；失败返回错误文案，不暴露任何哈希信息。
 */
export function UnlockForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, startUnlock] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startUnlock(async () => {
      const res = await unlockShareLink(token, password)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // 校验通过：整页刷新，让服务端带着新 cookie 重新渲染方案内容
      window.location.reload()
    })
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6">
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <KeyRound className="size-4 text-muted-foreground" />
          </span>
          <div className="text-base font-semibold">这个方案需要访问密码</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            请输入对接人给你的密码。密码只用于打开这一份方案，不会保存你的登录状态。
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="share-unlock-password" className="text-xs font-medium">
            访问密码
          </Label>
          <TextInput
            label={'请输入密码'}
            isLabelHidden
            id="share-unlock-password"
            type="password"
            value={password}
            hasAutoFocus
            autoComplete="off"
            onChange={(v) => setPassword(v)}
            placeholder="请输入密码"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'share-unlock-error' : undefined}
          />
          {error ? (
            <p id="share-unlock-error" className="text-xs text-destructive-strong">
              {error}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          isDisabled={pending || !password}
          icon={<Loader2 />}
          label="打开方案"
        />
      </form>
    </div>
  )
}
