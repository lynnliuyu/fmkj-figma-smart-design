/**
 * Next 的启动钩子：服务进程起来时执行一次。
 * 目前只用来排期官方产品资料的定时同步（没配 UPSTREAM_* 时什么都不做）。
 */
export async function register() {
  // Keep Node-only imports inside the positive runtime branch so the Edge
  // compiler can remove them, including pg and its filesystem dependencies.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCatalogSyncSchedule } = await import("@/lib/catalog-sync-schedule")
    startCatalogSyncSchedule()
  }
}
