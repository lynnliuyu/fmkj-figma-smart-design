/**
 * CAD 预览支持的输入格式（issue #178）。
 *
 * DXF：MIT 链路，可解析、可编辑、可保存副本。
 * DWG：上游解析器是 libredwg（GPL-3.0）或商业授权的 dwg-converter；本项目不引入 GPL，
 * 也不购买商业授权，因此明确不在开放范围内。
 */
export const CAD_SUPPORTED_INPUTS = ['.dxf'] as const
export const CAD_BLOCKED_INPUTS = ['.dwg'] as const

export function isSupportedCadFile(name: string) {
  return name.toLowerCase().endsWith('.dxf')
}
