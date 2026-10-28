/**
 * 进程内缓存：用于很少变动的共享数据（产品库、员工名单、公司信息）。
 * 写入时由 Payload hook 按标签立即清除；另有 TTL 兜底，防止 CLI 等绕过 hook 的修改长期不生效。
 * 存放在 globalThis 上，保证开发热更新或多份模块实例共用同一份缓存。
 */
type Entry = { value: Promise<unknown>; expires: number; tags: readonly string[] }

const g = globalThis as unknown as { __fmkjMemoCache?: Map<string, Entry> }
const store = (g.__fmkjMemoCache ??= new Map())

export function memoize<T>(key: string, tags: readonly string[], ttlMs: number, load: () => Promise<T>) {
  return (): Promise<T> => {
    const hit = store.get(key)
    if (hit && hit.expires > Date.now()) return hit.value as Promise<T>
    const value = load()
    store.set(key, { value, expires: Date.now() + ttlMs, tags })
    // 失败的结果不缓存，下次重新加载。
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key)
    })
    return value
  }
}

export function invalidateTag(tag: string) {
  for (const [key, entry] of store) if (entry.tags.includes(tag)) store.delete(key)
}
