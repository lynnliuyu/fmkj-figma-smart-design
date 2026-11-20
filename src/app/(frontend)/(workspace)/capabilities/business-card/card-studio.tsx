'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, Box, Check, Download, Info, Phone, QrCode, RotateCcw, User } from 'lucide-react'

import { BusinessCard } from '@/components/business-card'
import type { Card3DHandle } from '@/components/card-3d'
import { PageHeader } from '@/components/page-header'
import { ScaledFrame } from '@/components/scaled-frame'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { useToast } from '@astryxdesign/core/Toast'
import {
  CARD_ASSETS,
  CARD_EXPORT_SCALE,
  CARD_H,
  CARD_MM,
  CARD_TITLE_PRESETS,
  CARD_VARIANTS,
  CARD_W,
  cardFileName,
  type CardAssets,
  type CardInfo,
  type CardSide,
} from '@/lib/business-card'
import { renderCardPng, renderCardTexture } from '@/lib/card-export'
import { downloadBlob } from '@/lib/export-pdf'
import { cn } from '@/lib/utils'
import { zipFiles } from '@/lib/zip'

/**
 * three.js 单独一个 chunk：不打开三维预览就不下这 600KB。
 * 必须 ssr:false —— three 在服务端会直接抛 window is not defined。
 */
const Card3D = dynamic(() => import('@/components/card-3d').then((m) => m.Card3D), {
  ssr: false,
})

/**
 * html-to-image 对「运行时按 URL 取的外部 SVG <img>」经常漏图
 * （尤其有重定向或缓存头古怪的时候）。导出前把卡片用到的资产全部转成
 * data URL 内联进 DOM 再截图 —— 归档页的社交海报也是同一套做法。
 */
async function inlineAssets(): Promise<CardAssets> {
  const read = async (src: string) => {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`名片素材取不到：${src}（${res.status}）`)
    const blob = await res.blob()
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(new Error(`名片素材读不了：${src}`))
      fr.readAsDataURL(blob)
    })
  }
  const keys = Object.keys(CARD_ASSETS) as (keyof CardAssets)[]
  const values = await Promise.all(keys.map((k) => read(CARD_ASSETS[k])))
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as CardAssets
}

function InfoField({
  label,
  value,
  onChange,
  placeholder,
  icon: Icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  icon: typeof User
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" /> {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-primary"
      />
    </label>
  )
}

type PreviewView = 'flat' | '3d'

