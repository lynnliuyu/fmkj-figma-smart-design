import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

/**
 * 身份与自定义 tabBar：直接执行小程序源码（与 need-draft-page.test.ts 同一套 vm 方式），
 * 断言的是「第一次进选身份」「选择被记住」「两套导航」「业主不要求登录」这些可观察行为。
 */
const IDENTITY_KEY = 'fmkj_mp_identity'

function harness(storage = new Map<string, unknown>()) {
  const wx = {
    getStorageSync: (key: string) => storage.get(key) ?? '',
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: vi.fn(),
    switchTab: vi.fn(),
    navigateTo: vi.fn(),
  }
  const load = (path: string) => {
    let config: Record<string, any> = {}
    const mod = { exports: {} as Record<string, any> }
    const code = readFileSync(new URL(`../../../miniprogram/${path}`, import.meta.url), 'utf8')
    const component = { setData: (patch: object) => Object.assign(config.data, patch) }
    runInNewContext(code, {
      Page: (c: typeof config) => {
        config = { ...c, data: { ...(c.data ?? {}) }, setData: component.setData }
      },
      Component: (c: typeof config) => {
        config = {
          ...(c.methods ?? {}),
          data: { ...(c.data ?? {}) },
          setData: component.setData,
        }
      },
      App: (c: typeof config) => {
        config = { ...c, data: { ...(c.data ?? {}) } }
      },
      require: (id: string) => {
        if (id.endsWith('utils/identity')) {
          return runInNewContext(
            readFileSync(
              new URL('../../../miniprogram/utils/identity.js', import.meta.url),
              'utf8',
            ),
            { wx, module: {}, exports: {} },
          )
        }
        return {
          getToken: () => '',
          request: vi.fn(),
          toast: vi.fn(),
          captureLaunchTicket: vi.fn(),
          consumePendingWebLogin: vi.fn(),
          scanAndConfirmWebLogin: vi.fn(),
        }
      },
      wx,
      getCurrentPages: () => [],
      console,
      module: mod,
      exports: mod.exports,
    })
    return Object.keys(mod.exports).length ? mod.exports : config
  }
  return { wx, storage, load }
}

describe('小程序双身份', () => {
  it('身份只在两个合法值里记，默认未选', () => {
    const { storage, load } = harness()
    const identity = load('utils/identity.js')
    expect(identity.getIdentity()).toBe('')
    identity.setIdentity('owner')
    expect(storage.get(IDENTITY_KEY)).toBe('owner')
    expect(identity.isOwner()).toBe(true)
    identity.setIdentity('vendor')
    expect(identity.isOwner()).toBe(false)
    expect(() => identity.setIdentity('admin')).toThrow('INVALID_IDENTITY')
  })

  it('两套底部导航，业主四项、集成商五项', () => {
    const { load } = harness()
    const identity = load('utils/identity.js')
    expect(identity.tabsFor('owner').map((t: { text: string }) => t.text)).toEqual([
      '我的方案',
      '看清单',
      '找顾问',
      '我的',
    ])
    expect(identity.tabsFor('vendor').map((t: { text: string }) => t.text)).toEqual([
      '工作台',
      '项目',
      'AI 助手',
      '产品库',
      '我的',
    ])
    // 未选身份时按集成商渲染，避免业主菜单闪现在员工手机上。
    expect(identity.tabsFor('')).toEqual(identity.tabsFor('vendor'))
  })

  it('首次进入跳身份页；已选业主不要求登录；已选集成商仍需登录', async () => {
    const first = harness()
    const app = first.load('app.js')
    app.onLaunch({})
    expect(first.wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/identity/index' })

    // 入口页是员工工作台，业主停在 home 会被 requireLogin 踢到员工登录页，
    // 所以已选业主必须直接被带到业主首页。
    const owner = harness(new Map([[IDENTITY_KEY, 'owner']]))
    owner.load('app.js').onLaunch({})
    expect(owner.wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/plans/index' })

    const vendor = harness(new Map([[IDENTITY_KEY, 'vendor']]))
    vendor.load('app.js').onLaunch({})
    expect(vendor.wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' })
  })

  it('身份选择页记住选择并进入对应首页', () => {
    const { storage, wx, load } = harness()
    const page = load('pages/identity/index.js')
    page.choose({ currentTarget: { dataset: { identity: 'owner' } } })
    expect(storage.get(IDENTITY_KEY)).toBe('owner')
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/plans/index' })

    page.choose({ currentTarget: { dataset: { identity: 'vendor' } } })
    expect(storage.get(IDENTITY_KEY)).toBe('vendor')
    expect(wx.reLaunch).toHaveBeenLastCalledWith({ url: '/pages/login/index' })
  })

  it('自定义 tabBar 按身份渲染，未选身份时不显示', () => {
    const { load } = harness(new Map([[IDENTITY_KEY, 'owner']]))
    const bar = load('custom-tab-bar/index.js')
    bar.render()
    expect(bar.data.list.map((t: { text: string }) => t.text)).toEqual([
      '我的方案',
      '看清单',
      '找顾问',
      '我的',
    ])
    expect(bar.data.hidden).toBe(false)

    const none = harness()
    const hidden = none.load('custom-tab-bar/index.js')
    hidden.render()
    expect(hidden.data.hidden).toBe(true)
  })
})
