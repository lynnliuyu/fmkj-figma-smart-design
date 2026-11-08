/**
 * 售后维保（插件 after-sales）共用的字典与计算：记录类型、状态、收费方式、质保期计算、配置备份快照结构。
 * 纯函数与常量，服务端、客户端组件和打印页都可以安全导入。
 */
import { DEFAULT_WARRANTY_MONTHS, shanghaiDate } from '@/lib/contracts'

export const SERVICE_RECORD_TYPES = [
  { value: 'acceptance', label: '交付验收', hint: '登记后质保从这一天开始计算' },
  { value: 'inspection', label: '定期巡检', hint: '上门或远程检查设备在线、场景与网络' },
  { value: 'repair', label: '上门检修', hint: '排查故障、重新配网或调试' },
  { value: 'replacement', label: '设备更换', hint: '记录换下与换上的设备型号' },
  { value: 'remote', label: '远程调试', hint: '电话、微信或远程协助完成的服务' },
  { value: 'backup', label: '配置备份', hint: '留存当时的全屋设备台账，作为维保基准' },
] as const
export type ServiceRecordType = (typeof SERVICE_RECORD_TYPES)[number]['value']
export const isServiceRecordType = (v: unknown): v is ServiceRecordType =>
  SERVICE_RECORD_TYPES.some((t) => t.value === v)
export const serviceTypeLabel = (v?: string | null) =>
  SERVICE_RECORD_TYPES.find((t) => t.value === v)?.label ?? '维保记录'

export const SERVICE_RECORD_STATUSES = [
  { value: 'open', label: '待处理' },
  { value: 'scheduled', label: '已预约' },
  { value: 'done', label: '已完成' },
] as const
export type ServiceRecordStatus = (typeof SERVICE_RECORD_STATUSES)[number]['value']
export const isServiceRecordStatus = (v: unknown): v is ServiceRecordStatus =>
  SERVICE_RECORD_STATUSES.some((s) => s.value === v)
export const serviceStatusLabel = (v?: string | null) =>
  SERVICE_RECORD_STATUSES.find((s) => s.value === v)?.label ?? '已完成'

export const SERVICE_BILLING = [
  { value: 'warranty', label: '质保内免费' },
  { value: 'paid', label: '保外收费' },
  { value: 'free', label: '赠送服务' },
] as const
export type ServiceBilling = (typeof SERVICE_BILLING)[number]['value']
export const isServiceBilling = (v: unknown): v is ServiceBilling =>
  SERVICE_BILLING.some((b) => b.value === v)
export const serviceBillingLabel = (v?: string | null) =>
  SERVICE_BILLING.find((b) => b.value === v)?.label ?? '质保内免费'

/** 质保期即将到期的提醒阈值（天） */
export const WARRANTY_EXPIRING_DAYS = 30

/** 配置备份快照：当时的全屋设备台账（按房间排列），后续更换设备时以此为基准核对 */
export type ServiceSnapshotDevice = {
  code: string
  type: string
  typeName: string
  room: string | null
  floor: string | null
  product: string | null
  sku: string | null
}
export type ServiceSnapshot = {
  version: 1
  takenAt: string
  platform: string | null
  quote: { id: string; title: string; total: number } | null
  totals: { devices: number; rooms: number; sheets: number }
  devices: ServiceSnapshotDevice[]
}
export const MAX_SNAPSHOT_DEVICES = 800

/** 读取存储的快照（损坏或旧格式时返回 null） */
export function parseServiceSnapshot(raw: unknown): ServiceSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Partial<ServiceSnapshot>
  if (r.version !== 1 || !Array.isArray(r.devices)) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    version: 1,
    takenAt: typeof r.takenAt === 'string' ? r.takenAt : new Date(0).toISOString(),
    platform: str(r.platform),
    quote:
      r.quote && typeof r.quote === 'object' && typeof r.quote.id === 'string'
        ? { id: r.quote.id, title: String(r.quote.title ?? ''), total: Number(r.quote.total) || 0 }
        : null,
    totals: {
      devices: Number(r.totals?.devices) || r.devices.length,
      rooms: Number(r.totals?.rooms) || 0,
      sheets: Number(r.totals?.sheets) || 0,
    },
    devices: r.devices.slice(0, MAX_SNAPSHOT_DEVICES).map((d) => ({
      code: String(d?.code ?? ''),
      type: String(d?.type ?? 'other'),
      typeName: String(d?.typeName ?? ''),
      room: str(d?.room),
      floor: str(d?.floor),
      product: str(d?.product),
      sku: str(d?.sku),
    })),
  }
}

