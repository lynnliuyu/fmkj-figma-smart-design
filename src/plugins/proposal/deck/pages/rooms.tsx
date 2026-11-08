/**
 * 其余空间：场景章节没有展开的房间，逐间列出设备与小计，保证每个点位都有着落。
 * 少设备房间每页最多8间；明细较多时用三列两排，长房间名则保留一排。
 */
import type { Room } from '@/lib/project-docs'
import { cn } from '@/lib/utils'

import { yuanShort } from '../model'
import { amountFont, Chapter, Slide, type DeckCtx } from '../parts'

const COMPACT_LINES = 3
const FULL_LINES = 5

export type RoomPage = { rooms: Room[]; compact: boolean }

export function paginateRooms(rooms: Room[]): RoomPage[] {
  const pages: RoomPage[] = []
  let i = 0
  while (i < rooms.length) {
    let run = 0
    while (run < 8 && i + run < rooms.length && rooms[i + run]!.lines.length <= COMPACT_LINES) run++
    // 紧凑卡片至少能排满两行，或者剩下的房间都适合紧凑排列
    if (run >= 8 || (run > 0 && i + run === rooms.length)) {
      pages.push({ rooms: rooms.slice(i, i + run), compact: true })
      i += run
    } else {
      const next = rooms.slice(i, i + 6)
      const size = next.some((r) => r.displayName.length > 18) ? 3 : 6
      pages.push({ rooms: rooms.slice(i, i + size), compact: false })
      i += size
    }
  }
  return pages
}

export function RoomsPage({
  ctx,
  no,
  total,
  page,
  rooms: roomCount,
  part,
}: {
  ctx: DeckCtx
  no: number
  total: number
  page: RoomPage
  rooms: number
  part: string
}) {
  const { rooms, compact } = page
  const maxLines = compact ? COMPACT_LINES : FULL_LINES
  return (
    <Slide ctx={ctx} no={no} total={total} name={`其余空间${part}`}>
      <Chapter
        ctx={ctx}
        no={no}
        title={
          roomCount > ctx.m.otherRooms.length
            ? '每个空间，都逐一落实。'
            : '其余空间，同样逐一落实。'
        }
        subtitle={`${roomCount}个空间${part} / 点位、设备与小计一览，编号见平面索引`}
        tag={roomCount > ctx.m.otherRooms.length ? 'ALL SPACES' : 'OTHER SPACES'}
      />
      <div
        className={cn(
          'grid min-h-0 w-full auto-rows-max content-start items-start gap-[20px] overflow-hidden',
          rooms.length <= 2
            ? 'grid-cols-2'
            : !compact || rooms.length === 3
              ? 'grid-cols-3'
              : 'grid-cols-4',
        )}
      >
        {rooms.map((r) => (
          <div
            key={r.areaId}
            className={cn(
              'flex min-w-0 flex-col overflow-hidden rounded-(--deck-radius-sm) border border-doc-rule bg-(--deck-diagram) px-[18px] py-[14px]',
              compact ? 'min-h-[250px]' : 'min-h-[310px]',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="doc-display min-w-0 line-clamp-2 text-[20px] leading-[1.35] wrap-anywhere">
                {r.displayName}
              </p>
              <p className="doc-latin shrink-0 text-[14px] text-doc-accent">{r.total}点</p>
            </div>
            <p className="doc-body mt-[4px] line-clamp-2 text-[14px] leading-[1.4] text-doc-muted wrap-anywhere">
              {r.typeLabel} · {[...new Set(r.lines.map((l) => l.typeName))].slice(0, 3).join('、')}
            </p>
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col border-t border-doc-rule',
                compact ? 'mt-[10px] gap-[4px] pt-[8px]' : 'mt-[12px] gap-[6px] pt-[10px]',
              )}
            >
              {r.lines.slice(0, maxLines).map((l) => (
                <div
                  key={`${l.deviceType}-${l.product?.id ?? 'p'}`}
                  className="doc-body flex justify-between gap-2 text-[15px] leading-[1.5]"
                >
                  <span className="min-w-0 wrap-anywhere">
                    {l.typeName} ×{l.count}
                    {l.product?.unit || '个'}
                  </span>
                  <span className="doc-latin shrink-0 text-doc-muted">
                    {l.product ? yuanShort(l.subtotal) : '待选型'}
                  </span>
                </div>
              ))}
              {r.lines.length > maxLines ? (
                <p className="doc-body text-[13px] text-doc-muted">
                  另含 {r.lines.length - maxLines} 类设备，见报价明细
                </p>
              ) : null}
            </div>
            <div
              className={cn(
                'flex items-end justify-between border-t border-doc-rule',
                compact ? 'mt-[8px] pt-[8px]' : 'mt-[10px] pt-[10px]',
              )}
            >
              <p className="doc-body text-[14px] text-doc-muted">设备小计</p>
              <p
                className={cn(
                  amountFont(ctx),
                  'leading-none text-doc-accent',
                  compact ? 'text-[23px]' : 'text-[26px]',
                )}
              >
                {yuanShort(r.subtotal)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Slide>
  )
}
