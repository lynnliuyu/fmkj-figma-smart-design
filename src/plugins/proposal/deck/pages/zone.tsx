/**
 * 04–06 生活场景：按空间类型分章（进门 / 休息 / 看护 / 专注），每章展开点位最多的两间。
 * 左侧氛围照片 + 点位标注，下方房间设备与小计（休息、看护章节用房间小平面）；右侧推荐场景或报警逻辑。
 * 房间智能分析插件关闭时不展示推荐场景，改为列出各房间的设备配置。
 */
import type { Room } from '@/lib/project-docs'
import { sceneVisualForRoom } from '@/lib/scene-visuals'
import { nightScenePhotoForScene } from '@/lib/scene-night-photos'
import { cn } from '@/lib/utils'

import {
  installNote,
  roomScenes,
  yuanShort,
  ZONE_COPY,
  type DeckZone,
  type SceneItem,
} from '../model'
import {
  amountFont,
  Chapter,
  Panel,
  PlanCard,
  PlanView,
  Photo,
  roomCrop,
  SectionTitle,
  Slide,
  type DeckCtx,
} from '../parts'
import { SceneProductFigure } from '../scene-product-figure'
import { matchSceneProducts } from '../scene-products'

const CN = ['一', '二', '三', '四']
const SENSOR_TYPES = ['water-sensor', 'smoke-sensor', 'contact-sensor', 'motion-sensor']

const unitOf = (l: Room['lines'][number]) => l.product?.unit || '个'
const lineText = (l: Room['lines'][number]) => `${l.typeName} ×${l.count}${unitOf(l)}`

/** 分章的边界说明（不承诺做不到的事） */
function boundary(zone: DeckZone): { title: string; body: string } {
  const types = new Set(zone.points.map((p) => p.deviceType))
  if (zone.key === 'arrive') {
    return types.has('contact-sensor') || types.has('smart-lock')
      ? {
          title: '门开了，不等于知道谁回家',
          body: '门磁 / 门锁只提供开合或开锁状态，不能判断进出方向、人员身份或是否离家；不以单一状态自动判定回家 / 离家。',
        }
      : {
          title: '场景先确认，再自动执行',
          body: '回家 / 离家等自动化规则在交付时与业主逐条确认，可随时在 App 中调整或停用。',
        }
  }
  if (zone.key === 'rest') {
    const absent = [
      !types.has('curtain-track') && '卧室窗帘控制',
      !types.has('motion-sensor') && '起夜感应夜灯',
      '调光调色',
    ].filter(Boolean)
    return {
      title: '本次只控制已配置的设备',
      body: `不承诺${absent.join('、')}；照片中的床头灯与柔光氛围为意向示意，不代表新增设备。`,
    }
  }
  if (zone.key === 'care') {
    if (types.has('water-sensor'))
      return {
        title: '交接时，做一次真实的模拟测试',
        body: '探头接触最低积水面、主机勿浸泡，且可取出维护。模拟触水 → 核对网关状态 → 业主手机收讯 → 擦干复位；记录接收时延、断网表现与电池维护方式。',
      }
    if (types.has('smoke-sensor'))
      return {
        title: '交接时，做一次真实的报警测试',
        body: '按设备说明进行测试，核对网关状态与业主手机收讯，记录声光提醒、断网表现与电池维护方式。',
      }
    return {
      title: '安全提醒，以真实测试为准',
      body: '设备状态与通知以交付时的实测为准；接收账号、权限与通知方式在联调时确认。',
    }
  }
  return {
    title: '光线与氛围，交付时再微调',
    body: '灯光亮度、色温与场景在交付联调时按业主习惯微调，不在方案阶段承诺具体效果。',
  }
}

function SceneBlock({ ctx, scene, index }: { ctx: DeckCtx; scene: SceneItem; index: number }) {
  const name = scene.name.replace(/模式$/, '')
  return (
    <div className="flex flex-col gap-[10px] border-b border-doc-rule py-[15px]">
      <p className="doc-display flex items-center gap-[10px] text-[22px] leading-normal">
        <span
          aria-hidden
          className={cn('size-[8px] shrink-0 bg-doc-accent', ctx.theme.rounded && 'rounded-full')}
        />
        {name} / 场景{CN[index] ?? index + 1}
      </p>
      <p className="doc-body text-[15px] leading-[1.55] text-doc-muted">
        <span className="mr-[14px]">条件</span>手动选择「{name}」，或在场景面板 / App
        中一键触发，由业主确认后启用。
      </p>
      <p className="doc-body text-[17px] leading-[1.55]">
        <span className="mr-[12px]">→</span>
        {scene.action}
      </p>
    </div>
  )
}

