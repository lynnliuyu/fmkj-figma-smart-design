/**
 * 场景页：场景库里与本项目匹配的场景（每页两个）。
 * 内置图片采用校准场景与实际选型产品图；自定义场景图片保留原样。
 * 标题、联动步骤来自场景库；房间与设备只列出本项目真实存在的。
 */
import Image from 'next/image'

import { BUILTIN_SCENES } from '@/lib/builtin-scenes'
import type { Room } from '@/lib/project-docs'
import { sceneVisualForScene } from '@/lib/scene-visuals'
import { nightScenePhotoForScene } from '@/lib/scene-night-photos'
import type { ManagedScene } from '@/lib/scenes'

import type { DeckItem, DeckModel } from '../model'
import { Chapter, imgLoading, Slide, type DeckCtx } from '../parts'
import { SceneProductFigure } from '../scene-product-figure'
import { matchSceneProducts } from '../scene-products'

export type DeckScene = {
  scene: ManagedScene
  rooms: string[]
  items: DeckItem[]
  pointRooms?: Room[]
}

const CHAPTER_PHOTO: Record<string, string> = {
  arrive: 'entrance',
  rest: 'bedroom',
  care: 'kitchen',
  focus: 'living',
  network: 'study',
}

export function deckScenes(m: DeckModel): DeckScene[] {
  const d = m.d
  const out: DeckScene[] = []
  for (const scene of d.sceneLibrary) {
    const line = `${scene.name}：${scene.summary}`
    const rooms = d.rooms.filter((r) => r.scenes.includes(line))
    if (!rooms.length) continue
    const related = new Set([...scene.requiredDevices, ...scene.anyDevices])
    const refs = new Set(
      rooms.flatMap((r) => r.points.map((p) => m.deckPoint(p).ref)).filter(Boolean),
    )
    const items = m.items.filter(
      (i) =>
        (related.size ? related.has(i.deviceType) : true) &&
        (scene.scope === 'house' || refs.has(i.ref)),
    )
    out.push({
      scene,
      rooms: scene.scope === 'house' ? [] : rooms.map((r) => r.displayName),
      items,
      pointRooms: rooms,
    })
  }
  return out
}

/** 只升级能确认来源的内置图片；上传的自定义图片没有对应校准坐标。 */
function usesBuiltinPhoto(scene: ManagedScene) {
  if (!scene.image?.url) return true
  let path: string
  try {
    path = decodeURIComponent(new URL(scene.image.url, 'https://scene.local').pathname)
  } catch {
    return false
  }
  const file = path.split('/').pop()
  return BUILTIN_SCENES.some(
    (builtin) =>
      path === builtin.image?.url ||
      path === `/proposal/photos/scenes/${builtin.slug}.jpg` ||
      file === `scene-${builtin.slug}.jpg` ||
      file === `scene-${builtin.slug}.png`,
  )
}

function productPhoto(ctx: DeckCtx, item: DeckItem) {
  const point = ctx.m.d.points.find(
    (p) => p.deviceType === item.deviceType && ctx.m.deckPoint(p).ref === item.ref,
  )
  const product = point?.productId ? ctx.m.d.productById.get(point.productId) : null
  return product?.deviceType === item.deviceType ? product.image : null
}

function scenePhoto(ctx: DeckCtx, entry: DeckScene) {
  const { scene } = entry
  const related = new Set([...scene.requiredDevices, ...scene.anyDevices])
  const line = `${scene.name}：${scene.summary}`
  const matchedRooms = entry.pointRooms ?? ctx.m.d.rooms.filter((r) => r.scenes.includes(line))
  // 全屋场景也只从一个真实且适用的房间取图与点位，不把其他房间的产品贴到此图。
  const candidates =
    scene.scope === 'house'
      ? ctx.m.d.rooms.filter(
          (room) => !scene.roomTypes.length || scene.roomTypes.includes(room.areaType),
        )
      : matchedRooms
  const choices = candidates.flatMap((room) => {
    const points = room.points.filter((point) => !related.size || related.has(point.deviceType))
    if (!points.length) return []
    const visual = sceneVisualForScene(scene.name, room.areaType)
    if (!visual || (visual.roomTypes.length && !visual.roomTypes.includes(room.areaType))) return []
    const match = matchSceneProducts(visual, points, ctx.m.d.productById, {
      roomType: room.areaType,
      maxCallouts: 3,
    })
    return [{ room, visual, match }]
  })
  choices.sort(
    (a, b) =>
      b.match.callouts.filter((c) => c.status === 'ready').length -
        a.match.callouts.filter((c) => c.status === 'ready').length ||
      b.match.callouts.length - a.match.callouts.length,
  )
  const chosen = choices[0] ?? null
  if (!chosen || !usesBuiltinPhoto(scene)) return null

  const allPoints = (
    scene.scope === 'house' ? ctx.m.d.points : matchedRooms.flatMap((room) => room.points)
  ).filter((point) => !related.size || related.has(point.deviceType))
  const allGroups = matchSceneProducts(chosen.visual, allPoints, ctx.m.d.productById, {
    maxCallouts: 0,
  }).groups.length
  return { ...chosen, remainingGroups: Math.max(0, allGroups - chosen.match.callouts.length) }
}

