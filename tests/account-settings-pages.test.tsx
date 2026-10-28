import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ForgotPasswordScreen } from "../components/auth/forgot-password-screen"
import { NotificationsSettingsForm } from "../components/settings/settings-forms"
import { AccountTeamSettings } from "../components/account/account-team-settings"

describe("account screens show only usable actions", () => {
  it("shows the real local recovery path when messages cannot be delivered", () => {
    const html = renderToStaticMarkup(<ForgotPasswordScreen verificationAvailable={false} />)
    expect(html).toContain("当前未启用邮件或短信验证码")
    expect(html).toContain("设备安装维护人员")
    expect(html).toContain('href="/login"')
    expect(html).not.toContain("发送验证码")
    expect(html).not.toContain('id="reset-target"')
  })

  it("does not offer saving inactive notification switches", () => {
    const html = renderToStaticMarkup(<NotificationsSettingsForm />)
    expect(html).toContain("当前尚未启用")
    expect(html).toContain("查看最近动态")
    expect(html).not.toContain("更新通知")
    expect(html).not.toContain('role="switch"')
  })

  it("explains the real shared role policy without offering retired aftercare or imaginary approval actions", () => {
    const html = renderToStaticMarkup(<AccountTeamSettings />)
    expect(html).toContain("实际操作还受套餐、成员状态和项目授权限制")
    expect(html).toContain("点位设计")
    expect(html).toContain("高级导出")
    expect(html).not.toContain("工单售后")
    expect(html).not.toContain("审批")
  })
})
