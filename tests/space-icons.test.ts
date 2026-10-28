import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { renderSpaceIcon, spaceIconDefinitions, spaceIconGroups } from "../lib/space-icons.mjs"
import { validateSpaceIcon } from "../lib/space-icons/render.mjs"
import { SPACE_ICON_COLORS, SPACE_ICON_GROUPS, SPACE_ICON_VIEWBOX } from "../lib/space-icons/shared.mjs"

type SpaceIconDefinition = { nameZh: string; nameEn: string; commands: readonly unknown[] }
type SpaceIconGroup = "rooms" | "scenes"

const groups = spaceIconGroups as unknown as Record<SpaceIconGroup, Record<string, SpaceIconDefinition>>
const colors = SPACE_ICON_COLORS as unknown as Record<SpaceIconGroup, string>

const EXPECTED: Record<SpaceIconGroup, string[]> = {
  rooms: [
    "living-room",
    "dining-room",
    "kitchen",
    "master-bedroom",
    "bedroom",
    "kids-room",
    "elder-room",
    "study",
    "bathroom",
    "balcony",
    "entryway",
    "corridor",
    "cloakroom",
    "theater",
  ],
  scenes: [
    "home",
    "away",
    "movie",
    "dining",
    "sleep",
    "wake-up",
    "night-toilet",
    "guest",
    "cleaning",
    "armed",
    "all-on",
    "all-off",
  ],
}

describe("房间与场景图标", () => {
  it("两组图标齐全，slug 固定且无多余项", () => {
    expect(SPACE_ICON_GROUPS).toEqual(["rooms", "scenes"])
    for (const group of SPACE_ICON_GROUPS as SpaceIconGroup[]) {
      expect(Object.keys(groups[group])).toEqual(EXPECTED[group])
    }
    expect(spaceIconDefinitions).toHaveLength(EXPECTED.rooms.length + EXPECTED.scenes.length)
  })

  it("每个定义都符合画法约定：线条数量、坐标范围、中英文名", () => {
    for (const group of SPACE_ICON_GROUPS as SpaceIconGroup[]) {
      for (const [id, definition] of Object.entries(groups[group])) {
        expect(validateSpaceIcon(id, definition)).toEqual([])
        expect(definition.nameZh.length).toBeGreaterThan(0)
        expect(definition.nameEn.length).toBeGreaterThan(0)
      }
    }
  })

  it("磁盘上的 SVG 与几何定义渲染结果逐字节一致", () => {
    for (const entry of spaceIconDefinitions) {
      const group = entry.group as SpaceIconGroup
      const svg = readFileSync(new URL(`../public${entry.svg}`, import.meta.url), "utf8")
      expect(svg).toBe(renderSpaceIcon(group, entry.id))
      expect(svg).toContain(`viewBox="${SPACE_ICON_VIEWBOX}"`)
      expect(svg).toContain('transform="scale(1,-1)"')
      expect(svg).toContain('fill="none"')
      expect(svg).toContain(`stroke="${colors[group]}"`)
      // 只用线条：没有文字、字体、位图、脚本、圆元素
      expect(svg).not.toMatch(/<(?:text|tspan|image|foreignObject|circle|ellipse|path)\b|font-family|<script/i)
    }
  })

  it("透明 PNG 与 SVG 同名成套，且不是空白图", () => {
    for (const entry of spaceIconDefinitions) {
      expect(entry.png).toBe(`/assets/space-icons/png/${entry.group}/${entry.id}.png`)
      const png = readFileSync(new URL(`../public${entry.png}`, import.meta.url))
      expect(png.length).toBeGreaterThan(400)
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
    }
  })
})