export function ScenesPage({
  ctx,
  no,
  total,
  scenes,
  part,
}: {
  ctx: DeckCtx
  no: number
  total: number
  scenes: DeckScene[]
  part: string
}) {
  return (
    <Slide ctx={ctx} no={no} total={total} name={`生活场景${part}`}>
      <Chapter ctx={ctx} no={no} title="每一个场景，都由真实的设备支撑。" tag="SCENES" />
      <div className="grid min-h-0 w-full flex-1 grid-cols-2 gap-[28px] overflow-hidden">
        {scenes.map((entry) => {
          const { scene, rooms, items } = entry
          const night = usesBuiltinPhoto(scene) ? nightScenePhotoForScene(scene.name) : null
          const photo = night ? null : scenePhoto(ctx, entry)
          return (
            <div
              key={scene.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-(--deck-radius) border border-doc-rule bg-(--deck-diagram)"
            >
              <div className="relative h-[300px] shrink-0 overflow-hidden bg-doc-stripe">
                {photo ? (
                  <SceneProductFigure
                    visual={photo.visual}
                    callouts={photo.match.callouts}
                    width={648}
                    height={300}
                    maxCallouts={3}
                    lazy={ctx.lazy}
                    note=""
                  />
                ) : (
                  // 方案 deck 的场景图：来源可能是外部 URL / 本地兜底路径，
                  // 走 next/image 会受自定义 loader 与 remotePatterns 限制，
                  // 在导出 PDF/PNG 时也容易出问题。这里保留原生 img。
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      night?.url ??
                      scene.image?.url ??
                      `/proposal/photos/${CHAPTER_PHOTO[scene.chapter] ?? 'home'}.jpg`
                    }
                    alt={night?.alt ?? scene.image?.alt ?? scene.name}
                    {...imgLoading(ctx)}
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                {scene.tagline ? (
                  <span className="doc-latin absolute top-[16px] left-[16px] rounded-[calc(var(--deck-radius-sm)/2)] bg-(--deck-chip) px-[10px] py-[4px] text-[11px] tracking-[0.2em] text-(--deck-chip-ink)">
                    {scene.tagline}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-[8px] px-[20px] py-[14px]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="doc-display truncate text-[22px] leading-tight">{scene.name}</p>
                  <p className="doc-body shrink-0 truncate text-[12px] text-doc-accent">
                    {rooms.length
                      ? rooms.slice(0, 3).join('、') + (rooms.length > 3 ? ' 等' : '')
                      : '全屋'}
                  </p>
                </div>
                <p className="doc-body text-[13px] leading-[1.5] text-doc-muted">
                  {scene.headline || scene.summary}
                </p>
                {scene.steps.length ? (
                  <ol className="flex flex-col gap-[4px] border-t border-doc-rule pt-[8px]">
                    {scene.steps.slice(0, 3).map((s, i) => (
                      <li key={i} className="doc-body flex gap-[10px] text-[12px] leading-[1.4]">
                        <span className="doc-numeral w-[18px] shrink-0 text-doc-accent">
                          {i + 1}
                        </span>
                        <span className="min-w-0">{s}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <div className="grid grid-cols-2 gap-[5px] border-t border-doc-rule pt-[8px]">
                  {items.slice(0, 5).map((item) => {
                    const image = productPhoto(ctx, item)
                    return (
                      <span
                        key={item.ref}
                        title={[item.name, item.sku].filter(Boolean).join(' · ')}
                        className="doc-body flex min-w-0 items-center gap-[6px] rounded-[calc(var(--deck-radius-sm)/2)] bg-doc-stripe px-[6px] py-[3px] text-[11px]"
                      >
                        {image ? (
                          <Image
                            src={image.url}
                            alt={image.alt || item.name}
                            width={64}
                            height={64}
                            {...imgLoading(ctx)}
                            className="size-[24px] shrink-0 rounded-sm bg-white object-contain"
                          />
                        ) : (
                          <span className="flex size-[24px] shrink-0 items-center justify-center rounded-sm bg-doc-paper text-[8px] text-doc-muted">
                            {item.pending ? '待选型' : '无图'}
                          </span>
                        )}
                        <span className="min-w-0 truncate">
                          {item.pending ? item.typeName : item.name}
                        </span>
                      </span>
                    )
                  })}
                  {items.length > 5 ? (
                    <span className="doc-body self-center text-[11px] text-doc-muted">
                      另 {items.length - 5} 项见报价
                    </span>
                  ) : null}
                </div>
                {photo ? (
                  <p
                    className="doc-body truncate text-[11px] leading-[1.4] text-doc-muted"
                    title={photo.room.displayName}
                  >
                    {photo.match.callouts.length
                      ? `示意空间：${photo.room.displayName}`
                      : '本空间暂无对应标注位'}
                    {photo.remainingGroups
                      ? `；其余 ${photo.remainingGroups} 组见报价 / 房间配置`
                      : '；产品以本次选型为准'}
                  </p>
                ) : (
                  <p className="doc-body text-[11px] leading-[1.4] text-doc-muted">
                    {night
                      ? '夜间场景氛围意向，实际产品见本页清单与报价。'
                      : '场景图片保留原样，实际产品见本页清单与报价。'}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Slide>
  )
}
