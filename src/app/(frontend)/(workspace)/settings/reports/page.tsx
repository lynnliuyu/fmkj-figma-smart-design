import { PageHeader } from '@/components/page-header'
import { appAuth } from '@/lib/app-auth'
import { pageTitle } from '@/lib/brand'
import { redirectToLogin } from '@/lib/login-redirect'
import { isPlatformOperator } from '@/lib/platform-operator'
import { loadCustomerUsageReport } from '@/lib/usage-diagnostics'

import { UsageReportsClient } from './reports-client'

export const metadata = { title: pageTitle('客户使用与诊断报告') }

export default async function CustomerUsageReportsPage() {
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  // 报告包含全体客户的联系方式与项目数据：只对平台运营人员开放，普通成员不加载任何数据
  if (!(await isPlatformOperator(user))) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <PageHeader
          title="客户使用与运维诊断报告"
          description="汇总全体客户的使用数据，仅对平台运营人员开放"
        />
        <div className="rounded-xl border bg-card px-5 py-6 text-sm text-muted-foreground shadow-2xs">
          当前账号没有平台运营权限，无法查看跨客户的使用报告。你自己的项目、报价与 AI
          用量可以在对应页面查看。
        </div>
      </section>
    )
  }
  const report = await loadCustomerUsageReport()

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHeader
        title="客户使用与运维诊断报告"
        description="实时汇总客户项目转化漏斗、户型图 CAD 识别复盘、AI 模型 Auto 路由分布与异常排障日志"
      />
      <UsageReportsClient report={report} />
    </section>
  )
}
