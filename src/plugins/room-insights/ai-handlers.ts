import { deviceTypeOf } from '@/lib/device-types'
import type { AiToolHandler } from '@/plugins/ai-copilot/tools/context'

export const roomInsightsHandlers: Record<string, AiToolHandler> = {
  async room_insights(_args, ctx) {
    if (!ctx.project)
      return { result: { error: '没有关联项目，请先新建或关联项目' }, summary: '未关联项目' }
    const rooms = ctx.project.rooms.map((r) => ({
      room: r.name,
      type: r.typeLabel,
      points: r.total,
      score: r.score,
      devices: r.devices.map(
        (d) => `${deviceTypeOf(d.deviceType)?.name ?? d.deviceType}×${d.count}`,
      ),
      missing: r.missing.map((m) => `${m.label}（${m.reason}）`),
      scenes: r.scenes,
    }))
    return {
      result: {
        rooms,
        highlights: ctx.project.analysis.highlights,
        warnings: ctx.project.analysis.warnings,
      },
      summary: `分析了 ${rooms.length} 个房间`,
      href: `/projects/${ctx.projectId}/point-map`,
      hrefLabel: '查看点位图',
    }
  },
}
