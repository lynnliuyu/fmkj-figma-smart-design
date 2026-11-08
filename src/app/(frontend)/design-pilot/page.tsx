import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'

/**
 * Astryx 设计系统试点页（架构变更提案 §11.5，owner 已批准导入试点）。
 *
 * 用途：验证 Astryx 在当前栈（Next 16 + React 19 + Tailwind 4）里能否正常工作，
 * 以及它与本仓既有设计体系能否共存。有意保持简单、不外链任何数据。
 *
 * 接入方式（见 styles.css / layout.tsx）：
 * - 只导入 Astryx 组件样式与主题（都在 @layer 内，不覆盖既有工具类）
 * - 不导入 reset.css（避免全局 reset）与 tailwind-theme.css（会重定向 --color-primary）
 */
export const metadata = { title: 'Astryx 试点 · 繁梦空间' }

export default function DesignPilotPage() {
  return (
    <Stack direction="vertical" gap={6} padding={6}>
      <Stack direction="vertical" gap={2}>
        <Heading level={1}>Astryx 试点</Heading>
        <Text type="supporting">
          这一页全部由 Astryx 组件（Card / Stack / Text / Heading / Badge / Button）渲染，
          用于验证该设计系统在本项目的接入是否正常。
        </Text>
      </Stack>

      <Stack direction="horizontal" gap={3}>
        <Badge label="Beta" variant="warning" />
        <Badge label="试点" variant="info" />
        <Badge label="AI 能力" variant="purple" />
      </Stack>

      <Stack direction="horizontal" gap={4}>
        <Card padding={4}>
          <Stack direction="vertical" gap={2}>
            <Text type="label">组件渲染</Text>
            <Text type="supporting">基本排版、间距与卡片是否生效。</Text>
          </Stack>
        </Card>
        <Card padding={4}>
          <Stack direction="vertical" gap={2}>
            <Text type="label">共存性</Text>
            <Text type="supporting">是否影响既有 Tailwind / 品牌色。</Text>
          </Stack>
        </Card>
        <Card padding={4}>
          <Stack direction="vertical" gap={2}>
            <Text type="label">可维护性</Text>
            <Text type="supporting">能否逐页铺开、随时回退。</Text>
          </Stack>
        </Card>
      </Stack>

      <Stack direction="horizontal" gap={3}>
        <Button label="主要操作" variant="primary" />
        <Button label="次要操作" variant="secondary" />
        <Button label="幽灵按钮" variant="ghost" />
      </Stack>
    </Stack>
  )
}
