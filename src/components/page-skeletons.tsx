import { Skeleton } from '@astryxdesign/core/Skeleton'

/** 项目列表加载骨架。 */
export function ListSkeleton() {
  return (
    <section className="flex flex-col gap-5" aria-busy="true" aria-label="加载中">
      <div className="space-y-2">
        <Skeleton data-slot="skeleton" className="block h-8 w-32" />
        <Skeleton data-slot="skeleton" className="block h-4 w-48" />
      </div>
      <div className="flex gap-2">
        <Skeleton data-slot="skeleton" className="block h-8 w-80" />
        <Skeleton data-slot="skeleton" className="block h-8 w-16" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton data-slot="skeleton" key={i} className="block h-7 w-20" />
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton data-slot="skeleton" className="block h-4 w-56" />
              <Skeleton data-slot="skeleton" className="block h-3 w-32" />
            </div>
            <Skeleton data-slot="skeleton" className="block h-5 w-16" />
            <Skeleton data-slot="skeleton" className="block h-4 w-20" />
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
        <Skeleton data-slot="skeleton" className="block h-8 w-32" />
        <Skeleton data-slot="skeleton" className="block h-4 w-48" />
      </div>
      <Skeleton data-slot="skeleton" className="block h-8 w-96 max-w-full" />
      <Skeleton data-slot="skeleton" className="block h-28 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border">
            <Skeleton data-slot="skeleton" className="block aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton data-slot="skeleton" className="block h-4 w-3/4" />
              <Skeleton data-slot="skeleton" className="block h-3 w-1/2" />
              <Skeleton data-slot="skeleton" className="block h-6 w-20" />
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
    <section
      className="mx-auto flex w-full max-w-3xl flex-col gap-5"
      aria-busy="true"
      aria-label="加载中"
    >
      <Skeleton data-slot="skeleton" className="block h-7 w-24" />
      <div className="space-y-2">
        <Skeleton data-slot="skeleton" className="block h-8 w-72" />
        <Skeleton data-slot="skeleton" className="block h-4 w-48" />
      </div>
      <Skeleton data-slot="skeleton" className="block h-32 w-full rounded-xl" />
      <Skeleton data-slot="skeleton" className="block h-64 w-full rounded-xl" />
    </section>
  )
}

/** 项目板块（信息、合同、归档）加载骨架：顶栏和板块切换保持不动，只替换内容区。 */
export function ProjectTabSkeleton({ width = 'max-w-4xl' }: { width?: string }) {
  return (
    <section
      className={`mx-auto flex w-full ${width} flex-col gap-6`}
      aria-busy="true"
      aria-label="加载中"
    >
      <div className="overflow-hidden rounded-xl border">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="space-y-2">
            <Skeleton data-slot="skeleton" className="block h-5 w-24" />
            <Skeleton data-slot="skeleton" className="block h-4 w-40" />
          </div>
          <Skeleton data-slot="skeleton" className="block h-8 w-28" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-2.5 px-5 py-4 sm:flex-col">
              <Skeleton data-slot="skeleton" className="block size-6 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton data-slot="skeleton" className="block h-4 w-12" />
                <Skeleton data-slot="skeleton" className="block h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Skeleton data-slot="skeleton" className="block h-80 w-full rounded-xl" />
    </section>
  )
}

/** 项目报价列表骨架。 */
export function ProjectListSkeleton() {
  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-5"
      aria-busy="true"
      aria-label="加载中"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton data-slot="skeleton" className="block h-6 w-20" />
          <Skeleton data-slot="skeleton" className="block h-4 w-56" />
        </div>
        <Skeleton data-slot="skeleton" className="block h-8 w-48" />
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="flex-1 space-y-1.5">
              <Skeleton data-slot="skeleton" className="block h-4 w-48" />
              <Skeleton data-slot="skeleton" className="block h-3 w-32" />
            </div>
            <Skeleton data-slot="skeleton" className="block h-5 w-24" />
          </div>
        ))}
      </div>
    </section>
  )
}
