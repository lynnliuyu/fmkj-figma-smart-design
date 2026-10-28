"use client"

import type { PointMapStorage } from "./point-map-plan"
import type { ProductSelectionFields } from "./product-selection"
import type { ProductVisualAsset } from "./product-visual-assets"

export const QUOTE_DRAFT_STORAGE_KEY = "fmkj:quote-draft-items"
export const POINT_MAP_QUOTE_SNAPSHOT_PREFIX = "fmkj:point-map-quote:"
/** Same-tab notification so an open quote page can re-merge as soon as a point-map sync is saved. */
export const POINT_MAP_QUOTE_SNAPSHOT_EVENT = "fmkj:point-map-quote-updated"

export function writePointMapQuoteSnapshot(snapshot: PointMapQuoteSnapshot, storage: PointMapStorage | undefined = quoteStorage()) {
  if (!storage) return
  storage.setItem(POINT_MAP_QUOTE_SNAPSHOT_PREFIX + snapshot.projectId, JSON.stringify(snapshot))
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(POINT_MAP_QUOTE_SNAPSHOT_EVENT, { detail: { projectId: snapshot.projectId } }))
}

export type QuoteDraftProduct = ProductSelectionFields & {
  id: string
  name: string
  spec: string
  category: string
  unit: string
  price: number
  cost: number
  image: string
  sku?: string
  status?: string
  productSnapshot?: Record<string, unknown>
  visualAsset?: ProductVisualAsset | null
}

export type QuoteDraftItem = QuoteDraftProduct & {
  project: string
  projectId?: string
  room: string
  quantity: number
  pointMapProjectId?: string
  pointIds?: string[]
  pointMapRevision?: number
}

export type PointMapQuoteSnapshot = {
  projectId: string
  revision?: number
  items: QuoteDraftItem[]
  /** 点位图里实际用到的房间（含「楼层 / 房间」的写法）。报价单的房间清单只认这一份。 */
  rooms?: string[]
}

/** Validate received browser data without consuming another quote window's copy. */
export function parsePointMapQuoteSnapshot(raw: string | null | undefined, projectId: string): PointMapQuoteSnapshot | null {
  if (!raw) return null
  try {
    const snapshot = JSON.parse(raw) as PointMapQuoteSnapshot
    if (snapshot.projectId !== projectId || !Array.isArray(snapshot.items) || snapshot.items.some((item) => !isQuoteDraftItem(item) || item.pointMapProjectId !== projectId)) return null
    if (snapshot.revision !== undefined && (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1)) return null
    return snapshot
  } catch { return null }
}

/**
 * Initial opens consume the shared slot once. Already-open windows can supply
 * their own received event value, even if a peer consumed the shared slot first.
 * Only clear matching shared content: an older read must not consume a newer event.
 */
export function consumePointMapQuoteSnapshot(projectId: string, storage: PointMapStorage | undefined = quoteStorage(), receivedRaw?: string): PointMapQuoteSnapshot | null {
  const key = POINT_MAP_QUOTE_SNAPSHOT_PREFIX + projectId
  try {
    const raw = receivedRaw ?? storage?.getItem(key)
    const snapshot = parsePointMapQuoteSnapshot(raw, projectId)
    if (!snapshot) return null
    if (storage && storage.getItem(key) === raw) storage.setItem(key, "")
    return snapshot
  } catch { return null }
}

export function addQuoteDraftProduct(
  product: QuoteDraftProduct,
  room = "全屋",
  project = ""
) {
  if (typeof window === "undefined") {
    return 0
  }

  const items = readQuoteDraftItems()
  const existing = items.find(
    (item) =>
      item.id === product.id && item.room === room && item.project === project
  )

  if (existing) {
    existing.quantity += 1
  } else {
    items.push({ ...product, project, room, quantity: 1 })
  }

  window.localStorage.setItem(QUOTE_DRAFT_STORAGE_KEY, JSON.stringify(items))

  return existing?.quantity ?? 1
}

export function consumeQuoteDraftItems(options: { projectId?: string; projectName?: string; storage?: PointMapStorage } = {}) {
  const storage = options.storage ?? quoteStorage()
  if (!storage) return []
  const items = readQuoteDraftItems(storage)
  const matches = (item: QuoteDraftItem) => !options.projectId || (item.projectId ? item.projectId === options.projectId : !item.project || item.project === options.projectName)
  const selected = items.filter(matches)
  storage.setItem(QUOTE_DRAFT_STORAGE_KEY, JSON.stringify(items.filter((item) => !matches(item))))
  return selected
}

function readQuoteDraftItems(storage: PointMapStorage | undefined = quoteStorage()): QuoteDraftItem[] {
  try {
    const raw = storage?.getItem(QUOTE_DRAFT_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as QuoteDraftItem[]) : []

    return Array.isArray(parsed) ? parsed.filter(isQuoteDraftItem) : []
  } catch {
    return []
  }
}

function quoteStorage(): PointMapStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage
}

function isQuoteDraftItem(item: QuoteDraftItem) {
  return Boolean(
    item &&
      item.id &&
      item.name &&
      item.unit &&
      item.room &&
      typeof item.price === "number" &&
      typeof item.cost === "number" &&
      typeof item.quantity === "number"
  )
}
