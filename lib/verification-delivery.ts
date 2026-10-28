/** The current code delivery implementation is available for local testing only. */
export function verificationCodesAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" || env.AUTH_DEV_MODE === "true"
}

export const CODE_DELIVERY_UNAVAILABLE_MESSAGE = "当前未启用短信或邮件验证码，请联系企业管理员或设备安装维护人员处理。"
