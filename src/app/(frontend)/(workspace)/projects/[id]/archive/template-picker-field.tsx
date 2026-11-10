'use client'

import { useRouter } from 'next/navigation'
import { LayoutTemplate } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'
import type { PickerTemplate } from '@/plugins/proposal/picker-data'
import { Swatches, TemplatePicker } from '@/plugins/proposal/template-picker'

import { setDeliverables } from './actions'

/** 归档 → 交付资料包里的「方案模板」：带缩略图挑选，设为本项目的交付方案模板 */
export function ArchiveTemplatePicker({
  projectId,
  templates,
  thumbs,
  value,
  previewLinks,
  editable,
}: {
  projectId: string
  templates: PickerTemplate[]
  thumbs: Record<string, React.ReactNode>
  value: string | null
  previewLinks: Record<string, string>
  editable: boolean
}) {
  const router = useRouter()
  const current = templates.find((t) => t.value === value)

  async function select(v: string) {
    const t = templates.find((x) => x.value === v)
    const res = await setDeliverables(projectId, { proposalTemplate: v })
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`交付方案已换成「${t?.label ?? v}」`)
    router.refresh()
  }

  return (
    <TemplatePicker
      templates={templates}
      thumbs={thumbs}
      value={value}
      previewHref={previewLinks}
      kinds={['owner']}
      selectLabel="设为交付方案"
      pageNote="按示例别墅项目计算（预览样张使用本项目的数据）"
      disabled={!editable}
      onSelect={editable ? select : undefined}
      trigger={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="ml-7 h-8 gap-2 text-xs sm:ml-0"
          label="交付方案模板：，点击"
          icon={<Swatches colors={[]} />}
          endContent={<LayoutTemplate />}
        />
      }
    />
  )
}
