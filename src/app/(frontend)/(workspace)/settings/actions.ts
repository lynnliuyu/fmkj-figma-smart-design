'use server'

import { appAuth } from '@/lib/app-auth'
import {
  saveCostSettingsFor,
  type CostSettingsInput,
  type CostSettingsResult,
} from '@/lib/services/cost-settings-service'

/** 保存当前账号的报价成本与毛利设置（品牌拿货折扣、附加费用成本占比、毛利率底线）。 */
export async function saveCostSettings(input: CostSettingsInput): Promise<CostSettingsResult> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  return saveCostSettingsFor(user, input)
}
