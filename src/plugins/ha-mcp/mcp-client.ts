/**
 * 极简 MCP 客户端（Streamable HTTP）。
 *
 * ha-mcp 是一个标准 MCP Server，通过 Home Assistant 的 webhook 暴露：
 *   https://<你的 HA 域名>/api/webhook/<webhook-id>
 * 或同网段直连：
 *   http://<ha-ip>:9584/private_<random>
 *
 * 我们只需要三个动作：initialize → tools/call → 读结果。
 * 不引入 @modelcontextprotocol/sdk —— 它带来的依赖体积（含 zod 全量）对一个
 * 「只调 6 个工具」的插件不划算，而协议本身只有几个 JSON-RPC 方法。
 *
 * ⚠️ 无状态说明：ha-mcp 的 Streamable HTTP 实现接受「单次 POST 完成一次
 * JSON-RPC 调用」，不强制 session。若某天它要求 session，请在 `initialize`
 * 里保存返回的 `Mcp-Session-Id` 头并在此后携带（代码里已留位置）。
 */

export type McpToolResult = {
  /** 拼接后的纯文本内容（MCP 的 content[].text） */
  text: string
  /** 原始结构化内容，便于需要时取 structuredContent */
  raw: unknown
  isError: boolean
}

export type HaMcpConfig = {
  /** 完整的 MCP endpoint，例如 https://ha.example.com/api/webhook/abc */
  endpoint: string
  /** 可选：若 HA 在反向代理后要求额外鉴权头 */
  headers?: Record<string, string>
  /** 超时（毫秒），默认 20 秒 —— HA 服务调用通常很快，卡住基本是网络问题 */
  timeoutMs?: number
}

let requestId = 0

/** 发一个 JSON-RPC 请求，返回 result；失败抛错 */
async function rpc(config: HaMcpConfig, method: string, params: unknown): Promise<unknown> {
  const timeout = config.timeoutMs ?? 20_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Streamable HTTP 要求客户端声明能接受 JSON 或 SSE
        Accept: 'application/json, text/event-stream',
        ...(config.headers ?? {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`MCP 请求失败：HTTP ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') ?? ''

    // SSE 形态：逐行读 data: 后拼出 JSON
    if (contentType.includes('text/event-stream')) {
      const text = await response.text()
      const payload = text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
        .pop()
      if (!payload) throw new Error('MCP 返回了空的 SSE 流')
      return parseRpc(payload)
    }

    return parseRpc(await response.text())
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`MCP 请求超时（${Math.round(timeout / 1000)} 秒）`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function parseRpc(body: string): unknown {
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch (cause) {
    throw new Error('MCP 返回的内容不是 JSON', { cause })
  }
  const envelope = data as { result?: unknown; error?: { message?: string; code?: number } }
  if (envelope.error) {
    throw new Error(`MCP 错误：${envelope.error.message ?? envelope.error.code ?? '未知'}`)
  }
  return envelope.result
}

/** 握手。多数 MCP Server 允许同一连接上直接 tools/call，但先握手更稳。 */
export async function initialize(config: HaMcpConfig): Promise<void> {
  await rpc(config, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'fanmeng-ha-mcp', version: '1.0.0' },
  })
}

/** 列工具（调试用；正常运行不需要） */
export async function listTools(config: HaMcpConfig): Promise<string[]> {
  const result = (await rpc(config, 'tools/list', {})) as {
    tools?: Array<{ name?: string }>
  } | null
  return (result?.tools ?? []).map((t) => t.name ?? '').filter(Boolean)
}

/** 调一个工具 */
export async function callTool(
  config: HaMcpConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const result = (await rpc(config, 'tools/call', { name, arguments: args })) as {
    content?: Array<{ type?: string; text?: string }>
    structuredContent?: unknown
    isError?: boolean
  } | null

  const text = (result?.content ?? [])
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n')
    .trim()

  return {
    text: text || '（没有返回文本内容）',
    raw: result?.structuredContent ?? result,
    isError: Boolean(result?.isError),
  }
}
