// 场景图标：与房间组 / 设备点位图标同一套 CAD 线条语言。
// 只有 pline / rectang 两种命令，坐标 -1.4~1.4（图形控制在 ±1.1 内），y 轴向上。
// 每张 3~8 条线；轮廓 0.12，细节 0.07~0.09，箭头杆 0.10；同一张图不超过 3 种线宽。
import { line, rect, arc, ring, roundRect } from "./shared.mjs"

/** 朝右箭头：返回 [箭杆, 箭头] 两条线。 */
const arrowRight = (xTail, xTip, y, width = 0.1) => [
  line([[xTail, y], [xTip, y]], width),
  line([[xTip - 0.3, y + 0.26], [xTip, y], [xTip - 0.3, y - 0.26]], width),
]

/** 朝左箭头：返回 [箭杆, 箭头] 两条线。 */
const arrowLeft = (xTail, xTip, y, width = 0.1) => [
  line([[xTail, y], [xTip, y]], width),
  line([[xTip + 0.3, y + 0.26], [xTip, y], [xTip + 0.3, y - 0.26]], width),
]

/** 向上箭头：返回 [箭杆, 箭头] 两条线。 */
const arrowUp = (x, yTail, yTip, width = 0.1) => [
  line([[x, yTail], [x, yTip]], width),
  line([[x - 0.26, yTip - 0.3], [x, yTip], [x + 0.26, yTip - 0.3]], width),
]

/**
 * 月牙（两条圆弧拼成的闭合折线）。
 * 外圆 (cx,cy) 半径 r，内圆向右偏移 d、半径 r2，两圆交点之间围出月牙，开口朝右。
 * d 取 0.32r、r2 取 0.94r，切得够深才是月牙——偏移太小会变成"缺一角的圆"。
 */
const moon = (cx, cy, r, width = 0.12) => {
  const r2 = r * 0.94
  const d = r * 0.32
  const ix = (d * d + r * r - r2 * r2) / (2 * d)
  const iy = Math.sqrt(Math.max(0, r * r - ix * ix))
  const a1 = Math.atan2(iy, ix)
  const b1 = Math.atan2(iy, ix - d)
  const b2 = Math.atan2(-iy, ix - d)
  const steps = 14
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const a = a1 + (i / steps) * (Math.PI * 2 - 2 * a1)
    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  for (let i = 0; i <= steps; i += 1) {
    // 内弧要从下交点绕左侧（180°）回到上交点，才是月牙的内缘；绕右侧会把整个圆包进来
    const b = b2 + (i / steps) * (b1 - Math.PI * 2 - b2)
    points.push([cx + d + r2 * Math.cos(b), cy + r2 * Math.sin(b)])
  }
  return line(points, width, true)
}

/** 四角星（闭合折线）。 */
const sparkle = (cx, cy, r, width = 0.1) => {
  const k = r * 0.24
  return line(
    [
      [cx, cy + r],
      [cx + k, cy + k],
      [cx + r, cy],
      [cx + k, cy - k],
      [cx, cy - r],
      [cx - k, cy - k],
      [cx - r, cy],
      [cx - k, cy + k],
    ],
    width,
    true,
  )
}

/** 房子轮廓（闭合五边形：墙体 + 屋顶）。 */
const house = (width = 0.12) =>
  line([[-1.05, -0.55], [-1.05, 0.15], [-0.6, 0.75], [-0.15, 0.15], [-0.15, -0.55]], width, true)

