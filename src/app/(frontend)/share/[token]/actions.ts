'use server'

import {
  submitClientFeedback,
  type ClientFeedbackInput,
  type ClientFeedbackResult,
} from '@/lib/services/client-feedback-service'

/** 业主在分享页提交意向：校验、金额计算与凭证核对都在服务端完成（见 client-feedback-service） */
export async function submitIntent(
  shareToken: string,
  input: ClientFeedbackInput,
): Promise<ClientFeedbackResult> {
  return submitClientFeedback(shareToken, input)
}
