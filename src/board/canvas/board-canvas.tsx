'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Ruler } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PointDisplayEffects } from '@/components/point-display-effects'

import {
  boxContains,
  boxInside,
  normBox,
  normAngle,
  polyBox,
  snapAngle,
  toDeg,
} from '../core/geometry'
import { areaPoly, moveObjects, rawBox, rotateSymbols, setAreaPoly, sheetAt } from '../core/ops'
import type { SystemPack } from '../core/pack'
import { fittingScale, formatMm, gridSpec, niceStep, rulerStep } from '../core/paper'
import { symbolGeom, type SymbolGeom } from '../core/symbols'
import type {
  AreaObj,
  BoardDoc,
  BoardFile,
  BoardTool,
  Box,
  SheetObj,
  SymbolObj,
  SymbolTemplate,
  Vec,
  Viewport,
  ViewSettings,
} from '../core/types'
import { panBy, toScene, visibleBox, zoomAt, type Size } from '../core/viewport'
import { edgeMidpoints, HANDLE_CURSOR, hitTest, rotateHandle, type Hit } from './hit'
import { AreaView, OverlayView, RawView, SheetView, SymbolLabel, SymbolView } from './layers'

export type CanvasContext = { hit: Hit | null; scene: Vec; local: Vec; wrap: Size }

export type BoardCanvasProps = {
  doc: BoardDoc
  files: Record<string, BoardFile>
  pack: SystemPack
  view: ViewSettings
  viewport: Viewport
  onViewport: (v: Viewport) => void
  onSize: (size: Size) => void
  tool: BoardTool
  armed: SymbolTemplate | null
  selection: ReadonlySet<string>
  onSelection: (ids: Set<string>) => void
  hidden?: ReadonlySet<string>
  readOnly?: boolean
  dark?: boolean
  ready?: boolean
  activeSheetId?: string | null
  onCommit: (doc: BoardDoc) => void
  onPlace: (at: Vec) => void
  /** 画完区域：box 是外接框；poly 有值时是多边形（点出来的轮廓），否则是拖出来的矩形 */
  onCreateArea: (box: Box, poly?: Vec[]) => void
  onCalibrateLine: (sheet: SheetObj, a: Vec, b: Vec) => void
  onCalibrateRequest?: () => void
  onContextMenu: (ctx: CanvasContext) => void
  dropType?: string
  onDrop?: (data: string, at: Vec) => void
  className?: string
}

type Gesture =
  | { t: 'pan'; last: Vec; moved: boolean; clearOnTap: boolean }
  | { t: 'pinch'; startDist: number; startZoom: number; anchor: Vec }
  | { t: 'move'; start: Vec; startLocal: Vec; ids: string[]; moved: boolean }
  | { t: 'marquee'; start: Vec; startLocal: Vec; additive: boolean }
  | {
      t: 'vertex'
      id: string
      index: number
      orig: Vec[]
      start: Vec
      startLocal: Vec
      moved: boolean
    }
  | { t: 'insert'; id: string; index: number; orig: Vec[]; start: Vec }
  | { t: 'rotate'; id: string; center: Vec; origAngle: number; startAngle: number }
  | { t: 'area'; start: Vec; startLocal: Vec; drag: boolean }
  | { t: 'calibrate'; sheet: SheetObj; start: Vec }

type Preview = { doc?: BoardDoc; marquee?: Box; draft?: Box; calib?: [Vec, Vec] }

const EMPTY = new Set<string>()
/** 显示尺寸小于这个像素时用小图（线条预先加粗过） */
const SMALL_PX = 44
/** 画区域、拖顶点时吸附到相邻顶点横 / 纵坐标的距离（屏幕像素），让墙角保持直角 */
const SNAP_PX = 8
/** 点回起点多近算闭合（屏幕像素） */
const CLOSE_PX = 10

/** 把点吸附到相邻顶点的 x / y 上（各取最近的一个），返回吸附后的点 */
function snapToNeighbors(q: Vec, neighbors: readonly Vec[], tol: number): Vec {
  let { x, y } = q
  let bx = tol
  let by = tol
  for (const n of neighbors) {
    const dx = Math.abs(n.x - q.x)
    if (dx < bx) {
      bx = dx
      x = n.x
    }
    const dy = Math.abs(n.y - q.y)
    if (dy < by) {
      by = dy
      y = n.y
    }
  }
  return { x, y }
}

const neighborsOf = (poly: readonly Vec[], i: number) => [
  poly[(i - 1 + poly.length) % poly.length],
  poly[(i + 1) % poly.length],
]

function isTyping() {
  const el = document.activeElement as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  )
}

