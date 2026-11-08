'use client'

import { toDeg } from '../core/geometry'
import { areaPoly, sheetAt } from '../core/ops'
import { areaLabelAnchor } from './hit'
import type { SystemPack } from '../core/pack'
import { fittingScale, formatMm, PAPERS } from '../core/paper'
import { LABEL_SIZE, symbolGeom } from '../core/symbols'
import type { BoardDoc, BoardFile, SheetObj, ViewSettings } from '../core/types'
import { downloadBlob } from '@/lib/export-pdf'
import { renderPointDisplayEffectsSvg } from '@/lib/point-display-effects'

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

async function toDataUrl(url: string, cache: Map<string, string>) {
  if (url.startsWith('data:')) return url
  const hit = cache.get(url)
  if (hit) return hit
  const blob = await (await fetch(url)).blob()
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(blob)
  })
  cache.set(url, data)
  return data
}

/**
 * 导出一张图纸为 PNG（A3 / A4 横版，150dpi）：图纸 + 区域 + 展示效果 + 点位 + 图例 + 标题栏。
 * 图纸已标定时按标准比例（1:20 / 1:50 / 1:100）出图，打印时选「实际大小 100%」即为准确比例；
 * 未标定时按纸张铺满，标题栏注明「比例未标定」。网格、标尺不出图。图片全部内嵌，不会漏图。
 */
