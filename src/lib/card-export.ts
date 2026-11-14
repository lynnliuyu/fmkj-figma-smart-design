'use client'

/**
 * 名片导出：把画布节点截成 PNG，并写进 300dpi（见 lib/business-card 的 pngWithDpi）。
 *
 * 单独抽出来是因为导出有两个坑，写两遍就一定会有一遍漏：
 * 1. **必须等图片真的解码完** —— html-to-image 对没 load 完的 <img> 会直接画空白，
 *    名片上有 logo、三个品牌标和二维码，缺一张就是印废。
 * 2. **必须写 dpi** —— 没有 pHYs 的 PNG，印厂按 72dpi 打开，3240px 变成 114cm 宽。
 */
import { CARD_EXPORT_SCALE, CARD_H, CARD_W, pngWithDpi } from './business-card'

async function waitForImages(node: HTMLElement) {
  await document.fonts.ready
  await Promise.all(
    [...node.querySelectorAll('img')].map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error(`名片素材加载失败：${image.getAttribute('src')}`))
        })
      }
      if (!image.naturalWidth) throw new Error(`名片素材加载失败：${image.getAttribute('src')}`)
      await image.decode().catch(() => {})
    }),
  )
}

/** 截一张名片节点 → 300dpi 的 PNG 字节。node 必须是 1080×648 的原始画布。 */
export async function renderCardPng(node: HTMLElement): Promise<Uint8Array> {
  await waitForImages(node)
  const { toPng } = await import('html-to-image')
  const url = await toPng(node, {
    pixelRatio: CARD_EXPORT_SCALE,
    width: CARD_W,
    height: CARD_H,
    cacheBust: false,
  })
  if (!url.startsWith('data:image/png')) throw new Error('导出失败：PNG 数据为空')
  const raw = Uint8Array.from(atob(url.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
  return pngWithDpi(raw)
}

/** 把画布节点截成 data URL（三维贴图用，不写 dpi —— 那是屏幕贴图，不进印厂） */
export async function renderCardTexture(node: HTMLElement): Promise<string> {
  await waitForImages(node)
  const { toPng } = await import('html-to-image')
  // 贴图只要够清楚，别用 3 倍 —— 那是 4.5MB 的 base64，喂给 WebGL 会明显卡顿
  return toPng(node, {
    pixelRatio: 1.5,
    width: CARD_W,
    height: CARD_H,
    cacheBust: false,
  })
}
