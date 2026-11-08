import type { PayloadRequest } from 'payload'

import {
  DEFAULT_CONTRACT_TERMS,
  DEFAULT_DURATION_DAYS,
  DEFAULT_PAYMENTS,
  DEFAULT_WARRANTY_MONTHS,
} from '@/lib/contracts'
import { relId } from '@/lib/access'
import { BUILTIN_DEMO_SHEETS } from '@/lib/builtin-demo-sheets'
import { DEVICE_TYPE_ORDER } from '@/lib/device-types'
import { getPayloadClient } from '@/lib/payload'
import {
  buildAreaElements,
  buildPointElements,
  buildSheetElements,
  compactScene,
  markerFile,
  type SceneEl,
  type SceneFile,
} from '@/lib/point-scene'
import { inPointScope } from '@/lib/point-scopes'
import { SHEET, sheetOrigin } from '@/lib/sheet-spec'
import type { Product, Project, Quote } from '@/payload-types'

const DEMO_TEMPLATE_NAME = '【示例】湖山赋别墅全屋智能'
const TOTAL_DEMO_POINTS = BUILTIN_DEMO_SHEETS.reduce((sum, s) => sum + s.points.length, 0)

/**
 * 构造内置的「湖山赋别墅全屋智能」点位图场景（含 1F/2F/3F 三张标准图纸、房间分区与点位），
 * 当自托管数据库尚未创建 `isDemoTemplate: true` 的母版项目时自动初始化。
 */
export function buildBuiltinDemoScene(defaultProducts: Record<string, string> = {}) {
  const elements: SceneEl[] = []
  const files: Record<string, SceneFile> = {}

  BUILTIN_DEMO_SHEETS.forEach((sheet, idx) => {
    const fileId = `sheet-file-${sheet.id}`
    files[fileId] = { id: fileId, dataURL: sheet.url, mimeType: 'image/png' }
    elements.push(
      ...buildSheetElements({ index: idx, name: sheet.name, fileId, sheetId: sheet.id }),
    )

    const origin = sheetOrigin(idx)
    for (const a of sheet.areas) {
      const ax = origin.x + Math.round(a.x0 * SHEET.width)
      const ay = origin.y + Math.round(a.y0 * SHEET.height)
      const aw = Math.max(20, Math.round((a.x1 - a.x0) * SHEET.width))
      const ah = Math.max(20, Math.round((a.y1 - a.y0) * SHEET.height))
      const polygon = a.poly
        ? a.poly.map(
            ([px, py]) =>
              [Math.round((px - a.x0) * SHEET.width), Math.round((py - a.y0) * SHEET.height)] as [
                number,
                number,
              ],
          )
        : undefined
      elements.push(
        ...buildAreaElements({
          name: a.name,
          x: ax,
          y: ay,
          width: aw,
          height: ah,
          polygon,
        }),
      )
    }

    for (const p of sheet.points) {
      files[`mk2-${p.type}`] = markerFile(p.type)
      elements.push(
        ...buildPointElements({
          deviceType: p.type,
          cx: origin.x + Math.round(p.rx * SHEET.width),
          cy: origin.y + Math.round(p.ry * SHEET.height),
          code: p.code,
          productId: defaultProducts[p.type] ?? null,
        }),
      )
    }
  })

  return compactScene(elements, files)
}

function isLegacyBlankDemoScene(pointMap: unknown): boolean {
  if (!pointMap || typeof pointMap !== 'object') return true
  const raw = JSON.stringify(pointMap)
  if (raw.includes('blank-sheet.svg') || raw.includes('sh-demo-1f')) return true
  return false
}

/**
 * 确保数据库中存在一份 `isDemoTemplate: true` 的「【示例】湖山赋别墅全屋智能」母版项目及其 2 份示例报价单。
 * 若自托管环境首次运行尚未创建母版，或旧母版使用的是 blank-sheet.svg 占位图，则自动初始化/升级为真实三层户型图与 137 个点位。
 */