export async function exportSheetPng(opts: {
  doc: BoardDoc
  files: Record<string, BoardFile>
  sheet: SheetObj
  pack: SystemPack
  view: ViewSettings
  hidden: ReadonlySet<string>
  project: string
}) {
  const { doc, files, sheet, pack, view, hidden } = opts
  const paper = PAPERS[pack.paper]
  const DPI = 150
  const k = DPI / 25.4
  const W = Math.round(paper.w * k)
  const H = Math.round(paper.h * k)
  const margin = 10
  const legendW = 62
  const titleH = 16
  const availW = paper.w - 2 * margin - legendW - 4
  const availH = paper.h - 2 * margin - titleH - 4
  const scale = sheet.mmPerUnit
    ? fittingScale(sheet.w, sheet.h, sheet.mmPerUnit, pack.paper, margin, {
        w: legendW + 4,
        h: titleH + 4,
      })
    : null
  // 纸面毫米 / 场景单位
  const mmPerUnitPaper =
    scale && sheet.mmPerUnit
      ? sheet.mmPerUnit / scale
      : Math.min(availW / sheet.w, availH / sheet.h)
  const u = mmPerUnitPaper * k // 像素 / 场景单位
  const ox = margin * k + (availW * k - sheet.w * u) / 2
  const oy = margin * k + (availH * k - sheet.h * u) / 2
  const cache = new Map<string, string>()
  const parts: string[] = []
  const inside = (x: number, y: number) =>
    x >= sheet.x && x <= sheet.x + sheet.w && y >= sheet.y && y <= sheet.y + sheet.h

  const sheetSrc = sheet.fileId ? files[sheet.fileId]?.dataURL : null
  parts.push(
    `<g transform="translate(${ox} ${oy}) scale(${u}) translate(${-sheet.x} ${-sheet.y})">`,
  )
  if (sheetSrc)
    parts.push(
      `<image href="${await toDataUrl(sheetSrc, cache)}" x="${sheet.x}" y="${sheet.y}" width="${sheet.w}" height="${sheet.h}" opacity="${view.sheetOpacity}" preserveAspectRatio="none"/>`,
    )
  parts.push(
    `<rect x="${sheet.x}" y="${sheet.y}" width="${sheet.w}" height="${sheet.h}" fill="none" stroke="#d4d4d4" stroke-width="${0.6 / u}"/>`,
  )
  if (view.layers.area)
    for (const o of doc.objects) {
      if (o.kind !== 'area' || !inside(o.x + o.w / 2, o.y + o.h / 2)) continue
      const pts = areaPoly(o)
        .map((q) => `${q.x},${q.y}`)
        .join(' ')
      const a = areaLabelAnchor(o)
      parts.push(
        `<polygon points="${pts}" fill="none" stroke="#64748b" stroke-opacity="0.85" stroke-width="${1.2 / u}" stroke-linejoin="round"/>`,
      )
      parts.push(
        `<text x="${a.x + 4}" y="${a.y + 13}" font-size="11" font-weight="600" fill="#475569" stroke="#fff" stroke-width="3" paint-order="stroke" font-family="system-ui,sans-serif">${esc(o.name)}</text>`,
      )
    }
  if (view.layers.symbol) {
    const visibleDoc = {
      objects: doc.objects.filter(
        (o) => o.kind !== 'symbol' || (!hidden.has(o.id) && inside(o.x, o.y)),
      ),
    }
    const effects = (pack.overlays ?? [])
      .filter((o) => view.overlays?.[o.id])
      .flatMap((o) => o.build(visibleDoc).effects ?? [])
    if (effects.length) {
      parts.push(
        `<defs><clipPath id="board-export-effects-clip"><rect x="${sheet.x}" y="${sheet.y}" width="${sheet.w}" height="${sheet.h}"/></clipPath></defs>`,
      )
      parts.push(
        `<g clip-path="url(#board-export-effects-clip)">${renderPointDisplayEffectsSvg(effects, 'board-export-effects')}</g>`,
      )
    }
  }
  const used = new Set<string>()
  for (const o of doc.objects) {
    if (o.kind !== 'symbol' || hidden.has(o.id) || !inside(o.x, o.y)) continue
    const look = pack.look(o)
    used.add(o.id)
    const g = symbolGeom(o, look, view, sheetAt(doc, o.x, o.y)?.mmPerUnit ?? null)
    if (g.marker || !look.art) {
      if (look.marker)
        parts.push(
          `<image href="${await toDataUrl(look.marker, cache)}" x="${o.x - g.w / 2}" y="${o.y - g.h / 2}" width="${g.w}" height="${g.h}"/>`,
        )
    } else {
      const rot = o.angle ? ` transform="rotate(${toDeg(o.angle)} ${o.x} ${o.y})"` : ''
      parts.push(
        `<image href="${await toDataUrl(look.art.src, cache)}" x="${o.x - g.imgW / 2}" y="${o.y - g.imgH / 2}" width="${g.imgW}" height="${g.imgH}" preserveAspectRatio="none"${rot}/>`,
      )
    }
  }
  parts.push('</g>')

  // 图例
  const lx = (paper.w - margin - legendW) * k
  let ly = margin * k
  parts.push(
    `<text x="${lx}" y="${ly + 5 * k}" font-size="${4 * k}" font-weight="700" fill="#111" font-family="system-ui,sans-serif">图例</text>`,
  )
  ly += 9 * k
  const rows = pack.legend({ objects: doc.objects.filter((o) => used.has(o.id)) })
  const rowH = Math.min(7.2, (paper.h - 2 * margin - titleH - 14) / Math.max(1, rows.length)) * k
  for (const r of rows) {
    const src = view.symbolStyle === 'plan' && r.look.art ? r.look.art.src : r.look.marker
    if (src)
      parts.push(
        `<image href="${await toDataUrl(src, cache)}" x="${lx}" y="${ly}" width="${rowH * 0.85}" height="${rowH * 0.85}"/>`,
      )
    parts.push(
      `<text x="${lx + rowH}" y="${ly + rowH * 0.6}" font-size="${Math.min(3.2 * k, rowH * 0.5)}" fill="#222" font-family="system-ui,sans-serif">${esc(r.label)}</text>`,
    )
    parts.push(
      `<text x="${lx + legendW * k}" y="${ly + rowH * 0.6}" text-anchor="end" font-size="${Math.min(3.2 * k, rowH * 0.5)}" fill="#555" font-family="system-ui,sans-serif">×${r.count}</text>`,
    )
    ly += rowH
  }

  // 标题栏
  const ty = (paper.h - margin - titleH) * k
  const scaleText = scale
    ? `比例 1:${scale}（${pack.paper} 实际大小打印）`
    : '比例未标定（按纸张铺满）'
  parts.push(
    `<rect x="${margin * k}" y="${ty}" width="${(paper.w - 2 * margin) * k}" height="${titleH * k}" fill="none" stroke="#111" stroke-width="${0.35 * k}"/>`,
  )
  const cell = (x: number, label: string, value: string) =>
    `<text x="${(margin + x) * k}" y="${ty + 5.5 * k}" font-size="${2.6 * k}" fill="#666" font-family="system-ui,sans-serif">${esc(label)}</text><text x="${(margin + x) * k}" y="${ty + 12 * k}" font-size="${4 * k}" font-weight="600" fill="#111" font-family="system-ui,sans-serif">${esc(value)}</text>`
  parts.push(
    cell(4, '项目', opts.project.slice(0, 24)),
    cell(110, '图纸', `${pack.export.title} · ${sheet.name}`.slice(0, 30)),
    cell(230, '比例', scaleText),
    cell(paper.w - 2 * margin - 52, '日期', new Date().toLocaleDateString('zh-CN')),
  )
  if (scale && sheet.mmPerUnit) {
    const bar = 1000 / scale // 1m 在纸面的毫米数
    const bx = (paper.w - margin - legendW) * k
    const by = ty - 6 * k
    parts.push(
      `<rect x="${bx}" y="${by}" width="${bar * k}" height="${1.4 * k}" fill="#111"/><text x="${bx + bar * k + 2 * k}" y="${by + 1.4 * k}" font-size="${2.8 * k}" fill="#111" font-family="system-ui,sans-serif">${formatMm(1000)}</text>`,
    )
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join('')}</svg>`
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图纸渲染失败'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('导出失败')
    return { blob, scale }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function download(blob: Blob, name: string) {
  downloadBlob(blob, name)
}
