'use client'

import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAstryxTheme } from '@/components/astryx-theme-provider'
import { useAccent } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ACCENT_SWATCH, ACCENTS, isAccent } from '@/lib/appearance'
import { ASTRYX_SWATCH, ASTRYX_THEMES, isAstryxTheme } from '@/lib/astryx-theme'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

/** 外观菜单项：颜色模式 + 主题风格 + 组件主题（顶栏按钮和用户菜单共用）。 */
export function AppearanceMenuItems() {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent } = useAccent()
  const { themeId, setThemeId } = useAstryxTheme()
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">颜色模式</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
        {MODES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon className="size-4" />
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">主题风格</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={accent} onValueChange={(v) => isAccent(v) && setAccent(v)}>
        {ACCENTS.map((a) => (
          <DropdownMenuRadioItem key={a.id} value={a.id}>
            <span
              aria-hidden
              className={cn('size-3.5 rounded-full ring-1 ring-foreground/10', ACCENT_SWATCH[a.id])}
            />
            {a.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">组件主题</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={themeId}
        onValueChange={(v) => isAstryxTheme(v) && setThemeId(v)}
      >
        {ASTRYX_THEMES.map((t) => (
          <DropdownMenuRadioItem key={t.id} value={t.id}>
            <span
              aria-hidden
              className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: ASTRYX_SWATCH[t.id] }}
            />
            {t.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}

/** 顶栏外观按钮 */
export function AppearanceMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="外观：颜色模式、主题风格与组件主题"
          className="text-muted-foreground hover:text-foreground"
        >
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <AppearanceMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
