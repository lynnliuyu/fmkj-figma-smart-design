'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@astryxdesign/core/Button'

export function CopyClientLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const url = `${window.location.origin}/share/${encodeURIComponent(token)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('已复制业主预览链接，可直接发给客户微信', {
        description:
          '「已发送 / 已确认」的报价会出现在方案对比里，业主可勾选暂缓的设备并签名确认意向，反馈显示在项目「报价」页。',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void handleCopy()}
      tooltip="业主可在链接里对比方案、勾选暂缓设备并签名确认意向"
      icon={<Check />}
      endContent={<Share2 />}
      label="业主可在链接里对比方案、勾选暂缓设备并签名确认意向"
    />
  )
}
