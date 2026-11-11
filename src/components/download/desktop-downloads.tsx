'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Download, Laptop, Monitor, RefreshCw } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import {
  DESKTOP_DOWNLOADS_PATH,
  DESKTOP_FORMAT_LABELS,
  formatBytes,
  pickDesktopAsset,
  type DesktopArch,
  type DesktopReleaseManifest,
} from '@/lib/desktop-release-shared'
import { cn } from '@/lib/utils'

/** 桌面客户端预加载脚本暴露的接口（desktop/src/preload.js） */
type DesktopBridge = { isDesktop: true; version: string; checkForUpdates: () => Promise<void> }

declare global {
  interface Window {
    fanmengDesktop?: DesktopBridge
  }
}

type Platform = 'windows' | 'mac' | 'other'
type Detected = { platform: Platform; arch: DesktopArch }

const TARGETS = [
  {
    id: 'windows',
    platform: 'windows',
    arch: 'x64',
    title: 'Windows',
    cta: '下载 Windows 版',
    note: 'Windows 10 / 11 · 64 位',
    icon: Monitor,
  },
  {
    id: 'mac-arm64',
    platform: 'mac',
    arch: 'arm64',
    title: 'macOS · Apple 芯片',
    cta: '下载 Mac 版（Apple 芯片）',
    note: 'M1 – M4 系列 · macOS 12 及以上',
    icon: Laptop,
  },
  {
    id: 'mac-x64',
    platform: 'mac',
    arch: 'x64',
    title: 'macOS · Intel 芯片',
    cta: '下载 Mac 版（Intel）',
    note: 'Intel 处理器 · macOS 12 及以上',
    icon: Laptop,
  },
] as const

type Target = (typeof TARGETS)[number]

let manifestRequest: Promise<DesktopReleaseManifest | null> | null = null

function loadManifest() {
  manifestRequest ??= fetch(`${DESKTOP_DOWNLOADS_PATH}/manifest`, { cache: 'no-store' })
    .then((response) => (response.ok ? (response.json() as Promise<DesktopReleaseManifest>) : null))
    .catch(() => null)
  return manifestRequest
}

function useDesktopReleases() {
  const [state, setState] = React.useState<{
    loading: boolean
    manifest: DesktopReleaseManifest | null
  }>({ loading: true, manifest: null })
  React.useEffect(() => {
    let active = true
    loadManifest().then((manifest) => {
      if (active) setState({ loading: false, manifest })
    })
    return () => {
      active = false
    }
  }, [])
  return state
}

type UADataNavigator = Navigator & {
  userAgentData?: {
    platform?: string
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>
  }
}

function useDetectedPlatform() {
  const [detected, setDetected] = React.useState<Detected | null>(null)
  React.useEffect(() => {
    const nav = navigator as UADataNavigator
    const source = `${nav.userAgentData?.platform ?? ''} ${navigator.platform} ${navigator.userAgent}`
    const platform: Platform = /windows|win32|win64/i.test(source)
      ? 'windows'
      : /mac/i.test(source) && !/iphone|ipad/i.test(source)
        ? 'mac'
        : 'other'
    // 2020 年后的 Mac 基本都是 Apple 芯片；Chrome / Edge 能读到真实架构时再修正
    setDetected({ platform, arch: platform === 'mac' ? 'arm64' : 'x64' })
    if (platform === 'mac' && nav.userAgentData?.getHighEntropyValues) {
      nav.userAgentData
        .getHighEntropyValues(['architecture'])
        .then((values) => {
          if (values.architecture === 'x86') setDetected({ platform, arch: 'x64' })
        })
        .catch(() => {})
    }
  }, [])
  return detected
}

function useDesktopBridge() {
  const [bridge, setBridge] = React.useState<DesktopBridge | null>(null)
  React.useEffect(() => {
    if (window.fanmengDesktop?.isDesktop) setBridge(window.fanmengDesktop)
  }, [])
  return bridge
}

function recommendedTarget(detected: Detected | null): Target | null {
  if (!detected || detected.platform === 'other') return null
  return (
    TARGETS.find(
      (target) => target.platform === detected.platform && target.arch === detected.arch,
    ) ?? null
  )
}

