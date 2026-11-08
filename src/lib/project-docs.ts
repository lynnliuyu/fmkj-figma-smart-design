import { relId } from '@/lib/access'
import {
  analyzeProject,
  floorTagFromSheetName,
  groupRooms,
  roomKey,
  type AreaAnalysis,
} from '@/lib/area-analysis'
import { getCatalog, getCompanyInfo, resolveMediaUrl, type CatalogProduct } from '@/lib/cached-data'
import {
  categoryOfType,
  DEVICE_CATEGORIES,
  DEVICE_TYPE_ORDER,
  deviceTypeOf,
  isDeviceType,
} from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import { assignScenes, loadSceneLibrary } from '@/lib/scenes'
import { resolveFinalQuote } from '@/lib/deliverables'
import { fillDefaultProducts, parseDefaults, resolvePoint } from '@/lib/point-map-items'
import {
  normalizeScene,
  sceneAreas,
  scenePoints,
  sceneSheets,
  type AreaInfo,
  type PointInfo,
  type SheetInfo,
} from '@/lib/point-scene'
import {
  inferScopeFromTitle,
  inPointScope,
  isPointScope,
  POINT_SCOPES,
  type PointScope,
} from '@/lib/point-scopes'
import type { Media, Project, Quote, User } from '@/payload-types'

export { inPointScope, isPointScope, POINT_SCOPES, type PointScope }

export type DocPoint = PointInfo & {
  productId: string | null
  source: 'point' | 'default' | 'pending'
}
export type ProductRow = {
  product: CatalogProduct
  deviceType: string
  count: number
  subtotal: number
  rooms: string[]
}
export type RoomLine = {
  deviceType: string
  typeName: string
  product: CatalogProduct | null
  count: number
  unitPrice: number
  subtotal: number
  codes: string[]
}
export type Room = AreaAnalysis & {
  floorName: string
  displayName: string
  sheets: string[]
  points: DocPoint[]
  lines: RoomLine[]
  subtotal: number
}
export type FloorSummary = {
  sheetId: string
  floorName: string
  sheetName: string
  roomCount: number
  pointCount: number
  subtotal: number
}

/**
 * 项目文档（点位图、点位交底清单、方案）共用的数据：项目、图纸、区域、点位及其选型、房间分析、产品汇总、最新报价和合同。
 * 若项目已有对应报价单（或通过 quoteId 指定），点位的型号、图片与单价自动与报价单同步（含临时改价与换型号）。
 */
export async function loadProjectDocs(
  projectId: string,
  user: User,
  scope: PointScope = 'all',
  quoteId?: string | null,
) {
  return loadDocs(projectId, user, scope, quoteId)
}

/**
 * 系统身份读取项目文档（不校验登录）：只用于平台内置的示例母版项目（模板库、模板缩略图预览）。
 * 不返回其他项目列表，避免泄露任何成员数据。
 */
export async function loadSystemProjectDocs(projectId: string) {
  return loadDocs(projectId, null, 'all', null)
}

