/**
 * 进程内缓存：用于很少变动的共享数据（产品库、成员名单、抬头信息）。
 * - 写入时由 Payload hook 按标签立即清除，下一次读取拿到新数据；
 * - 过了 TTL 先返回旧值、后台刷新（stale-while-revalidate），页面不会因为缓存过期而等待整库重新加载；
 * - TTL 兜底命令行等绕过 hook 的修改。
 * 存放在 globalThis 上，保证开发热更新或多份模块实例共用同一份缓存。
 */
type Entry = {
  value: Promise<unknown>
  expires: number
  tags: readonly string[]
  settled: boolean
  refreshing: boolean
}

const g = globalThis as unknown as { __fmkjMemoCache?: Map<string, Entry> }
const store = (g.__fmkjMemoCache ??= new Map())

export function memoize<T>(
  key: string,
  tags: readonly string[],
  ttlMs: number,
  load: () => Promise<T>,
) {
  const start = () => {
    const entry: Entry = {
      value: load(),
      expires: Date.now() + ttlMs,
      tags,
      settled: false,
      refreshing: false,
    }
    store.set(key, entry)
    entry.value.then(
      () => {
        entry.settled = true
      },
      // 失败的结果不缓存，下次重新加载
      () => {
        if (store.get(key) === entry) store.delete(key)
      },
    )
    return entry
  }

  return (): Promise<T> => {
    const hit = store.get(key)
    if (!hit) return start().value as Promise<T>
    if (hit.expires <= Date.now() && hit.settled && !hit.refreshing) {
      hit.refreshing = true
      load().then(
        (value) => {
          if (store.get(key) === hit)
            store.set(key, {
              value: Promise.resolve(value),
              expires: Date.now() + ttlMs,
              tags,
              settled: true,
              refreshing: false,
            })
        },
        () => {
          // 刷新失败继续用旧值，稍后再试
          hit.refreshing = false
          hit.expires = Date.now() + 5_000
        },
      )
    }
    return hit.value as Promise<T>
  }
}

export function invalidateTag(tag: string) {
  for (const [key, entry] of store) if (entry.tags.includes(tag)) store.delete(key)
}
