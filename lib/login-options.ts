import { selfSignupAllowed } from "./self-signup"
import { verificationCodesAvailable } from "./verification-delivery"

/**
 * 登录页上哪些入口该出现。
 *
 * 设备版（客户自己买的机器）：不开放自助注册；也没接短信服务（码发不出去），
 * 所以「注册」和「短信验证码登录」两个入口都不该出现——点了只会让人困惑。
 * 验证码发送目前只有开发测试实现；正常运行时不展示收不到码的入口。
 */
export function loginOptions(env: Record<string, string | undefined> = process.env): {
  showSignUp: boolean
  showSmsLogin: boolean
} {
  const sms = String(env.FMKJ_ALLOW_SMS_LOGIN ?? "").trim().toLowerCase()
  return {
    showSignUp: selfSignupAllowed(env),
    showSmsLogin: sms !== "false" && sms !== "0" && sms !== "no" && verificationCodesAvailable(env),
  }
}
