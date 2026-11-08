import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Theme } from '@astryxdesign/core/theme'
import Link from 'next/link'

import { themes, defaultThemeSlug, type ThemeSlug } from '@/astryx-themes'

/**
 * Astryx 主题对比页：用 ?theme=<slug> 切换主题，看同一个页面在各主题下的色彩表现。
 *
 * 背景：Astryx 是 Meta 的克制型设计系统（大面积中性色、颜色只用于状态），
 * 且 stone/neutral 官方定位就是「Muted, minimal（低调极简）」。
 * 想有色彩，要选 butter / matcha / chocolate 这类主题。
 */
export const metadata = { title: 'Astryx 主题对比 · 繁梦空间' }

const SLUGS = Object.keys(themes) as ThemeSlug[]

const SLUG_LABEL: Record<string, string> = {
  neutral: 'Neutral 极简灰',
  stone: 'Stone 暖石',
  butter: 'Butter 奶油黄+蓝',
  matcha: 'Matcha 自然绿',
  chocolate: 'Chocolate 暖棕',
  fanmeng: 'Fanmeng 繁梦紫',
}

export default async function ThemeComparePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>
}) {
  const sp = await searchParams
  const slug: ThemeSlug = SLUGS.includes(sp.theme as ThemeSlug)
    ? (sp.theme as ThemeSlug)
    : defaultThemeSlug

  return (
    <Theme theme={themes[slug]}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            主题对比 · 当前：{SLUG_LABEL[slug] ?? slug}
          </h1>
          <nav className="flex flex-wrap gap-2">
            {SLUGS.map((s) => (
              <Link
                key={s}
                href={`/design-pilot/themes?theme=${s}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  s === slug ? 'bg-foreground text-background' : 'bg-card hover:bg-muted'
                }`}
              >
                {SLUG_LABEL[s] ?? s}
              </Link>
            ))}
          </nav>
        </header>

        <Stack direction="vertical" gap={6}>
          <Stack direction="horizontal" gap={2}>
            <Button label="主要操作" variant="primary" />
            <Button label="次要操作" variant="secondary" />
            <Button label="幽灵" variant="ghost" />
            <Button label="删除" variant="destructive" />
          </Stack>

          <Stack direction="horizontal" gap={2}>
            <Badge label="中性" variant="neutral" />
            <Badge label="信息" variant="info" />
            <Badge label="成功" variant="success" />
            <Badge label="警告" variant="warning" />
            <Badge label="错误" variant="error" />
            <Badge label="分类" variant="purple" />
            <Badge label="分类" variant="teal" />
            <Badge label="分类" variant="orange" />
          </Stack>

          <Stack direction="horizontal" gap={3}>
            <Card padding={4}>
              <Stack direction="vertical" gap={2}>
                <Heading level={3}>卡片标题</Heading>
                <Text type="supporting">这是卡片里的说明文字，用来看色彩与排版。</Text>
              </Stack>
            </Card>
            <Card padding={4} variant="muted">
              <Stack direction="vertical" gap={2}>
                <Heading level={3}>弱化卡片</Heading>
                <Text type="supporting">variant=&quot;muted&quot; 的观感。</Text>
              </Stack>
            </Card>
            <Card padding={4} variant="purple">
              <Stack direction="vertical" gap={2}>
                <Heading level={3}>彩色卡片</Heading>
                <Text type="supporting">variant=&quot;purple&quot; 的观感。</Text>
              </Stack>
            </Card>
          </Stack>
        </Stack>
      </div>
    </Theme>
  )
}
