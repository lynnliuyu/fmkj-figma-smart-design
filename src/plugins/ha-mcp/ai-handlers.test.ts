import { afterEach, describe, expect, it, vi } from 'vitest'

import { haMcpHandlers } from './ai-handlers'

/**
 * 这些测试用 mock fetch 验证「协议翻译」是否正确，不需要真的 HA 实例。
 * 真实 MCP 往返在改协议时另做手工验证（见 PR 说明）。
 */
describe('ha-mcp handlers', () => {
  afterEach(() => {
    delete process.env.HA_MCP_ENDPOINT
    vi.restoreAllMocks()
  })

  it('未配置时给出明确提示，不抛错', async () => {
    delete process.env.HA_MCP_ENDPOINT
    const r = await haMcpHandlers.ha_get_overview({}, {} as never)
    expect(r.summary).toBe('未配置 HA 连接')
    expect(JSON.stringify(r.result)).toContain('HA_MCP_ENDPOINT')
  })

  it('缺参数时直接拒绝，不走网络', async () => {
    process.env.HA_MCP_ENDPOINT = 'http://127.0.0.1:1'
    const spy = vi.spyOn(globalThis, 'fetch')
    const r = await haMcpHandlers.ha_search_entities({}, {} as never)
    expect(r.summary).toBe('缺少关键词')
    expect(spy).not.toHaveBeenCalled()
  })

  it('把 MCP 的 content[].text 转成摘要与结果', async () => {
    process.env.HA_MCP_ENDPOINT = 'http://127.0.0.1:1'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: '客厅吊灯 light.living_main 状态 on' }],
            isError: false,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const r = await haMcpHandlers.ha_search_entities({ query: '客厅吊灯' }, {} as never)
    expect(r.summary).toContain('客厅吊灯')
    expect(JSON.stringify(r.result)).toContain('light.living_main')
  })

  it('服务调用参数不全时拒绝', async () => {
    process.env.HA_MCP_ENDPOINT = 'http://127.0.0.1:1'
    const r = await haMcpHandlers.ha_call_service({ domain: 'light' }, {} as never)
    expect(r.summary).toBe('参数不全')
  })

  it('MCP 返回 isError 时把它当错误往上抛', async () => {
    process.env.HA_MCP_ENDPOINT = 'http://127.0.0.1:1'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '实体不存在' }], isError: true },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const r = await haMcpHandlers.ha_search_entities({ query: 'x' }, {} as never)
    expect(JSON.stringify(r.result)).toContain('实体不存在')
    expect(r.summary).toContain('返回错误')
  })
})
