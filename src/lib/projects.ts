/** 项目工作台共用的取值、文案和分组规则（沿用旧系统定义）。 */

export const PROJECT_STAGES = [
  { value: 'new', label: '新建跟进' },
  { value: 'measure', label: '现场测量' },
  { value: 'proposal', label: '方案报价' },
  { value: 'contract', label: '合同收款' },
  { value: 'install', label: '安装调试' },
  { value: 'acceptance', label: '交付验收' },
  { value: 'aftercare', label: '售后维护' },
] as const
export type ProjectStage = (typeof PROJECT_STAGES)[number]['value']

export const PROJECT_RISKS = [
  { value: 'normal', label: '正常' },
  { value: 'watch', label: '需关注' },
  { value: 'blocked', label: '受阻' },
] as const
export type ProjectRisk = (typeof PROJECT_RISKS)[number]['value']

export const PROJECT_WAITING_ON = [
  { value: 'none', label: '无' },
  { value: 'customer', label: '等客户' },
  { value: 'internal', label: '等内部' },
  { value: 'vendor', label: '等供应商' },
] as const
export type ProjectWaitingOn = (typeof PROJECT_WAITING_ON)[number]['value']

export const PROJECT_STATUSES = [
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '暂停' },
  { value: 'canceled', label: '已取消' },
  { value: 'archived', label: '已归档' },
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]['value']

export const PROJECT_PLATFORMS = ['米家', 'Aqara Home', 'Apple Home', '华为鸿蒙智家', 'KNX', 'Control4', '网络/弱电', '待定'] as const

const labelOf = <T extends readonly { value: string; label: string }[]>(list: T, value: string | null | undefined) =>
  list.find((item) => item.value === value)?.label ?? list[0].label

export const stageLabel = (v?: string | null) => labelOf(PROJECT_STAGES, v)
export const riskLabel = (v?: string | null) => labelOf(PROJECT_RISKS, v)
export const waitingLabel = (v?: string | null) => labelOf(PROJECT_WAITING_ON, v)
export const statusLabel = (v?: string | null) => labelOf(PROJECT_STATUSES, v)
export const stageIndex = (v?: string | null) => Math.max(0, PROJECT_STAGES.findIndex((s) => s.value === v))

export type WorkbenchGroupKey = 'risk' | 'upcoming' | 'waiting' | 'active'
export const WORKBENCH_GROUPS: { key: WorkbenchGroupKey; label: string; description: string }[] = [
  { key: 'risk', label: '风险项目', description: '受阻或需关注，优先处理' },
  { key: 'upcoming', label: '近期待办', description: '3 天内到期或已逾期的下一步' },
  { key: 'waiting', label: '等待中', description: '在等客户、内部或供应商' },
  { key: 'active', label: '进行中', description: '正常推进的项目' },
]

type WorkbenchInput = {
  riskLevel?: string | null
  waitingOn?: string | null
  nextActionDueAt?: string | null
  stage?: string | null
  status?: string | null
  updatedAt: string
}

const UPCOMING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const riskRank: Record<string, number> = { blocked: 0, watch: 1, normal: 2 }
const time = (v?: string | null) => (v ? new Date(v).getTime() : null)

/**
 * 旧系统工作台规则：风险 > 3 天内待办 > 等待中 > 进行中；已归档、已取消不进工作台，
 * 售后阶段只有存在风险/待办/等待时才出现。
 */
export function groupWorkbench<T extends WorkbenchInput>(projects: T[], now = Date.now()) {
  const groups: Record<WorkbenchGroupKey, T[]> = { risk: [], upcoming: [], waiting: [], active: [] }
  for (const p of projects) {
    if (p.status === 'archived' || p.status === 'canceled') continue
    const due = time(p.nextActionDueAt)
    if (p.riskLevel && p.riskLevel !== 'normal') groups.risk.push(p)
    else if (due !== null && due <= now + UPCOMING_WINDOW_MS) groups.upcoming.push(p)
    else if (p.waitingOn && p.waitingOn !== 'none') groups.waiting.push(p)
    else if (p.stage !== 'aftercare') groups.active.push(p)
  }
  const byDue = (a: T, b: T) =>
    (time(a.nextActionDueAt) ?? Infinity) - (time(b.nextActionDueAt) ?? Infinity) || byUpdated(a, b)
  const byUpdated = (a: T, b: T) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0)
  groups.risk.sort((a, b) => (riskRank[a.riskLevel ?? 'normal'] ?? 2) - (riskRank[b.riskLevel ?? 'normal'] ?? 2) || byDue(a, b))
  groups.upcoming.sort(byDue)
  groups.waiting.sort(byUpdated)
  groups.active.sort(byUpdated)
  return groups
}
