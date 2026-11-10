'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Pencil } from 'lucide-react'

import { BetaDocLink } from '@/components/beta-doc-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@astryxdesign/core/Button'
import { yuan } from '@/lib/quotes'
import { cn } from '@/lib/utils'

import { ProjectForm, type ProjectFormValues } from '../project-form'

export type ProjectOverviewData = {
  id: string
  displayName: string
  customerName: string | null
  customerPhone: string | null
  community: string | null
  address: string | null
  platform: string | null
  budget: number | null
  notes: string | null
  updated: string
  roleText: string
  stage: { label: string; variant: 'outline' | 'brand' | 'warning' | 'success' | 'secondary' }
  progress: { key: string; label: string; value: string; done: boolean; href: string }[]
}

/** 一项资料：没填写时显示浅色的「未填写」，不留空白 */
function Field({
  label,
  value,
  className,
  children,
}: {
  label: string
  value?: string | null
  className?: string
  children?: React.ReactNode
}) {
  const empty = !children && !value
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-sm break-words',
          empty ? 'text-muted-foreground' : 'font-medium text-foreground',
        )}
      >
        {children ?? (value || '未填写')}
      </dd>
    </div>
  )
}

/**
 * 项目信息：默认是只读的项目档案（客户与房屋、方案配置、交付进度、备注），
 * 点「编辑信息」才显示表单；保存或取消后回到展示视图。删除项目只在编辑视图底部出现。
 */
export function ProjectOverview({
  data,
  form,
  owners,
  readOnly,
  danger,
}: {
  data: ProjectOverviewData
  form: ProjectFormValues
  owners?: { value: string; label: string }[]
  readOnly: boolean
  danger?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const closeEditor = () => {
    setEditing(false)
    requestAnimationFrame(() => editButton.current?.focus())
  }

  if (editing) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <ProjectForm initial={form} owners={owners} onSaved={closeEditor} onCancel={closeEditor} />
        {danger}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">项目信息</h2>
            <Badge variant={data.stage.variant}>{data.stage.label}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span>更新于 {data.updated}</span>
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
            <span>{data.roleText}</span>
          </p>
        </div>
        {readOnly ? null : (
          <Button
            ref={editButton}
            variant="secondary"
            size="sm"
            onClick={() => setEditing(true)}
            icon={<Pencil />}
            label="编辑信息"
          />
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <section
            aria-labelledby="overview-customer"
            className="rounded-[var(--radius-container)] border bg-card shadow-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
              <h3 id="overview-customer" className="text-sm font-semibold">
                客户与房屋
              </h3>
              {/* 现场勘测：目前只有一份勘测确认单（Beta），入口放在基础资料区 */}
              <BetaDocLink label="现场勘测" href={`/print/projects/${data.id}/survey`} />
            </div>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 pt-5 pb-4">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">客户</p>
                <p
                  className={cn(
                    'mt-1 truncate text-lg font-semibold tracking-tight',
                    !data.customerName && 'font-normal text-muted-foreground',
                  )}
                >
                  {data.customerName || '未填写客户姓名'}
                </p>
              </div>
              {data.customerPhone ? (
                <a
                  href={`tel:${data.customerPhone}`}
                  className="rounded-md text-sm font-medium tabular-nums text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                >
                  {data.customerPhone}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">未填写电话</span>
              )}
            </div>
            <dl className="grid gap-4 border-t px-5 py-4 sm:grid-cols-2">
              <Field label="小区 / 楼盘" value={data.community} />
              <Field label="房号 / 详细地址" value={data.address} />
            </dl>
          </section>

          <section
            aria-labelledby="overview-notes"
            className="rounded-[var(--radius-container)] border bg-card shadow-xs"
          >
            <h3 id="overview-notes" className="border-b px-5 py-3 text-sm font-semibold">
              备注与需求
            </h3>
            {data.notes ? (
              <p className="px-5 py-4 text-sm leading-relaxed whitespace-pre-line text-fg-secondary">
                {data.notes}
              </p>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                还没有备注。可以记录常住成员、装修阶段、客户偏好或网络条件
                {readOnly ? '' : '，点「编辑信息」添加'}。
              </p>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby="overview-config"
            className="rounded-[var(--radius-container)] border bg-card shadow-xs"
          >
            <h3 id="overview-config" className="border-b px-5 py-3 text-sm font-semibold">
              方案配置
            </h3>
            <dl className="grid gap-4 px-5 py-4">
              <Field label="主平台" value={data.platform} />
              <Field label="预算">
                {data.budget ? (
                  <span className="tabular-nums">{yuan(data.budget)}</span>
                ) : undefined}
              </Field>
              <Field label="项目名称" value={data.displayName} />
            </dl>
          </section>

          <section
            aria-labelledby="overview-progress"
            className="rounded-[var(--radius-container)] border bg-card shadow-xs"
          >
            <h3 id="overview-progress" className="border-b px-5 py-3 text-sm font-semibold">
              交付进度
            </h3>
            <ol className="p-1.5">
              {data.progress.map((step) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className="group flex items-center gap-3 rounded-lg px-3.5 py-2.5 transition-colors duration-150 hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full',
                        step.done
                          ? 'bg-success/15 text-success'
                          : 'border-[1.5px] border-border-strong',
                      )}
                    >
                      {step.done ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{step.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {step.value}
                      </span>
                    </span>
                    <span className="sr-only">{step.done ? '（已完成）' : '（未完成）'}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
