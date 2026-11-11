'use client'

import { useEffect, useState } from 'react'
import { Palette } from 'lucide-react'

import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { EmptyState } from '@/components/empty-state'
import type { StyleTransferHandoff } from '@/lib/style-templates'

import { StyleTransfer } from '../../../ai/image/style/style-transfer'

type Meta = {
  configured: boolean
  cost: number
  templates: { id: string; name: string; description: string; file: string }[]
}

/**
 * 点位图顶栏「AI 精装彩平」的弹窗。
 *
 * 以前点这个按钮 router.push('/ai/image/style') 直接跳走，画布上下文就没了；
 * 现在就地开弹窗，并把当前楼层底图预载进上传位。
 *
 * 服务端配置（是否配了 key / 积分单价 / 模板清单）走现成的 GET 端点读，
 * 不在客户端 import 服务端模块 —— AI_APIKEY_FAN_KEY 只在服务端可见。
 *
 * 注意：官方 Dialog 关闭时**不卸载** children（只隐藏 <dialog>），所以内容
 * 整块条件挂载，保证每次打开都是干净状态，不会残留上次的上传/生成结果。
 */
export function AiStyleDialog({
  open,
  onOpenChange,
  source,
  enabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: StyleTransferHandoff | null
  /** 「AI 对话侧栏（高级）」插件是否开启（点位图页服务端算好后传入） */
  enabled: boolean
}) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/ai/images/style')
        const data = (await res.json().catch(() => null)) as
          | (Meta & { ok?: boolean; error?: string })
          | null
        if (!res.ok || !data?.ok) throw new Error(data?.error ?? `配置读取失败（${res.status}）`)
        if (!cancelled) {
          setMeta(data)
          setMetaError(null)
        }
      } catch (e) {
        if (!cancelled) setMetaError(e instanceof Error ? e.message : '配置读取失败')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      width="min(94vw, 1000px)"
      maxHeight="88dvh"
      padding={0}
    >
      {open ? (
        <Layout
          header={
            <DialogHeader
              title="AI 精装彩平"
              subtitle="保留当前户型墙体布局，用 AI 生成家具彩平图（消耗积分）"
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent padding={4}>
              {!enabled ? (
                <EmptyState
                  icon={<Palette className="size-5" />}
                  title="「AI 对话侧栏（高级）」插件已关闭"
                  description="AI 精装彩平依赖 AI 插件，请先在插件中心开启。"
                />
              ) : metaError ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {metaError}
                </p>
              ) : !meta ? (
                <p className="py-10 text-center text-sm text-muted-foreground">正在读取风格配置…</p>
              ) : (
                <StyleTransfer
                  templates={meta.templates}
                  configured={meta.configured}
                  cost={meta.cost}
                  initialSource={source}
                  compact
                />
              )}
            </LayoutContent>
          }
        />
      ) : null}
    </Dialog>
  )
}
