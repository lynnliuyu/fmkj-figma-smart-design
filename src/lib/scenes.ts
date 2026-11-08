import type { Payload } from 'payload'

import type { User } from '@/payload-types'

import { BUILTIN_SCENES } from './builtin-scenes'
import { ensureBuiltinLibrarySeeded } from './proposal-library'

/** 场景库里的一条场景（只取方案需要的字段） */
export type ManagedScene = {
  id: string
  name: string
  summary: string
  headline: string | null
  subtitle: string | null
  tagline: string | null
  steps: string[]
  image: { url: string; alt: string } | null
  scope: 'room' | 'house'
  chapter: string
  roomTypes: string[]
  requiredDevices: string[]
  anyDevices: string[]
}

/** 读取后台场景库里启用的场景；user 为 null 时按系统身份读取（模板库示例方案用） */
export async function loadScenes(payload: Payload, user: User | null): Promise<ManagedScene[]> {
  await ensureBuiltinLibrarySeeded(payload)
  const access = user ? { user, overrideAccess: false } : { overrideAccess: true }
  const res = await payload.find({
    collection: 'scenes',
    where: { enabled: { equals: true } },
    sort: 'sortOrder',
    limit: 200,
    depth: 1,
    ...access,
  })
  return res.docs.map((d) => {
    const img =
      d.image && typeof d.image === 'object' && d.image.url
        ? { url: d.image.url, alt: d.image.alt || d.name }
        : null
    return {
      id: String(d.id),
      name: d.name,
      summary: d.summary,
      headline: d.headline ?? null,
      subtitle: d.subtitle ?? null,
      tagline: d.tagline ?? null,
      steps: (d.steps ?? []).map((s) => s.text),
      image: img,
      scope: d.scope === 'house' ? 'house' : 'room',
      chapter: d.chapter ?? 'arrive',
      roomTypes: d.roomTypes ?? [],
      requiredDevices: d.requiredDevices ?? [],
      anyDevices: d.anyDevices ?? [],
    }
  })
}

/**
 * 方案用的场景库：后台有启用的场景用后台的；一条都没有（或读取失败）时用内置场景库，
 * 保证「生活场景」章节和房间场景不会空白。
 */
export async function loadSceneLibrary(
  payload: Payload,
  user: User | null,
): Promise<{ scenes: ManagedScene[]; source: 'library' | 'builtin' }> {
  const managed = await loadScenes(payload, user).catch(() => [])
  return managed.length
    ? { scenes: managed, source: 'library' }
    : { scenes: BUILTIN_SCENES, source: 'builtin' }
}

const devicesOk = (s: ManagedScene, types: Set<string>) =>
  s.requiredDevices.every((t) => types.has(t)) &&
  (!s.anyDevices.length || s.anyDevices.some((t) => types.has(t)))

type RoomLike = { areaType: string; points: { deviceType: string }[] }

/**
 * 按房间分配场景：
 * - 按房间的场景：房间类型适用、房间里的设备满足条件；
 * - 全屋场景：整套房子的设备满足条件，挂在第一个有相关设备的房间（只出现一次）。
 * 返回每个房间的「名称：说明」列表（与原有房间场景格式一致）。
 */
export function assignScenes(scenes: ManagedScene[], rooms: RoomLike[]): string[][] {
  const out = rooms.map(() => [] as string[])
  const all = new Set(rooms.flatMap((r) => r.points.map((p) => p.deviceType)))
  for (const s of scenes) {
    const line = `${s.name}：${s.summary}`
    if (s.scope === 'house') {
      if (!devicesOk(s, all)) continue
      const related = [...s.requiredDevices, ...s.anyDevices]
      let i = rooms.findIndex(
        (r) =>
          (!s.roomTypes.length || s.roomTypes.includes(r.areaType)) &&
          r.points.some((p) => related.includes(p.deviceType)),
      )
      if (i < 0) i = rooms.findIndex((r) => r.points.length)
      if (i >= 0) out[i].push(line)
      continue
    }
    rooms.forEach((r, i) => {
      if (s.roomTypes.length && !s.roomTypes.includes(r.areaType)) return
      if (devicesOk(s, new Set(r.points.map((p) => p.deviceType)))) out[i].push(line)
    })
  }
  return out
}
