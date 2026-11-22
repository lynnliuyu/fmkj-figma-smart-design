'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAstryxTheme } from '@/components/astryx-theme-provider'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout'
import { SelectableCard } from '@astryxdesign/core/SelectableCard'
import { ASTRYX_SWATCH, ASTRYX_THEMES, DEFAULT_ASTRYX_THEME } from '@/lib/astryx-theme'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

/**
 * 组件主题的示意小窗：用主题自身的强调色画「主按钮 + 输入框 + 卡片边」，
 * 让各套主题的差别（强调色深浅、按钮形态）一眼可辨。
 * 色值来自各主题 `theme.css` 的 `--color-accent`，不是随手挑的。
 */
function AstryxThemePreview({ swatch }: { swatch: string }) {
  return (
    <span className="flex h-16 flex-col gap-2 overflow-hidden rounded-lg border bg-background p-2">
      <span className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: swatch }} />
        <span className="h-1.5 w-8 rounded-full bg-muted-foreground/25" />
      </span>
      <span className="h-3 w-full rounded-sm bg-muted-foreground/12" />
      <span className="mt-auto h-4 w-12 rounded-md" style={{ backgroundColor: swatch }} />
    </span>
  )
}

/** 外观：颜色模式 + 主题风格。只保存在当前浏览器。 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const { themeId, setThemeId } = useAstryxTheme()
  // next-themes 在服务端不知道用户选择，挂载后再显示选中项，避免水合不一致
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <Card
      id="appearance"
      padding={0}
      className="border-0 bg-card text-sm text-card-foreground shadow-xs ring-1 ring-border"
    >
      <Layout
        height="auto"
        header={
          <LayoutHeader padding={5} paddingBlockEnd={0}>
            <div className="font-heading text-base font-semibold tracking-tight">外观</div>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={5} isScrollable={false}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p id="appearance-mode" className="text-sm font-medium">
                  颜色模式
                </p>
                {/* 官方 SelectableCard 的选中态是整卡内描边，没有角落圆点；
                    单选互斥由受控 state 保证（点已选项不改变选择）。 */}
                <Grid columns={3} gap={2} role="group" aria-labelledby="appearance-mode">
                  {MODES.map(({ value, label, icon: Icon }) => (
                    <SelectableCard
                      key={value}
                      label={label}
                      isSelected={mounted && (theme ?? 'system') === value}
                      onChange={() => setTheme(value)}
                      padding={3}
                      className="flex flex-col items-start gap-2"
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="text-sm">{label}</span>
                    </SelectableCard>
                  ))}
                </Grid>
              </div>

              {/* 组件主题（Astryx 官方 5 套）：管官方组件的 token
            （强调色、圆角、边框…）。2026-11-21 起页面级 accent 已整套移除，
            页面配色只由这里的组件主题与语义 token 决定。 */}
              <div className="flex flex-col gap-2">
                <p id="appearance-astryx" className="text-sm font-medium">
                  组件主题
                </p>
                <p className="text-xs text-muted-foreground">
                  按钮、输入框、弹窗等组件的样式。页面配色已统一为官方灰调，不再有独立的主题风格开关。
                </p>
                <Grid
                  columns={{ minWidth: 180, max: 3 }}
                  gap={2}
                  role="group"
                  aria-labelledby="appearance-astryx"
                >
                  {ASTRYX_THEMES.map((t) => (
                    <SelectableCard
                      key={t.id}
                      label={t.label}
                      isSelected={themeId === t.id}
                      onChange={() => setThemeId(t.id)}
                      padding={3}
                      className="flex flex-col items-stretch gap-2.5"
                    >
                      <AstryxThemePreview swatch={ASTRYX_SWATCH[t.id]} />
                      <span className="text-sm font-medium">
                        {t.label}
                        {t.id === DEFAULT_ASTRYX_THEME ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            默认
                          </span>
                        ) : null}
                      </span>
                    </SelectableCard>
                  ))}
                </Grid>
              </div>
            </div>
          </LayoutContent>
        }
      />
    </Card>
  )
}
