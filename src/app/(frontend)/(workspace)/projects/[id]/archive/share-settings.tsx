'use client'

import { useState, useTransition } from 'react'
import { CalendarClock, KeyRound, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import { Field } from '@astryxdesign/core/Field'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Input } from '@/components/ui/input'
import type { ShareConfig } from '@/lib/project-access'

import { setShareSettings } from './actions'

/** 把 ISO 串转成 <input type="datetime-local"> 需要的本地格式（YYYY-MM-DDTHH:mm） */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 业主分享链接的有效期与访问密码。
 *
 * 三态跟用户讲清楚：不填 = 永不过期 / 不需要密码；填了才生效。
 * 密码只存摘要，保存后无法回显，所以密码框永远是空的，placeholder 说明当前状态。
 */
export function ShareSettings({ projectId, config }: { projectId: string; config: ShareConfig }) {
  const [expiresAt, setExpiresAt] = useState(toLocalInput(config.expiresAt))
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [saving, startSave] = useTransition()

  const hasPassword = Boolean(config.passwordHash)
  const expired = Boolean(config.expiresAt) && Date.parse(config.expiresAt as string) < Date.now()

  function save() {
    startSave(async () => {
      const res = await setShareSettings(projectId, {
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        // 清空输入框 = 不修改；要清除密码得显式勾选
        password: clearPassword ? '' : password || undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setPassword('')
      setClearPassword(false)
      toast.success('分享设置已保存', {
        description: res.config.expiresAt
          ? `链接将于 ${new Date(res.config.expiresAt).toLocaleString('zh-CN')} 失效`
          : '链接当前永久有效',
      })
    })
  }

  return (
    <section className="rounded-[var(--radius-container)] border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <KeyRound className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">分享链接的安全设置</h3>
        {expired ? (
          <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive-strong">
            已过期
          </span>
        ) : hasPassword ? (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            已设访问密码
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <Field label="有效期" inputID="share-expires">
          <Input
            id="share-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            留空 = 永久有效。到期后业主打开链接会看到「链接已过期」，不影响你自己登录查看。
          </p>
        </Field>

        <Field label="访问密码" inputID="share-password">
          <TextInput
            label={'share-password'}
            isLabelHidden
            id="share-password"
            type="text"
            value={password}
            isDisabled={clearPassword}
            placeholder={hasPassword ? '已设置；留空则保持不变' : '留空则不需要密码'}
            onChange={(v) => setPassword(v)}
            controlClassName="w-full max-w-xs"
            autoComplete="new-password"
          />
          {hasPassword ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => {
                  setClearPassword(e.target.checked)
                  if (e.target.checked) setPassword('')
                }}
              />
              清除访问密码（业主可直接打开链接）
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              设置后，业主首次打开链接需要输入密码。密码只保存摘要，无法找回，只能重设。
            </p>
          )}
        </Field>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            isDisabled={saving}
            onClick={save}
            icon={<Loader2 />}
            label="保存设置"
          />
          <span className="text-xs text-muted-foreground">
            只影响业主预览链接，不改变你和协作成员的访问权限。
          </span>
        </div>
      </div>
    </section>
  )
}
