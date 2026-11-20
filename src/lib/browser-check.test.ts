import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

import { checkBrowserSupport, MIN_CHROMIUM_MAJOR } from './browser-check'

/**
 * 浏览器检查逻辑单测（issue #188）。
 *
 * 判定原则（见 browser-check.ts 注释）：
 * - 能力足够（@scope 支持）→ ok，不按品牌/UA 告警；
 * - 能力不足 + Chromium 内核 < 118 → too-old;
 * - 能力不足 + 内核 >= 118，或识别不到 Chromium（Safari/Firefox/未知）→ 不告警（unknown/ok）。
 * 这里通过覆盖 navigator.userAgent / CSS.supports 模拟，替代真实老内核（测试替身，详见用例注释）。
 */
function installEnv({
  ua,
  supportsScope,
  supportsFn,
}: {
  ua: string
  supportsScope: boolean
  supportsFn?: boolean
}) {
  const win = globalThis as unknown as {
    window?: unknown
    document?: { documentElement?: unknown }
    navigator: { userAgent?: string }
    CSS: { supports?: (...s: unknown[]) => boolean }
  }
  // node 测试环境无 window/document：补最小宿主，让 checkBrowserSupport 走浏览器逻辑分支。
  Object.defineProperty(win, 'window', { value: win, configurable: true })
  Object.defineProperty(win, 'document', {
    value: { documentElement: {} },
    configurable: true,
  })
  Object.defineProperty(win, 'navigator', {
    value: { userAgent: ua },
    configurable: true,
  })
  Object.defineProperty(win, 'CSS', {
    value: {
      supports:
        supportsFn === false
          ? undefined
          : (...args: unknown[]) =>
              args.length === 1 && args[0] === 'at-rule(@scope)' && supportsScope,
    },
    configurable: true,
  })
}

const OLD_EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36 Edg/100.0.1185.29'
const NEW_EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'

describe('checkBrowserSupport', () => {
  it('能力足够（@scope 支持）→ ok，不因 UA 告警', () => {
    installEnv({ ua: '', supportsScope: true })
    expect(checkBrowserSupport().decision).toBe('ok')
  })

  it('能力不足 + Edge 100（Chromium 100）→ too-old（正判据，Edge 100 实机问题）', () => {
    installEnv({ ua: OLD_EDGE_UA, supportsScope: false })
    const r = checkBrowserSupport()
    expect(r.decision).toBe('too-old')
    if (r.decision === 'too-old') expect(r.info).toBe('Chromium 100')
  })

  it('能力不足 + 新版 Edge 125 → 不告警（反判据：新版用户不应被误报，按 ok 处理）', () => {
    installEnv({ ua: NEW_EDGE_UA, supportsScope: false })
    expect(checkBrowserSupport().decision).toBe('ok')
  })

  it('能力不足 + Chromium >= 118（虽有 UA 但能力异常）→ ok，不误报', () => {
    installEnv({ ua: NEW_EDGE_UA, supportsScope: false })
    expect(['unknown', 'ok']).toContain(checkBrowserSupport().decision)
  })

  it('Safari/Firefox 等非 Chromium UA + 能力不足 → 不误报', () => {
    installEnv({
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      supportsScope: false,
    })
    expect(checkBrowserSupport().decision).toBe('unknown')
  })

  it('连 CSS.supports 都没有的极老环境 → unknown，不误报', () => {
    installEnv({ ua: OLD_EDGE_UA, supportsScope: false, supportsFn: false })
    expect(checkBrowserSupport().decision).toBe('unknown')
  })
})

describe('常数基线', () => {
  it('Chromium 内核门槛 = 118（Astryx @scope：Chrome/Edge 118+，MDN BCD）', () => {
    expect(MIN_CHROMIUM_MAJOR).toBe(118)
  })
})

import { BROWSER_WARN_INIT_SCRIPT } from './browser-check'

describe('BROWSER_WARN_INIT_SCRIPT（SSR 输出的内联脚本）', () => {
  it('语法有效（new Function 能编译，旧内核也能执行）', () => {
    // 模板里是完整 IIFE；直接编译整段脚本体。
    expect(() => new Function(BROWSER_WARN_INIT_SCRIPT)).not.toThrow()
  })

  it.each([undefined, vi.fn((value: string) => value === 'at-rule(@scope)')])(
    '不因 UA 把支持 @scope 或无法进行能力检测的浏览器判为过旧',
    (supports) => {
      const listen = vi.fn()
      runInNewContext(BROWSER_WARN_INIT_SCRIPT, {
        CSS: { supports },
        navigator: { userAgent: OLD_EDGE_UA },
        document: {
          documentElement: { getAttribute: () => null, setAttribute: vi.fn() },
          addEventListener: listen,
        },
      })
      expect(listen).not.toHaveBeenCalled()
    },
  )

  it('不引用浏览器不存在的 API（只用到 document/CSS/navigator/localStorage）', () => {
    const body = BROWSER_WARN_INIT_SCRIPT
    for (const api of ['window.fetch', 'Element.prototype', 'IntersectionObserver']) {
      expect(body).not.toContain(api)
    }
  })
})
