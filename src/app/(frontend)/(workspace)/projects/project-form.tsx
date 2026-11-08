'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Home,
  Loader2,
  NotebookPen,
  Plus,
  Save,
  Settings2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { registerLeaveGuard } from '@/lib/leave-guard'
import { autoProjectName, PROJECT_PLATFORMS } from '@/lib/projects'
import { cn } from '@/lib/utils'

import { saveProject, type ProjectFormState } from './actions'

export type ProjectFormValues = {
  id?: string
  name?: string
  customerName?: string | null
  customerPhone?: string | null
  community?: string | null
  address?: string | null
  owner?: string | null
  platform?: string | null
  budget?: number | null
  notes?: string | null
}

type Option = { value: string; label: string }

/**
 * 项目信息表单（新建和编辑共用）。所有字段都可以留空：
 * 项目名称按小区 + 房号或客户姓名自动生成，主平台默认沿用上一个项目，负责人默认是自己。
 * 编辑已有项目时可传 onSaved / onCancel：保存成功或取消后回到项目信息的展示视图。
 */
export function ProjectForm({
  initial = {},
  owners,
  readOnly = false,
  onCancelHref,
  onSaved,
  onCancel,
}: {
  initial?: ProjectFormValues
  owners?: Option[]
  readOnly?: boolean
  onCancelHref?: string
  onSaved?: () => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(saveProject, null)
  const [dirty, setDirty] = useState(false)
  const [nameSource, setNameSource] = useState({
    customerName: initial.customerName ?? '',
    community: initial.community ?? '',
    address: initial.address ?? '',
  })
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {}
  const isNew = !initial.id
  const suggestedName = autoProjectName(nameSource)

  useEffect(() => {
    if (!state?.ok) return
    setDirty(false)
    if (isNew) router.push(`/projects/${state.id}`)
    else {
      toast.success('项目信息已保存')
      router.refresh()
      onSaved?.()
    }
    // onSaved 只在保存成功（state 变化）时调用一次，不放进依赖，避免父组件重新渲染时重复触发。
    // 这是有意的：若把 onSaved 放进依赖，父组件每次重渲染都会换新函数引用，
    // 导致这个 effect 反复触发、重复弹 toast / 重复 router.refresh。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isNew, router])

  useEffect(() => {
    if (!dirty || readOnly || isNew) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    const release = registerLeaveGuard(() => window.confirm('项目信息还没有保存，确定离开吗？'))
    return () => {
      window.removeEventListener('beforeunload', warn)
      release()
    }
  }, [dirty, readOnly, isNew])

  const text = (
    name: keyof ProjectFormValues,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={(initial[name] as string | number | null | undefined) ?? ''}
        aria-invalid={errors[name] ? true : undefined}
        disabled={readOnly}
        {...props}
        onChange={(e) => {
          if (name === 'customerName' || name === 'community' || name === 'address')
            setNameSource((s) => ({ ...s, [name]: e.target.value }))
          props.onChange?.(e)
        }}
      />
      {errors[name] ? <p className="text-xs text-destructive-strong">{errors[name]}</p> : null}
    </div>
  )

  const select = (
    name: keyof ProjectFormValues,
    label: string,
    options: readonly Option[],
    fallback: string,
    allowNone = false,
  ) => (
    <div className="grid content-start gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select
        name={name}
        defaultValue={(initial[name] as string | null | undefined) || fallback}
        disabled={readOnly}
        onValueChange={() => setDirty(true)}
      >
        <SelectTrigger id={name} className="w-full" aria-invalid={errors[name] ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value="__none">未指定</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errors[name] ? <p className="text-xs text-destructive-strong">{errors[name]}</p> : null}
    </div>
  )

  const group = (
    Icon: typeof Home,
    title: string,
    desc: string,
    children: React.ReactNode,
    first = false,
  ) => (
    <fieldset
      className={cn(
        'min-w-0 grid gap-4 md:grid-cols-[14rem_1fr] md:gap-8',
        !first && 'border-t border-border pt-6',
      )}
    >
      <div className="space-y-1">
        <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-6.5 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-3.5" />
          </span>
          {title}
        </legend>
        <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )

  return (
    <form action={action} onChange={() => setDirty(true)} className="flex flex-col gap-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state && !state.ok ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong"
        >
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </div>
      ) : null}

      <Card className="gap-0 border-border shadow-2xs">
        {isNew ? null : (
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base font-semibold">项目基础档案</CardTitle>
            <p className="text-xs text-muted-foreground">
              管理业主联系方式、房产地址、全屋智能主生态平台与预算范围
            </p>
          </CardHeader>
        )}
        <CardContent className="flex flex-col gap-6 pt-6">
          {group(
            UserRound,
            '业主信息',
            '用于方案封面、报价单与合同抬头自动署名。',
            <>
              {text('customerName', '客户姓名', {
                placeholder: '例如：王女士',
                autoFocus: isNew,
                autoComplete: 'off',
              })}
              {text('customerPhone', '客户电话', { inputMode: 'tel', autoComplete: 'off' })}
            </>,
            true,
          )}
          {group(
            Home,
            '房屋地址',
            '填写楼盘小区与房号，系统可自动生成规范项目名称。',
            <>
              {text('community', '小区 / 楼盘', { placeholder: '例如：万科城' })}
              {text('address', '房号 / 详细地址', { placeholder: '例如：3-1201' })}
            </>,
          )}
          {group(
            Settings2,
            '方案与平台配置',
            '选择主要智能生态平台与客户期望预算，辅助 AI 智能配单。',
            <>
              {select(
                'platform',
                '主平台',
                PROJECT_PLATFORMS.map((p) => ({ value: p, label: p })),
                initial.platform || PROJECT_PLATFORMS[0],
              )}
              {text('budget', '预算（元）', {
                type: 'number',
                min: 0,
                step: 1000,
                inputMode: 'numeric',
                placeholder: '可不填',
              })}
              {owners && !isNew ? select('owner', '负责人', owners, '__none', true) : null}
              <div
                className={cn('grid content-start gap-2', owners && !isNew ? '' : 'sm:col-span-2')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="name">项目名称</Label>
                  <span id="name-hint" className="text-xs text-muted-foreground">
                    留空自动生成
                  </span>
                </div>
                <Input
                  id="name"
                  name="name"
                  defaultValue={initial.name ?? ''}
                  placeholder={suggestedName}
                  maxLength={120}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby="name-hint"
                  disabled={readOnly}
                />
              </div>
            </>,
          )}
          {group(
            NotebookPen,
            '项目备注与需求',
            '记录家庭常住成员、装修阶段、特殊联动场景或网路条件。',
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="notes" className="sr-only">
                备注
              </Label>
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                maxLength={2000}
                defaultValue={initial.notes ?? ''}
                disabled={readOnly}
                placeholder="户型、装修进度、客户偏好等"
              />
            </div>,
          )}
        </CardContent>
        {readOnly ? null : (
          <CardFooter className="mt-6 justify-end gap-2 border-t">
            {isNew ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(onCancelHref ?? '/projects')}
              >
                取消
              </Button>
            ) : (
              <>
                {dirty ? (
                  <span className="mr-auto text-xs text-muted-foreground">有未保存的修改</span>
                ) : null}
                {onCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (dirty && !window.confirm('项目信息还没有保存，确定放弃修改吗？')) return
                      onCancel()
                    }}
                  >
                    取消
                  </Button>
                ) : null}
              </>
            )}
            <Button type="submit" disabled={pending || (!isNew && !dirty)}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isNew ? (
                <Plus className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {isNew ? '创建项目' : '保存'}
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  )
}
