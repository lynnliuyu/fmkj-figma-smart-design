import { Badge as AstryxBadge } from '@astryxdesign/core/Badge'
import { Button as AstryxButton } from '@astryxdesign/core/Button'
import { Card as AstryxCard } from '@astryxdesign/core/Card'
import { Heading as AstryxHeading } from '@astryxdesign/core/Heading'
import { Stack as AstryxStack } from '@astryxdesign/core/Stack'
import { Text as AstryxText } from '@astryxdesign/core/Text'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Astryx 设计系统对照页（架构变更提案 §11.5，owner 已批准导入试点）。
 *
 * 同一份内容渲染两遍：左边用本仓现有组件（shadcn 风格），右边用 Astryx。
 * 用来肉眼比较两者在真实项目里的观感差异，同时验证 Astryx 与本仓设计体系能否共存。
 *
 * 接入方式见 styles.css / layout.tsx：只导入 Astryx 组件样式与主题（均在 @layer 内），
 * 不导入 reset.css（避免全局 reset）、tailwind-theme.css（会重定向 --color-primary）、
 * fonts.css（含 Google Fonts 外链）。
 */
export const metadata = { title: 'Astryx 对照 · 繁梦空间' }

const FEATURES = [
  { title: '点位图', desc: '底图、点位、缩放拖动', tag: '核心' },
  { title: '能力中心', desc: 'AI 能力 / 模板 / 工具', tag: '插件' },
  { title: '报价合同', desc: '编辑、打印、归档', tag: '核心' },
]

export default function DesignPilotPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Astryx 对照</h1>
        <p className="text-sm text-muted-foreground">
          同样的内容渲染两遍：左为本仓现有组件，右为 Astryx。用于肉眼比较，并验证两者能否共存。
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── 现有组件 ── */}
        <section className="flex flex-col gap-4 rounded-[var(--radius-container)] border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">现有组件</h2>

          <div className="flex flex-wrap gap-2">
            <Badge label={'默认'} />
            <Badge variant="neutral" label={'次要'} />
            <Badge variant="neutral" label={'描边'} />
            <Badge variant="success" label={'已确认'} />
            <Badge variant="warning" label={'待处理'} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button label="主要操作" />
            <Button variant="secondary" label="次要操作" />
            <Button variant="secondary" label="描边" />
            <Button variant="ghost" label="幽灵" />
            <Button variant="destructive" label="删除" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.slice(0, 2).map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <CardTitle>{f.title}</CardTitle>
                  <CardDescription>{f.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="neutral" label={f.tag} />
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            这是一段说明文字，用来看正文的行高与字色是否符合预期。
          </p>
        </section>

        {/* ── Astryx ── */}
        <section className="flex flex-col gap-4 rounded-[var(--radius-container)] border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Astryx</h2>

          <AstryxStack direction="horizontal" gap={2}>
            <AstryxBadge label="默认" variant="neutral" />
            <AstryxBadge label="信息" variant="info" />
            <AstryxBadge label="成功" variant="success" />
            <AstryxBadge label="警告" variant="warning" />
            <AstryxBadge label="分类" variant="purple" />
          </AstryxStack>

          <AstryxStack direction="horizontal" gap={2}>
            <AstryxButton label="主要操作" variant="primary" />
            <AstryxButton label="次要操作" variant="secondary" />
            <AstryxButton label="幽灵" variant="ghost" />
            <AstryxButton label="删除" variant="destructive" />
          </AstryxStack>

          <AstryxStack direction="horizontal" gap={3}>
            {FEATURES.slice(0, 2).map((f) => (
              <AstryxCard key={f.title} padding={4}>
                <AstryxStack direction="vertical" gap={2}>
                  <AstryxText type="label">{f.title}</AstryxText>
                  <AstryxText type="supporting">{f.desc}</AstryxText>
                  <AstryxBadge label={f.tag} variant="purple" />
                </AstryxStack>
              </AstryxCard>
            ))}
          </AstryxStack>

          <AstryxText type="body">
            这是一段说明文字，用来看 Astryx 正文的行高与字色是否符合预期。
          </AstryxText>

          <AstryxHeading level={3}>三级标题示例</AstryxHeading>
        </section>
      </div>
    </div>
  )
}
