/** 项目共用的取值、文案和规则。 */

/**
 * 项目的五个板块，也是一个项目从开始到交付的顺序。
 * 进度由数据自动得出（有点位、有报价、合同已签、已归档），不需要手动推进阶段。
 */
export const PROJECT_SECTIONS = [
  { key: 'info', label: '信息', segment: null },
  { key: 'points', label: '点位', segment: 'point-map' },
  { key: 'quotes', label: '报价', segment: 'quotes' },
  { key: 'contract', label: '合同', segment: 'contract' },
  { key: 'archive', label: '归档', segment: 'archive' },
] as const
export type ProjectSectionKey = (typeof PROJECT_SECTIONS)[number]['key']

export const sectionHref = (projectId: string, key: ProjectSectionKey) => {
  const section = PROJECT_SECTIONS.find((s) => s.key === key)!
  return section.segment ? `/projects/${projectId}/${section.segment}` : `/projects/${projectId}`
}

/** 项目状态：进行中 / 已归档。 */
export const PROJECT_STATUSES = [
  { value: 'active', label: '进行中' },
  { value: 'archived', label: '已归档' },
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]['value']

export const PROJECT_PLATFORMS = [
  '米家',
  'Aqara Home',
  'Apple Home',
  '华为鸿蒙智家',
  'KNX',
  'Control4',
  '网络/弱电',
  '待定',
] as const
export type ProjectPlatform = (typeof PROJECT_PLATFORMS)[number]
export const isProjectPlatform = (v: unknown): v is ProjectPlatform =>
  (PROJECT_PLATFORMS as readonly unknown[]).includes(v)
export const DEFAULT_PLATFORM: ProjectPlatform = '米家'

type NameSource = {
  community?: string | null
  address?: string | null
  customerName?: string | null
}

/**
 * 项目名称留空时自动生成：
 * 「小区 + 房号」（如「万科城 3-1201」）→ 只有小区或地址 →「客户姓名家」→「未命名项目 10月30日」。
 * 详细地址太长时只用小区，避免名称过长。
 */
export function autoProjectName(p: NameSource, now = new Date()) {
  const community = p.community?.trim() ?? ''
  const address = p.address?.trim() ?? ''
  const customer = p.customerName?.trim() ?? ''
  const place = community
    ? address && address.length <= 16
      ? `${community} ${address}`
      : community
    : address.slice(0, 40)
  if (place) return place.slice(0, 120)
  if (customer) return `${customer}家`.slice(0, 120)
  const day = now.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
  })
  return `未命名项目 ${day}`
}

export type ProgressInput = {
  status?: string | null
  pointCount?: number | null
  quoteCount: number
  contractStatus?: string | null
}

export type ProjectProgress = {
  /** 已推进到第几个板块（0 信息 … 4 归档） */
  index: number
  label: string
  detail: string
  next: { section: ProjectSectionKey; label: string } | null
}

/** 由项目数据推算进度和下一步，项目列表、信息页共用同一套规则。 */
export function projectProgress(p: ProgressInput): ProjectProgress {
  const points = p.pointCount ?? 0
  if (p.status === 'archived') return { index: 4, label: '归档', detail: '已归档', next: null }
  if (p.contractStatus === 'signed')
    return {
      index: 3,
      label: '合同',
      detail: '合同已签订',
      next: { section: 'archive', label: '归档项目' },
    }
  if (p.contractStatus === 'draft')
    return {
      index: 3,
      label: '合同',
      detail: '合同待签订',
      next: { section: 'contract', label: '确认签订' },
    }
  if (p.quoteCount > 0)
    return {
      index: 2,
      label: '报价',
      detail: `${p.quoteCount} 份报价`,
      next: { section: 'contract', label: '生成合同' },
    }
  if (points > 0)
    return {
      index: 1,
      label: '点位',
      detail: `${points} 个点位`,
      next: { section: 'quotes', label: '生成报价' },
    }
  return {
    index: 0,
    label: '信息',
    detail: '待布置点位',
    next: { section: 'points', label: '布置点位' },
  }
}

export const statusLabel = (v?: string | null) =>
  PROJECT_STATUSES.find((s) => s.value === v)?.label ?? '进行中'

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'