/** 推荐场景关闭时：按类型汇总配置，完整型号保留在投资明细和报价单。 */
function ConfigBlock({ ctx, r }: { ctx: DeckCtx; r: Room }) {
  const byType = new Map<string, { name: string; count: number; unit: string }>()
  for (const line of r.lines) {
    const current = byType.get(line.deviceType)
    if (current) current.count += line.count
    else byType.set(line.deviceType, { name: line.typeName, count: line.count, unit: unitOf(line) })
  }
  const types = [...byType.values()]
  return (
    <div className="flex flex-col gap-[5px] border-b border-doc-rule py-[10px]">
      <p className="doc-display text-[20px] leading-[1.35] wrap-anywhere">
        {r.displayName} · {r.typeLabel}
      </p>
      {types.slice(0, 4).map((type) => (
        <p
          key={type.name}
          className="doc-body flex justify-between gap-4 text-[14px] leading-[1.5] text-doc-muted"
        >
          <span className="wrap-anywhere">{type.name}</span>
          <span className="shrink-0">
            ×{type.count}
            {type.unit}
          </span>
        </p>
      ))}
      {types.length > 4 ? (
        <p className="doc-body text-[13px] text-doc-muted">
          另含 {types.length - 4} 类设备，见报价明细
        </p>
      ) : null}
      <p className="doc-body mt-[2px] flex items-baseline justify-between gap-4 text-[14px]">
        <span>设备小计</span>
        <span className={cn(amountFont(ctx), 'shrink-0 text-[23px] text-doc-accent')}>
          {yuanShort(r.subtotal)}
        </span>
      </p>
    </div>
  )
}

/** 房间设备与小计（进门 / 专注章节） */
function RoomBlock({ ctx, r }: { ctx: DeckCtx; r: Room }) {
  const lines = r.lines.slice(0, 4)
  return (
    <div className="flex min-w-0 flex-col">
      <p className="doc-strong line-clamp-2 text-[20px] leading-[1.35] wrap-anywhere">
        {r.displayName} · {r.total}点
      </p>
      <div className="doc-body mt-[8px] flex flex-col gap-[4px] text-[15px] leading-[1.5] text-doc-muted">
        {lines.map((l) => (
          <p key={`${l.deviceType}-${l.product?.id ?? 'p'}`} className="wrap-anywhere">
            {lineText(l)}　{l.product ? yuanShort(l.subtotal) : '待选型'}
          </p>
        ))}
        {r.lines.length > lines.length ? (
          <p>另含 {r.lines.length - lines.length} 类设备，见报价明细</p>
        ) : null}
      </div>
      <div className="mt-[8px] flex items-end justify-between gap-[12px] border-t border-doc-rule pt-[10px]">
        <p className="doc-body min-w-0 text-[15px] leading-normal wrap-anywhere">
          {r.displayName}设备小计
        </p>
        <p className={cn(amountFont(ctx), 'shrink-0 text-[28px] leading-none text-doc-accent')}>
          {yuanShort(r.subtotal)}
        </p>
      </div>
    </div>
  )
}

/** 房间小平面（取房间所在图纸，裁到房间范围） */
function RoomMini({
  ctx,
  r,
  width,
  height,
}: {
  ctx: DeckCtx
  r: Room
  width: number
  height: number
}) {
  const d = ctx.m.d
  const areas = d.areas.filter((a) => r.areaIds.includes(a.id))
  const sheet = d.sheets.find((s) => s.id === areas[0]?.sheetId)
  const own = sheet ? areas.filter((a) => a.sheetId === sheet.id) : []
  const crop = sheet ? roomCrop(sheet, own) : null
  return (
    <PlanCard className="items-center justify-center">
      <div style={{ width, height }} className="flex items-center justify-center">
        {sheet && crop ? (
          <PlanView
            ctx={ctx}
            sheet={sheet}
            points={r.points.filter((p) => p.sheetId === sheet.id).map(ctx.m.deckPoint)}
            areas={own}
            width={width - 16}
            height={height - 16}
            crop={crop}
          />
        ) : (
          <p className="doc-body text-[12px] text-[#787771]">未框选房间范围</p>
        )}
      </div>
    </PlanCard>
  )
}

