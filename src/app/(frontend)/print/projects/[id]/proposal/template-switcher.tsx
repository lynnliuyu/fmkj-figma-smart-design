'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2 } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
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
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs sm:gap-2 sm:px-3"
          label="方案模板"
          icon={<Loader2 />}
          endContent={<ChevronDown />}
        />
      }
    />
  )
}
