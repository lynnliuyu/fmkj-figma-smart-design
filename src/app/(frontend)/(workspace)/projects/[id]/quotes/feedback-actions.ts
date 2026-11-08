'use server'

import { appAuth } from '@/lib/app-auth'
import {
  createQuoteFromFeedback,
  setFeedbackStatus,
  type FeedbackActionResult,
} from '@/lib/services/client-feedback-service'

/** 业主意向反馈的处理：业务规则见 src/lib/services/client-feedback-service.ts */
const expired = { ok: false as const, error: '登录已过期，请重新登录' }

export async function setFeedbackStatusAction(
  id: string,
  status: 'new' | 'handled',
): Promise<FeedbackActionResult> {
  const user = await appAuth.getCurrentUser()
  return user ? setFeedbackStatus(user, id, status) : expired
}

export async function createQuoteFromFeedbackAction(
  id: string,
): Promise<FeedbackActionResult<{ quoteId: string; projectId: string }>> {
  const user = await appAuth.getCurrentUser()
  return user ? createQuoteFromFeedback(user, id) : expired
}
