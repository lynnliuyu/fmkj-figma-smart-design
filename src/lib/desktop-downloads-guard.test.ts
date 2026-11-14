import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * 安装包链接必须是原生 <a>，不能是 next/link。
 *
 * 2026-11-14 用户报「Windows 客户端切换侧边栏好卡」，本地怎么压都跑满 60fps，
 * 最后发现不是动画：下载按钮写成了 <Button as={Link} href={安装包地址}>，
 * App Router 把 /downloads/desktop/<文件> 当**站内路由预取** —— 打开 /download
 * 一次静默拉走 360 MB（三个安装包各一遍，URL 带 ?_rsc=）。服务器出口只有 ~1 Mbps，
 * 线路被占满后连点侧边栏切页面都要排队。
 *
 * 为什么不用 e2e 守：CI 的冒烟跑的是 `next dev`，而 dev 模式**不做预取**，
 * 页面级断言在那里永远是绿的。所以这条只能在源码层面盯住。
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('../components/download/desktop-downloads.tsx', import.meta.url)),
  'utf8',
)

/** 取出一个 JSX 元素从开始到 `/>` 的文本（够用：这些 Button 都没有嵌套子元素） */
function elements(source: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?/>`, 'g')
  for (const m of source.matchAll(re)) out.push(m[0])
  return out
}

describe('桌面客户端下载按钮', () => {
  it('安装包下载按钮不加 as={Link}（否则会被 App Router 预取 100MB+ 的文件）', () => {
    const installers = elements(SOURCE, 'Button').filter((jsx) =>
      /href=\{(?:asset|target)/.test(jsx),
    )
    expect(installers.length).toBeGreaterThan(0)
    for (const jsx of installers) {
      expect(jsx).not.toMatch(/as=\{Link\}/)
    }
  })

  it('站内导航按钮仍然可以、也应当用 next/link', () => {
    // 反向断言：别为了躲预取把真正的路由跳转也改成整页刷新
    const internal = elements(SOURCE, 'Button').filter((jsx) => /href="\/projects"/.test(jsx))
    expect(internal.length).toBeGreaterThan(0)
    for (const jsx of internal) expect(jsx).toMatch(/as=\{Link\}/)
  })
})