function assetFor(manifest: DesktopReleaseManifest | null, target: Target) {
  return pickDesktopAsset(manifest?.[target.platform], target.arch, true)
}

/** 首屏下载按钮：按访客的系统推荐对应安装包 */
export function DesktopHeroActions() {
  const { loading, manifest } = useDesktopReleases()
  const detected = useDetectedPlatform()
  const bridge = useDesktopBridge()

  if (bridge) {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Badge
          variant="neutral"
          className="h-9 rounded-full bg-card px-4 text-sm"
          label={`你正在使用桌面客户端 v${bridge.version}`}
        />
        <Button
          size="lg"
          variant="secondary"
          className="h-11 rounded-full px-6 text-base"
          onClick={() => void bridge.checkForUpdates()}
          icon={<RefreshCw />}
          label="检查更新"
        />
      </div>
    )
  }

  if (loading || !detected) {
    return (
      <div className="mt-8 flex flex-col gap-3" aria-hidden>
        <Skeleton data-slot="skeleton" className="block h-11 w-56 rounded-full" />
        <Skeleton data-slot="skeleton" className="block h-4 w-72" />
      </div>
    )
  }

  const target = recommendedTarget(detected)
  const asset = target ? assetFor(manifest, target) : null
  const version = target ? manifest?.[target.platform]?.version : null

  if (target && asset) {
    return (
      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
            href={asset.url}
            as={Link}
            icon={<Download />}
            label={target.cta}
          />
          <Button
            size="lg"
            variant="ghost"
            className="h-11 rounded-full px-5 text-base"
            href="#platforms"
            as={Link}
            label="其他平台"
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          v{version} · {formatBytes(asset.size)} · {target.note}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          className="h-11 rounded-full bg-foreground px-6 text-base text-background hover:bg-foreground/85"
          href="/projects"
          as={Link}
          icon={<ArrowRight />}
          label="使用网页版"
        />
        <Button
          size="lg"
          variant="ghost"
          className="h-11 rounded-full px-5 text-base"
          href="#platforms"
          as={Link}
          label="查看全部平台"
        />
      </div>
    </div>
  )
}

/** 全部平台的下载卡片 */
export function DesktopPlatformCards() {
  const { loading, manifest } = useDesktopReleases()
  const recommended = recommendedTarget(useDetectedPlatform())

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-3">
      {TARGETS.map((target) => {
        const asset = assetFor(manifest, target)
        const release = manifest?.[target.platform]
        const isRecommended = recommended?.id === target.id
        const Icon = target.icon
        return (
          <div
            key={target.id}
            className={cn(
              'flex flex-col rounded-2xl border border-border bg-card p-6',
              isRecommended && 'border-primary/60 ring-1 ring-primary/40',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              {isRecommended ? (
                <Badge variant="neutral" className="rounded-full" label={'推荐你的电脑'} />
              ) : null}
            </div>
            <h3 className="mt-6 font-medium">{target.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{target.note}</p>

            {loading ? (
              <div className="mt-6 flex flex-1 flex-col justify-end gap-3" aria-hidden>
                <Skeleton data-slot="skeleton" className="block h-4 w-2/3" />
                <Skeleton data-slot="skeleton" className="block h-9 w-full rounded-full" />
              </div>
            ) : asset && release ? (
              <div className="mt-6 flex flex-1 flex-col justify-end gap-4">
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">版本</dt>
                    <dd className="mt-1 font-medium tabular-nums">v{release.version}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">大小</dt>
                    <dd className="mt-1 font-medium tabular-nums">{formatBytes(asset.size)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">格式</dt>
                    <dd className="mt-1 font-medium">{DESKTOP_FORMAT_LABELS[asset.format]}</dd>
                  </div>
                </dl>
                <Button
                  size="lg"
                  variant={isRecommended ? 'primary' : 'secondary'}
                  className="w-full rounded-full"
                  href={asset.url}
                  as={Link}
                  icon={<Download />}
                  label="下载"
                />
              </div>
            ) : (
              <div className="mt-6 flex flex-1 flex-col justify-end gap-4">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full rounded-full"
                  isDisabled
                  label="即将上线"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
