'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ImageIcon, Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Values = {
  name: string
  slogan: string
  phone: string
  email: string
  address: string
  qrCaption: string
  quoteNotes: string
  logoUrl: string | null
  qrCodeUrl: string | null
}

function ImageField({ name, label, url, hint }: { name: 'logo' | 'qrCode'; label: string; url: string | null; hint: string }) {
  const [preview, setPreview] = useState(url)
  const [removed, setRemoved] = useState(false)
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={label} className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground/60" />
          )}
        </div>
        <div className="grid flex-1 gap-1.5">
          <Input
            id={name}
            name={name}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setPreview(URL.createObjectURL(f))
                setRemoved(false)
              }
            }}
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {preview ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`移除${label}`} onClick={() => { setPreview(null); setRemoved(true) }}>
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      {removed ? <input type="hidden" name={`${name}Remove`} value="1" /> : null}
    </div>
  )
}

export function CompanyForm({ initial }: { initial: Values }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/settings/company', { method: 'POST', body: new FormData(e.currentTarget) })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string }
      if (!res.ok || !data.ok) return setError({ message: data.error ?? '保存失败，请稍后重试', field: data.field })
      toast.success('公司信息已保存')
      router.refresh()
    } catch {
      setError({ message: '网络错误，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  const field = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={initial[name] ?? ''} aria-invalid={error?.field === name ? true : undefined} {...props} />
    </div>
  )

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
          <AlertCircle className="size-4 shrink-0" />
          {error.message}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>报价单抬头</CardTitle>
          <CardDescription>公司名称、副标题和 Logo 显示在报价单顶部</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field('name', '公司名称', { required: true, maxLength: 60 })}
          {field('slogan', '副标题', { maxLength: 80 })}
          <div className="md:col-span-2">
            <ImageField name="logo" label="Logo" url={initial.logoUrl} hint="建议横版或方形 PNG，透明背景，不超过 3MB" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>联系方式</CardTitle>
          <CardDescription>显示在报价单底部的「联系我们」</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field('phone', '联系电话', { inputMode: 'tel', maxLength: 30 })}
          {field('email', '邮箱', { type: 'email', maxLength: 80 })}
          <div className="md:col-span-2">{field('address', '地址', { maxLength: 200 })}</div>
          <div className="md:col-span-2">
            <ImageField name="qrCode" label="二维码" url={initial.qrCodeUrl} hint="例如企业微信或公众号二维码" />
          </div>
          {field('qrCaption', '二维码说明', { maxLength: 40, placeholder: '扫码添加微信' })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>报价默认备注</CardTitle>
          <CardDescription>新生成的报价会自动带上这段备注，生成后仍可单独修改</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id="quoteNotes" name="quoteNotes" rows={4} maxLength={2000} defaultValue={initial.quoteNotes} placeholder="例如：报价有效期 30 天；设备质保一年，含一年免费上门维护" />
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}保存
        </Button>
      </div>
    </form>
  )
}
