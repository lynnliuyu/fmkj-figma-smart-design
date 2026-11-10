'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAstryxTheme } from '@/components/astryx-theme-provider'
import { useAccent } from '@/components/theme-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ACCENT_SWATCH, ACCENTS, DEFAULT_ACCENT, isAccent } from '@/lib/appearance'
import {
  ASTRYX_SWATCH,
  ASTRYX_THEMES,
  DEFAULT_ASTRYX_THEME,
  isAstryxTheme,
} from '@/lib/astryx-theme'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

// 整块选项可点；Radix 单选项输出 data-state，据此高亮选中的那一块
const tile =
  'relative cursor-pointer rounded-[var(--radius-container)] border bg-card font-normal leading-normal transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/30'

/**
 * 主题风格的示意小窗：侧栏 + 内容 + 主按钮。
 *
 * `pill` 用来反映该主题真实的按钮形态——「官网」主题的按钮是全圆胶囊，
 * 如果预览里仍画成小圆角方块，几套主题的缩略图会长得几乎一样，
 * 用户看图看不出差别（视觉评审指出过这一点）。
 */
function AccentPreview({ swatch, pill = false }: { swatch: string; pill?: boolean }) {
  return (
    <span aria-hidden className="flex h-16 overflow-hidden rounded-lg border bg-background">
      <span className="flex w-1/3 flex-col gap-1.5 border-r bg-muted/60 p-2">
        <span className={cn('h-1.5 w-full rounded-full', swatch)} />
        <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/25" />
        <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/25" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="h-1.5 w-1/2 rounded-full bg-foreground/50" />
        <span className="h-1.5 w-5/6 rounded-full bg-muted-foreground/25" />
        <span className={cn('mt-auto h-3 w-10', pill ? 'rounded-full' : 'rounded-sm', swatch)} />
      </span>
    </span>
  )
}

/**
 * 组件主题的示意小窗：用主题自身的强调色画「主按钮 + 输入框 + 卡片边」，
 * 让 6 套主题的差别（强调色深浅、按钮形态）一眼可辨。
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
  const { accent, setAccent } = useAccent()
  const { themeId, setThemeId } = useAstryxTheme()
  // next-themes 在服务端不知道用户选择，挂载后再显示选中项，避免水合不一致
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <Card id="appearance">
      <CardHeader>
        <CardTitle>外观</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p id="appearance-mode" className="text-sm font-medium">
            颜色模式
          </p>
          <RadioGroup
            aria-labelledby="appearance-mode"
            value={mounted ? (theme ?? 'system') : ''}
            onValueChange={setTheme}
            className="grid-cols-3 gap-2"
          >
            {MODES.map(({ value, label, icon: Icon }) => (
              <Label
                key={value}
                htmlFor={`appearance-mode-${value}`}
                className={cn(tile, 'flex-col items-start gap-2 p-3')}
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
                <RadioGroupItem
                  id={`appearance-mode-${value}`}
                  value={value}
                  className="absolute top-3 right-3"
                />
              </Label>
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <p id="appearance-accent" className="text-sm font-medium">
            主题风格
          </p>
          <RadioGroup
            aria-labelledby="appearance-accent"
            value={accent}
            onValueChange={(v) => isAccent(v) && setAccent(v)}
            className="gap-2 sm:grid-cols-3"
          >
            {ACCENTS.map((a) => (
              <Label
                key={a.id}
                htmlFor={`appearance-accent-${a.id}`}
                className={cn(tile, 'flex-col items-stretch gap-2.5 p-3')}
              >
                <AccentPreview swatch={ACCENT_SWATCH[a.id]} pill={a.id === 'official'} />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {a.label}
                    {a.id === DEFAULT_ACCENT ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">默认</span>
                    ) : null}
                  </span>
                  <RadioGroupItem id={`appearance-accent-${a.id}`} value={a.id} />
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {/* 组件主题（Astryx 官方 6 套）—— 与上面的「主题风格」是两套：
            主题风格管页面级配色，这一组管官方组件的 token（强调色、圆角、边框…）。 */}
        <div className="flex flex-col gap-2">
          <p id="appearance-astryx" className="text-sm font-medium">
            组件主题
          </p>
          <p className="text-xs text-muted-foreground">
            按钮、输入框、弹窗等组件的样式；与上面的主题风格相互独立。
          </p>
          <RadioGroup
            aria-labelledby="appearance-astryx"
            value={themeId}
            onValueChange={(v) => isAstryxTheme(v) && setThemeId(v)}
            className="gap-2 sm:grid-cols-3"
          >
            {ASTRYX_THEMES.map((t) => (
              <Label
                key={t.id}
                htmlFor={`appearance-astryx-${t.id}`}
                className={cn(tile, 'flex-col items-stretch gap-2.5 p-3')}
              >
                <AstryxThemePreview swatch={ASTRYX_SWATCH[t.id]} />
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {t.label}
                    {t.id === DEFAULT_ASTRYX_THEME ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">默认</span>
                    ) : null}
                  </span>
                  <RadioGroupItem id={`appearance-astryx-${t.id}`} value={t.id} />
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  )
}
