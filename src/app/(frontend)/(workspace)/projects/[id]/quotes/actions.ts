'use server'

import { redirect } from 'next/navigation'

import { appAuth } from '@/lib/app-auth'
import { setProjectDefault } from '@/lib/project-defaults'
import type { PointScope } from '@/lib/point-scopes'
import {
  createQuoteForProject,
  deleteQuoteById,
  saveQuoteInput,
  syncQuoteWithPointMap,
  type QuoteInput,
  type SaveQuoteResult,
} from '@/lib/services/quote-service'

export type { QuoteInput, SaveQuoteResult }

/** 报价的业务规则在 src/lib/services/quote-service.ts，网页和微信小程序共用。 */

const quoteHref = (projectId: string, quoteId: string, pending?: number) =>
  `/projects/${projectId}/quotes/${quoteId}${pending ? `?pending=${pending}` : ''}`

/** 从项目点位图生成草稿报价，生成后打开报价单。 */
export async function createQuoteFromProject(form: FormData) {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect('/login')
  const projectId = String(form.get('projectId') ?? '')
  const result = await createQuoteForProject(user, projectId, form.get('scope'))
  if (!result.ok) {
    if (result.status === 404) redirect('/projects')
    redirect(`/projects/${projectId}/quotes?error=${encodeURIComponent(result.error)}`)
  }
  redirect(quoteHref(projectId, result.quoteId, result.pending))
}

/** 把点位图的最新点位同步到已有报价单（保留临时改价、换过的型号与附加费用）。 */
export async function syncQuoteFromPointMap(
  quoteId: string,
  explicitScope?: PointScope,
): Promise<
  | { ok: true; quoteId: string; pending: number; total: number; scope: PointScope }
  | { ok: false; error: string }
> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  return syncQuoteWithPointMap(user, quoteId, explicitScope)
}

/** 在报价里换型号时，可同时把新型号设为项目默认型号。 */
export async function setQuoteProjectDefault(
  projectId: string,
  deviceType: string,
  productId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  const result = await setProjectDefault(user, projectId, deviceType, productId)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function saveQuote(id: string, input: QuoteInput): Promise<SaveQuoteResult> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  return saveQuoteInput(user, id, input)
}

export async function deleteQuote(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await appAuth.getCurrentUser()
  if (!user) return { ok: false, error: '登录已过期，请重新登录' }
  return deleteQuoteById(user, id)
}
