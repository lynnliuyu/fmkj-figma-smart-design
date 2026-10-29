/** 项目共用的取值、文案和分组规则（沿用旧系统定义）。 */

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
export const statusLabel = (v?: string | null) => labelOf(PROJECT_STATUSES, v)
export const stageIndex = (v?: string | null) => Math.max(0, PROJECT_STAGES.findIndex((s) => s.value === v))
