'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { PickerTemplate } from '@/plugins/proposal/picker-data'
import { Swatches, TemplatePicker } from '@/plugins/proposal/template-picker'

/** 方案页顶部的模板切换：打开带缩略图的选择器，选中后跳到对应模板（保留范围与报价版本） */
export function ProposalTemplateSwitcher({
  templates,
  thumbs,
  value,
  links,
  previewLinks,
  pageNote,
}: {
  templates: PickerTemplate[]
  thumbs: Record<string, React.ReactNode>
  value: string
  links: Record<string, string>
  previewLinks: Record<string, string>
  pageNote: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const current = templates.find((t) => t.value === value)
  return (
    <TemplatePicker
      templates={templates}
      thumbs={thumbs}
      value={value}
      previewHref={previewLinks}
      pageNote={pageNote}
      selectLabel="切换到此模板"
      onSelect={(v) => start(() => router.push(links[v] ?? `?template=${encodeURIComponent(v)}`))}
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs sm:gap-2 sm:px-3"
          aria-label={`方案模板：${current?.label ?? '未选择'}，点击更换`}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : current ? (
            <span className="hidden sm:inline-flex">
              <Swatches colors={current.swatches} />
            </span>
          ) : null}
          <span className="max-w-20 truncate sm:max-w-32">{current?.label ?? '选择模板'}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      }
    />
  )
}
