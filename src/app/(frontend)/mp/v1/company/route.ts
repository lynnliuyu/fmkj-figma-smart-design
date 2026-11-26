import { getCompanyInfo } from '@/lib/cached-data'
import { mpPublicRoute, ok } from '@/lib/mp/http'

/** 业主版「找顾问」：只公开公司名称、电话与地址，不返回任何内部配置。 */
export const GET = mpPublicRoute(async () => {
  const company = await getCompanyInfo()
  return ok(
    {
      company: {
        name: company.name ?? null,
        phone: company.phone ?? null,
        address: company.address ?? null,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
