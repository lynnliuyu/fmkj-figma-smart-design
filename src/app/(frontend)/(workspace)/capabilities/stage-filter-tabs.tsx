'use client'

import { Tab, TabList } from '@astryxdesign/core/TabList'
import { useRouter } from 'next/navigation'

export type StageFilterItem = {
  key: string
  label: string
  href: string
  active: boolean
}

/**
 * 能力中心的阶段筛选（全部阶段 / 勘测与点位设计 / 报价与方案 …）。
 *
 * 旧 FilterTabs 是链接条（服务端渲染，next/link + scroll=false）。
 * 官方 TabList 是客户端受控组件（value/onChange），这里包一层：
 * 激活时用 router.push 走同站软跳转并保持滚动位置，与原 Link 行为一致。
 * 键盘从「逐个 Tab」变为官方 TabList 的 ARIA 导航模式（单 Tab 停靠 +
 * 方向键移动、Enter 激活），与工作区其它 TabList 一致。
 */
export function StageFilterTabs({ label, items }: { label: string; items: StageFilterItem[] }) {
  const router = useRouter()
  const activeKey = items.find((it) => it.active)?.key ?? items[0]!.key

  return (
    <TabList
      size="sm"
      aria-label={label}
      value={activeKey}
      onChange={(v) => {
        const target = items.find((it) => it.key === v)
        if (target) router.push(target.href, { scroll: false })
      }}
    >
      {items.map((it) => (
        <Tab key={it.key} value={it.key} label={it.label} />
      ))}
    </TabList>
  )
}
