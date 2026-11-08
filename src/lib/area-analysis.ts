/**
 * 区域智能分析：按房间类型检查配置是否完整，给出补充建议和推荐场景。
 * 规则是公司的设计经验（必备 / 推荐 / 可选），方案模板按区域逐个展示。
 */
import { areaTypeLabel, type AreaType } from './area-types'
import { categoryOfType, DEVICE_TYPE_ORDER } from './device-types'

type Level = 'core' | 'recommended' | 'optional'
type Need = { label: string; match: (t: string) => boolean; level: Level; reason: string }

const cat = (slug: string) => (t: string) => categoryOfType(t)?.slug === slug
const anyOf = (...types: string[]) => (t: string) => types.includes(t)
const LIGHT = cat('lighting')
const CONTROL = (t: string) => cat('switch')(t) || t === 'touch-panel'

const light = (reason = '基础照明与氛围照明'): Need => ({ label: '照明', match: LIGHT, level: 'core', reason })
const control = (reason = '灯光可本地控制，也能接入场景'): Need => ({ label: '智能开关 / 面板', match: CONTROL, level: 'core', reason })

const RULES: Record<AreaType, { needs: Need[]; scenes: string[] }> = {
  entrance: {
    needs: [
      { label: '智能门锁', match: anyOf('smart-lock'), level: 'core', reason: '指纹 / 人脸开门，开锁即触发回家模式' },
      light('进门第一盏灯'),
      { label: '人体传感器', match: anyOf('motion-sensor'), level: 'recommended', reason: '进门自动亮灯，离开后自动关闭' },
      { label: '场景面板', match: CONTROL, level: 'recommended', reason: '门口一键「回家 / 离家」' },
      { label: '门铃 / 摄像头', match: anyOf('doorbell', 'camera', 'contact-sensor'), level: 'optional', reason: '访客识别、入户门状态提醒' },
    ],
    scenes: ['回家模式：开锁后玄关灯、客厅主灯依次亮起，窗帘自动打开', '离家模式：一键关闭全屋灯光和窗帘，摄像头开始布防'],
  },
  living: {
    needs: [
      light('主照明 + 筒射灯 + 灯带，分组控制营造层次'),
      control('分回路控制，支持会客、观影等场景'),
      { label: '电动窗帘', match: anyOf('curtain-track'), level: 'recommended', reason: '观影、起床场景联动窗帘开合' },
      { label: '中控屏 / 智能音箱', match: anyOf('touch-panel', 'speaker'), level: 'recommended', reason: '集中控制和语音控制全屋设备' },
      { label: '温湿度 / 空调控制', match: anyOf('temp-sensor', 'vrf-controller'), level: 'optional', reason: '按温湿度自动调节空调' },
    ],
    scenes: ['会客模式：主灯与筒灯全亮，窗帘打开', '观影模式：主灯关闭，灯带 30% 暖光，窗帘闭合'],
  },
  dining: {
    needs: [light('餐吊灯或筒灯，显色好、可调光'), control(), { label: '智能音箱', match: anyOf('speaker'), level: 'optional', reason: '用餐背景音乐' }],
    scenes: ['用餐模式：餐吊灯 80% 暖光，其余区域灯光调暗'],
  },
  kitchen: {
    needs: [
      light('操作台面无阴影照明'),
      control(),
      { label: '烟雾 / 燃气报警', match: anyOf('smoke-sensor'), level: 'core', reason: '火情、燃气泄漏早期报警' },
      { label: '水浸传感器', match: anyOf('water-sensor'), level: 'recommended', reason: '水槽下方漏水及时告警' },
      { label: '人体传感器', match: anyOf('motion-sensor'), level: 'optional', reason: '双手占用时人来灯亮' },
    ],
    scenes: ['安全联动：烟雾或燃气报警时推送手机，并联动声光提醒'],
  },
  bedroom: {
    needs: [
      light('主灯 + 床头阅读 + 夜灯'),
      control('门口与床头双控'),
      { label: '电动窗帘', match: anyOf('curtain-track'), level: 'recommended', reason: '定时开合，起床自然光唤醒' },
      { label: '人体传感器', match: anyOf('motion-sensor'), level: 'recommended', reason: '起夜自动亮起低亮度夜灯' },
      { label: '温湿度 / 空调控制', match: anyOf('temp-sensor', 'vrf-controller'), level: 'optional', reason: '睡眠时自动调节空调' },
    ],
    scenes: ['睡眠模式：关闭全部灯光，窗帘闭合，空调切换睡眠温度', '起夜模式：感应到有人起身，夜灯 10% 亮起，躺回后自动关闭'],
  },
  kids: {
    needs: [
      light('护眼、无频闪照明'),
      control(),
      { label: '温湿度传感器', match: anyOf('temp-sensor'), level: 'recommended', reason: '关注孩子房间温湿度' },
      { label: '电动窗帘', match: anyOf('curtain-track'), level: 'optional', reason: '午睡、晚睡定时闭合' },
    ],
    scenes: ['学习模式：书桌区域 4000K 中性光，亮度 80%', '晚安模式：21:30 灯光渐暗，窗帘闭合'],
  },
  study: {
    needs: [light('工作照明 + 氛围照明'), control(), { label: '电动窗帘', match: anyOf('curtain-track'), level: 'optional', reason: '视频会议时一键遮光' }],
    scenes: ['专注模式：主灯 4000K 全亮，音箱静音'],
  },
  bathroom: {
    needs: [
      light('镜前与淋浴区照明'),
      { label: '感应或开关控制', match: (t) => CONTROL(t) || t === 'motion-sensor', level: 'core', reason: '人来灯亮，人走自动关闭' },
      { label: '水浸传感器', match: anyOf('water-sensor'), level: 'recommended', reason: '地漏、洗衣机漏水告警' },
      { label: '浴霸 / 换气', match: anyOf('other'), level: 'optional', reason: '洗浴前远程预热' },
    ],
    scenes: ['人来灯亮：感应到有人自动亮灯，无人 3 分钟后关闭', '夜间如厕：23:00 后亮度自动降到 20%'],
  },
  balcony: {
    needs: [light(), { label: '电动窗帘', match: anyOf('curtain-track'), level: 'recommended', reason: '遮阳、隐私，随日照自动开合' }, { label: '智能晾衣架', match: anyOf('other'), level: 'optional', reason: '一键升降、烘干' }],
    scenes: ['日落模式：日落后阳台灯自动亮起，22:00 关闭'],
  },
  corridor: {
    needs: [light(), { label: '人体传感器', match: anyOf('motion-sensor'), level: 'recommended', reason: '夜间经过自动亮灯，不用摸黑找开关' }, { label: '开关', match: CONTROL, level: 'optional', reason: '两端双控' }],
    scenes: ['夜间通行：22:00 后感应亮灯，亮度 30%'],
  },
  stairs: {
    needs: [light('踏步灯 + 筒灯'), { label: '人体传感器', match: anyOf('motion-sensor'), level: 'recommended', reason: '踏步灯逐级点亮，30 秒后熄灭' }, { label: '上下双控', match: CONTROL, level: 'optional', reason: '楼上楼下都能控制' }],
    scenes: ['感应照明：有人上下楼时踏步灯逐级点亮，无人后自动熄灭'],
  },
  closet: {
    needs: [light('柜内灯带 + 顶灯'), { label: '人体传感器', match: anyOf('motion-sensor'), level: 'recommended', reason: '进门即亮，离开即关' }],
    scenes: ['进门即亮：感应到有人时柜内灯带亮起'],
  },
  theater: {
    needs: [light('可调光的氛围照明'), control(), { label: '电动窗帘', match: anyOf('curtain-track'), level: 'recommended', reason: '观影一键遮光' }, { label: '中控屏', match: anyOf('touch-panel'), level: 'recommended', reason: '影音、灯光、窗帘集中控制' }],
    scenes: ['影院模式：灯光渐暗至 5%，窗帘闭合，投影开启'],
  },
  leisure: {
    needs: [light(), control(), { label: '智能音箱', match: anyOf('speaker'), level: 'optional', reason: '背景音乐' }],
    scenes: ['休闲模式：氛围灯 50%，播放背景音乐'],
  },
  garage: {
    needs: [light(), { label: '人体传感器', match: anyOf('motion-sensor'), level: 'recommended', reason: '停车自动亮灯' }, { label: '摄像头', match: anyOf('camera'), level: 'recommended', reason: '车辆与出入安全' }],
    scenes: ['到家联动：车库门打开时灯光自动亮起'],
  },
  utility: {
    needs: [light(), { label: '水浸传感器', match: anyOf('water-sensor'), level: 'recommended', reason: '热水器、洗衣机漏水告警' }, { label: '烟雾报警', match: anyOf('smoke-sensor'), level: 'optional', reason: '设备间火情报警' }],
    scenes: ['漏水告警：检测到漏水立即推送手机'],
  },
  other: { needs: [light()], scenes: [] },
}

