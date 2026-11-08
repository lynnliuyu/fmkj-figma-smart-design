import type { Config, Plugin } from 'payload'

/**
 * DWG → PNG 户型图转换插件。
 *
 * 转换本身依赖 CADCraft CLI、Poppler 等原生工具，不在本应用里运行，而是交给外部转换服务。
 * 转换服务约定：
 *   POST {endpoint}/convert   multipart/form-data，字段 file 为 DWG 文件
 *   Header: Authorization: Bearer {token}（可选）
 *   成功：200，Content-Type: image/png，响应体为 PNG
 *   失败：非 2xx，JSON { error: string }
 *
 * 未配置 endpoint 时插件处于停用状态，前端入口自动隐藏，其余功能不受影响。
 */
export type DwgConverterOptions = {
  endpoint?: string
  token?: string
  /** 单个 DWG 最大字节数，默认 50MB */
  maxBytes?: number
  /** 等待转换的最长时间，默认 120 秒 */
  timeoutMs?: number
}

export type DwgConverterSettings = Required<Pick<DwgConverterOptions, 'maxBytes' | 'timeoutMs'>> & {
  enabled: boolean
  endpoint: string
  token: string
}

export const dwgConverterPlugin =
  (options: DwgConverterOptions = {}): Plugin =>
  (config: Config): Config => {
    const endpoint = (options.endpoint ?? '').trim().replace(/\/+$/, '')
    const settings: DwgConverterSettings = {
      enabled: Boolean(endpoint),
      endpoint,
      token: options.token ?? '',
      maxBytes: options.maxBytes ?? 50 * 1024 * 1024,
      timeoutMs: options.timeoutMs ?? 120_000,
    }
    return { ...config, custom: { ...config.custom, dwgConverter: settings } }
  }

export function getDwgSettings(config: {
  custom?: Record<string, unknown>
}): DwgConverterSettings | null {
  const s = config.custom?.dwgConverter as DwgConverterSettings | undefined
  return s?.enabled ? s : null
}

export class DwgConvertError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

/** 调用外部转换服务，返回 PNG 二进制；失败时抛出带中文提示的 DwgConvertError。 */
export async function convertDwg(settings: DwgConverterSettings, file: File): Promise<Buffer> {
  const form = new FormData()
  form.append('file', file, file.name)
  let res: Response
  try {
    res = await fetch(`${settings.endpoint}/convert`, {
      method: 'POST',
      body: form,
      headers: settings.token ? { Authorization: `Bearer ${settings.token}` } : undefined,
      signal: AbortSignal.timeout(settings.timeoutMs),
    })
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError')
      throw new DwgConvertError('转换超时，请简化图纸后重试', 504)
    throw new DwgConvertError('转换服务暂时无法连接，请稍后重试', 502)
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new DwgConvertError(
      detail?.error ? `转换失败：${detail.error}` : '转换失败，请确认文件是有效的 DWG',
      502,
    )
  }
  if (!res.headers.get('content-type')?.includes('image/png'))
    throw new DwgConvertError('转换服务返回的不是 PNG 图片', 502)
  return Buffer.from(await res.arrayBuffer())
}
