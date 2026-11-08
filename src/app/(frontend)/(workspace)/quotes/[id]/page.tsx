import { notFound, redirect } from 'next/navigation'

import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { redirectToLogin } from '@/lib/login-redirect'

/** 旧链接 /quotes/[id]：跳到报价所在项目的「报价」板块。 */
export default async function LegacyQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pending?: string }>
}) {
  const { id } = await params
  const { pending } = await searchParams
  const user = await appAuth.getCurrentUser()
  if (!user) return redirectToLogin()
  const payload = await getPayloadClient()
  const quote = await payload
    .findByID({
      collection: 'quotes',
      id,
      depth: 0,
      user,
      overrideAccess: false,
      select: { project: true },
    })
    .catch(() => null)
  const projectId = relId(quote?.project)
  if (!projectId) notFound()
  redirect(
    `/projects/${projectId}/quotes/${id}${pending ? `?pending=${encodeURIComponent(pending)}` : ''}`,
  )
}
