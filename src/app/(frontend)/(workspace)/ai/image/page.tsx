import { EmptyState } from '@/components/empty-state'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Palette, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { getPluginFlags } from '@/plugins/state'
import { IMAGE_MODELS, imageGenerationConfigured } from '@/plugins/ai-copilot/image-generation'

import { ImageGenerator } from './image-generator'

export const metadata = { title: pageTitle('AI 生图') }

export default async function AiImagePage() {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect('/login?from=/ai/image')
  const flags = await getPluginFlags(user.id)
  if (!flags['ai-copilot']) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="「AI 对话侧栏（高级）」插件已关闭"
          description="AI 生图依赖 AI 插件，请先在插件中心开启。"
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/capabilities/ai-copilot">去插件页开启</Link>
            </Button>
          }
        />
      </div>
    )
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-primary">AI IMAGE</p>
          <h1 className="mt-1 text-2xl font-semibold">AI 生图</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            用文字描述生成智能家居场景图、方案配图、材质意向图。
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/ai/image/style">
              <Palette className="size-4" />
              户型图风格化
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/ai">
              <ArrowLeft className="size-4" />
              返回 AI 对话
            </Link>
          </Button>
        </div>
      </div>
      <ImageGenerator
        configured={imageGenerationConfigured()}
        models={IMAGE_MODELS.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          sizes: [...m.sizes],
          cost: m.cost,
        }))}
      />
    </div>
  )
}
