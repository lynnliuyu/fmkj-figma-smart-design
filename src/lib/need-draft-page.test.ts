import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const storageKey = 'fmkj_need_draft_v2'
const ticket = 'test-ticket'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

type Reply = {
  token?: string
  revision?: string
  answers?: object
  steps?: object[]
  structured?: object
  projectId?: string
}
type RequestOptions = { method?: string; data?: { revision?: string; answers?: object } }

function setup(
  handler: (path: string, opts: RequestOptions) => Reply | Promise<Reply> = () => ({}),
) {
  const storage = new Map<string, unknown>()
  const request = vi.fn(async (path: string, opts: RequestOptions) => {
    if (path.endsWith('/catalog')) return { steps: [] }
    if (path === '/need-leads' && !opts.method) return { token: ticket }
    return handler(path, opts)
  })
  const navigate = vi.fn((options: { url: string; complete: () => void }) => options.complete())
  const toast = vi.fn()
  function load(name: 'need' | 'need-result') {
    let page: Record<string, any> = {}
    const code = readFileSync(
      new URL(`../../miniprogram/pages/${name}/index.js`, import.meta.url),
      'utf8',
    )
    runInNewContext(code, {
      Page: (config: typeof page) => {
        page = { ...config, setData: (patch: object) => Object.assign(page.data, patch) }
      },
      require: () => ({ request, toast }),
      clearTimeout,
      setTimeout,
      wx: {
        getStorageSync: (key: string) => structuredClone(storage.get(key)),
        setStorageSync: (key: string, data: unknown) => storage.set(key, structuredClone(data)),
        navigateTo: navigate,
      },
    })
    return page
  }
  return { load, request, navigate, storage }
}

const failed = (message: string, code = 'NETWORK') => Object.assign(new Error(message), { code })

describe('need draft pages', () => {
  it('waits for the in-flight save and then confirms edits made during it before opening the result', async () => {
    const first = deferred<Reply>()
    const next = deferred<Reply>()
    const respond = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise)
    const { load, request, navigate } = setup(respond)
    const page = load('need')
    page.onLoad()
    page.setAnswer('sceneCards', ['security'])
    const save = page.save()
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
    page.setAnswer('sceneCards', ['security', 'curtain'])
    const opening = page.openResult()
    expect(navigate).not.toHaveBeenCalled()
    first.resolve({ revision: 'r1' })
    await save
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
    expect(request.mock.lastCall?.[1].data).toMatchObject({
      token: ticket,
      revision: 'r1',
      answers: { sceneCards: ['security', 'curtain'] },
    })
    expect(navigate).not.toHaveBeenCalled()
    next.resolve({ revision: 'r2' })
    await opening
    expect(navigate.mock.lastCall?.[0].url).toContain('&revision=r2')
    page.onUnload()
  })

  it('reopens with the exact unacknowledged write and retains the newer local answers', async () => {
    const first = deferred<Reply>()
    const respond = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ revision: 'r1' })
      .mockResolvedValueOnce({ revision: 'r2' })
    const { load, request, navigate } = setup(respond)
    const page = load('need')
    page.onLoad()
    page.setAnswer('sceneCards', ['security'])
    const save = page.save()
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1))
    page.setAnswer('sceneCards', ['security', 'curtain'])
    page.onUnload()
    first.resolve({ revision: 'r1' })
    await save

    const reopened = load('need')
    reopened.onLoad()
    expect(reopened.data.answers.sceneCards).toEqual(['security', 'curtain'])
    await reopened.openResult()
    const writes = request.mock.calls.filter(([, opts]) => opts.method === 'POST')
    expect(writes[1]).toEqual(writes[0])
    expect(writes[2][1].data).toMatchObject({
      revision: 'r1',
      answers: { sceneCards: ['security', 'curtain'] },
    })
    expect(navigate.mock.lastCall?.[0].url).toContain('&revision=r2')
    reopened.onUnload()
  })

  it.each(['NETWORK', 'RATE_LIMITED'])(
    'keeps %s failures visible and permits a manual retry',
    async (code) => {
      const respond = vi
        .fn()
        .mockRejectedValueOnce(failed('稍后重试', code))
        .mockResolvedValueOnce({ revision: 'r1' })
      const { load, navigate, storage } = setup(respond)
      const page = load('need')
      page.onLoad()
      page.setAnswer('sceneCards', ['curtain'])
      await page.openResult()
      expect(page.data.saveFailed).toBe(true)
      expect(page.data.saveMessage).toBe('稍后重试')
      expect(navigate).not.toHaveBeenCalled()
      expect(storage.get(storageKey)).toMatchObject({ answers: { sceneCards: ['curtain'] } })
      await page.openResult()
      expect(navigate.mock.lastCall?.[0].url).toContain('&revision=r1')
      expect(respond).toHaveBeenCalledTimes(2)
      page.onUnload()
    },
  )

  it('does not replace local edits with a late resume response', async () => {
    const remote = deferred<Reply>()
    const { load, storage } = setup(() => remote.promise)
    storage.set('fmkj_need_token', ticket)
    const page = load('need')
    page.onLoad()
    page.setAnswer('sceneCards', ['curtain'])
    remote.resolve({ revision: 'r1', answers: { sceneCards: ['security'] } })
    await page._restoring
    expect(page.data.answers.sceneCards).toEqual(['curtain'])
    expect(page.isSaved()).toBe(false)
    page.onUnload()
  })

  it('clears a stale estimate and sends the confirmed revision on submit', async () => {
    const { load, request } = setup((path) => {
      if (path.endsWith('/submit')) throw failed('答案已更新', 'DRAFT_CHANGED')
      return { structured: { house: {} } }
    })
    const page = load('need-result')
    await page.onLoad({ token: ticket, revision: 'r1' })
    expect(page.data.result).not.toBeNull()
    await page.submit()
    expect(request.mock.lastCall?.[1].data).toMatchObject({ revision: 'r1' })
    expect(page.data.result).toBeNull()
    expect(page.data.needsSave).toBe(true)
  })
})
