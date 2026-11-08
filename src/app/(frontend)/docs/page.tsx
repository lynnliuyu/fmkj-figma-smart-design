import type { Metadata } from 'next'

import { pageTitle } from '@/lib/brand'
import { getCompanyInfo } from '@/lib/cached-data'
import { getManualSnapshot } from '@/lib/user-manual'
import { enabledAiModels } from '@/plugins/ai-copilot/templates'

import { DocsClient } from './docs-client'

export const metadata: Metadata = {
  title: pageTitle('文档中心 (Docs) · 功能用法与计费指南'),
  description:
    '繁梦空间（FMKJ）官方用户文档中心：涵盖五步核心工作流、点位图画板（含智能生成点位与撤销）、报价双向联动、AI 积分充值与国产 AI 大模型计费规则。',
  alternates: { canonical: '/docs' },
}

export const dynamic = 'force-dynamic'

export default async function DocsPage() {
  const company = await getCompanyInfo().catch(() => null)
  const activeModels = company?.aiModels ? enabledAiModels(company.aiModels) : undefined
  const manual = getManualSnapshot(activeModels)

  return <DocsClient manual={manual} />
}
