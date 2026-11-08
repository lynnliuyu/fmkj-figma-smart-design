import { detectPlanBounds, fitIntoSheet, type Pixels } from './floor-plan-crop'
import { SHEET } from './sheet-spec'

/**
 * 服务端户型图标准化（与点位图编辑器里的裁切算法一致）：
 * 自动去掉图框、标题栏和图名 → 等比放进 3:2 白底标准图纸（2400×1600）。
 * 返回 PNG 和标准图纸的像素数据（供 CAD 符号识别使用）。
 */
export async function normalizeFloorPlan(input: Buffer, opts: { crop?: boolean } = {}) {
  const sharp = (await import('sharp')).default
  const meta = await sharp(input, { failOn: 'none' }).metadata()
  if (
    !meta.format ||
    !['png', 'jpeg', 'jpg', 'webp', 'gif', 'heif', 'tiff'].includes(meta.format)
  ) {
    throw new Error('UNSUPPORTED_IMAGE')
  }
  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const source: Pixels = { data, width: info.width, height: info.height, channels: info.channels }
  const crop =
    opts.crop === false
      ? { x: 0, y: 0, width: info.width, height: info.height }
      : detectPlanBounds(source)
  const { target } = fitIntoSheet(crop, SHEET.pixelWidth, SHEET.pixelHeight, SHEET.padding)

  const plan = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
    .resize(target.width, target.height, { fit: 'fill' })
    .png()
    .toBuffer()
  const png = await sharp({
    create: {
      width: SHEET.pixelWidth,
      height: SHEET.pixelHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([{ input: plan, left: target.x, top: target.y }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    png,
    pixels: {
      data: raw.data,
      width: raw.info.width,
      height: raw.info.height,
      channels: raw.info.channels,
    } as Pixels,
    cropped: opts.crop !== false && (crop.width < info.width || crop.height < info.height),
  }
}
