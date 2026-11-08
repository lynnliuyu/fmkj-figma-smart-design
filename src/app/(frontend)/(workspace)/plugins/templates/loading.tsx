import { Skeleton } from '@/components/ui/skeleton'

/**
 * 模板中心自己的骨架屏。
 *
 * 必须提供：父级 (workspace)/plugins/loading.tsx 是 CardGridSkeleton，
 * 若不覆盖，本页会沿用那个「卡片网格」骨架，与本页实际布局（三个区块）不符。
 * 本页是同步静态页面，正常情况下骨架一闪而过。
 */
export default function TemplateCenterLoading() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="space-y-2 border-b border-border pb-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="h-28 w-full rounded-[var(--radius-container)]" />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
