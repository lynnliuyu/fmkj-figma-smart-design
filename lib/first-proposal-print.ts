import type { PointMapNode, PointMapScene } from "./point-map-plan"
import type { ProjectDeliveryQuoteItem, ProjectDeliverySnapshot } from "./project-delivery"
import { quoteVerification } from "./quote-verification"

/** Printed first proposals stay within this many A4 sheets, unless the saved project itself cannot fit. */
export const FIRST_PROPOSAL_MAX_PAGES = 10

/** Body area inside one sheet after the running header, footer and padding. Kept shorter than the paper so a small estimate error does not spill. */
const BODY_MM = 214

export type FirstProposalDensity = "standard" | "compact"

export type FirstProposalRoomBand = {
  roomName: string
  showVisual: boolean
  showPlan: boolean
  floorId: string | null
  pointIds: string[]
  sceneIds: string[]
  lineIds: string[]
  showSubtotal: boolean
  showBoundary: boolean
  showEmptyScene: boolean
}

export type FirstProposalPage =
  | { kind: "cover"; usedMm: number; budgetMm: number }
  | { kind: "overview"; usedMm: number; budgetMm: number; floorIds: string[]; roomNames: string[]; lead: boolean }
  | { kind: "room"; usedMm: number; budgetMm: number; bands: FirstProposalRoomBand[]; continuation: boolean }
  | { kind: "quote"; usedMm: number; budgetMm: number; lineIds: string[]; showSummary: boolean; includeConfirm: boolean; continued: boolean }
  | { kind: "confirm"; usedMm: number; budgetMm: number }

export type FirstProposalLayout = {
  density: FirstProposalDensity
  pages: FirstProposalPage[]
  overBudget: boolean
}

type StoryRoom = {
  name: string
  points: PointMapNode[]
  items: ProjectDeliveryQuoteItem[]
  scenes: PointMapScene[]
  floorId: string | null
}

type DensityMetrics = {
  photo: number
  floor: number
  head: number
  pairPhoto: number
  sceneChars: number
  sceneNarrowChars: number
  sceneLine: number
  quoteChars: number
  quoteLine: number
  roomChars: number
  roomLine: number
  pointRow: number
}

const METRICS: Record<FirstProposalDensity, DensityMetrics> = {
  standard: { photo: 58, floor: 36, head: 16, pairPhoto: 36, sceneChars: 22, sceneNarrowChars: 16, sceneLine: 4.8, quoteChars: 24, quoteLine: 4.6, roomChars: 36, roomLine: 4.8, pointRow: 5.2 },
  compact: { photo: 48, floor: 28, head: 14, pairPhoto: 32, sceneChars: 26, sceneNarrowChars: 18, sceneLine: 4.1, quoteChars: 28, quoteLine: 4.1, roomChars: 42, roomLine: 4.1, pointRow: 4.4 },
}

function textLines(text: string, chars: number) {
  const parts = (text || "").split(/\n/)
  let lines = 0
  for (const part of parts) {
    const value = part.trim()
    lines += Math.max(1, Math.ceil((value.length || 1) / chars))
  }
  return Math.max(1, lines)
}

function sceneMm(scene: PointMapScene, density: FirstProposalDensity, narrow: boolean) {
  const metrics = METRICS[density]
  const chars = narrow ? metrics.sceneNarrowChars : metrics.sceneChars
  const body = textLines(`${scene.trigger}\n${scene.description}`, chars)
  return 8 + body * metrics.sceneLine
}

function lineMm(item: ProjectDeliveryQuoteItem, density: FirstProposalDensity, where: "room" | "quote") {
  const metrics = METRICS[density]
  const reasons = quoteVerification(item).reasons.join("；")
  if (where === "room") {
    const lines = textLines(`${item.name}\n${reasons}`, metrics.roomChars)
    return Math.max(9, 3.2 + lines * metrics.roomLine)
  }
  const lines = textLines(`${item.name}\n${item.brand ?? ""} ${item.sku ?? ""}\n${item.spec}\n${reasons}`, metrics.quoteChars)
  return Math.max(11, 5 + lines * metrics.quoteLine)
}

function pointsMm(count: number, density: FirstProposalDensity) {
  if (count <= 0) return 0
  return count * METRICS[density].pointRow
}

function canonical(value: string) {
  return value.replace(/\s*\/\s*/g, "/").trim()
}

