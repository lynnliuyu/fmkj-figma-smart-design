import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

/**
 * 身份与自定义 tabBar：直接执行小程序源码（与 need-draft-page.test.ts 同一套 vm 方式），
 * 断言的是「第一次进选身份」「选择被记住」「两套导航」「业主不要求登录」这些可观察行为。
 */
const IDENTITY_KEY = 'fmkj_mp_identity'

function harness(storage = new Map<string, unknown>(), route = '') {
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
      getCurrentPages: () => (route ? [{ route }] : []),
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

/**
 * 界面级断言：前两轮都漏掉 N1（业主页没有底部导航），因为测试只调 page.choose()、
 * 从不检查 WXML 绑定与「业主页是否真的能互相到达」。这两条直接读模板与路由表。
 */
describe('界面绑定与业主侧可达性', () => {
  const read = (path: string) =>
    readFileSync(new URL(`../../../miniprogram/${path}`, import.meta.url), 'utf8')

  it('身份页每张卡片都绑定了 choose，且 data-identity 合法', () => {
    const wxml = read('pages/identity/index.wxml')
    // 抓出每个带 data-identity 的开始标签，逐张断言 bindtap 存在。
    const tags = wxml.match(/<view\b[^>]*data-identity="[^"]+"[^>]*>/g) ?? []
    expect(tags.length).toBe(2)
    for (const tag of tags) {
      expect(tag).toMatch(/data-identity="(owner|vendor)"/)
      expect(tag).toContain('bindtap="choose"')
    }
  })

  it('业主四项导航在业主三个页面都能到达（页面内导航覆盖全部 pagePath）', () => {
    const app = JSON.parse(read('app.json'))
    const nativeList = new Set<string>(app.tabBar.list.map((t: { pagePath: string }) => t.pagePath))
    const ownerTabs: { pagePath: string }[] = (() => {
      const { tabsFor } = harness().load('utils/identity.js')
      return tabsFor('owner')
    })()
    expect(ownerTabs).toHaveLength(4)

    for (const tab of ownerTabs) {
      // 微信只在 tabBar.list 内注入原生 tabBar；不在名单里的页面必须有页面内导航。
      if (nativeList.has(tab.pagePath)) continue
      const wxml = read(`${tab.pagePath}.wxml`)
      expect(wxml, `${tab.pagePath} 缺少页面内导航`).toContain('<owner-tabbar')
      const json = JSON.parse(read(`${tab.pagePath}.json`))
      expect(json.usingComponents?.['owner-tabbar']).toBe('/components/owner-tabbar/index')
    }
  })

  it('业主页面内导航能跳到四个业主页，且当前项高亮正确', () => {
    const bar = harness(new Map(), 'pages/advisor/index').load('components/owner-tabbar/index.js')
    bar.render()
    expect(bar.data.list.map((t: { pagePath: string }) => t.pagePath)).toEqual([
      'pages/plans/index',
      'pages/lists/index',
      'pages/advisor/index',
      'pages/mine/index',
    ])
    expect(bar.data.selected).toBe(2)
  })
})

/**
 * 身份切换回归（#236 复验发现，main 上也复现）：
 * 「我的」→「切换身份」如果只是无参 reLaunch 到身份页，身份页 onLoad 见已存身份
 * 会立刻把人送回原首页，用户永远换不了身份。
 * 这里断言「手动切换带参数、且带参数时不被自动跳回」，同时守住冷启动规则不变。
 */
describe('身份切换不会被自动跳回', () => {
  it('「我的」→ 切换身份 必须带 switch=1', () => {
    const { wx, load } = harness(new Map([[IDENTITY_KEY, 'owner']]))
    const page = load('pages/mine/index.js')
    page.switchIdentity()
    expect(wx.reLaunch).toHaveBeenCalledTimes(1)
    const url = wx.reLaunch.mock.calls[0]![0].url as string
    expect(url).toContain('/pages/identity/index')
    expect(url).toContain('switch=1')
  })

  it('手动切换进入身份页时停在原地，旧身份不被改写', () => {
    const storage = new Map<string, unknown>([[IDENTITY_KEY, 'owner']])
    const { wx, load } = harness(storage)
    const page = load('pages/identity/index.js')
    page.onLoad({ switch: '1' })
    expect(wx.reLaunch).not.toHaveBeenCalled()
    expect(storage.get(IDENTITY_KEY)).toBe('owner')
  })

  it('冷启动进入身份页仍按已存身份分流（业主→业主首页）', () => {
    const storage = new Map<string, unknown>([[IDENTITY_KEY, 'owner']])
    const { wx, load } = harness(storage)
    const page = load('pages/identity/index.js')
    page.onLoad({})
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: '/pages/plans/index' })
  })

  it('手动切换后选择集成商：写 vendor，无员工令牌则进登录页', () => {
    const storage = new Map<string, unknown>([[IDENTITY_KEY, 'owner']])
    const { wx, load } = harness(storage)
    const page = load('pages/identity/index.js')
    page.onLoad({ switch: '1' })
    page.choose({ currentTarget: { dataset: { identity: 'vendor' } } })
    expect(storage.get(IDENTITY_KEY)).toBe('vendor')
    expect(wx.reLaunch).toHaveBeenLastCalledWith({ url: '/pages/login/index' })
  })

  it('手动切换后选择业主：写 owner 并进业主首页', () => {
    const storage = new Map<string, unknown>([[IDENTITY_KEY, 'vendor']])
    const { wx, load } = harness(storage)
    const page = load('pages/identity/index.js')
    page.onLoad({ switch: '1' })
    page.choose({ currentTarget: { dataset: { identity: 'owner' } } })
    expect(storage.get(IDENTITY_KEY)).toBe('owner')
    expect(wx.reLaunch).toHaveBeenLastCalledWith({ url: '/pages/plans/index' })
  })
})