const caption = (r: Room) =>
  `${r.displayName} / ${r.lines
    .slice(0, 3)
    .map((l) => `${l.typeName} ×${l.count}${unitOf(l)}`)
    .join(' · ')}`

export function ZonePage({
  ctx,
  no,
  total,
  zone,
  insights,
}: {
  ctx: DeckCtx
  no: number
  total: number
  zone: DeckZone
  insights: boolean
}) {
  const copy = ZONE_COPY[zone.key]
  const rooms = zone.rooms
  const scenes = insights ? roomScenes(rooms) : []
  const sensors = zone.points.filter((p) => SENSOR_TYPES.includes(p.deviceType))
  const showAlert = zone.key === 'care' && sensors.length > 0
  const minis = zone.key === 'rest' || zone.key === 'care'
  const note = boundary(zone)
  const roomNames = rooms.map((r) => r.displayName).join('与')
  const photoH = minis ? 410 : 440
  const priced = zone.key === 'rest'
  // 一张氛围图只展示一个真实房间的选型，不把同名或邻近空间的型号混进来。
  const sceneRoom = rooms.find((room) => sceneVisualForRoom(room.areaType))
  const nightPhoto = zone.key === 'rest' ? nightScenePhotoForScene('睡眠模式') : null
  const visual = !nightPhoto && sceneRoom ? sceneVisualForRoom(sceneRoom.areaType) : null
  const products =
    visual && sceneRoom
      ? matchSceneProducts(visual, sceneRoom.points, ctx.m.d.productById, {
          roomType: sceneRoom.areaType,
          maxCallouts: 6,
        })
      : null
  const photoNote = nightPhoto
    ? '夜间睡眠氛围意向 · 实际设备见本次配置'
    : sceneRoom
      ? `AI场景意向 · ${sceneRoom.displayName}产品位置示意${products?.unplaced.length ? ` · 另${products.unplaced.length}组见报价` : ''}`
      : ctx.theme.photoNote
  return (
    <Slide ctx={ctx} no={no} total={total} name={`${copy.tag} · ${roomNames}`}>
      <Chapter
        ctx={ctx}
        no={no}
        title={copy.title}
        subtitle={`${roomNames} / ${copy.subtitle}`}
        tag={copy.tag}
      />
      <div className="flex min-h-0 w-full flex-1 items-start gap-[24px] overflow-hidden">
        <div className="flex w-[864px] shrink-0 flex-col">
          {visual && products ? (
            <SceneProductFigure
              visual={visual}
              callouts={products.callouts}
              width={864}
              height={photoH}
              lazy={ctx.lazy}
              note={photoNote}
            />
          ) : (
            <Photo
              src={nightPhoto?.url ?? zone.photo}
              width={864}
              height={photoH}
              note={photoNote}
            />
          )}
          {minis ? (
            rooms.length > 1 ? (
              <div className="mt-[12px] grid grid-cols-2 gap-[24px]">
                {rooms.map((r) => (
                  <div key={r.areaId} className="flex min-w-0 flex-col gap-[8px]">
                    <RoomMini ctx={ctx} r={r} width={420} height={160} />
                    <p className="doc-body line-clamp-2 text-[13px] leading-[1.45] text-doc-muted wrap-anywhere">
                      {caption(r)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-[12px] flex gap-[24px]">
                <RoomMini ctx={ctx} r={rooms[0]} width={366} height={176} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="doc-strong line-clamp-2 text-[17px] leading-[1.45] wrap-anywhere">
                    {rooms[0].displayName} / {rooms[0].typeLabel}
                  </p>
                  {rooms[0].lines.slice(0, 3).map((l) => (
                    <p
                      key={`${l.deviceType}-${l.product?.id ?? 'p'}`}
                      className="doc-body line-clamp-2 text-[14px] leading-[1.5] wrap-anywhere"
                    >
                      {l.product?.name || l.typeName} · {lineText(l)}
                    </p>
                  ))}
                  <div className="mt-auto flex items-end justify-between border-t border-doc-rule pt-[12px]">
                    <p className="doc-body text-[14px]">{rooms[0].displayName}设备小计</p>
                    <p className={cn(amountFont(ctx), 'text-[26px] leading-none text-doc-accent')}>
                      {yuanShort(rooms[0].subtotal)}
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="mt-[18px] grid grid-cols-2 gap-[28px]">
              {rooms.map((r) => (
                <RoomBlock key={r.areaId} ctx={ctx} r={r} />
              ))}
            </div>
          )}
          {minis ? (
            <p className="doc-body mt-[10px] text-[13px] leading-[1.45] text-doc-muted">
              示意，非施工图；房间小平面取自总平面，仅表示相对位置，尺寸与安装条件以现场复核为准。
            </p>
          ) : null}
        </div>

        <div className="flex w-[440px] shrink-0 flex-col overflow-hidden">
          {showAlert ? (
            <>
              <SectionTitle
                title="报警逻辑"
                note="安全规则 / 非新增生活场景"
                className="pb-[6px]"
              />
              {[
                [
                  '01 / 发现',
                  `${[...new Set(sensors.map((p) => p.typeName))].join('、')}检测到异常，向已配对网关上报状态。`,
                ],
                [
                  '02 / 通知',
                  '兼容网关与配置支持且网络正常时，尝试远程通知；接收账号、权限与通知方式待联调确认。',
                ],
                [
                  '03 / 处置',
                  sensors.some((p) => p.deviceType === 'water-sensor')
                    ? '业主接到提醒后人工检查水源、关闭角阀并排查；本次不含自动关水阀，不承诺自动止漏。'
                    : '业主接到提醒后人工确认并处置现场；本次不含联动消防或燃气阀门。',
                ],
              ].map(([t, body]) => (
                <div key={t} className="flex flex-col gap-[6px] border-b border-doc-rule py-[14px]">
                  <p className="doc-strong text-[18px] leading-normal">{t}</p>
                  <p className="doc-body text-[14px] leading-[1.55] text-doc-muted">{body}</p>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="h-px w-full shrink-0 bg-doc-rule" />
              {scenes.length
                ? scenes
                    .slice(0, priced ? 1 : 2)
                    .map((s, i) => <SceneBlock key={s.name} ctx={ctx} scene={s} index={i} />)
                : rooms.map((r) => <ConfigBlock key={r.areaId} ctx={ctx} r={r} />)}
              {!scenes.length ? (
                <p className="doc-body mt-[10px] text-[12px] leading-[1.5] text-doc-muted">
                  完整设备品牌、型号及数量见投资明细与报价单。
                </p>
              ) : null}
            </>
          )}
          <Panel
            title={note.title}
            className="mt-[16px] px-[16px] py-[14px] [&>div]:text-[14px] [&>div]:leading-[1.55] [&>p]:text-[17px]"
          >
            {note.body}
          </Panel>
          <p className="doc-body mt-[14px] text-[13px] leading-[1.55] text-doc-muted">
            {installNote([...new Set(zone.points.map((p) => p.deviceType))])}
          </p>
          {priced && scenes.length > 0
            ? rooms.map((r) => (
                <div
                  key={r.areaId}
                  className="mt-[14px] flex items-start justify-between gap-4 border-t border-doc-rule pt-[14px]"
                >
                  <div className="min-w-0">
                    <p className="doc-body line-clamp-2 text-[16px] leading-[1.45] wrap-anywhere">
                      {r.displayName} · {r.total} 个点位
                    </p>
                    <p className="doc-body mt-[4px] line-clamp-2 text-[13px] leading-[1.45] text-doc-muted wrap-anywhere">
                      {r.lines
                        .map((l) => l.product?.name || l.typeName)
                        .slice(0, 2)
                        .join(' / ')}{' '}
                      · 设备小计
                    </p>
                  </div>
                  <p
                    className={cn(
                      amountFont(ctx),
                      'shrink-0 text-[26px] leading-none text-doc-accent',
                    )}
                  >
                    {yuanShort(r.subtotal)}
                  </p>
                </div>
              ))
            : null}
        </div>
      </div>
    </Slide>
  )
}