/** Rooms follow the saved point map, then any quote row whose room is not already listed. */
export function firstProposalRooms(snapshot: ProjectDeliverySnapshot): Array<Omit<StoryRoom, "scenes" | "floorId">> {
  const rooms = new Map<string, Omit<StoryRoom, "scenes" | "floorId">>()
  const floors = new Map((snapshot.plan.floors ?? []).map((floor) => [floor.id, floor.name]))
  const quotedRoomNames = [...new Set((snapshot.quote?.items ?? []).map((item) => item.room.trim()))]
  const pointRoomFloors = new Map<string, Set<string>>()
  for (const point of snapshot.plan.points) {
    const room = point.room.trim()
    if (!pointRoomFloors.has(room)) pointRoomFloors.set(room, new Set())
    pointRoomFloors.get(room)!.add(point.floorId ?? "")
  }
  const get = (name: string) => {
    const roomName = name.trim() || "全屋 / 未分房间"
    if (!rooms.has(roomName)) rooms.set(roomName, { name: roomName, points: [], items: [] })
    return rooms.get(roomName)!
  }
  for (const point of snapshot.plan.points) {
    const floorName = floors.get(point.floorId ?? "")
    const composite = floorName ? `${floorName} / ${point.room.trim()}` : point.room
    const quotedComposite = quotedRoomNames.find((room) => canonical(room) === canonical(composite))
    const multipleFloors = (pointRoomFloors.get(point.room.trim())?.size ?? 0) > 1
    get(quotedComposite || (multipleFloors && floorName ? composite : point.room)).points.push(point)
  }
  for (const item of snapshot.quote?.items ?? []) get(item.room).items.push(item)
  return [...rooms.values()]
}

function zoneOf(name: string) {
  if (/玄关|门厅|入户/.test(name)) return "entry"
  if (/客餐厅|客厅|起居/.test(name)) return "living"
  if (/主卧|主人房/.test(name)) return "master"
  if (/次卧|儿童房|客卧|老人房/.test(name)) return "secondary"
  if (/厨房|餐厨/.test(name)) return "kitchen"
  if (/餐厅/.test(name)) return "dining"
  return ""
}

const ZONE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["entry", "living"],
  ["master", "secondary"],
  ["kitchen", "dining"],
]

function storyRooms(snapshot: ProjectDeliverySnapshot, floorIds: ReadonlySet<string>): StoryRoom[] {
  const base = firstProposalRooms(snapshot)
  const roomOfPoint = new Map<string, string>()
  for (const room of base) for (const point of room.points) roomOfPoint.set(point.id, room.name)
  const scenesByRoom = new Map<string, PointMapScene[]>()
  const loose: PointMapScene[] = []
  for (const scene of snapshot.plan.scenes ?? []) {
    const home = scene.pointIds.map((id) => roomOfPoint.get(id)).find((name): name is string => Boolean(name))
    if (!home) loose.push(scene)
    else {
      const list = scenesByRoom.get(home) ?? []
      list.push(scene)
      scenesByRoom.set(home, list)
    }
  }
  const stories: StoryRoom[] = base.map((room) => ({
    ...room,
    scenes: scenesByRoom.get(room.name) ?? [],
    floorId: floorFor(room.points, floorIds),
  }))
  if (loose.length) {
    stories.push({ name: "尚未关联房间的场景", points: [], items: [], scenes: loose, floorId: null })
  }
  return stories
}

