'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAccent } from '@/components/theme-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ACCENT_SWATCH, ACCENTS, DEFAULT_ACCENT, isAccent } from '@/lib/appearance'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const

// 整块选项可点；Radix 单选项输出 data-state，据此高亮选中的那一块
const tile =
  'relative cursor-pointer rounded-xl border bg-card font-normal leading-normal transition-colors hover:bg-accent/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/30'

/** 主题风格的示意小窗：侧栏 + 内容 + 主按钮 */
function AccentPreview({ swatch }: { swatch: string }) {
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
        <span className={cn('mt-auto h-3 w-10 rounded-sm', swatch)} />
      </span>
    </span>
  )
}

/** 外观：颜色模式 + 主题风格。只保存在当前浏览器。 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const { accent, setAccent } = useAccent()
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
                <AccentPreview swatch={ACCENT_SWATCH[a.id]} />
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
      </CardContent>
    </Card>
  )
}