async function loadDocs(
  projectId: string,
  user: User | null,
  scope: PointScope = 'all',
  quoteId?: string | null,
) {
  const payload = await getPayloadClient()
  // 成员读取按自己的权限过滤；系统读取（示例母版）绕过权限
  const acc = user ? { user, overrideAccess: false as const } : { overrideAccess: true as const }
  // 只依赖项目编号的查询和项目本身同时发出，减少数据库往返（每次往返约 0.2 秒）
  // 报价只取方案与文档用到的字段，不展开关联（条目里的产品只用编号，图片单独按需读取）
  const quotesP = payload.find({
    collection: 'quotes',
    where: { project: { equals: projectId } },
    sort: '-updatedAt',
    limit: 50,
    depth: 0,
    ...acc,
    select: {
      title: true,
      status: true,
      total: true,
      items: true,
      fees: true,
      discount: true,
      updatedAt: true,
    },
  })
  const contractsP = payload.find({
    collection: 'contracts',
    where: { project: { equals: projectId } },
    limit: 1,
    depth: 0,
    ...acc,
  })
  const projectsP = user
    ? payload.find({
        collection: 'projects',
        sort: '-updatedAt',
        limit: 30,
        depth: 0,
        user,
        overrideAccess: false,
        select: {
          name: true,
          community: true,
          customerName: true,
          pointCount: true,
          platform: true,
        },
      })
    : Promise.resolve({ docs: [] as Project[] })
  const scenesP = loadSceneLibrary(payload, user)
  const catalogP = getCatalog()
  const project = (await payload
    .findByID({ collection: 'projects', id: projectId, depth: 0, ...acc })
    .catch(() => null)) as Project | null
  if (!project) {
    void Promise.allSettled([quotesP, contractsP, projectsP, scenesP, catalogP])
    return null
  }
  const ownerId = relId(project.owner)
  const headerUserId = ownerId || (user ? String(user.id) : null)
  const ownerP = ownerId
    ? (payload
        .findByID({
          collection: 'users',
          id: ownerId,
          depth: 0,
          overrideAccess: true,
          select: { name: true, phone: true },
        })
        .catch(() => null) as Promise<User | null>)
    : Promise.resolve(null)
  const [catalog, company, quotesRes, contracts, projectsRes, owner, scenes] = await Promise.all([
    catalogP,
    getCompanyInfo(headerUserId),
    quotesP,
    contractsP,
    projectsP,
    ownerP,
    scenesP,
  ])
  const sceneLibrary = scenes.scenes
  const contract = contracts.docs[0] ?? null
  const allQuotes = quotesRes.docs as Quote[]
  const contractQuoteId = relId(contract?.quote)
  // 交付用的定稿报价（合同 → 手动定稿 → 已接受 → 最新），方案和资料包默认用它
  const final = resolveFinalQuote(allQuotes, {
    contractQuoteId,
    finalQuoteId: relId((project as { finalQuote?: unknown }).finalQuote),
  })
  const finalQuoteId = final.quote ? String(final.quote.id) : null

  // 选择最匹配的报价单：指定 quoteId > 同范围已确认/合同报价 > 同范围最新报价 > 合同报价 > 最新报价
  const scopeQuotes = allQuotes.filter(
    (q) => (q.items?.length ?? 0) > 0 && inferScopeFromTitle(q.title) === scope,
  )
  const activeQuote: Quote | null =
    (quoteId ? allQuotes.find((q) => String(q.id) === quoteId) : undefined) ??
    scopeQuotes.find((q) => String(q.id) === contractQuoteId) ??
    scopeQuotes.find((q) => String(q.id) === finalQuoteId) ??
    scopeQuotes.find((q) => q.status === 'accepted') ??
    scopeQuotes[0] ??
    (scope === 'all'
      ? (allQuotes.find(
          (q) => String(q.id) === contractQuoteId && inferScopeFromTitle(q.title) === 'all',
        ) ??
        allQuotes.find(
          (q) => String(q.id) === finalQuoteId && inferScopeFromTitle(q.title) === 'all',
        ) ??
        allQuotes.find(
          (q) => (q.items?.length ?? 0) > 0 && inferScopeFromTitle(q.title) === 'all',
        ) ??
        allQuotes.find((q) => String(q.id) === contractQuoteId) ??
        allQuotes[0] ??
        null)
      : null)

  // 基于产品库构建映射，并将当前报价单中的换型号与临时改价覆盖进来
  const byId = new Map<string, CatalogProduct>(catalog.map((p) => [p.id, { ...p }]))
  const defaults = fillDefaultProducts(
    parseDefaults(project.defaultProducts),
    catalog,
    project.platform,
  )
  const quoteTypeOverride = new Map<string, string>()

  // 报价条目里单独换过的图片（很少）：只读当前报价用到的几张
  const imageIds = [
    ...new Set(
      (activeQuote?.items ?? [])
        .map((i) => (i.image && typeof i.image !== 'object' ? String(i.image) : null))
        .filter((v): v is string => Boolean(v)),
    ),
  ]
  const mediaById = new Map<string, Media>()
  if (imageIds.length) {
    const media = await payload
      .find({
        collection: 'media',
        where: { id: { in: imageIds } },
        limit: imageIds.length,
        depth: 0,
        ...acc,
        select: { url: true, filename: true, alt: true },
      })
      .catch(() => null)
    for (const m of media?.docs ?? []) mediaById.set(String(m.id), m as Media)
  }

  if (activeQuote?.items?.length) {
    for (const [index, item] of activeQuote.items.entries()) {
      const pid = relId(item.product)
      const imgDoc = item.image
        ? typeof item.image === 'object'
          ? (item.image as Media)
          : mediaById.get(String(item.image))
        : null
      const imgUrl = imgDoc ? resolveMediaUrl(imgDoc) : null
      if (pid) {
        const base = byId.get(pid)
        // 历史报价可能保留了错误的产品关联，不能把灯具快照覆盖到 AP 等其他类型。
        // 报价本身的快照仍由提案投资明细原样展示，不用于污染点位选型。
        if (base && (!item.deviceType || base.deviceType === item.deviceType)) {
          byId.set(pid, {
            ...base,
            name: item.name || base.name,
            sku: item.sku || base.sku,
            unit: item.unit || base.unit,
            price: typeof item.price === 'number' ? item.price : base.price,
            image: imgUrl
              ? { id: base.image?.id ?? pid, url: imgUrl, alt: item.name || base.name }
              : base.image,
          })
          const deviceType = item.deviceType ?? base.deviceType
          if (
            isDeviceType(deviceType) &&
            base.status === 'active' &&
            !quoteTypeOverride.has(deviceType)
          ) {
            quoteTypeOverride.set(deviceType, pid)
          }
        }
      } else if (isDeviceType(item.deviceType)) {
        const syntheticId = `quote-item-${item.id ?? index}`
        byId.set(syntheticId, {
          id: syntheticId,
          name: item.name,
          sku: item.sku ?? '',
          price: item.price,
          cost: null,
          unit: item.unit ?? '个',
          stock: null,
          description: null,
          platforms: [],
          status: 'active',
          deviceType: item.deviceType,
          tags: [],
          updatedAt: activeQuote.updatedAt,
          brand: null,
          category: null,
          image: imgUrl ? { id: syntheticId, url: imgUrl, alt: item.name } : null,
        })
        if (!quoteTypeOverride.has(item.deviceType)) {
          quoteTypeOverride.set(item.deviceType, syntheticId)
        }
      }
    }
  }

  const effectiveDefaults: Record<string, string> = { ...defaults }
  for (const [dt, pid] of quoteTypeOverride.entries()) {
    effectiveDefaults[dt] = pid
  }

  const scene = normalizeScene(project.pointMap as never)
  const sheets: SheetInfo[] = sceneSheets(scene.elements, scene.files)
  const areas: AreaInfo[] = sceneAreas(scene.elements, sheets)
  const points: DocPoint[] = scenePoints(scene.elements, sheets, areas)
    .map((p) => {
      // 如果报价单对该设备类型替换了型号，且点位自身型号不是报价单中的特殊指定，优先跟随报价单型号
      const overridePid = quoteTypeOverride.get(p.deviceType)
      const r = resolvePoint(
        { deviceType: p.deviceType, productId: p.productId },
        byId,
        effectiveDefaults,
      )
      if (overridePid && r.source === 'default') {
        return { ...p, productId: overridePid, source: 'default' as const }
      }
      return { ...p, productId: r.productId, source: r.source }
    })
    .filter((p) => inPointScope(p.deviceType, scope))

  const sheetFloorMap = new Map(
    sheets.map((s, idx) => [s.id, floorTagFromSheetName(s.name) || `第${idx + 1}层`]),
  )
  const sheetName = new Map(sheets.map((s) => [s.id, s.name]))
  const multiFloor = new Set(sheets.map((s) => sheetFloorMap.get(s.id))).size > 1

  const formatRoomDisplayName = (rawName: string, floor: string) => {
    const normalized = rawName.replace(
      /^(地下[一二三123]层|负[一二三123]层|[一二三四五六七八九十1-9]+层)\s*[·•-]?\s*(.+)$/,
      '$1 · $2',
    )
    if (!multiFloor || !floor) return normalized
    if (normalized.startsWith(floor) || normalized.includes('层')) return normalized
    return `${floor} · ${normalized}`
  }

  const areaDisplayName = new Map(
    areas.map((a) => {
      const floor = a.sheetId ? (sheetFloorMap.get(a.sheetId) ?? '') : ''
      return [a.id, formatRoomDisplayName(a.name, floor)]
    }),
  )

  const analysis = analyzeProject(areas, points, sheets)

  // 产品清单：按设备类型顺序汇总
  const rows = new Map<string, ProductRow>()
  for (const p of points) {
    if (!p.productId) continue
    const product = byId.get(p.productId)
    if (!product) continue
    const row = rows.get(product.id) ?? {
      product,
      deviceType: p.deviceType,
      count: 0,
      subtotal: 0,
      rooms: [],
    }
    row.count++
    row.subtotal = Math.round((row.subtotal + product.price) * 100) / 100
    const room = p.areaId
      ? areaDisplayName.get(p.areaId)
      : p.sheetId
        ? `${sheetFloorMap.get(p.sheetId) ?? ''} · 公共区`
        : null
    if (room && !row.rooms.includes(room)) row.rooms.push(room)
    rows.set(product.id, row)
  }
  const products = [...rows.values()].sort(
    (a, b) =>
      DEVICE_TYPE_ORDER.indexOf(a.deviceType) - DEVICE_TYPE_ORDER.indexOf(b.deviceType) ||
      b.count - a.count,
  )
  const total = Math.round(products.reduce((s, r) => s + r.subtotal, 0) * 100) / 100
  const pending = points.filter((p) => !p.productId).length

  const categories = DEVICE_CATEGORIES.map((c) => {
    const pts = points.filter((p) => categoryOfType(p.deviceType)?.slug === c.slug)
    const amount =
      Math.round(
        products
          .filter((r) => categoryOfType(r.deviceType)?.slug === c.slug)
          .reduce((s, r) => s + r.subtotal, 0) * 100,
      ) / 100
    return { ...c, count: pts.length, amount }
  }).filter((c) => c.count)

  const buildRoomLines = (pts: DocPoint[]): RoomLine[] => {
    const buckets = new Map<string, RoomLine>()
    for (const pt of pts) {
      const prod = pt.productId ? (byId.get(pt.productId) ?? null) : null
      const key = `${pt.deviceType}::${prod?.id ?? 'pending'}`
      let line = buckets.get(key)
      if (!line) {
        line = {
          deviceType: pt.deviceType,
          typeName: deviceTypeOf(pt.deviceType)?.name ?? '设备',
          product: prod,
          count: 0,
          unitPrice: prod?.price ?? 0,
          subtotal: 0,
          codes: [],
        }
        buckets.set(key, line)
      }
      line.count++
      line.subtotal = Math.round(line.unitPrice * line.count * 100) / 100
      if (pt.code) line.codes.push(pt.code)
    }
    const list = [...buckets.values()].sort(
      (a, b) => DEVICE_TYPE_ORDER.indexOf(a.deviceType) - DEVICE_TYPE_ORDER.indexOf(b.deviceType),
    )
    for (const l of list) l.codes.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    return list
  }

  const rooms: Room[] = groupRooms(areas, sheetFloorMap).map((group) => {
    const a = analysis.areas.find((r) => r.areaIds.includes(group[0].id))!
    const ids = new Set(group.map((g) => g.id))
    const pts = points.filter((p) => p.areaId && ids.has(p.areaId))
    const firstSheetId = group[0].sheetId
    const floorName = firstSheetId ? (sheetFloorMap.get(firstSheetId) ?? '全屋') : '全屋'
    const displayName = formatRoomDisplayName(a.name, floorName)
    const lines = buildRoomLines(pts)
    return {
      ...a,
      floorName,
      displayName,
      sheets: [
        ...new Set(
          group
            .map((g) => (g.sheetId ? sheetName.get(g.sheetId) : null))
            .filter((v): v is string => !!v),
        ),
      ],
      points: pts,
      lines,
      subtotal:
        Math.round(
          pts.reduce((s, p) => s + (p.productId ? (byId.get(p.productId)?.price ?? 0) : 0), 0) *
            100,
        ) / 100,
    }
  })

  // 如果某张图纸上有未划入任何区域框的点位，自动归入该楼层的「公共 / 弱电区」，避免漏算设备与预算差额
  for (const s of sheets) {
    const unassignedPts = points.filter((p) => p.sheetId === s.id && !p.areaId)
    if (!unassignedPts.length) continue
    const floorName = sheetFloorMap.get(s.id) ?? s.name
    const displayName = multiFloor ? `${floorName} · 公共 / 弱电区` : '公共 / 弱电区'
    const lines = buildRoomLines(unassignedPts)
    const counts = new Map<string, number>()
    for (const p of unassignedPts) counts.set(p.deviceType, (counts.get(p.deviceType) ?? 0) + 1)
    rooms.push({
      areaId: `unassigned-${s.id}`,
      areaIds: [`unassigned-${s.id}`],
      name: '公共 / 弱电区',
      areaType: 'other',
      typeLabel: '公共设备区',
      floorName,
      displayName,
      devices: DEVICE_TYPE_ORDER.filter((t) => counts.has(t)).map((t) => ({
        deviceType: t,
        count: counts.get(t)!,
      })),
      total: unassignedPts.length,
      met: [
        {
          label: '核心网络 / 公共设备',
          reason: '集中部署全屋交换机、路由或公共控制节点',
          level: 'core',
        },
      ],
      missing: [],
      warnings: [],
      scenes: ['全屋网络底座：PoE 供电与核心数据交换稳定在线'],
      score: 100,
      sheets: [s.name],
      points: unassignedPts,
      lines,
      subtotal:
        Math.round(
          unassignedPts.reduce(
            (sum, p) => sum + (p.productId ? (byId.get(p.productId)?.price ?? 0) : 0),
            0,
          ) * 100,
        ) / 100,
    })
  }

  const floors: FloorSummary[] = sheets
    .map((s, idx) => {
      const floorName = sheetFloorMap.get(s.id) ?? `第${idx + 1}层`
      const sPts = points.filter((p) => p.sheetId === s.id)
      const sRooms = rooms.filter((r) => r.sheets.includes(s.name))
      const subtotal =
        Math.round(
          sPts.reduce(
            (sum, p) => sum + (p.productId ? (byId.get(p.productId)?.price ?? 0) : 0),
            0,
          ) * 100,
        ) / 100
      return {
        sheetId: s.id,
        floorName,
        sheetName: s.name,
        roomCount: sRooms.length,
        pointCount: sPts.length,
        subtotal,
      }
    })
    .filter((f) => f.pointCount > 0 || scope === 'all')

  const projectList = (projectsRes.docs as Project[])
    .filter((p) => (p.pointCount ?? 0) > 0 || String(p.id) === String(project.id))
    .map((p) => ({
      id: String(p.id),
      name: p.name,
      community: p.community ?? '',
      customerName: p.customerName ?? '',
      pointCount: p.pointCount ?? 0,
    }))

  // 按项目真实的房间和设备分配场景（后台场景库为空时用内置场景库），替换按房间类型的通用推荐
  if (sceneLibrary.length)
    assignScenes(sceneLibrary, rooms).forEach((s, i) => (rooms[i].scenes = s))

  return {
    project,
    owner,
    company,
    sceneLibrary,
    /** 场景来自后台场景库（library）还是内置场景库（builtin） */
    sceneSource: scenes.source,
    sheets,
    areas,
    points,
    rooms,
    floors,
    roomKey,
    analysis,
    products,
    productById: byId,
    categories,
    total,
    pending,
    quote: activeQuote,
    quotes: allQuotes.map((q) => ({
      id: String(q.id),
      title: q.title,
      total: q.total ?? 0,
      status: q.status,
      scope: inferScopeFromTitle(q.title),
    })),
    contract,
    projectList,
    scope,
    /** 定稿报价与来源（合同 / 手动定稿 / 已接受 / 最新） */
    finalQuoteId,
    finalQuoteSource: final.source,
    /** 项目选定的交付方案模板（未选为 null） */
    proposalTemplate: (project as { proposalTemplate?: string | null }).proposalTemplate ?? null,
  }
}

