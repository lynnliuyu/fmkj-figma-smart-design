import { getCatalog } from '@/lib/cached-data'
import { categoryOfType, deviceTypeOf } from '@/lib/device-types'
import { intParam, mpRoute, ok, text } from '@/lib/mp/http'
import { presentProduct } from '@/lib/mp/present'

/** 产品库：?q=&category=&deviceType=&sort=&page=1&limit=20（只列在售产品）。 */
export const GET = mpRoute(async ({ request }) => {
  const sp = new URL(request.url).searchParams
  const q = text(sp.get('q'), 60).toLowerCase()
  const category = text(sp.get('category'), 40)
  const deviceType = text(sp.get('deviceType'), 40)
  const sort = text(sp.get('sort'), 20)
  const page = intParam(sp.get('page'), 1, 1, 1000)
  const limit = intParam(sp.get('limit'), 20, 1, 50)
  const all = (await getCatalog())
    .filter((p) => p.status === 'active')
    .filter((p) => (!deviceType ? true : p.deviceType === deviceType))
    .filter((p) => (!category ? true : categoryOfType(p.deviceType)?.slug === category))
    .filter((p) =>
      !q
        ? true
        : `${p.name} ${p.sku} ${p.brand?.name ?? ''} ${deviceTypeOf(p.deviceType)?.name ?? ''}`
            .toLowerCase()
            .includes(q),
    )
  all.sort((a, b) =>
    sort === 'price-asc'
      ? (a.price || Infinity) - (b.price || Infinity)
      : sort === 'price-desc'
        ? b.price - a.price
        : sort === 'updated'
          ? b.updatedAt.localeCompare(a.updatedAt)
          : Number(b.price > 0) - Number(a.price > 0) || a.name.localeCompare(b.name, 'zh-CN'),
  )
  const items = all.slice((page - 1) * limit, page * limit).map((p) => presentProduct(p))
  return ok({ items, page, total: all.length, hasMore: page * limit < all.length })
})
