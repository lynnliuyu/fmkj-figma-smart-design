import { getBrands } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { parseCostSettings, RATE_MAX, RATE_MIN, type CostSettings } from '@/lib/quote-costs'
import type { User } from '@/payload-types'

/** 报价成本与毛利设置：每个账号独立保存在自己的「个人抬头与默认设置」里，只有本人在报价台可见。 */

/** 读取当前登录账号自己的成本设置（以本人身份读取，遵守 users 集合的访问规则） */
export async function loadCostSettings(user: User): Promise<CostSettings> {
  const payload = await getPayloadClient()
  const doc = await payload
    .findByID({
      collection: 'users',
      id: String(user.id),
      depth: 0,
      user,
      overrideAccess: false,
      select: { companyProfile: true } as never,
    })
    .catch(() => null)
  const profile = (doc as { companyProfile?: { costSettings?: unknown } | null } | null)
    ?.companyProfile
  return parseCostSettings(profile?.costSettings)
}

export type CostSettingsInput = {
  /** 折扣按「几折」填写：6.5 表示 6.5 折（rate 0.65）；空字符串表示不设置 */
  brandRates: { brand: string; discount: string | number }[]
  defaultDiscount: string | number | null
  feeCostPercent: string | number
  minMarginPercent: string | number
}

export type CostSettingsResult =
  | { ok: true; settings: CostSettings }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const num = (v: unknown) =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN

/** 校验表单（品牌只接受产品库里存在的品牌），再写回当前账号 */
export async function saveCostSettingsFor(
  user: User,
  input: CostSettingsInput,
): Promise<CostSettingsResult> {
  const fieldErrors: Record<string, string> = {}
  const brands = new Set((await getBrands()).map((b) => b.slug))
  const brandRates: { brand: string; rate: number }[] = []
  for (const row of Array.isArray(input?.brandRates) ? input.brandRates.slice(0, 200) : []) {
    const brand = typeof row?.brand === 'string' ? row.brand.trim() : ''
    if (!brand || !brands.has(brand)) continue
    if (row.discount === '' || row.discount === null || row.discount === undefined) continue
    const d = num(row.discount)
    if (!Number.isFinite(d) || d < RATE_MIN * 10 || d > RATE_MAX * 10) {
      fieldErrors[`brand:${brand}`] = '折扣需在 0.5–10 折之间'
      continue
    }
    brandRates.push({ brand, rate: d / 10 })
  }
  let defaultRate: number | null = null
  if (
    input?.defaultDiscount !== null &&
    input?.defaultDiscount !== undefined &&
    input.defaultDiscount !== ''
  ) {
    const d = num(input.defaultDiscount)
    if (!Number.isFinite(d) || d < RATE_MIN * 10 || d > RATE_MAX * 10)
      fieldErrors.defaultDiscount = '折扣需在 0.5–10 折之间'
    else defaultRate = d / 10
  }
  const fee = num(input?.feeCostPercent)
  if (!Number.isFinite(fee) || fee < 0 || fee > 100)
    fieldErrors.feeCostPercent = '请输入 0–100 之间的百分比'
  const min = num(input?.minMarginPercent)
  if (!Number.isFinite(min) || min < 0 || min > 90)
    fieldErrors.minMarginPercent = '请输入 0–90 之间的百分比'
  if (Object.keys(fieldErrors).length)
    return { ok: false, error: Object.values(fieldErrors)[0]!, fieldErrors }

  const settings = parseCostSettings({
    brandRates,
    defaultRate,
    feeCostPercent: fee,
    minMarginPercent: min,
  })
  try {
    const payload = await getPayloadClient()
    const existing = await payload.findByID({
      collection: 'users',
      id: user.id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { companyProfile: true } as never,
    })
    const prev = ((existing as { companyProfile?: Record<string, unknown> | null })
      .companyProfile ?? {}) as Record<string, unknown>
    await payload.update({
      collection: 'users',
      id: user.id,
      // 只改成本设置，个人抬头的其他内容原样保留
      data: { companyProfile: { ...prev, costSettings: settings } } as never,
      user,
      overrideAccess: false,
      depth: 0,
      select: { name: true },
    })
    return { ok: true, settings }
  } catch (error) {
    console.error('[cost-settings] save failed', error)
    return { ok: false, error: '保存失败，请稍后重试' }
  }
}