export function CardStudio({
  defaultInfo,
  defaultName,
}: {
  defaultInfo: CardInfo
  defaultName: string
}) {
  // 姓名默认跳当前登录账号，省掉每次手填
  const initial = useMemo<CardInfo>(
    () => ({ ...defaultInfo, name: defaultInfo.name || defaultName }),
    [defaultInfo, defaultName],
  )
  const [info, setInfo] = useState<CardInfo>(initial)
  const [picked, setPicked] = useState<string[]>([CARD_VARIANTS[0]!.key])
  const [exporting, setExporting] = useState<string | null>(null)
  const [assets, setAssets] = useState<CardAssets | null>(null)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  const showToast = useToast()
  const onWebglError = useCallback(() => setWebglFailed(true), [])

  // 导出用的离屏画布（资产已内联成 data URL），和屏幕上看到的完全一致
  const exportNodes = useRef(new Map<string, HTMLDivElement | null>())
  // 三维贴图取自导出画布，所以要等 assets 就绪
  const [previewKey, setPreviewKey] = useState(CARD_VARIANTS[0]!.key)
  const [view, setView] = useState<PreviewView>('3d')
  const [textures, setTextures] = useState<Record<string, { front: string; back: string }>>({})
  const [texBusy, setTexBusy] = useState(false)
  const threeRef = useRef<Card3DHandle | null>(null)
  const [webglFailed, setWebglFailed] = useState(false)
  const [spinOn, setSpinOn] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  // 挂载即预加载：离屏导出舞台一上来就得是完整可截图的（以前只在开三维时才加载，
  // 结果没开过三维就直接导出时舞台是空的）。三维贴图仍然按需生成。
  useEffect(() => {
    let cancelled = false
    inlineAssets()
      .then((a) => {
        if (cancelled) return
        setAssets(a)
        setAssetsError(null)
      })
      .catch((e) => {
        if (!cancelled) setAssetsError(e instanceof Error ? e.message : '素材预加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const previewVariant = CARD_VARIANTS.find((v) => v.key === previewKey) ?? CARD_VARIANTS[0]!
  const show3d = view === '3d' && !webglFailed

  useEffect(() => {
    if (!assets || !show3d || textures[previewKey]) return
    const front = exportNodes.current.get(`${previewKey}-front`)
    const back = exportNodes.current.get(`${previewKey}-back`)
    if (!front || !back) return
    let cancelled = false
    setTexBusy(true)
    ;(async () => {
      try {
        const [f, b] = await Promise.all([renderCardTexture(front), renderCardTexture(back)])
        if (!cancelled) setTextures((prev) => ({ ...prev, [previewKey]: { front: f, back: b } }))
      } catch (e) {
        if (!cancelled) setAssetsError(e instanceof Error ? e.message : '三维贴图生成失败')
      } finally {
        if (!cancelled) setTexBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // info 变了贴图就过期，要重新截
  }, [assets, show3d, previewKey, textures, info])

  // 用户改了文字 → 三维贴图作废
  const update = (patch: Partial<CardInfo>) => {
    setInfo((prev) => ({ ...prev, ...patch }))
    setTextures({})
  }

  const togglePick = (key: string) =>
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  /**
   * 截图前确保离屏舞台用的是内联好的素材。
   *
   * `setAssets` 只排队重渲染，React 不保证它在下一行截图之前提交；
   * 极端场景（刚挂载 / 跳走再回来立刻导出）会截到还是 URL 素材的那一版，
   * 导出的 PNG 就少 logo 和二维码。所以 setAssets 之后等两帧，
   * 让 React 提交、浏览器完成一次绘制，再让调用方去读舞台节点。
   */
  const ensureAssets = async () => {
    if (assets) return assets
    const loaded = await inlineAssets()
    setAssets(loaded)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return loaded
  }

  const nodeFor = (variantKey: string, side: CardSide) => {
    const node = exportNodes.current.get(`${variantKey}-${side}`)
    if (!node) throw new Error('画布还没准备好，稍后重试')
    return node
  }

  const downloadOne = async (variantKey: string, side: CardSide) => {
    if (exporting) return
    const variant = CARD_VARIANTS.find((v) => v.key === variantKey)!
    const id = `${variantKey}-${side}`
    setExporting(id)
    try {
      await ensureAssets()
      const bytes = await renderCardPng(nodeFor(variantKey, side))
      const name = cardFileName(variant, side)
      downloadBlob(new Blob([bytes as BlobPart], { type: 'image/png' }), name)
      showToast({
        body: `已导出 ${name}（${CARD_W * CARD_EXPORT_SCALE}×${CARD_H * CARD_EXPORT_SCALE} · 300dpi）`,
      })
    } catch (e) {
      showToast({ body: e instanceof Error ? e.message : '导出失败', type: 'error' })
    } finally {
      setExporting(null)
    }
  }

  const downloadAll = async () => {
    if (exporting) return
    if (!picked.length) {
      showToast({ body: '先勾选至少一版', type: 'error' })
      return
    }
    setExporting('all')
    try {
      await ensureAssets()
      const entries: { name: string; data: Uint8Array }[] = []
      for (const variant of CARD_VARIANTS.filter((v) => picked.includes(v.key))) {
        for (const side of ['front', 'back'] as CardSide[]) {
          entries.push({
            name: cardFileName(variant, side),
            data: await renderCardPng(nodeFor(variant.key, side)),
          })
        }
      }
      downloadBlob(
        zipFiles(entries),
        `繁梦空间-名片-${entries.length}张-${CARD_W * CARD_EXPORT_SCALE}px.zip`,
      )
      showToast({ body: `已打包 ${entries.length} 张 PNG` })
    } catch (e) {
      showToast({ body: e instanceof Error ? e.message : '打包失败', type: 'error' })
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 w-fit text-muted-foreground"
        href="/capabilities/tools"
        icon={<ArrowLeft />}
        label="返回全部工具"
      />

      <PageHeader
        title="名片"
        description={`${CARD_MM.w}×${CARD_MM.h} mm · 导出 ${CARD_W * CARD_EXPORT_SCALE}×${CARD_H * CARD_EXPORT_SCALE} PNG（300dpi）· 改完文字直接导出送印`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setInfo(initial)
                setTextures({})
              }}
              icon={<RotateCcw />}
              label="重置"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => void downloadAll()}
              isDisabled={Boolean(exporting) || !picked.length}
              icon={<Download />}
              label={
                exporting === 'all'
                  ? '打包中…'
                  : `导出 ZIP（${picked.length} 版 · ${picked.length * 2} 张）`
              }
            />
          </>
        }
      />

      {assetsError ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          名片素材没加载出来：{assetsError}
        </div>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* 左栏：编辑区，宽屏吸顶 */}
        <Card className="gap-4 lg:sticky lg:top-20 lg:w-80 lg:shrink-0">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <InfoField
              label="姓名"
              value={info.name}
              onChange={(v) => update({ name: v })}
              placeholder="你的名字"
              icon={User}
            />
            <InfoField
              label="头衔"
              value={info.title}
              onChange={(v) => update({ title: v })}
              placeholder="主理人 / 顾问"
              icon={User}
            />
            <InfoField
              label="电话"
              value={info.phone}
              onChange={(v) => update({ phone: v })}
              placeholder="188 0000 0000"
              icon={Phone}
            />
            <InfoField
              label="网站"
              value={info.site}
              onChange={(v) => update({ site: v })}
              placeholder="fmkj.top"
              icon={QrCode}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">头衔快捷：</span>
            {CARD_TITLE_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update({ title: t })}
                aria-pressed={info.title === t}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  info.title === t
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            公司抬头与二维码来自「设置 → 公司资料」，这里只临时改姓名、头衔、电话、网站。
          </p>
        </Card>

        {/* 右栏：预览区（容器查询，按自身宽度决定正反面并排） */}
        <div className="@container flex min-w-0 flex-1 flex-col gap-4">
          <Card className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* 版式缩略图切换器：每张显示该版式正面 */}
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                {CARD_VARIANTS.map((variant) => {
                  const selected = variant.key === previewKey
                  return (
                    <button
                      key={variant.key}
                      type="button"
                      onClick={() => setPreviewKey(variant.key)}
                      aria-pressed={selected}
                      aria-label={`切换版式：${variant.name}`}
                      className={cn(
                        'flex cursor-pointer flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors',
                        selected
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-border hover:border-primary/60',
                      )}
                    >
                      {/* 缩略图：正面在上、背面在下，一眼看到双面版式与构图差异 */}
                      <span className="relative grid gap-1 overflow-hidden rounded-md">
                        {(['front', 'back'] as CardSide[]).map((side) => (
                          <ScaledFrame
                            key={side}
                            width={CARD_W}
                            height={CARD_H}
                            label={`${variant.name} ${side === 'front' ? '正面' : '背面'}缩略图`}
                          >
                            <BusinessCard
                              variant={variant}
                              side={side}
                              info={info}
                              assets={assets ?? undefined}
                            />
                          </ScaledFrame>
                        ))}
                        {selected ? (
                          <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3" />
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          'truncate text-xs',
                          selected ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {variant.name.split(' · ')[0]}
                      </span>
                    </button>
                  )
                })}
              </div>
              <SegmentedControl
                label="预览方式"
                value={view}
                onChange={(v) => {
                  setView(v as PreviewView)
                  if (v === '3d') setWebglFailed(false)
                }}
                size="sm"
                layout="hug"
              >
                <SegmentedControlItem value="flat" label="平面预览" />
                <SegmentedControlItem value="3d" label="三维预览" />
              </SegmentedControl>
            </div>

            {/* 导出范围：勾选哪几版进 ZIP */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">导出范围</span>
              {CARD_VARIANTS.map((variant) => (
                <CheckboxInput
                  key={variant.key}
                  size="sm"
                  label={variant.name.split(' · ')[0]}
                  value={picked.includes(variant.key)}
                  onChange={() => togglePick(variant.key)}
                />
              ))}
            </div>
          </Card>

          <Card className="gap-3">
            {view === '3d' && webglFailed ? (
              <div
                role="status"
                className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
              >
                3D 预览不可用（WebGL 初始化失败）。已切换到平面预览，仍可编辑与导出。
              </div>
            ) : null}
            {show3d ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Box className="size-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">三维预览（首选）</p>
                  <span className="text-xs text-muted-foreground">看厚度 · 双面</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      label="正面"
                      onClick={() => threeRef.current?.flipTo('front')}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      label="背面"
                      onClick={() => threeRef.current?.flipTo('back')}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      label="复位视角"
                      onClick={() => threeRef.current?.reset()}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      label={spinOn && !reduceMotion ? '暂停旋转' : '继续旋转'}
                      isDisabled={reduceMotion}
                      onClick={() => setSpinOn((current) => !current)}
                    />
                  </span>
                </div>
                {reduceMotion ? (
                  <p className="text-xs text-muted-foreground">
                    检测到「减少动态效果」偏好：已停止自动旋转，仍可拖动、翻面与导出。
                  </p>
                ) : null}
                <div data-testid="card-3d-wrap" className="pt-1">
                  {texBusy && !textures[previewKey] ? (
                    <div className="grid h-[260px] place-items-center text-xs text-muted-foreground sm:h-[380px]">
                      正在生成三维贴图…
                    </div>
                  ) : (
                    // 窄屏给矮一点：卡片是 5:3 横图，容器太高只会左右被裁
                    <div className="mx-auto h-[260px] w-full max-w-3xl sm:h-[380px]">
                      <Card3D
                        ref={threeRef}
                        className="h-full"
                        spinning={spinOn && !reduceMotion}
                        onSpinningChange={setSpinOn}
                        reduceMotion={reduceMotion}
                        frontSrc={textures[previewKey]?.front ?? null}
                        backSrc={textures[previewKey]?.back ?? null}
                        edgeColor={
                          previewVariant.front.bg.startsWith('linear-gradient')
                            ? '#151833'
                            : '#E8E2D6'
                        }
                        onError={onWebglError}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{previewVariant.name}</h2>
                  <span className="text-xs text-muted-foreground">{previewVariant.note}</span>
                </div>
                <div className="grid gap-4 @[600px]:grid-cols-2">
                  {(['front', 'back'] as CardSide[]).map((side) => (
                    <div key={side} className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {side === 'front' ? '正面' : '背面'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void downloadOne(previewVariant.key, side)}
                          isDisabled={Boolean(exporting)}
                          icon={<Download />}
                          label={
                            exporting === `${previewVariant.key}-${side}` ? '导出中…' : '下载 PNG'
                          }
                        />
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border shadow-sm">
                        <ScaledFrame
                          width={CARD_W}
                          height={CARD_H}
                          label={`${previewVariant.name} ${side}`}
                        >
                          <BusinessCard
                            variant={previewVariant}
                            side={side}
                            info={info}
                            assets={assets ?? undefined}
                          />
                        </ScaledFrame>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/*
        导出用离屏画布：移出视口而不是 display:none ——
        隐藏的节点 html-to-image 截出来是空白（归档页社交海报同一套写法）。
        4 版式 × 正反面恒为 8 张，素材没内联完之前先用原始路径顶上。
      */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-[-20000px]">
        {CARD_VARIANTS.flatMap((variant) =>
          (['front', 'back'] as CardSide[]).map((side) => (
            <div
              key={`${variant.key}-${side}`}
              ref={(el) => {
                exportNodes.current.set(`${variant.key}-${side}`, el)
              }}
            >
              <BusinessCard
                variant={variant}
                side={side}
                info={info}
                assets={assets ?? CARD_ASSETS}
              />
            </div>
          )),
        )}
      </div>

      <Card className="gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Info className="size-3.5 text-muted-foreground" /> 送印前确认
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            尺寸 {CARD_MM.w}×{CARD_MM.h} mm，四边留了 ≥3mm 安全边；告诉印厂「出血各
            3mm」即可，浅色底建议覆哑膜。
          </li>
          <li>深色版（星夜紫 / 深夜金）大面积实地，选厚一点的纸（300g 以上）不容易透。</li>
          <li>
            二维码印出来至少 15mm 见方；这版是 218px / 1080 宽 ≈
            18mm，扫描没问题。换二维码请到「设置 → 公司资料」。
          </li>
          <li>
            米家 / Apple Home / KNX
            只作为「支持接入的平台与协议」展示，不代表官方认证；若要写「认证」需要另拿授权。
          </li>
        </ul>
      </Card>
    </section>
  )
}