export async function ensureDemoTemplateProject(): Promise<Project | null> {
  const payload = await getPayloadClient()
  const byFlag = await payload
    .find({
      collection: 'projects',
      where: { isDemoTemplate: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  const existingTemplate = byFlag?.docs?.[0] as Project | undefined
  if (
    existingTemplate &&
    !isLegacyBlankDemoScene(existingTemplate.pointMap) &&
    (existingTemplate.pointCount ?? 0) >= 100
  ) {
    return existingTemplate
  }

  if (!existingTemplate) {
    const byOwnerless = await payload
      .find({
        collection: 'projects',
        where: { owner: { exists: false } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (byOwnerless?.docs?.[0] && !isLegacyBlankDemoScene(byOwnerless.docs[0].pointMap)) {
      const updated = await payload
        .update({
          collection: 'projects',
          id: byOwnerless.docs[0].id,
          data: { isDemoTemplate: true, name: DEMO_TEMPLATE_NAME, community: '湖山赋' } as never,
          overrideAccess: true,
          depth: 0,
        })
        .catch(() => byOwnerless.docs[0])
      return updated as Project
    }
  }

  // 数据库中没有任何母版项目时，根据当前产品库自动初始化母版项目与两份示例报价单
  const productsRes = await payload
    .find({
      collection: 'products',
      where: { status: { equals: 'active' } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  const allProducts = (productsRes?.docs ?? []) as Product[]
  const byType = new Map<string, Product>()
  for (const prod of allProducts) {
    if (!prod.deviceType) continue
    const existing = byType.get(prod.deviceType)
    const prefersMijia = Array.isArray(prod.platforms) && prod.platforms.includes('米家')
    if (!existing || prefersMijia) {
      byType.set(prod.deviceType, prod)
    }
  }

  const defaultProducts: Record<string, string> = {}
  for (const [dtype, prod] of byType.entries()) {
    defaultProducts[dtype] = String(prod.id)
  }

  const pointMap = buildBuiltinDemoScene(defaultProducts)
  if (existingTemplate) {
    const upgraded = await payload
      .update({
        collection: 'projects',
        id: existingTemplate.id,
        data: {
          name: DEMO_TEMPLATE_NAME,
          community: '湖山赋',
          pointMap,
          pointCount: TOTAL_DEMO_POINTS,
          defaultProducts,
        } as never,
        overrideAccess: true,
        depth: 0,
      })
      .catch(() => existingTemplate)
    return upgraded as Project
  }

  const template = (await payload.create({
    collection: 'projects',
    data: {
      name: DEMO_TEMPLATE_NAME,
      customerName: '林先生',
      customerPhone: '13800008888',
      community: '湖山赋',
      address: 'A区 12栋（三层联排别墅）',
      platform: '米家',
      budget: 55000,
      status: 'active',
      owner: null,
      isDemoTemplate: true,
      notes:
        '系统内置的全屋智能演示项目（含点位图、智能选型、报价单与合同），你可以自由修改点位、导出打印或直接删除。',
      pointMap,
      pointCount: TOTAL_DEMO_POINTS,
      defaultProducts,
    } as never,
    overrideAccess: true,
    depth: 0,
  })) as Project

  // 按点位统计各设备类型数量，生成「含灯具」和「不含灯具」两份母版报价单
  const counts = new Map<string, number>()
  for (const sh of BUILTIN_DEMO_SHEETS) {
    for (const pt of sh.points) {
      counts.set(pt.type, (counts.get(pt.type) ?? 0) + 1)
    }
  }
  const buildItems = (scope: 'all' | 'no-light') => {
    const rows: Array<Record<string, unknown>> = []
    const types = DEVICE_TYPE_ORDER.filter((t) => counts.has(t) && inPointScope(t, scope))
    for (const dtype of types) {
      const prod = byType.get(dtype)
      const qty = counts.get(dtype) ?? 1
      rows.push({
        product: prod ? String(prod.id) : null,
        deviceType: dtype,
        image: prod ? relId(prod.image) || null : null,
        name: prod?.name ?? `智能${dtype}设备`,
        sku: prod?.sku ?? `DEMO-${dtype.toUpperCase()}`,
        unit: prod?.unit ?? '个',
        price: typeof prod?.price === 'number' ? prod.price : 199,
        quantity: qty,
      })
    }
    return rows
  }

  const fullItems = buildItems('all')
  const noLightItems = buildItems('no-light')

  await payload
    .create({
      collection: 'quotes',
      data: {
        title: '湖山赋 全屋智能整装报价（含灯具）',
        project: String(template.id),
        status: 'accepted',
        items: fullItems,
        fees: [{ name: '安装调试费', amount: 1800 }],
        discount: 0,
        notes: '含全屋智能开关、调光灯具、电动窗帘、传感器及全屋 Wi-Fi 7 组网。',
      } as never,
      overrideAccess: true,
      depth: 0,
    })
    .catch(() => null)

  await payload
    .create({
      collection: 'quotes',
      data: {
        title: '湖山赋 全屋智能报价（不含灯具）',
        project: String(template.id),
        status: 'draft',
        items: noLightItems,
        fees: [],
        discount: 0,
        notes: '不含照明灯具，仅含智能控制、传感、窗帘与全屋网络。',
      } as never,
      overrideAccess: true,
      depth: 0,
    })
    .catch(() => null)

  return template
}

function coerceRelId(val: unknown, sampleId: string | number): string | number | null {
  const raw = relId(val)
  if (!raw) return null
  if (typeof sampleId === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return raw
}

/**
 * 为新注册/新建的成员账号自动发放一份独立的示例项目副本（含三层点位图、默认选型与示例报价单）。
 * 副本的 owner 为该新用户自己，用户可以自由编辑点位、改报价、打印导出或直接删除，互不影响。
 */
export async function cloneDemoProjectForUser(
  userId: string | number,
  req?: PayloadRequest,
): Promise<string | null> {
  if (userId === null || userId === undefined || String(userId).trim() === '') return null

  try {
    const payload = await getPayloadClient()
    // 母版项目的读取与初始化在独立连接中完成，避免与当前用户创建事务产生锁冲突
    const template = await ensureDemoTemplateProject()
    if (!template) return null

    const ownerId = coerceRelId(userId, template.id) ?? userId
    // 若在 Users.afterChange 钩子中调用，复用当前事务（清空 user 以免触发普通成员权限拦截），
    // 这样未提交的新用户记录在同一事务内对外键检查可见，不会报 projects_owner_id_users_id_fk。
    const txReq = req?.transactionID
      ? ({ ...req, user: null } as unknown as PayloadRequest)
      : undefined

    // 避免同一用户重复发放示例项目
    const existing = await payload.count({
      collection: 'projects',
      where: {
        and: [{ owner: { equals: ownerId } }, { name: { equals: template.name } }],
      },
      req: txReq,
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) return null

    // 母版报价单也用独立连接预先读取
    const templateQuotes = await payload
      .find({
        collection: 'quotes',
        where: { project: { equals: template.id } },
        sort: 'createdAt',
        limit: 5,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    const createdProject = await payload.create({
      collection: 'projects',
      data: {
        name: template.name,
        customerName: template.customerName ?? '林先生',
        customerPhone: template.customerPhone ?? '13800008888',
        community: template.community ?? '湖山赋',
        address: template.address ?? 'A区 12栋（三层联排别墅）',
        platform: template.platform ?? '米家',
        budget: template.budget ?? 55000,
        status: 'active',
        owner: ownerId,
        isDemoTemplate: false,
        notes:
          template.notes ??
          '系统为你准备的全屋智能示例项目（含一层/二层/三层点位图、智能选型与示例报价单），你可以自由修改点位、导出打印或直接删除。',
        pointMap: template.pointMap ?? null,
        defaultProducts: template.defaultProducts ?? null,
      } as never,
      req: txReq,
      overrideAccess: true,
      depth: 0,
    })

    const newProjectId = createdProject.id

    for (const q of (templateQuotes?.docs ?? []) as Quote[]) {
      const cleanItems = (q.items ?? []).map((item) => ({
        product: coerceRelId(item.product, template.id),
        deviceType: item.deviceType ?? null,
        image: coerceRelId(item.image, template.id),
        name: item.name,
        sku: item.sku ?? null,
        unit: item.unit ?? '个',
        price: item.price,
        quantity: item.quantity,
      }))
      const cleanFees = (q.fees ?? []).map((fee) => ({
        name: fee.name,
        amount: fee.amount,
      }))
      const clonedQuote = await payload
        .create({
          collection: 'quotes',
          data: {
            title: q.title,
            project: newProjectId,
            status: q.status ?? 'draft',
            items: cleanItems,
            fees: cleanFees,
            discount: q.discount ?? 0,
            notes: q.notes ?? null,
          } as never,
          req: txReq,
          overrideAccess: true,
          depth: 0,
        })
        .catch((err) => {
          console.error('[demo-project] clone quote failed', err)
          return null
        })
      if (clonedQuote && q.status === 'accepted') {
        await payload
          .create({
            collection: 'contracts',
            data: {
              project: newProjectId,
              quote: clonedQuote.id,
              status: 'draft',
              amount: q.total ?? 51820,
              customerName: template.customerName ?? '林先生',
              customerPhone: template.customerPhone ?? '13800008888',
              address: [
                template.community ?? '湖山赋',
                template.address ?? 'A区 12栋（三层联排别墅）',
              ]
                .filter(Boolean)
                .join(' '),
              durationDays: DEFAULT_DURATION_DAYS,
              warrantyMonths: DEFAULT_WARRANTY_MONTHS,
              payments: DEFAULT_PAYMENTS.map((p) => ({
                name: p.name,
                percent: p.percent,
                received: false,
              })),
              terms: DEFAULT_CONTRACT_TERMS,
            } as never,
            req: txReq,
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
      }
    }

    return String(newProjectId)
  } catch (err) {
    console.error('[demo-project] cloneDemoProjectForUser failed', err)
    return null
  }
}
