// 房间 / 场景图标共用的画法与调色板。
// 与设备点位图标（lib/point-device-symbols.mjs）同一套 CAD 原生几何：
// 只有 pline（折线/多边形，可闭合）和 rectang（矩形）两种命令，
// 曲线一律用采样折线近似（arc / ring 就是干这个的）。
// 坐标空间固定 -1.4 ~ 1.4，与设备图标一致；渲染时整体 scale(1,-1) 翻成屏幕坐标。

export const SPACE_ICON_VIEWBOX = "-1.4 -1.4 2.8 2.8"
export const SPACE_ICON_SIZE = 112

/** 折线：points 为 [x, y] 数组；closed 为 true 时渲染成 polygon（闭合）。 */
export const line = (points, width = 0.105, closed = false) => [
  "pline",
  { vertices: points, width, closed },
]

/** 矩形（轴线矩形，非填充）。 */
export const rect = (x0, y0, x1, y1, width = 0.12) => [
  "rectang",
  { p1: [x0, y0], p2: [x1, y1], width },
]

/** 圆弧 → 采样折线。角度为度，逆时针，0° 指向 +x，90° 指向 +y。 */
export const arc = (r, from = 25, to = 155, center = [0, -0.65], width = 0.105) =>
  line(
    Array.from({ length: 17 }, (_, index) => {
      const angle = ((from + ((to - from) * index) / 16) * Math.PI) / 180
      return [center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)]
    }),
    width,
  )

/** 整圆 → 采样折线（闭合）。 */
export const ring = (r, center = [0, 0], width = 0.105) => arc(r, 0, 360, center, width)

/** 圆角矩形：用折线倒角，避免出现 rect 无法表达的形状。 */
export const roundRect = (x0, y0, x1, y1, radius = 0.18, width = 0.12) => {
  const points = []
  const corner = (cx, cy, from) => {
    for (let step = 0; step <= 4; step += 1) {
      const angle = ((from + step * 22.5) * Math.PI) / 180
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
    }
  }
  corner(x1 - radius, y1 - radius, 0)
  corner(x0 + radius, y1 - radius, 90)
  corner(x0 + radius, y0 + radius, 180)
  corner(x1 - radius, y0 + radius, 270)
  return line(points, width, true)
}

export const SPACE_ICON_COLORS = Object.freeze({
  rooms: "#334155",
  scenes: "#0f766e",
})

export const SPACE_ICON_GROUPS = Object.freeze(["rooms", "scenes"])
