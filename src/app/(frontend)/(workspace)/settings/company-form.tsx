'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ImageIcon, Loader2, Save, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Field } from '@astryxdesign/core/Field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  DocumentTemplateSettings,
  type DocKindOption,
  type DocStyleOption,
} from './document-plugin-settings'
import { SquareCropDialog } from './square-crop-dialog'

type Values = {
  name: string
  slogan: string
  phone: string
  email: string
  address: string
  qrCaption: string
  quoteNotes: string
  contractTerms: string
  printProductImages: boolean
  logoUrl: string | null
  qrCodeUrl: string | null
}

function ImageField({
  name,
  label,
  url,
  hint,
  squareCrop,
}: {
  name: 'logo' | 'qrCode'
  label: string
  url: string | null
  hint: string
  squareCrop?: boolean
}) {
  const [preview, setPreview] = useState(url)
  const [removed, setRemoved] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [cropping, setCropping] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const apply = (f: File) => {
    setPreview(URL.createObjectURL(f))
    setFileName(f.name)
    setRemoved(false)
  }
  return (
    <Field label={label} inputID={name}>
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
          {/* 原生文件框的按钮文字由浏览器决定（常显示英文），这里隐藏原生控件、用中文按钮代替 */}
          <input
            ref={inputRef}
            id={name}
            name={name}
            type="file"
            className="peer sr-only"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              if (squareCrop) setCropping(f)
              else apply(f)
            }}
          />
          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor={name}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-accent"
            >
              <Upload className="size-3.5" />
              {preview ? '更换图片' : '选择图片'}
            </label>
            <span className="truncate text-sm text-muted-foreground">
              {fileName ?? (preview ? '已上传' : '未选择文件')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {preview ? (
          <IconButton
            type="button"
            variant="ghost"

            aria-label={`移除${label}`}
            onClick={() => {
              setPreview(null)
              setFileName(null)
              setRemoved(true)
            }}
            label={`移除${label}`}
            icon={<X />}
            size="sm"
          />
        ) : null}
      </div>
      {removed ? <input type="hidden" name={`${name}Remove`} value="1" /> : null}
      {squareCrop ? (
        <SquareCropDialog
          file={cropping}
          onCancel={() => {
            // 放弃裁剪：清空本次选择，保留原来的图片
            if (inputRef.current) inputRef.current.value = ''
            setCropping(null)
          }}
          onDone={(f) => {
            const input = inputRef.current
            if (input) {
              const dt = new DataTransfer()
              dt.items.add(f)
              input.files = dt.files
            }
            apply(f)
            setCropping(null)
          }}
        />
      ) : null}
    </Field>
  )
}

export function CompanyForm({
  initial,
  documents,
}: {
  initial: Values
  documents: {
    kinds: DocKindOption[]
    styles: DocStyleOption[]
    defaults: Record<string, { style?: string; layout?: string }>
  }
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/settings/company', {
        method: 'POST',
        body: new FormData(e.currentTarget),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        field?: string
      }
      if (!res.ok || !data.ok)
        return setError({ message: data.error ?? '保存失败，请稍后重试', field: data.field })
      toast.success('设置已保存')
      router.refresh()
    } catch {
      setError({ message: '网络错误，请稍后重试' })
    } finally {
      setSaving(false)
    }
  }

  const field = (
    name: Exclude<keyof Values, 'printProductImages'>,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Field label={label} inputID={name}>
      <Input
        id={name}
        name={name}
        defaultValue={initial[name] ?? ''}
        aria-invalid={error?.field === name ? true : undefined}
        {...props}
      />
    </Field>
  )

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error.message}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>抬头</CardTitle>
          <CardDescription>用于报价单、方案、合同页眉及侧边栏标识</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field('name', '名称', {
            required: true,
            maxLength: 60,
            placeholder: '公司、工作室或个人名称',
          })}
          {field('slogan', '副标题', { maxLength: 80 })}
          <div className="md:col-span-2">
            <ImageField
              name="logo"
              label="Logo"
              url={initial.logoUrl}
              hint="PNG 或 SVG，透明背景，≤ 3MB"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>联系方式</CardTitle>
          <CardDescription>用于报价单页脚与合同乙方信息</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {field('phone', '联系电话', { inputMode: 'tel', maxLength: 30 })}
          {field('email', '邮箱', { type: 'email', maxLength: 80 })}
          <div className="md:col-span-2">{field('address', '地址', { maxLength: 200 })}</div>
          <div className="md:col-span-2">
            <ImageField
              name="qrCode"
              label="二维码"
              url={initial.qrCodeUrl}
              hint="微信或公众号二维码，上传后可裁剪为正方形"
              squareCrop
            />
          </div>
          {field('qrCaption', '二维码说明', { maxLength: 40, placeholder: '扫码添加微信' })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>默认内容</CardTitle>
          <CardDescription>新建报价与合同时自动带入</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field label="报价备注" inputID="quoteNotes">
            <Textarea
              id="quoteNotes"
              name="quoteNotes"
              rows={3}
              maxLength={2000}
              defaultValue={initial.quoteNotes}
              placeholder="例如：报价有效期 30 天；设备质保一年，含一年免费上门维护"
            />
          </Field>
          <Field label="合同条款" inputID="contractTerms">
            <Textarea
              id="contractTerms"
              name="contractTerms"
              rows={7}
              maxLength={5000}
              defaultValue={initial.contractTerms}
              className="leading-relaxed"
            />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="printProductImages">打印报价单时显示产品缩略图</Label>
            <Switch
              id="printProductImages"
              name="printProductImages"
              defaultChecked={initial.printProductImages}
            />
          </div>
        </CardContent>
      </Card>
      <DocumentTemplateSettings
        kinds={documents.kinds}
        styles={documents.styles}
        defaults={documents.defaults}
      />
      {/*
        保存条：吸底时必须是**不透明**背景 + 上边框，否则滚动过程中下方卡片的
        标题会从半透明背景里透出来，看起来像「保存条压住了标题」。
        用实心 bg-background，并加 border-t 与阴影把它与内容明确分开。
      */}
      {/*
        保存条：不用 sticky。原因有两点：
        1. sticky bottom-0 在「整页截图 / 打印 / 滚动到中间」时会被冻结在视口底部，
           视觉上像一条浮在表单中间的横条，把上下内容切断——实测长截图里它正好
           落在「名称/副标题」与「Logo」之间，看起来像遮挡。
        2. 这个表单本身不长（外观 + 抬头 + 联系方式 + 文档默认值），
           滚到底点保存是自然的操作，不需要吸底常驻。
        改为普通文档流 + 上边框，保存按钮始终跟着表单末尾走。
      */}
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" isDisabled={saving} icon={<Loader2 />} label="保存" />
      </div>
    </form>
  )
}