export const LEVEL_LABEL: Record<Level, string> = { core: '必备', recommended: '推荐', optional: '可选' }

/** 导出结构化房间配置规则（供领域知识导出脚本 export-domain-knowledge.ts 与知识库同步） */
export const ROOM_ANALYSIS_RULES = Object.fromEntries(
  (Object.keys(RULES) as AreaType[]).map((areaType) => {
    const r = RULES[areaType]
    return [
      areaType,
      {
        areaType,
        label: areaTypeLabel(areaType),
        needs: r.needs.map((n) => ({
          label: n.label,
          level: n.level,
          levelLabel: LEVEL_LABEL[n.level],
          reason: n.reason,
          matchingDevices: DEVICE_TYPE_ORDER.filter((dt) => n.match(dt)),
        })),
        scenes: r.scenes,
      },
    ]
  }),
) as Record<
  AreaType,
  {
    areaType: AreaType
    label: string
    needs: { label: string; level: Level; levelLabel: string; reason: string; matchingDevices: string[] }[]
    scenes: string[]
  }
>

type AreaLike = { id: string; name: string; areaType: AreaType; sheetId?: string | null }
type PointLike = { deviceType: string; areaId: string | null; sheetId: string | null }

export type AreaAnalysis = {
  areaId: string
  /** 同名区域（例如插座图和灯光图上的同一个客厅）合并分析 */
  areaIds: string[]
  name: string
  areaType: AreaType
  typeLabel: string
  devices: { deviceType: string; count: number }[]
  total: number
  met: { label: string; reason: string; level: Level }[]
  missing: { label: string; reason: string; level: Level }[]
  warnings: string[]
  scenes: string[]
  /** 必备 + 推荐项的满足比例（0–100） */
  score: number
}

