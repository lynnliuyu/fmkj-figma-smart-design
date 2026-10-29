'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PROJECT_PLATFORMS, PROJECT_STAGES, PROJECT_STATUSES } from '@/lib/projects'

import { saveProject, type ProjectFormState } from './actions'

export type ProjectFormValues = {
  id?: string
  name?: string
  customerName?: string
  customerPhone?: string | null
  community?: string | null
  address?: string | null
  stage?: string
  status?: string
  owner?: string | null
  platform?: string | null
  budget?: number | null
  notes?: string | null
}

type Option = { value: string; label: string }

export function ProjectForm({
  initial = {},
  owners,
  readOnly = false,
}: {
  initial?: ProjectFormValues
  owners: Option[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(saveProject, null)
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}
  const isNew = !initial.id

  useEffect(() => {
    if (!state?.ok) return
    if (isNew) router.push(`/projects/${state.id}`)
    else {
      toast.success('项目已保存')
      router.refresh()
    }
  }, [state, isNew, router])

  const text = (name: keyof ProjectFormValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={(initial[name] as string | number | null | undefined) ?? ''}
        aria-invalid={errors[name] ? true : undefined}
        disabled={readOnly}
        {...props}
      />
      {errors[name] ? <p className="text-xs text-destructive-strong">{errors[name]}</p> : null}
    </div>
  )

  const select = (name: keyof ProjectFormValues, label: string, options: readonly Option[], fallback: string, allowNone = false) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={(initial[name] as string | null | undefined) || fallback} disabled={readOnly}>
        <SelectTrigger id={name} className="w-full" aria-invalid={errors[name] ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value="__none">未指定</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors[name] ? <p className="text-xs text-destructive-strong">{errors[name]}</p> : null}
    </div>
  )

  return (
    <form action={action} className="flex flex-col gap-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state && !state.ok ? (
        <div role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
                  </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">{text('name', '项目名称', { placeholder: '例如：万科城 3-1201 全屋智能', required: true })}</div>
          {text('customerName', '客户姓名', { required: true })}
          {text('customerPhone', '客户电话', { inputMode: 'tel' })}
          {text('community', '小区 / 楼盘')}
          {text('address', '详细地址')}
          {select('owner', '负责人', owners, '__none', true)}
          {select('platform', '主平台', PROJECT_PLATFORMS.map((p) => ({ value: p, label: p })), '__none', true)}
          {text('budget', '预算（元）', { type: 'number', min: 0, step: 100, inputMode: 'numeric' })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>进度</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {select('stage', '阶段', PROJECT_STAGES, 'new')}
          {select('status', '状态', PROJECT_STATUSES, 'active')}
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="notes">备注</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial.notes ?? ''} disabled={readOnly} />
          </div>
        </CardContent>
      </Card>

      {readOnly ? null : (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/projects')}>取消</Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {isNew ? '创建项目' : '保存修改'}
          </Button>
        </div>
      )}
    </form>
  )
}