/* ------------------------------ 质保期计算 ------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000
const ymd = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}
const utcOf = (iso: string) => {
  const { y, m, d } = ymd(iso)
  return Date.UTC(y, m - 1, d)
}
/** 任意日期值转为上海时区的 YYYY-MM-DD；无效时返回 null */
export const toShanghaiDay = (v: string | Date | null | undefined): string | null => {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : shanghaiDate(d)
}
/** YYYY-MM-DD 加若干个自然月（月底日期按目标月最后一天处理，如 1-31 + 1 月 = 2-28/29） */
export function addMonthsToDay(day: string, months: number) {
  const { y, m, d } = ymd(day)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}
export const daysBetween = (from: string, to: string) =>
  Math.round((utcOf(to) - utcOf(from)) / DAY_MS)

export type WarrantyInfo = {
  /** none：还没有起算日期（未签合同、也没有登记交付验收） */
  status: 'none' | 'active' | 'expiring' | 'expired'
  start: string | null
  end: string | null
  months: number
  daysLeft: number | null
  totalDays: number | null
  /** 已过去的比例 0–1 */
  elapsed: number
  startSource: 'acceptance' | 'contract' | null
}

/**
 * 质保期：起算日优先取「交付验收」记录的日期，没有时取合同签订日期；质保月数取合同（未填写按默认 12 个月）。
 */
export function warrantyInfo(
  contract: {
    status?: string | null
    signedAt?: string | null
    warrantyMonths?: number | null
  } | null,
  acceptanceDay: string | null,
  today: string = shanghaiDate(),
): WarrantyInfo {
  const months =
    contract?.warrantyMonths != null && Number.isFinite(contract.warrantyMonths)
      ? Math.max(0, Math.round(contract.warrantyMonths))
      : DEFAULT_WARRANTY_MONTHS
  const signedDay = contract?.status === 'signed' ? toShanghaiDay(contract.signedAt) : null
  const start = acceptanceDay ?? signedDay
  if (!start)
    return {
      status: 'none',
      start: null,
      end: null,
      months,
      daysLeft: null,
      totalDays: null,
      elapsed: 0,
      startSource: null,
    }
  const end = addMonthsToDay(start, months)
  const totalDays = Math.max(1, daysBetween(start, end))
  const daysLeft = daysBetween(today, end)
  const elapsed = Math.min(1, Math.max(0, daysBetween(start, today) / totalDays))
  const status =
    daysLeft < 0 ? 'expired' : daysLeft <= WARRANTY_EXPIRING_DAYS ? 'expiring' : 'active'
  return {
    status,
    start,
    end,
    months,
    daysLeft,
    totalDays,
    elapsed,
    startSource: acceptanceDay ? 'acceptance' : 'contract',
  }
}

export const WARRANTY_STATUS_LABEL: Record<WarrantyInfo['status'], string> = {
  none: '未开始计算',
  active: '质保中',
  expiring: '即将到期',
  expired: '已过质保',
}

/** 给定日期在质保期内吗（用于新记录默认收费方式） */
export const inWarranty = (w: WarrantyInfo, day: string) =>
  Boolean(w.start && w.end && day >= w.start && day <= w.end)

/** 中文长日期：2026 年 11 月 3 日 */
export const longDay = (day: string | null | undefined) => {
  if (!day) return '—'
  const { y, m, d } = ymd(day)
  return `${y} 年 ${m} 月 ${d} 日`
}