export type ProjectDocsData = NonNullable<Awaited<ReturnType<typeof loadProjectDocs>>>

/** 点位范围的显示名（用于标题） */
export const scopeTitle = (scope: PointScope) =>
  scope === 'all' ? '' : (POINT_SCOPES.find((s) => s.value === scope)?.label ?? '')

const SWITCH_TYPES = ['switch-1', 'switch-2', 'switch-3', 'switch-4']

/** 方案里的场景名称（「回家模式：…」取冒号前），去重。 */
export const sceneNames = (d: ProjectDocsData) => [
  ...new Set(d.rooms.flatMap((r) => r.scenes).map((s) => s.split('：')[0])),
]

/**
 * 共同验收清单：按项目实际设备生成（点位数、开关、窗帘、门磁、门锁、场景、传感器）。
 * 点位交底清单和方案的「服务交付」页共用。
 */
export function acceptanceChecks(d: ProjectDocsData) {
  const count = (types: string[]) => d.points.filter((p) => types.includes(p.deviceType)).length
  const switches = count(SWITCH_TYPES)
  const curtainPts = d.points.filter((p) => p.deviceType === 'curtain-track')
  const curtains = curtainPts.length
  const curtainRoom = curtainPts[0]?.areaId
    ? d.areas.find((a) => a.id === curtainPts[0].areaId)?.name
    : null
  const contacts = count(['contact-sensor'])
  const locks = count(['smart-lock'])
  const scenes = sceneNames(d)
  const shown = scenes.slice(0, 3)
  const tests = [
    switches ? `${switches}只开关` : null,
    curtains ? `${curtains > 1 ? `${curtains}处` : (curtainRoom ?? '')}窗帘行程` : null,
    contacts ? '门磁开合状态' : null,
    locks ? '门锁开锁与告警' : null,
  ].filter(Boolean)
  return [
    `核对${d.points.length}台/只设备的编号、型号、位置与数量。`,
    tests.length ? `测试${tests.join('、')}。` : '测试全部设备的手动与手机控制。',
    shown.length
      ? `演示${shown.join(' / ')}${scenes.length > 3 ? `等${scenes.length}个` : `${shown.length}个`}场景及手动操作。`
      : '演示回家 / 离家 / 睡眠3个场景及手动操作。',
    count(['water-sensor'])
      ? '模拟水浸、复位及手机通知，记录网络依赖。'
      : count(['smoke-sensor'])
        ? '模拟烟雾报警、复位及手机通知，记录网络依赖。'
        : '模拟传感器触发、复位及手机通知，记录网络依赖。',
    '测试网络覆盖与断网表现，明确本地可用范围。',
    '账号绑定业主，移交清单、配置备份与维护说明。',
  ]
}

/** 文档编号：有合同用合同编号，否则按日期生成。 */
export const docNumber = (d: ProjectDocsData, prefix: string) =>
  d.contract?.number ??
  `${prefix}-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }).replaceAll('-', '').slice(2)}`
