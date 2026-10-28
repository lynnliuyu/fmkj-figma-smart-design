// 房间 / 场景图标总入口：把两组定义聚合成一份可枚举、可渲染的清单。
// 几何定义在 lib/space-icons/rooms.mjs 与 lib/space-icons/scenes.mjs；
// 画法与渲染规则在 lib/space-icons/shared.mjs 与 lib/space-icons/render.mjs。
import { rooms } from "./space-icons/rooms.mjs"
import { scenes } from "./space-icons/scenes.mjs"
import { SPACE_ICON_COLORS, SPACE_ICON_GROUPS } from "./space-icons/shared.mjs"
import { renderSpaceIconSvg } from "./space-icons/render.mjs"

export const spaceIconGroups = Object.freeze({ rooms, scenes })

/** 扁平清单：顺序固定为 rooms → scenes，每个分组内按定义顺序。 */
export const spaceIconDefinitions = SPACE_ICON_GROUPS.flatMap((group) =>
  Object.entries(spaceIconGroups[group]).map(([id, definition]) => ({
    id,
    group,
    nameZh: definition.nameZh,
    nameEn: definition.nameEn,
    svg: `/assets/space-icons/${group}/${id}.svg`,
    png: `/assets/space-icons/png/${group}/${id}.png`,
    color: SPACE_ICON_COLORS[group],
  })),
)

export function renderSpaceIcon(group, id) {
  const definition = spaceIconGroups[group]?.[id]
  if (!definition) throw new Error(`没有这个图标: ${group}/${id}`)
  return renderSpaceIconSvg({
    commands: definition.commands,
    color: SPACE_ICON_COLORS[group],
    title: `${definition.nameZh} ${definition.nameEn}`,
  })
}
