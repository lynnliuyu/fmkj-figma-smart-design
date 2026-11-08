import { getCompanyInfo, type CompanyInfo } from '@/lib/cached-data'
import { PLUGINS } from '@/plugins'
import { getPluginFlags, type PluginFlags } from '@/plugins/state'

import { MINIMAL_STYLE } from './minimal'
import type { DocKind, DocLayout, DocStyle } from './types'

/** 每类文档的版式（内容怎么排），风格（长什么样）对所有文档通用。 */
export const DOC_KINDS: Record<
  DocKind,
  { label: string; orientation: 'portrait' | 'landscape'; layouts: DocLayout[] }
> = {
  quote: {
    label: '报价单',
    orientation: 'portrait',
    layouts: [
      { value: 'area', label: '分区版', description: '按楼层、房间列出点位图和设备，最后整单汇总' },
      { value: 'standard', label: '标准版', description: '一张明细表，附各层点位图' },
      { value: 'detailed', label: '图文版', description: '按类别排列产品卡片，带产品图和品牌' },
      { value: 'compact', label: '精简版', description: '紧凑表格，一两页打完' },
      {
        value: 'system',
        label: '按系统版',
        description: '按照明、安防、网络等系统分组列设备，附各系统小计与占比',
      },
      {
        value: 'budget',
        label: '预算概览',
        description: '一页看懂总价：楼层与系统小计、付款节点，不列型号',
      },
    ],
  },
  plans: {
    label: '点位图',
    orientation: 'landscape',
    layouts: [
      { value: 'symbol', label: '设备图标', description: '每张图纸一页，设备图标 + 代号 + 图例' },
      { value: 'product', label: '产品图', description: '点位显示产品图，图例列出型号' },
      { value: 'clean', label: '大图', description: '只放图纸和点位，图例压缩到页脚' },
    ],
  },
  contract: {
    label: '合同',
    orientation: 'portrait',
    layouts: [
      { value: 'full', label: '含报价附件', description: '合同正文 + 附件《报价明细》' },
      { value: 'brief', label: '仅正文', description: '只打印合同正文' },
      {
        value: 'formal',
        label: '正式版',
        description: '封面 + 「第 X 条」正文 + 签署页 + 附件《报价明细》',
      },
      {
        value: 'confirm',
        label: '订单确认书',
        description: '单页确认金额、付款与工期，适合小型项目',
      },
    ],
  },
  checklist: {
    label: '点位交底清单',
    orientation: 'portrait',
    layouts: [
      { value: 'room', label: '按房间', description: '按楼层、房间逐点列出，方便现场逐间安装' },
      { value: 'type', label: '按设备', description: '按设备类型列出，方便备货和分工' },
      { value: 'sheet', label: '按图纸', description: '每张图纸先放点位图，再列该图点位' },
    ],
  },
}

export const DOC_KIND_LIST = Object.keys(DOC_KINDS) as DocKind[]
export const isDocKind = (v: unknown): v is DocKind => DOC_KIND_LIST.includes(v as DocKind)

/** 当前可用的风格：核心的「简约」+ 已启用插件提供的风格。 */
export function availableStyles(flags: PluginFlags): DocStyle[] {
  return [MINIMAL_STYLE, ...PLUGINS.filter((p) => flags[p.id]).flatMap((p) => p.docStyles ?? [])]
}

/** 已安装的全部风格（不论插件是否开启），用于校验和保存默认值。 */
export function allStyles(): DocStyle[] {
  return [MINIMAL_STYLE, ...PLUGINS.flatMap((p) => p.docStyles ?? [])]
}

export type DocSetup = {
  kind: DocKind
  style: DocStyle
  layout: string
  styles: DocStyle[]
  layouts: DocLayout[]
  company: CompanyInfo
  flags: PluginFlags
}

/** 打印页确定风格和版式：网址参数 → 设置里的默认值 → 第一个可用项。 */
export async function resolveDocSetup(
  kind: DocKind,
  params: { style?: string; layout?: string },
  userId?: string | number | null,
): Promise<DocSetup> {
  const [company, flags] = await Promise.all([getCompanyInfo(userId), getPluginFlags(userId)])
  const styles = availableStyles(flags)
  const layouts = DOC_KINDS[kind].layouts
  const defaults = company.documentDefaults[kind] ?? {}
  const style =
    styles.find((s) => s.id === params.style) ??
    styles.find((s) => s.id === defaults.style) ??
    MINIMAL_STYLE
  const layout = (
    layouts.find((l) => l.value === params.layout) ??
    layouts.find((l) => l.value === defaults.layout) ??
    layouts[0]
  ).value
  return { kind, style, layout, styles, layouts, company, flags }
}

/** 打印工具条里的「版式」「风格」切换项。 */
export function docToolbarGroups(
  setup: DocSetup,
  href: (patch: { style?: string; layout?: string }) => string,
) {
  return [
    ...(setup.layouts.length > 1
      ? [
          {
            label: '版式',
            value: setup.layout,
            options: setup.layouts.map((l) => ({
              value: l.value,
              label: l.label,
              href: href({ layout: l.value }),
            })),
          },
        ]
      : []),
    ...(setup.styles.length > 1
      ? [
          {
            label: '风格',
            value: setup.style.id,
            options: setup.styles.map((s) => ({
              value: s.id,
              label: s.name,
              href: href({ style: s.id }),
            })),
          },
        ]
      : []),
  ]
}
