import { Skeleton } from '@/components/ui/skeleton'

/** 列表页（项目、报价）加载骨架。 */
export function ListSkeleton() {
  return (
    <section className="flex flex-col gap-5" aria-busy="true" aria-label="加载中">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-7 w-16" />)}
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </section>
  )
}

/** 产品库卡片骨架。 */
export function CardGridSkeleton() {
  return (
    <section className="flex flex-col gap-5" aria-busy="true" aria-label="加载中">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-8 w-96 max-w-full" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 详情 / 编辑页骨架。 */
export function DetailSkeleton() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5" aria-busy="true" aria-label="加载中">
      <Skeleton className="h-7 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </section>
  )
}