export function BoardCanvas(props: BoardCanvasProps) {
  const {
    doc,
    files,
    pack,
    view,
    viewport,
    selection,
    hidden = EMPTY,
    readOnly = false,
    dark = false,
  } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ w: 0, h: 0 })
  const [preview, setPreviewState] = useState<Preview | null>(null)
  const [hover, setHover] = useState<{ cursor: string; pos: Vec | null }>({
    cursor: 'default',
    pos: null,
  })
  const [space, setSpace] = useState(false)
  // 正在点出的区域轮廓（画区域工具）
  const [polyDraft, setPolyDraftState] = useState<Vec[]>([])
  const polyDraftRef = useRef<Vec[]>([])
  const setPolyDraft = (pts: Vec[]) => {
    polyDraftRef.current = pts
    setPolyDraftState(pts)
  }
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, Vec>())
  const previewRef = useRef<Preview | null>(null)
  const setPreview = (p: Preview | null) => {
    previewRef.current = p
    setPreviewState(p)
  }
  const latest = useRef(props)
  latest.current = props
  const spaceRef = useRef(false)
  const effectsClipId = `board-effects-${useId().replace(/:/g, '')}`

  const shown = preview?.doc ?? doc

  // 符号几何（显示尺寸、外接框、代号位置）
  const geoms = useMemo(() => {
    const map = new Map<string, SymbolGeom>()
    for (const o of shown.objects)
      if (o.kind === 'symbol')
        map.set(
          o.id,
          symbolGeom(o, pack.look(o), view, sheetAt(shown, o.x, o.y)?.mmPerUnit ?? null),
        )
    return map
  }, [shown, pack, view])
  const geomsRef = useRef(geoms)
  geomsRef.current = geoms

  // 系统包的辅助图层（覆盖圈、开关控灯关联……）：只在打开时计算
  const overlayShapes = useMemo(() => {
    const visibleDoc = {
      objects: shown.objects.filter((o) => o.kind !== 'symbol' || !hidden.has(o.id)),
    }
    return (pack.overlays ?? [])
      .filter((o) => view.overlays?.[o.id])
      .map((o) => ({ id: o.id, shapes: o.build(visibleDoc) }))
  }, [pack, view.overlays, shown, hidden])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const s = { w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }
      setSize(s)
      latest.current.onSize(s)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const local = (e: { clientX: number; clientY: number }): Vec => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const hitAt = useCallback((p: Vec) => {
    const c = latest.current
    return hitTest(p, {
      doc: c.doc,
      geoms: geomsRef.current,
      view: c.view,
      zoom: c.viewport.zoom,
      hidden: c.hidden ?? EMPTY,
      selection: c.selection,
      readOnly: !!c.readOnly,
    })
  }, [])

  /* ---------------- 点出区域轮廓 ---------------- */

  const closeDraft = useCallback(() => {
    const pts = polyDraftRef.current
    if (pts.length >= 3) latest.current.onCreateArea(polyBox(pts), pts)
    polyDraftRef.current = []
    setPolyDraftState([])
  }, [])

  /** 加一个顶点：Shift 画水平 / 垂直线；靠近上一个点或起点的横纵坐标时自动对齐；点回起点闭合 */
  const addDraftPoint = (p: Vec, shift: boolean) => {
    const zoom = latest.current.viewport.zoom
    const pts = polyDraftRef.current
    if (!pts.length) return setPolyDraft([p])
    const last = pts[pts.length - 1]
    if (pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) * zoom <= CLOSE_PX)
      return closeDraft()
    let q = p
    if (shift)
      q =
        Math.abs(p.x - last.x) > Math.abs(p.y - last.y)
          ? { x: p.x, y: last.y }
          : { x: last.x, y: p.y }
    else q = snapToNeighbors(p, [last, pts[0]], SNAP_PX / zoom)
    // 双击时第二下落在同一位置：不重复加点
    if (Math.hypot(q.x - last.x, q.y - last.y) * zoom < 3) return
    setPolyDraft([...pts, q])
  }

  // 换工具时丢弃没画完的轮廓
  useEffect(() => {
    if (props.tool !== 'area' && polyDraftRef.current.length) setPolyDraft([])
  }, [props.tool])

  // 画轮廓时的快捷键：Enter 完成、Esc 取消、Backspace 撤回一个点（在编辑器的快捷键之前处理）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!polyDraftRef.current.length || isTyping()) return
      if (e.key === 'Enter') closeDraft()
      else if (e.key === 'Escape') setPolyDraft([])
      else if (e.key === 'Backspace' || e.key === 'Delete')
        setPolyDraft(polyDraftRef.current.slice(0, -1))
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [closeDraft])

  // 滚轮：平移；Ctrl / ⌘ + 滚轮（含触控板双指捏合）：缩放
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = latest.current
      const l = local(e)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      if (e.ctrlKey || e.metaKey)
        c.onViewport(
          zoomAt(c.viewport, l.x, l.y, c.viewport.zoom * Math.exp(-e.deltaY * unit * 0.0022)),
        )
      else {
        let dx = e.deltaX * unit
        let dy = e.deltaY * unit
        if (e.shiftKey && !dx) [dx, dy] = [dy, 0]
        c.onViewport(panBy(c.viewport, -dx, -dy))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // 按住空格临时平移
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping() || document.querySelector('[role=dialog]')) return
      if (!wrapRef.current?.matches(':hover')) return
      e.preventDefault()
      if (!spaceRef.current) {
        spaceRef.current = true
        setSpace(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceRef.current = false
      setSpace(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return
    const c = latest.current
    const l = local(e)
    const p = toScene(c.viewport, l.x, l.y)
    pointers.current.set(e.pointerId, l)
    wrapRef.current?.setPointerCapture(e.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      setPreview(null)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      gesture.current = {
        t: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startZoom: c.viewport.zoom,
        anchor: toScene(c.viewport, mid.x, mid.y),
      }
      return
    }
    if (pointers.current.size > 2) return
    const touch = e.pointerType === 'touch'
    if (e.button === 1 || spaceRef.current || c.tool === 'pan') {
      gesture.current = { t: 'pan', last: l, moved: false, clearOnTap: false }
      return
    }
    if (c.armed && !c.readOnly) {
      c.onPlace(p)
      return
    }
    if (c.tool === 'area' && !c.readOnly) {
      gesture.current = { t: 'area', start: p, startLocal: l, drag: false }
      return
    }
    if (c.tool === 'calibrate' && !c.readOnly) {
      const sheet = sheetAt(c.doc, p.x, p.y)
      if (sheet) gesture.current = { t: 'calibrate', sheet, start: p }
      return
    }
    const hit = hitAt(p)
    if (hit?.kind === 'vertex' || hit?.kind === 'mid') {
      const o = c.doc.objects.find((x) => x.id === hit.id)
      if (o?.kind === 'area') {
        const orig = areaPoly(o)
        gesture.current =
          hit.kind === 'vertex'
            ? {
                t: 'vertex',
                id: o.id,
                index: hit.index,
                orig,
                start: p,
                startLocal: l,
                moved: false,
              }
            : { t: 'insert', id: o.id, index: hit.index, orig, start: p }
      }
      return
    }
    if (hit?.kind === 'handle') {
      const o = c.doc.objects.find((x) => x.id === hit.id)
      if (o?.kind === 'symbol')
        gesture.current = {
          t: 'rotate',
          id: o.id,
          center: { x: o.x, y: o.y },
          origAngle: o.angle,
          startAngle: Math.atan2(p.y - o.y, p.x - o.x),
        }
      return
    }
    if (hit && hit.kind !== 'sheet') {
      let sel = new Set(c.selection)
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (sel.has(hit.id)) sel.delete(hit.id)
        else sel.add(hit.id)
        c.onSelection(sel)
        if (!sel.has(hit.id)) return
      } else if (!sel.has(hit.id)) {
        sel = new Set([hit.id])
        c.onSelection(sel)
      }
      if (!c.readOnly)
        gesture.current = { t: 'move', start: p, startLocal: l, ids: [...sel], moved: false }
      return
    }
    if (touch || c.readOnly) gesture.current = { t: 'pan', last: l, moved: false, clearOnTap: true }
    else gesture.current = { t: 'marquee', start: p, startLocal: l, additive: e.shiftKey }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const c = latest.current
    const l = local(e)
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, l)
    const g = gesture.current
    const p = toScene(c.viewport, l.x, l.y)
    if (!g) {
      let cursor = 'default'
      if (spaceRef.current || c.tool === 'pan') cursor = 'grab'
      else if (c.armed || c.tool === 'area' || c.tool === 'calibrate') cursor = 'crosshair'
      else {
        const hit = hitAt(p)
        if (hit?.kind === 'handle') cursor = HANDLE_CURSOR[hit.handle]
        else if (hit?.kind === 'vertex') cursor = 'move'
        else if (hit?.kind === 'mid') cursor = 'copy'
        else if (hit && hit.kind !== 'sheet') cursor = c.readOnly ? 'pointer' : 'move'
      }
      const pos = c.armed || (c.tool === 'area' && !c.readOnly) ? p : null
      if (cursor !== hover.cursor || pos || hover.pos) setHover({ cursor, pos })
      return
    }
    switch (g.t) {
      case 'pan': {
        const dx = l.x - g.last.x
        const dy = l.y - g.last.y
        if (Math.abs(dx) + Math.abs(dy) > 0) {
          c.onViewport(panBy(c.viewport, dx, dy))
          g.last = l
          g.moved = true
        }
        break
      }
      case 'pinch': {
        const pts = [...pointers.current.values()]
        if (pts.length < 2) break
        const [a, b] = pts
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const z = Math.min(
          16,
          Math.max(0.05, (g.startZoom * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDist),
        )
        c.onViewport({ zoom: z, scrollX: mid.x / z - g.anchor.x, scrollY: mid.y / z - g.anchor.y })
        break
      }
      case 'move': {
        if (!g.moved && Math.hypot(l.x - g.startLocal.x, l.y - g.startLocal.y) < 3) break
        g.moved = true
        let dx = p.x - g.start.x
        let dy = p.y - g.start.y
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        setPreview({ doc: moveObjects(c.doc, g.ids, dx, dy) })
        break
      }
      case 'marquee':
        setPreview({ marquee: normBox(g.start, p) })
        break
      case 'vertex': {
        if (!g.moved && Math.hypot(l.x - g.startLocal.x, l.y - g.startLocal.y) < 2) break
        g.moved = true
        const raw = {
          x: g.orig[g.index].x + p.x - g.start.x,
          y: g.orig[g.index].y + p.y - g.start.y,
        }
        const poly = g.orig.slice()
        poly[g.index] = e.altKey
          ? raw
          : snapToNeighbors(raw, neighborsOf(g.orig, g.index), SNAP_PX / c.viewport.zoom)
        setPreview({ doc: setAreaPoly(c.doc, g.id, poly) })
        break
      }
      case 'insert': {
        const a = g.orig[g.index]
        const b = g.orig[(g.index + 1) % g.orig.length]
        const raw = { x: (a.x + b.x) / 2 + p.x - g.start.x, y: (a.y + b.y) / 2 + p.y - g.start.y }
        const q = e.altKey ? raw : snapToNeighbors(raw, [a, b], SNAP_PX / c.viewport.zoom)
        setPreview({
          doc: setAreaPoly(c.doc, g.id, [
            ...g.orig.slice(0, g.index + 1),
            q,
            ...g.orig.slice(g.index + 1),
          ]),
        })
        break
      }
      case 'rotate': {
        let a = g.origAngle + Math.atan2(p.y - g.center.y, p.x - g.center.x) - g.startAngle
        a = e.altKey ? normAngle(a) : snapAngle(a)
        setPreview({ doc: rotateSymbols(c.doc, [g.id], { absolute: a }) })
        break
      }
      case 'area':
        // 还没开始点轮廓时按住拖动：画矩形
        if (
          !polyDraftRef.current.length &&
          (g.drag || Math.hypot(l.x - g.startLocal.x, l.y - g.startLocal.y) > 4)
        ) {
          g.drag = true
          setPreview({ draft: normBox(g.start, p) })
        }
        break
      case 'calibrate': {
        let q = p
        if (e.shiftKey)
          q =
            Math.abs(p.x - g.start.x) > Math.abs(p.y - g.start.y)
              ? { x: p.x, y: g.start.y }
              : { x: g.start.x, y: p.y }
        setPreview({ calib: [g.start, q] })
        break
      }
    }
  }

  const finish = (e: React.PointerEvent, cancel = false) => {
    pointers.current.delete(e.pointerId)
    const c = latest.current
    const g = gesture.current
    const pv = previewRef.current
    if (g?.t === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      return
    }
    gesture.current = null
    setPreview(null)
    if (!g || cancel) return
    switch (g.t) {
      case 'move':
      case 'vertex':
      case 'insert':
      case 'rotate':
        if (pv?.doc && pv.doc !== c.doc) c.onCommit(pv.doc)
        break
      case 'pan':
        if (!g.moved && g.clearOnTap) {
          const hit = hitAt(toScene(c.viewport, local(e).x, local(e).y))
          c.onSelection(
            hit && (hit.kind === 'symbol' || hit.kind === 'area' || hit.kind === 'raw')
              ? new Set([hit.id])
              : new Set(),
          )
        }
        break
      case 'marquee': {
        const box = pv?.marquee
        if (!box || box.w * c.viewport.zoom < 3) {
          if (!g.additive) c.onSelection(new Set())
          break
        }
        const sel = new Set(g.additive ? c.selection : [])
        const hid = c.hidden ?? EMPTY
        for (const o of c.doc.objects) {
          if (o.kind === 'symbol' && c.view.layers.symbol && !hid.has(o.id) && boxContains(box, o))
            sel.add(o.id)
          else if (o.kind === 'area' && c.view.layers.area && boxInside(o, box)) sel.add(o.id)
          else if (
            o.kind === 'raw' &&
            c.view.layers.shape &&
            !o.el.locked &&
            boxInside(rawBox(o.el), box)
          )
            sel.add(o.id)
        }
        c.onSelection(sel)
        break
      }
      case 'area': {
        if (g.drag) {
          if (pv?.draft && pv.draft.w >= 16 && pv.draft.h >= 16) c.onCreateArea(pv.draft)
        } else {
          const l = local(e)
          addDraftPoint(toScene(c.viewport, l.x, l.y), e.shiftKey)
        }
        break
      }
      case 'calibrate':
        if (pv?.calib) {
          const [a, b] = pv.calib
          if (Math.hypot(a.x - b.x, a.y - b.y) >= 10) c.onCalibrateLine(g.sheet, a, b)
        }
        break
    }
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const c = latest.current
    const l = local(e)
    const p = toScene(c.viewport, l.x, l.y)
    let hit = hitAt(p)
    if (hit?.kind === 'handle') hit = { kind: 'symbol', id: hit.id }
    else if (hit?.kind === 'vertex' || hit?.kind === 'mid') hit = { kind: 'area', id: hit.id }
    if (hit && hit.kind !== 'sheet' && !c.selection.has(hit.id)) c.onSelection(new Set([hit.id]))
    c.onContextMenu({ hit, scene: p, local: l, wrap: size })
  }

  /** 双击：画轮廓时完成；选中区域时双击顶点删除这个顶点（至少保留 3 个） */
  const onDoubleClick = (e: React.MouseEvent) => {
    const c = latest.current
    if (c.readOnly) return
    if (c.tool === 'area') {
      if (polyDraftRef.current.length >= 3) closeDraft()
      return
    }
    const l = local(e)
    const hit = hitAt(toScene(c.viewport, l.x, l.y))
    if (hit?.kind !== 'vertex') return
    const o = c.doc.objects.find((x) => x.id === hit.id)
    if (o?.kind !== 'area') return
    const poly = areaPoly(o)
    if (poly.length <= 3) return
    const next = setAreaPoly(
      c.doc,
      o.id,
      poly.filter((_, i) => i !== hit.index),
    )
    if (next !== c.doc) c.onCommit(next)
  }

  const z = viewport.zoom
  const vis = visibleBox(viewport, size)
  const objs = shown.objects
  const sheets = objs.filter((o): o is SheetObj => o.kind === 'sheet')
  const activeSheet = sheets.find((s) => s.sheetId === props.activeSheetId) ?? sheets[0] ?? null
  const cursor = gesture.current?.t === 'pan' ? 'grabbing' : space ? 'grab' : hover.cursor
  const sheetStyle = view.sheetStyle ?? 'cad'
  const ghost =
    props.armed && hover.pos
      ? (() => {
          const o: SymbolObj = {
            kind: 'symbol',
            id: '__ghost',
            x: hover.pos!.x,
            y: hover.pos!.y,
            code: '',
            angle: props.armed!.angle ?? 0,
            ...props.armed!,
          }
          const look = pack.look(o)
          const g = symbolGeom(o, look, view, sheetAt(doc, o.x, o.y)?.mmPerUnit ?? null)
          return (
            <SymbolView
              o={o}
              g={g}
              look={look}
              small={Math.max(g.imgW, g.imgH) * z < SMALL_PX}
              ghost
            />
          )
        })()
      : null

  return (
    <div
      ref={wrapRef}
      role="application"
      aria-label="画板"
      tabIndex={0}
      className={cn(
        'relative size-full touch-none overflow-hidden bg-canvas outline-none select-none',
        props.className,
      )}
      // 选中框、区域高亮跟随主题强调色（繁梦紫 / 青碧 / 经典），深浅色由 CSS 变量切换，服务端与客户端首帧一致
      style={{
        cursor,
        ['--board-accent' as string]: 'var(--primary)',
        ['--board-accent-soft' as string]: 'color-mix(in oklch, var(--primary) 9%, transparent)',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onPointerLeave={() => hover.pos && setHover((h) => ({ ...h, pos: null }))}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => {
        if (props.dropType && e.dataTransfer.types.includes(props.dropType)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const data = props.dropType ? e.dataTransfer.getData(props.dropType) : ''
        if (!data) return
        e.preventDefault()
        const l = local(e)
        props.onDrop?.(data, toScene(viewport, l.x, l.y))
      }}
    >
      <svg
        className={cn(
          'absolute inset-0 size-full transition-opacity',
          props.ready === false && 'opacity-0',
        )}
        aria-hidden
      >
        <defs>
          <clipPath id={effectsClipId}>
            {sheets.map((s) => (
              <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} />
            ))}
          </clipPath>
          <filter id="board-paper-shadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="6"
              floodColor="#0f172a"
              floodOpacity={dark ? 0.48 : 0.08}
            />
          </filter>
          <filter id="board-sheet-warm" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.96 0.03 0.00 0 0.01  0.02 0.93 0.02 0 0.00  0.00 0.02 0.86 0 -0.02  0 0 0 1 0"
            />
          </filter>
          <filter id="board-sheet-modern" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.93 0.04 0.03 0 0.01  0.02 0.94 0.04 0 0.01  0.02 0.04 0.98 0 0.02  0 0 0 1 0"
            />
          </filter>
          <filter id="board-sheet-blueprint" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.82 0.06 0.08 0 0.04  0.04 0.88 0.08 0 0.06  0.06 0.10 0.98 0 0.10  0 0 0 1 0"
            />
          </filter>
        </defs>
        <g transform={`scale(${z}) translate(${viewport.scrollX} ${viewport.scrollY})`}>
          {view.layers.sheet
            ? sheets.map((s) => (
                <SheetView
                  key={s.id}
                  s={s}
                  href={s.fileId ? (files[s.fileId]?.dataURL ?? null) : null}
                  opacity={view.sheetOpacity}
                  titleColor={dark ? '#d4d4d8' : '#3f3f46'}
                  sheetStyle={sheetStyle}
                />
              ))
            : null}
          {view.grid ? sheets.map((s) => <Grid key={s.id} sheet={s} vis={vis} zoom={z} />) : null}
          {view.layers.area
            ? objs.map((o) =>
                o.kind === 'area' ? (
                  <AreaView
                    key={o.id}
                    a={o}
                    selected={selection.has(o.id)}
                    sheetStyle={sheetStyle}
                  />
                ) : null,
              )
            : null}
          {view.layers.shape
            ? objs.map((o) =>
                o.kind === 'raw' ? (
                  <RawView
                    key={o.id}
                    el={o.el}
                    href={
                      typeof o.el.fileId === 'string' ? (files[o.el.fileId]?.dataURL ?? null) : null
                    }
                  />
                ) : null,
              )
            : null}
          {view.layers.symbol
            ? overlayShapes.map((ov) => (
                <g key={ov.id}>
                  {ov.shapes.effects?.length ? (
                    <g clipPath={`url(#${effectsClipId})`}>
                      <PointDisplayEffects effects={ov.shapes.effects} />
                    </g>
                  ) : null}
                  <OverlayView shapes={ov.shapes} zoom={z} />
                </g>
              ))
            : null}
          {view.layers.symbol
            ? objs.map((o) => {
                if (o.kind !== 'symbol' || hidden.has(o.id)) return null
                const g = geoms.get(o.id)!
                return (
                  <SymbolView
                    key={o.id}
                    o={o}
                    g={g}
                    look={pack.look(o)}
                    small={Math.max(g.imgW, g.imgH) * z < SMALL_PX}
                  />
                )
              })
            : null}
          {/* 代号单独一层，画在所有图标之上 */}
          {view.layers.symbol && view.labels
            ? objs.map((o) =>
                o.kind === 'symbol' && o.code && !hidden.has(o.id) ? (
                  <SymbolLabel key={o.id} o={o} g={geoms.get(o.id)!} color={pack.look(o).color} />
                ) : null,
              )
            : null}
          <SelectionOverlay
            doc={shown}
            geoms={geoms}
            selection={selection}
            zoom={z}
            readOnly={readOnly}
          />
          {preview?.marquee ? (
            <rect
              {...rectOf(preview.marquee)}
              fill="var(--board-accent-soft)"
              stroke="var(--board-accent)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {preview?.draft ? <AreaDraft box={preview.draft} /> : null}
          {polyDraft.length ? <PolyDraft pts={polyDraft} next={hover.pos} zoom={z} /> : null}
          {preview?.calib ? <CalibLine a={preview.calib[0]} b={preview.calib[1]} zoom={z} /> : null}
          {ghost}
        </g>
      </svg>
      {view.rulers && size.w ? (
        <Rulers
          viewport={viewport}
          size={size}
          sheet={activeSheet}
          dark={dark}
          onCalibrate={props.onCalibrateRequest}
        />
      ) : null}
      {activeSheet?.mmPerUnit && size.w ? (
        <ScaleBar
          mmPerUnit={activeSheet.mmPerUnit}
          zoom={z}
          sheet={activeSheet}
          pack={pack}
          left={view.rulers ? 32 : 12}
        />
      ) : null}
    </div>
  )
}

const rectOf = (b: Box) => ({ x: b.x, y: b.y, width: b.w, height: b.h })

function Grid({ sheet, vis, zoom }: { sheet: SheetObj; vis: Box; zoom: number }) {
  const spec = gridSpec(sheet.mmPerUnit, zoom)
  const x0 = Math.max(sheet.x, vis.x)
  const y0 = Math.max(sheet.y, vis.y)
  const x1 = Math.min(sheet.x + sheet.w, vis.x + vis.w)
  const y1 = Math.min(sheet.y + sheet.h, vis.y + vis.h)
  if (x1 <= x0 || y1 <= y0) return null
  const path = (step: number | null) => {
    if (!step) return ''
    let d = ''
    for (let x = sheet.x + Math.ceil((x0 - sheet.x) / step) * step; x <= x1; x += step)
      d += `M${x} ${y0}V${y1}`
    for (let y = sheet.y + Math.ceil((y0 - sheet.y) / step) * step; y <= y1; y += step)
      d += `M${x0} ${y}H${x1}`
    return d
  }
  const color = spec.calibrated ? '#0ea5e9' : '#64748b'
  return (
    <g pointerEvents="none">
      <path
        d={path(spec.minor)}
        stroke={color}
        strokeOpacity={0.14}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
      <path
        d={path(spec.major)}
        stroke={color}
        strokeOpacity={0.28}
        strokeWidth={0.8}
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
    </g>
  )
}

function SelectionOverlay({
  doc,
  geoms,
  selection,
  zoom,
  readOnly,
}: {
  doc: BoardDoc
  geoms: Map<string, SymbolGeom>
  selection: ReadonlySet<string>
  zoom: number
  readOnly: boolean
}) {
  if (!selection.size) return null
  const single = selection.size === 1
  const hs = 7 / zoom
  return (
    <g pointerEvents="none">
      {doc.objects.map((o) => {
        if (!selection.has(o.id)) return null
        if (o.kind === 'symbol') {
          const g = geoms.get(o.id)
          if (!g) return null
          const pad = 3 / zoom + 1
          const a = g.marker ? 0 : o.angle
          const rh = single && !readOnly && !g.marker ? rotateHandle(o, g, zoom) : null
          return (
            <g key={o.id}>
              <rect
                x={o.x - g.w / 2 - pad}
                y={o.y - g.h / 2 - pad}
                width={g.w + 2 * pad}
                height={g.h + 2 * pad}
                transform={a ? `rotate(${toDeg(a)} ${o.x} ${o.y})` : undefined}
                fill="none"
                stroke="var(--board-accent)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              {rh ? (
                <>
                  <line
                    x1={o.x}
                    y1={o.y}
                    x2={rh.x}
                    y2={rh.y}
                    stroke="var(--board-accent)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    strokeOpacity={0.6}
                  />
                  <circle
                    cx={rh.x}
                    cy={rh.y}
                    r={4.5 / zoom}
                    fill="#fff"
                    stroke="var(--board-accent)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              ) : null}
            </g>
          )
        }
        if (o.kind === 'area') {
          if (!single || readOnly) return null
          const poly = areaPoly(o as AreaObj)
          return (
            <g key={o.id}>
              {/* 边中点：拖动加顶点 */}
              {edgeMidpoints(poly).map((q, i) => (
                <circle
                  key={`m${i}`}
                  cx={q.x}
                  cy={q.y}
                  r={3.2 / zoom}
                  fill="#fff"
                  fillOpacity={0.9}
                  stroke="var(--board-accent)"
                  strokeOpacity={0.7}
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {/* 顶点：拖动改形状，双击删除 */}
              {poly.map((q, i) => (
                <rect
                  key={`v${i}`}
                  x={q.x - hs / 2}
                  y={q.y - hs / 2}
                  width={hs}
                  height={hs}
                  rx={1.5 / zoom}
                  fill="#fff"
                  stroke="var(--board-accent)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          )
        }
        if (o.kind === 'raw')
          return (
            <rect
              key={o.id}
              {...rectOf(rawBox(o.el))}
              fill="none"
              stroke="var(--board-accent)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )
        return null
      })}
    </g>
  )
}

function AreaDraft({ box }: { box: Box }) {
  return (
    <g pointerEvents="none">
      <rect
        {...rectOf(box)}
        fill="var(--board-accent-soft)"
        stroke="var(--board-accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  )
}

/** 正在点出的轮廓：已点的边是实线，跟随鼠标的下一条边是虚线；能闭合时起点放大提示 */
function PolyDraft({ pts, next, zoom }: { pts: Vec[]; next: Vec | null; zoom: number }) {
  const first = pts[0]
  const last = pts[pts.length - 1]
  const closable =
    pts.length >= 3 && !!next && Math.hypot(next.x - first.x, next.y - first.y) * zoom <= CLOSE_PX
  const tip = next
    ? closable
      ? first
      : snapToNeighbors(next, [last, first], SNAP_PX / zoom)
    : null
  const ring = [...pts, ...(tip ? [tip] : [])]
  return (
    <g pointerEvents="none">
      {ring.length >= 3 ? (
        <polygon
          points={ring.map((q) => `${q.x},${q.y}`).join(' ')}
          fill="var(--board-accent-soft)"
          stroke="none"
        />
      ) : null}
      <polyline
        points={pts.map((q) => `${q.x},${q.y}`).join(' ')}
        fill="none"
        stroke="var(--board-accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {tip ? (
        <line
          x1={last.x}
          y1={last.y}
          x2={tip.x}
          y2={tip.y}
          stroke="var(--board-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {pts.map((q, i) => (
        <circle
          key={i}
          cx={q.x}
          cy={q.y}
          r={(i === 0 && closable ? 6 : 3.5) / zoom}
          fill={i === 0 ? 'var(--board-accent)' : '#fff'}
          stroke="var(--board-accent)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

function CalibLine({ a, b, zoom }: { a: Vec; b: Vec; zoom: number }) {
  const len = Math.hypot(a.x - b.x, a.y - b.y)
  const fs = 12 / zoom
  return (
    <g pointerEvents="none">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#f97316"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {[a, b].map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4 / zoom}
          fill="#fff"
          stroke="#f97316"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <text
        x={(a.x + b.x) / 2}
        y={(a.y + b.y) / 2 - fs * 0.6}
        fontSize={fs}
        textAnchor="middle"
        fill="#c2410c"
        stroke="#fff"
        strokeWidth={fs * 0.3}
        paintOrder="stroke"
        fontWeight={700}
      >
        拖到已知长度的两端后松开（{Math.round(len)}）
      </text>
    </g>
  )
}

function Rulers({
  viewport,
  size,
  sheet,
  dark,
  onCalibrate,
}: {
  viewport: Viewport
  size: Size
  sheet: SheetObj | null
  dark: boolean
  onCalibrate?: () => void
}) {
  const R = 20
  const mm = sheet?.mmPerUnit ?? null
  const ox = sheet?.x ?? 0
  const oy = sheet?.y ?? 0
  const step = rulerStep(mm, viewport.zoom)
  const label = (u: number) => (mm ? formatMm(Math.round(u * mm)) : String(Math.round(u)))
  const ticks = (from: number, to: number, origin: number) => {
    const out: { v: number; major: boolean }[] = []
    const minor = step.units / 5
    for (let u = Math.floor((from - origin) / minor) * minor; u <= to - origin; u += minor)
      out.push({ v: u, major: Math.abs(u / step.units - Math.round(u / step.units)) < 1e-6 })
    return out
  }
  const vx0 = -viewport.scrollX
  const vy0 = -viewport.scrollY
  const tx = ticks(vx0, vx0 + size.w / viewport.zoom, ox)
  const ty = ticks(vy0, vy0 + size.h / viewport.zoom, oy)
  const sx = (u: number) => (ox + u + viewport.scrollX) * viewport.zoom
  const sy = (u: number) => (oy + u + viewport.scrollY) * viewport.zoom
  const fg = dark ? '#a1a1aa' : '#71717a'
  const bg = dark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.92)'
  return (
    <>
      <svg
        className="pointer-events-none absolute top-0 left-0"
        width={size.w}
        height={R}
        style={{ background: bg }}
        aria-hidden
      >
        <line x1={0} y1={R - 0.5} x2={size.w} y2={R - 0.5} stroke={fg} strokeOpacity={0.4} />
        {tx.map((t) => {
          const x = sx(t.v)
          return x < R ? null : (
            <g key={t.v}>
              <line
                x1={x}
                y1={t.major ? 6 : 14}
                x2={x}
                y2={R}
                stroke={fg}
                strokeOpacity={t.major ? 0.8 : 0.4}
              />
              {t.major ? (
                <text x={x + 3} y={11} fontSize={9.5} fill={fg}>
                  {label(t.v)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <svg
        className="pointer-events-none absolute top-0 left-0"
        width={R}
        height={size.h}
        style={{ background: bg }}
        aria-hidden
      >
        <line x1={R - 0.5} y1={0} x2={R - 0.5} y2={size.h} stroke={fg} strokeOpacity={0.4} />
        {ty.map((t) => {
          const y = sy(t.v)
          return y < R ? null : (
            <g key={t.v}>
              <line
                x1={t.major ? 6 : 14}
                y1={y}
                x2={R}
                y2={y}
                stroke={fg}
                strokeOpacity={t.major ? 0.8 : 0.4}
              />
              {t.major ? (
                <text
                  transform={`translate(11 ${y + 3}) rotate(-90)`}
                  fontSize={9.5}
                  fill={fg}
                  textAnchor="end"
                >
                  {label(t.v)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onCalibrate}
        title={
          mm
            ? `已标定：1 单位 = ${mm.toFixed(2)}mm，点击重新标定`
            : '未标定比例：点击后在图纸上拖一条已知长度的线'
        }
        aria-label="标定比例"
        className={cn(
          'absolute top-0 left-0 flex size-5 items-center justify-center border-r border-b',
          mm ? 'text-muted-foreground' : 'text-warning',
        )}
        style={{ background: bg }}
      >
        <Ruler className="size-3" />
      </button>
    </>
  )
}

function ScaleBar({
  mmPerUnit,
  zoom,
  sheet,
  pack,
  left,
}: {
  mmPerUnit: number
  zoom: number
  sheet: SheetObj
  pack: SystemPack
  left: number
}) {
  const mm = niceStep((90 / zoom) * mmPerUnit)
  const px = (mm / mmPerUnit) * zoom
  const fit = fittingScale(sheet.w, sheet.h, mmPerUnit, pack.paper)
  return (
    <div
      className="pointer-events-none absolute bottom-4 flex flex-col gap-0.5 rounded-md bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm"
      style={{ left }}
    >
      <div className="flex items-end gap-1.5">
        <div className="flex h-2 border-x border-b border-foreground/70" style={{ width: px }}>
          <div className="w-1/2 border-r border-foreground/40" />
        </div>
        <span className="tabular-nums text-foreground">{formatMm(mm)}</span>
      </div>
      {fit ? (
        <span className="tabular-nums">
          {pack.paper} 横版可按 1:{fit} 打印
        </span>
      ) : null}
    </div>
  )
}
