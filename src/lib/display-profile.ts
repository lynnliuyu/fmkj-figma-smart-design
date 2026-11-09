/**
 * 点位图显示方案：决定点位图在**方案模板**里怎么显示。
 *
 * 为什么单独抽一层：点位图工作台里的「视图设置」（网格、标尺、符号大小）是
 * **按浏览器记住的临时偏好**（见 board/canvas/use-view-settings.ts），
 * 不该污染方案；而这里定义的是**随项目走的交付形态**——
 * 同一个项目，打印给工长和发给客户，需要的视觉根本不是一回事。
 *
 * 预设写在代码里而不是建一张配置表：一共四条、几乎不变，
 * 放进数据库只会多一次查询和一套后台维护界面。
 */

/** 一套显示方案。字段刻意与方案模板 PlanView 需要的参数对齐。 */
export type DisplayProfile = {
  id: DisplayProfileId
  /** 方案名（工作台选择器、模板中心卡片都用它） */
  label: string
  /** 一句话说明：什么时候用这套 */
  description: string
  /** 网格：施工/交底需要，展示/演示不需要 */
  grid: boolean
  /** WiFi / 信号覆盖圈 */
  coverage: boolean
  /** 灯光光晕、感应波纹 */
  displayEffects: boolean
  /** 底图透明度：越低越淡，展示/演示时让点位突出 */
  sheetOpacity: number
}

export type DisplayProfileId = 'construction' | 'owner' | 'handover' | 'presentation'

export const DISPLAY_PROFILES: readonly DisplayProfile[] = [
  {
    id: 'construction',
    label: '施工图',
    description: '清晰线稿、保留网格，适合打印给施工方',
    grid: true,
    coverage: false,
    displayEffects: false,
    sheetOpacity: 0.72,
  },
  {
    id: 'owner',
    label: '业主展示',
    description: '淡化底图、显示覆盖圈与光晕，适合发给客户看',
    grid: false,
    coverage: true,
    displayEffects: true,
    sheetOpacity: 0.45,
  },
  {
    id: 'handover',
    label: '技术交底',
    description: '网格 + 覆盖圈都开，适合现场调设备与验收',
    grid: true,
    coverage: true,
    displayEffects: false,
    sheetOpacity: 0.72,
  },
  {
    id: 'presentation',
    label: '汇报演示',
    description: '极简：底图最淡、只留点位与光晕，适合大屏汇报',
    grid: false,
    coverage: false,
    displayEffects: true,
    sheetOpacity: 0.35,
  },
] as const

/** 默认方案。老项目没有 displayProfile 字段时回落到它。 */
export const DEFAULT_DISPLAY_PROFILE: DisplayProfileId = 'construction'

const byId = new Map(DISPLAY_PROFILES.map((p) => [p.id, p]))

export const isDisplayProfileId = (v: unknown): v is DisplayProfileId =>
  typeof v === 'string' && byId.has(v as DisplayProfileId)

/**
 * 按 id 取方案。未知值（老数据、脏数据、字段改名）一律回落到默认方案，
 * **不抛错**——渲染链路不该因为一个显示偏好而整页失败。
 */
export function resolveDisplayProfile(id: unknown): DisplayProfile {
  return (isDisplayProfileId(id) ? byId.get(id) : undefined) ?? byId.get(DEFAULT_DISPLAY_PROFILE)!
}