/** 区域名称统一（去空格），同名区域视为同一个房间 */
export const roomKey = (name: string) => name.replace(/\s+/g, '')

/**
 * 从图纸名称提取简短楼层标识（用于区分不同楼层的同名房间，如一层的楼梯与二层的楼梯）。
 * 注意：地下室必须保留 B 前缀（B1F ≠ 1F），否则不同楼层的同名房间会被错误合并。
 */
export function floorTagFromSheetName(name: string | null | undefined): string {
  if (!name) return ''
  const m = /(地下[一二三四五六七八九十\d]+层|负[一二三四五六七八九十\d]+层|[一二三四五六七八九十\d]+层|B\d+F|\d+F)/i.exec(name)
  return m ? m[1].toUpperCase() : name.trim()
}

export function analyzeArea(area: AreaLike, points: PointLike[], siblings: AreaLike[] = [area]): AreaAnalysis {
  const ids = new Set(siblings.map((a) => a.id))
  const mine = points.filter((p) => p.areaId && ids.has(p.areaId))
  const counts = new Map<string, number>()
  for (const p of mine) counts.set(p.deviceType, (counts.get(p.deviceType) ?? 0) + 1)
  const types = [...counts.keys()]
  const rule = RULES[area.areaType] ?? RULES.other
  const met: AreaAnalysis['met'] = []
  const missing: AreaAnalysis['missing'] = []
  for (const n of rule.needs) (types.some(n.match) ? met : missing).push({ label: n.label, reason: n.reason, level: n.level })
  const weighted = rule.needs.filter((n) => n.level !== 'optional')
  const score = weighted.length ? Math.round((weighted.filter((n) => types.some(n.match)).length / weighted.length) * 100) : 100

  const warnings: string[] = []
  const lights = mine.filter((p) => LIGHT(p.deviceType)).length
  const controls = mine.filter((p) => CONTROL(p.deviceType) || p.deviceType === 'motion-sensor').length
  if (lights && !controls) warnings.push(`有 ${lights} 个灯具但没有开关、面板或传感器，无法单独控制`)
  const keys = mine.reduce((s, p) => s + (/^switch-(\d)$/.exec(p.deviceType) ? Number(p.deviceType.slice(-1)) : 0), 0)
  if (lights >= 10 && keys > 0 && keys < 3 && !counts.has('touch-panel')) warnings.push(`${lights} 个灯具只有 ${keys} 个开关键位，建议增加键位或改用场景面板分组控制`)
  if (!mine.length) warnings.push('这个区域还没有放置设备')

  return {
    areaId: area.id,
    areaIds: [...ids],
    name: area.name,
    areaType: area.areaType,
    typeLabel: areaTypeLabel(area.areaType),
    devices: DEVICE_TYPE_ORDER.filter((t) => counts.has(t)).map((t) => ({ deviceType: t, count: counts.get(t)! })),
    total: mine.length,
    met,
    missing,
    warnings,
    scenes: rule.scenes,
    score,
  }
}