function floorFor(points: PointMapNode[], floorIds: ReadonlySet<string>) {
  const counts = new Map<string, number>()
  for (const point of points) {
    const id = point.floorId ?? ""
    if (!floorIds.has(id)) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  let best: string | null = null
  let seen = 0
  for (const [id, count] of counts) if (count > seen) { best = id; seen = count }
  return best
}

function confirmMm(snapshot: ProjectDeliverySnapshot) {
  const unplaced = snapshot.plan.points.filter((point) => !point.placed).map((point) => `${point.room} ${point.code || point.name}`).join("、")
  const proposed = (snapshot.plan.scenes ?? []).filter((scene) => scene.status !== "confirmed").map((scene) => scene.name).join("、")
  return 78 + textLines(unplaced, 28) * 4 + textLines(proposed, 28) * 4
}

/** A room with only a few saved points stays on the overview. Scenes, quote rows, or a long point list get their own sheet. */
function needsRoomPage(room: StoryRoom) {
  return room.scenes.length > 0 || room.items.length > 0 || room.points.length > 8
}

type SoloPage = { scenes: PointMapScene[]; items: ProjectDeliveryQuoteItem[]; showVisual: boolean; showSubtotal: boolean; usedMm: number }

function packSolo(room: StoryRoom, density: FirstProposalDensity): SoloPage[] {
  const metrics = METRICS[density]
  const scenesLeft = [...room.scenes]
  const linesLeft = [...room.items]
  const pages: SoloPage[] = []
  let first = true
  let guard = 0
  do {
    if (++guard > 48) break
    const sceneIds: PointMapScene[] = []
    const lineItems: ProjectDeliveryQuoteItem[] = []
    let used = metrics.head
    if (first) {
      let column = 13
      while (scenesLeft.length) {
        const weight = sceneMm(scenesLeft[0], density, true)
        if (column + weight > metrics.photo) break
        column += weight
        sceneIds.push(scenesLeft.shift()!)
      }
      const legend = Math.max(room.floorId ? metrics.floor : 0, pointsMm(room.points.length, density))
      used += metrics.photo + legend + 4
    }
    while (!first && scenesLeft.length) {
      const weight = sceneMm(scenesLeft[0], density, false)
      if (sceneIds.length && used + weight > BODY_MM - 4) break
      sceneIds.push(scenesLeft.shift()!)
      used += weight
      if (weight > BODY_MM - metrics.head) break
    }
    while (linesLeft.length) {
      const weight = lineMm(linesLeft[0], density, "room")
      const subtotal = linesLeft.length === 1 ? 12 : 0
      if (lineItems.length && used + weight + subtotal > BODY_MM) break
      if (!lineItems.length && used + weight + subtotal > BODY_MM) {
        if (sceneIds.length) break
        lineItems.push(linesLeft.shift()!)
        used += weight + subtotal
        break
      }
      lineItems.push(linesLeft.shift()!)
      used += weight
      if (linesLeft.length === 0) used += 12
    }
    pages.push({
      scenes: sceneIds,
      items: lineItems,
      showVisual: first,
      showSubtotal: room.items.length > 0 && linesLeft.length === 0 && lineItems.length > 0,
      usedMm: used,
    })
    first = false
  } while (scenesLeft.length || linesLeft.length)
  if (!pages.length) pages.push({ scenes: [], items: [], showVisual: true, showSubtotal: false, usedMm: metrics.head + metrics.photo })
  return pages
}

function pairHeight(room: StoryRoom, density: FirstProposalDensity) {
  const metrics = METRICS[density]
  const scenes = room.scenes.reduce((sum, scene) => sum + sceneMm(scene, density, true), 0)
  const lines = room.items.reduce((sum, item) => sum + lineMm(item, density, "room"), 0)
  const column = Math.max(metrics.pairPhoto, 8 + scenes)
  return 8 + column + lines + (room.items.length ? 10 : 8) + Math.min(pointsMm(room.points.length, density), 16)
}

function canPair(left: StoryRoom, right: StoryRoom, density: FirstProposalDensity) {
  const leftZone = zoneOf(left.name)
  const rightZone = zoneOf(right.name)
  if (!leftZone || !rightZone) return false
  const match = ZONE_PAIRS.some((pair) => (pair[0] === leftZone && pair[1] === rightZone) || (pair[1] === leftZone && pair[0] === rightZone))
  if (!match) return false
  const heights = [pairHeight(left, density), pairHeight(right, density)]
  if (heights.some((height) => height > 108)) return false
  return heights[0] + heights[1] + METRICS[density].head <= BODY_MM
}

function band(room: StoryRoom, page: SoloPage): FirstProposalRoomBand {
  return {
    roomName: room.name,
    showVisual: page.showVisual,
    showPlan: page.showVisual && Boolean(room.floorId),
    floorId: page.showVisual ? room.floorId : null,
    pointIds: page.showVisual ? room.points.map((point) => point.id) : [],
    sceneIds: page.scenes.map((scene) => scene.id),
    lineIds: page.items.map((item) => item.lineId),
    showSubtotal: page.showSubtotal,
    showBoundary: page.showVisual,
    showEmptyScene: page.showVisual && room.scenes.length === 0,
  }
}

function roomPages(rooms: StoryRoom[], density: FirstProposalDensity): FirstProposalPage[] {
  const pages: FirstProposalPage[] = []
  const consumed = new Set<string>()
  for (const room of rooms) {
    if (consumed.has(room.name)) continue
    if (!needsRoomPage(room)) { consumed.add(room.name); continue }
    const partner = rooms.find((other) => other.name !== room.name && !consumed.has(other.name) && canPair(room, other, density))
    if (partner) {
      consumed.add(room.name)
      consumed.add(partner.name)
      const height = pairHeight(room, density) + pairHeight(partner, density) + METRICS[density].head
      pages.push({
        kind: "room",
        usedMm: height,
        budgetMm: BODY_MM,
        continuation: false,
        bands: [room, partner].map((entry) => ({
          roomName: entry.name,
          showVisual: true,
          showPlan: false,
          floorId: null,
          pointIds: entry.points.map((point) => point.id),
          sceneIds: entry.scenes.map((scene) => scene.id),
          lineIds: entry.items.map((item) => item.lineId),
          showSubtotal: entry.items.length > 0,
          showBoundary: entry.name === room.name,
          showEmptyScene: entry.scenes.length === 0,
        })),
      })
      continue
    }
    consumed.add(room.name)
    const packed = packSolo(room, density)
    packed.forEach((page, index) => {
      pages.push({
        kind: "room",
        usedMm: page.usedMm,
        budgetMm: BODY_MM,
        continuation: index > 0,
        bands: [band(room, page)],
      })
    })
  }
  return pages
}

function overviewPages(snapshot: ProjectDeliverySnapshot, rooms: StoryRoom[], floorIds: string[], density: FirstProposalDensity): FirstProposalPage[] {
  const floorRow = floorIds.length ? (density === "compact" ? 62 : 72) : 0
  const head = 36 + floorRow
  const rowMm = (room: StoryRoom) => {
    const text = room.name.length + room.points.map((point) => point.code || point.name).join("、").length
    return 8 + Math.max(0, Math.ceil(text / 28) - 1) * 4
  }
  const pages: FirstProposalPage[] = []
  const floorsLeft = [...floorIds]
  const roomsLeft = [...rooms]
  let lead = true
  let guard = 0
  do {
    if (++guard > 24) break
    let used = lead ? head : 18 + (floorsLeft.length ? floorRow : 0)
    const pageFloors: string[] = []
    const pageRooms: string[] = []
    while (floorsLeft.length && pageFloors.length < 2) pageFloors.push(floorsLeft.shift()!)
    if (!lead && pageFloors.length) used = 18 + floorRow
    while (roomsLeft.length) {
      const weight = rowMm(roomsLeft[0])
      if (pageRooms.length && used + weight > BODY_MM) break
      if (used + weight > BODY_MM && pageRooms.length) break
      pageRooms.push(roomsLeft.shift()!.name)
      used += weight
    }
    pages.push({ kind: "overview", usedMm: used, budgetMm: BODY_MM, floorIds: pageFloors, roomNames: pageRooms, lead })
    lead = false
  } while (floorsLeft.length || roomsLeft.length)
  if (!pages.length) pages.push({ kind: "overview", usedMm: head, budgetMm: BODY_MM, floorIds: [], roomNames: [], lead: true })
  return pages
}

function quotePages(snapshot: ProjectDeliverySnapshot, density: FirstProposalDensity): FirstProposalPage[] {
  const items = snapshot.quote?.items ?? []
  const confirm = confirmMm(snapshot)
  if (!items.length) {
    const used = 28 + confirm
    if (used <= BODY_MM) return [{ kind: "quote", usedMm: used, budgetMm: BODY_MM, lineIds: [], showSummary: false, includeConfirm: true, continued: false }]
    return [
      { kind: "quote", usedMm: 28, budgetMm: BODY_MM, lineIds: [], showSummary: false, includeConfirm: false, continued: false },
      { kind: "confirm", usedMm: confirm, budgetMm: BODY_MM },
    ]
  }
  const pages: Array<{ lineIds: string[]; usedMm: number }> = []
  const left = [...items]
  let guard = 0
  while (left.length && guard++ < 48) {
    let used = 28
    const lineIds: string[] = []
    while (left.length) {
      const weight = lineMm(left[0], density, "quote")
      const closing = left.length === 1 ? 24 : 0
      if (lineIds.length && used + weight + closing > BODY_MM) break
      if (!lineIds.length && used + weight > BODY_MM) {
        lineIds.push(left.shift()!.lineId)
        used += weight
        break
      }
      if (used + weight + closing > BODY_MM) break
      lineIds.push(left.shift()!.lineId)
      used += weight
    }
    if (!lineIds.length) break
    pages.push({ lineIds, usedMm: used })
  }
  const quoted: FirstProposalPage[] = pages.map((page, index) => {
    const last = index === pages.length - 1
    const withSummary = last ? page.usedMm + 24 : page.usedMm
    const merged = last && withSummary + confirm <= BODY_MM
    return {
      kind: "quote" as const,
      usedMm: merged ? withSummary + confirm : withSummary,
      budgetMm: BODY_MM,
      lineIds: page.lineIds,
      showSummary: last,
      includeConfirm: merged,
      continued: index > 0,
    }
  })
  const last = quoted[quoted.length - 1]
  if (last?.kind === "quote" && !last.includeConfirm) quoted.push({ kind: "confirm", usedMm: confirm, budgetMm: BODY_MM })
  return quoted
}

function build(snapshot: ProjectDeliverySnapshot, floorIds: string[], density: FirstProposalDensity): FirstProposalPage[] {
  const rooms = storyRooms(snapshot, new Set(floorIds))
  const quote = quotePages(snapshot, density)
  // quotePages already appends confirm when needed. The concat above uses a boolean expression that may double-add.
  return [
    { kind: "cover", usedMm: 200, budgetMm: BODY_MM },
    ...overviewPages(snapshot, rooms, floorIds, density),
    ...roomPages(rooms, density),
    ...quote,
  ]
}

function overflows(pages: FirstProposalPage[]) {
  return pages.some((page) => page.usedMm > page.budgetMm + 0.5)
}

/**
 * Try the room-narrative sheet at reading size first.
 * Compact only tightens type and photographs inside the same columns.
 * It never stacks a pile of unrelated rooms on one sheet.
 * Still over 10 pages, or one saved block taller than a sheet, sets overBudget.
 */
export function createFirstProposalLayout(
  snapshot: ProjectDeliverySnapshot,
  floors: ReadonlyArray<{ id: string }>,
): FirstProposalLayout {
  const floorIds = floors.map((floor) => floor.id)
  const standard = dedupeConfirm(build(snapshot, floorIds, "standard"))
  if (standard.length <= FIRST_PROPOSAL_MAX_PAGES && !overflows(standard)) {
    return { density: "standard", pages: standard, overBudget: false }
  }
  const compact = dedupeConfirm(build(snapshot, floorIds, "compact"))
  return {
    density: "compact",
    pages: compact,
    overBudget: compact.length > FIRST_PROPOSAL_MAX_PAGES || overflows(compact),
  }
}

function dedupeConfirm(pages: FirstProposalPage[]): FirstProposalPage[] {
  let confirmSeen = false
  return pages.filter((page) => {
    if (page.kind !== "confirm") return true
    if (confirmSeen) return false
    confirmSeen = true
    return true
  })
}

function isElement(value: ParentNode): value is Element {
  return typeof (value as Element).querySelectorAll === "function"
}

/**
 * Browser print guard. A sheet that is taller than its A4 box throws with the page number
 * so rows are not silently clipped. More than 10 sheets is allowed only when the layout
 * already marked overBudget.
 */
export function assertFirstProposalPrintLayout(root: ParentNode | null | undefined): void {
  if (!root || !isElement(root)) return
  const doc = root.classList?.contains("first-proposal-document") ? root : root.querySelector?.(".first-proposal-document")
  if (!doc) return
  const pages = [...doc.querySelectorAll(".fp-page")]
  const overBudget = doc.getAttribute("data-proposal-over-budget") === "true"
  if (pages.length > FIRST_PROPOSAL_MAX_PAGES && !overBudget) {
    throw new Error(`首次提案超过 ${FIRST_PROPOSAL_MAX_PAGES} 页（现在是 ${pages.length} 页）。没有继续打印。`)
  }
  pages.forEach((page, index) => {
    const box = page as HTMLElement
    const client = box.clientHeight ?? 0
    const scroll = box.scrollHeight ?? 0
    if (client > 0 && scroll > client + 1) {
      throw new Error(`首次提案第 ${index + 1} 页超出纸张（内容 ${Math.round(scroll)}px，纸面 ${Math.round(client)}px）。这一页装不下，没有继续打印，避免把内容切掉。`)
    }
  })
}
