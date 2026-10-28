// 房间 / 场景图标渲染器：与设备点位图标完全同款输出（同 viewBox、同翻转、同描边约定）。
// 只接受 pline / rectang 两种 CAD 原生命令，任何其它命令一律报错，避免出现字体或位图。
import { SPACE_ICON_SIZE, SPACE_ICON_VIEWBOX } from "./shared.mjs"

const number = (value) => String(Number(value.toFixed(6)))

export function renderSpaceIconSvg({ commands, color, title }) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error("图标没有任何线条")
  }
  const elements = commands.map(([command, params]) => {
    if (command === "rectang") {
      const [x0, y0] = params.p1
      const [x1, y1] = params.p2
      return `<rect x="${number(Math.min(x0, x1))}" y="${number(Math.min(y0, y1))}" width="${number(Math.abs(x1 - x0))}" height="${number(Math.abs(y1 - y0))}" stroke-width="${number(params.width)}"/>`
    }
    if (command === "pline") {
      const points = params.vertices.map(([x, y]) => `${number(x)},${number(y)}`).join(" ")
      const element = params.closed ? "polygon" : "polyline"
      return `<${element} points="${points}" stroke-width="${number(params.width)}"/>`
    }
    throw new Error(`不支持的绘图命令: ${command}（只允许 pline / rectang）`)
  })
  const label = title ? `<title>${String(title).replace(/[<>&]/g, "")}</title>` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPACE_ICON_SIZE}" height="${SPACE_ICON_SIZE}" viewBox="${SPACE_ICON_VIEWBOX}">${label}<g transform="scale(1,-1)" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">${elements.join("")}</g></svg>\n`
}

/** 统计图形的包围盒，用于检查是否超出画布、是否画得过大或过小。 */
export function commandBounds(commands) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const push = ([x, y]) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const [command, params] of commands) {
    if (command === "rectang") {
      push(params.p1)
      push(params.p2)
    } else if (command === "pline") {
      for (const vertex of params.vertices) push(vertex)
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function validateSpaceIcon(id, definition) {
  const problems = []
  if (!definition || typeof definition !== "object") return [`${id}: 定义不是对象`]
  if (!definition.nameZh) problems.push(`${id}: 缺少 nameZh`)
  if (!definition.nameEn) problems.push(`${id}: 缺少 nameEn`)
  const commands = definition.commands
  if (!Array.isArray(commands) || commands.length === 0) {
    problems.push(`${id}: commands 为空`)
    return problems
  }
  if (commands.length < 3) problems.push(`${id}: 线条只有 ${commands.length} 条，太简单（要求 ≥3）`)
  if (commands.length > 8) problems.push(`${id}: 线条有 ${commands.length} 条，太碎（要求 ≤8）`)
  for (const [index, command] of commands.entries()) {
    if (!Array.isArray(command) || command.length !== 2) {
      problems.push(`${id}: 第 ${index + 1} 条命令格式不对`)
      continue
    }
    const [kind, params] = command
    if (kind !== "pline" && kind !== "rectang") {
      problems.push(`${id}: 第 ${index + 1} 条命令 ${kind} 不允许`)
      continue
    }
    if (kind === "pline") {
      if (!Array.isArray(params?.vertices) || params.vertices.length < 2) {
        problems.push(`${id}: 第 ${index + 1} 条折线顶点不足`)
      } else if (params.vertices.some((v) => !Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== "number" || !Number.isFinite(n)))) {
        problems.push(`${id}: 第 ${index + 1} 条折线有非法顶点`)
      }
    }
    if (kind === "rectang" && (!Array.isArray(params?.p1) || !Array.isArray(params?.p2))) {
      problems.push(`${id}: 第 ${index + 1} 个矩形缺少角点`)
    }
  }
  const bounds = commandBounds(commands.filter(([kind]) => kind === "pline" || kind === "rectang"))
  if (Number.isFinite(bounds.minX)) {
    const overflow = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY))
    if (overflow > 1.2) problems.push(`${id}: 图形超出画布（最远到 ${overflow.toFixed(2)}，要求 ≤1.2）`)
    if (Math.max(bounds.width, bounds.height) < 0.6) problems.push(`${id}: 图形太小（最大边 ${Math.max(bounds.width, bounds.height).toFixed(2)}）`)
  }
  return problems
}