/** 全屋分析：亮点（写进方案概览）和需要注意的问题。 */
/**
 * 按房间分组：同一楼层的同名区域合并成一个房间（例如同一层 L 形主卫的两个框，或同层灯光图与插座图上的客厅），
 * 不同楼层的同名区域（如一层楼梯、二层楼梯）保持独立。
 */
export function groupRooms<T extends AreaLike>(areas: T[], sheetFloorById?: ReadonlyMap<string, string>) {
  const rooms = new Map<string, T[]>()
  for (const a of areas) {
    const floor = a.sheetId ? (sheetFloorById?.get(a.sheetId) ?? a.sheetId) : ''
    const key = floor ? `${floor}::${roomKey(a.name)}` : roomKey(a.name)
    rooms.set(key, [...(rooms.get(key) ?? []), a])
  }
  return [...rooms.values()]
}

/** 每个区域元素对应的房间分析（编辑器里按区域显示，内容按房间合并计算） */
export function analyzeAreas(areas: AreaLike[], points: PointLike[], sheets?: { id: string; name: string }[]) {
  const floorMap = sheets ? new Map(sheets.map((s) => [s.id, floorTagFromSheetName(s.name)])) : undefined
  const map = new Map<string, AreaAnalysis>()
  for (const group of groupRooms(areas, floorMap)) {
    const r = analyzeArea(group[0], points, group)
    for (const a of group) map.set(a.id, r)
  }
  return map
}

export function analyzeProject(areas: AreaLike[], points: PointLike[], sheets: { id: string; name: string }[]) {
  const floorMap = new Map(sheets.map((s) => [s.id, floorTagFromSheetName(s.name)]))
  const results = groupRooms(areas, floorMap).map((group) => analyzeArea(group[0], points, group))
  const count = (f: (t: string) => boolean) => points.filter((p) => f(p.deviceType)).length
  const lights = count(LIGHT)
  const switches = count(cat('switch'))
  const sensors = count(cat('sensor'))
  const curtains = count(anyOf('curtain-track'))
  const acRouters = count(anyOf('ac-router'))
  const aps = count(anyOf('ap-node', 'ceiling-ap'))
  const gateways = count(anyOf('gateway'))
  const panels = count(anyOf('touch-panel'))
  const highlights: string[] = []
  const uncontrolled = results.filter((r) => r.warnings.some((w) => w.includes('无法单独控制'))).length
  if (lights) highlights.push(uncontrolled ? `${lights} 个灯光点位接入智能控制` : `全屋 ${lights} 个灯光点位全部可通过开关、面板或传感器智能控制`)
  if (switches || panels) highlights.push(`${switches} 个智能开关${panels ? `、${panels} 块中控屏` : ''}，支持一键场景与远程控制`)
  if (sensors) highlights.push(`${sensors} 个传感器，实现人来灯亮与安全告警`)
  if (curtains) highlights.push(`${curtains} 套电动窗帘，随场景与日照自动开合`)
  if (aps) highlights.push(acRouters ? `${acRouters} 台 AC 控制器统一管理 ${aps} 个房间 AP，全屋 Wi-Fi 无缝漫游` : `${aps} 个 AP，全屋 Wi-Fi 无缝漫游`)

  const warnings: string[] = []
  if (!gateways && (sensors || count(anyOf('curtain-track', 'smart-lock')))) warnings.push('没有配置智能网关：传感器、窗帘等无线设备需要网关接入')
  const unassigned = areas.length ? points.filter((p) => !p.areaId).length : 0
  if (unassigned) warnings.push(`${unassigned} 个点位不在任何区域内，区域分析没有统计它们`)
  if (aps) {
    if (aps >= 2 && !acRouters) warnings.push(`布置了 ${aps} 个 AP 但未配置 AC 路由/PoE 交换机，建议在弱电箱增加 AC 控制器统一管理漫游与供电`)
    const bare = sheets.filter((s) => !points.some((p) => p.sheetId === s.id && (p.deviceType === 'ap-node' || p.deviceType === 'ceiling-ap')))
    if (bare.length && sheets.length > 1) warnings.push(`「${bare.map((s) => s.name).join('、')}」没有 AP，建议每层至少布置 1 个`)
  }
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : null
  return { areas: results, highlights, warnings, score: avg }
}