export const scenes = {
  home: {
    nameZh: "回家",
    nameEn: "Arrive home",
    commands: [
      house(0.12), // 房子
      rect(-0.85, -0.55, -0.5, -0.1, 0.08), // 门
      ...arrowLeft(0.95, 0.02, 0), // 箭头指向房子（朝内）
    ],
  },
  away: {
    nameZh: "离家",
    nameEn: "Leave home",
    commands: [
      house(0.12), // 房子
      rect(-0.85, -0.55, -0.5, -0.1, 0.08), // 门
      ...arrowRight(0.02, 0.95, 0), // 箭头背离房子（朝外）
    ],
  },
  movie: {
    nameZh: "观影",
    nameEn: "Movie night",
    commands: [
      roundRect(-1, -0.45, 1, 0.8, 0.14, 0.12), // 幕布 / 屏幕
      line([[-0.22, 0.45], [-0.22, -0.35], [0.45, 0.05], [-0.22, 0.45]], 0.1, true), // 播放三角
      line([[-0.5, -0.45], [-0.68, -0.85]], 0.09), // 支架左
      line([[0.5, -0.45], [0.68, -0.85]], 0.09), // 支架右
    ],
  },
  dining: {
    nameZh: "就餐",
    nameEn: "Dining",
    commands: [
      ring(0.5, [0, 0.02], 0.12), // 餐盘
      line([[-1, 0.78], [-1, 0.45], [-0.85, 0.28], [-0.7, 0.45], [-0.7, 0.78]], 0.09), // 叉齿
      line([[-0.85, 0.28], [-0.85, -0.8]], 0.09), // 叉柄
      line([[0.82, -0.8], [0.82, 0.45], [0.98, 0.8], [0.98, -0.8]], 0.09, true), // 餐刀
    ],
  },
  sleep: {
    nameZh: "睡眠",
    nameEn: "Sleep",
    commands: [
      moon(-0.35, 0, 0.72, 0.12), // 月亮
      sparkle(0.35, 0.45, 0.32, 0.09), // 星
      sparkle(0.6, -0.4, 0.18, 0.07), // 小星
    ],
  },
  "wake-up": {
    nameZh: "起床",
    nameEn: "Wake up",
    commands: [
      ring(0.34, [-0.3, 0.1], 0.12), // 日轮
      line([[-0.65, 0.45], [-0.87, 0.67]], 0.08), // 光线（左上，拉长并离日轮留空隙，才像太阳不像靶心/齿轮）
      line([[0.05, 0.45], [0.27, 0.67]], 0.08), // 光线（右上）
      line([[0.05, -0.25], [0.27, -0.47]], 0.08), // 光线（右下）
      line([[-0.65, -0.25], [-0.87, -0.47]], 0.08), // 光线（左下）
      ...arrowUp(0.72, -0.6, 0.72), // 上升箭头
    ],
  },
  "night-toilet": {
    nameZh: "起夜",
    nameEn: "Night toilet",
    commands: [
      line([[-0.9, 0.26], [-0.9, 0.66], [-0.82, 0.78], [-0.08, 0.78], [0, 0.66], [0, 0.26]], 0.12), // 水箱（上圆角，长宽约 1.7:1，太扁会被看成"一道边"）
      line([[-0.94, 0.26], [0.04, 0.26]], 0.1), // 水箱与便体的分界线
      arc(0.6, 180, 360, [-0.45, 0.26], 0.12), // 便体（宽而深的下半圆：弧线才像马桶，折线会被看成标签/六边形）
      line([[-0.63, -0.32], [-0.57, -0.6], [-0.33, -0.6], [-0.27, -0.32]], 0.12, true), // 底座
      line([[-0.74, 0.56], [-0.44, 0.56]], 0.08), // 冲水键
      moon(0.68, 0.7, 0.36, 0.08), // 月亮
    ],
  },
  guest: {
    nameZh: "会客",
    nameEn: "Guests",
    commands: [
      ring(0.2, [-0.42, 0.5], 0.1), // 左人头
      arc(0.36, 0, 180, [-0.42, -0.18], 0.12), // 左人肩
      ring(0.2, [0.42, 0.5], 0.1), // 右人头
      arc(0.36, 0, 180, [0.42, -0.18], 0.12), // 右人肩
    ],
  },
  cleaning: {
    nameZh: "清洁",
    nameEn: "Cleaning",
    commands: [
      line([[0.72, 0.98], [-0.02, -0.2]], 0.1), // 扫帚柄
      line([[-0.2, -0.12], [0.16, -0.12], [0.42, -0.62], [-0.46, -0.62]], 0.11, true), // 扫帚头
      line([[-0.3, -0.62], [-0.38, -0.92]], 0.08), // 刷毛
      line([[-0.06, -0.62], [-0.06, -0.95]], 0.08),
      line([[0.18, -0.62], [0.28, -0.9]], 0.08),
    ],
  },
  armed: {
    nameZh: "布防",
    nameEn: "Armed",
    commands: [
      line([[-0.66, 0.8], [0.66, 0.8], [0.66, 0.28], [0.44, -0.22], [0, -0.85], [-0.44, -0.22], [-0.66, 0.28]], 0.12, true), // 盾牌
      rect(-0.25, -0.44, 0.25, -0.06, 0.09), // 锁体
      arc(0.19, 0, 180, [0, -0.06], 0.09), // 锁梁
      ring(0.075, [0, -0.22], 0.07), // 锁孔
      line([[0, -0.3], [0, -0.38]], 0.07), // 锁孔尾（有尾才不会被看成相机镜头）
    ],
  },
  "all-on": {
    nameZh: "全开",
    nameEn: "All on",
    commands: [
      ring(0.4, [0, 0.32], 0.12), // 灯泡
      rect(-0.2, -0.34, 0.2, -0.02, 0.09), // 灯头
      ...arrowUp(0.72, -0.6, 0.55), // 向上箭头
    ],
  },
  "all-off": {
    nameZh: "全关",
    nameEn: "All off",
    commands: [
      ring(0.4, [0, 0.32], 0.12), // 灯泡
      rect(-0.2, -0.34, 0.2, -0.02, 0.09), // 灯头
      line([[-0.66, 0.9], [0.66, -0.5]], 0.12), // 斜杠划掉灯泡 = 关（与 all-on 的"灯泡+箭头"轮廓不同，24px 也能分）
    ],
  },
}
