/** 合同共用的取值、默认内容和金额计算（服务端保存、编辑页、打印页使用同一套规则）。 */

export const CONTRACT_STATUSES = [
  { value: 'draft', label: '待签订' },
  { value: 'signed', label: '已签订' },
] as const
export type ContractStatus = (typeof CONTRACT_STATUSES)[number]['value']
export const isContractStatus = (v: unknown): v is ContractStatus => CONTRACT_STATUSES.some((s) => s.value === v)
export const contractStatusLabel = (v?: string | null) => CONTRACT_STATUSES.find((s) => s.value === v)?.label ?? '待签订'

export type PaymentTerm = { name: string; percent: number; received?: boolean | null }

/** 新合同的默认付款方式，生成后可以逐项修改。 */
export const DEFAULT_PAYMENTS: PaymentTerm[] = [
  { name: '首付款（签订合同时）', percent: 50 },
  { name: '进度款（设备进场时）', percent: 40 },
  { name: '尾款（验收合格后）', percent: 10 },
]
export const DEFAULT_DURATION_DAYS = 15
export const DEFAULT_WARRANTY_MONTHS = 12

/** 设置里没有填写合同条款时使用的默认条款。 */
export const DEFAULT_CONTRACT_TERMS = [
  '1. 乙方按附件《报价明细》提供智能家居设备，并负责安装、调试和使用培训。',
  '2. 甲方应保证现场具备安装条件（水电、网络、装修进度等）；因现场条件导致的延期，工期相应顺延。',
  '3. 设备品牌、型号以附件为准；如需变更，双方协商一致后另行确认，费用多退少补。',
  '4. 质保期内，非人为损坏的设备故障由乙方免费维修或更换；人为损坏、不可抗力及质保期外的维修按实际成本收费。',
  '5. 安装调试完成后，甲方应在 3 日内组织验收；逾期未验收且已实际使用的，视为验收合格。',
  '6. 本合同一式两份，甲乙双方各执一份，自双方签字（盖章）之日起生效。',
].join('\n')

const round2 = (n: number) => Math.round(n * 100) / 100

export const paymentPercentTotal = (payments: { percent?: number | null }[]) => round2(payments.reduce((s, p) => s + (p.percent ?? 0), 0))

/** 各期金额：按比例计算，最后一期补齐分位误差，保证合计等于合同金额。 */
export function paymentAmounts(amount: number, payments: { percent?: number | null }[]) {
  const amounts = payments.map((p) => round2((amount * (p.percent ?? 0)) / 100))
  if (amounts.length && Math.abs(paymentPercentTotal(payments) - 100) < 0.001) {
    const rest = amounts.slice(0, -1).reduce((s, n) => s + n, 0)
    amounts[amounts.length - 1] = round2(amount - rest)
  }
  return amounts
}

/** 金额大写，例如 68000 → 陆万捌仟元整，20.05 → 贰拾元零伍分。 */
export function rmbUpper(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return ''
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const unit = [['元', '万', '亿', '万亿'], ['', '拾', '佰', '仟']]
  const cents = Math.round(amount * 100)
  const jiao = Math.floor(cents / 10) % 10
  const fen = cents % 10
  let n = Math.floor(cents / 100)
  let int = ''
  for (let i = 0; i < unit[0].length && n > 0; i++) {
    let p = ''
    for (let j = 0; j < unit[1].length && n > 0; j++) {
      p = digit[n % 10] + unit[1][j] + p
      n = Math.floor(n / 10)
    }
    int = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + int
  }
  if (n > 0) return '' // 超出可表示范围，宁可不显示也不静默丢弃高位
  int = int.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零')
  const frac = (jiao ? `${digit[jiao]}角` : '') + (fen ? `${int && !jiao ? '零' : ''}${digit[fen]}分` : '')
  if (!int && !frac) return '零元整'
  return int + (frac || '整')
}

/** 北京时间的日期（YYYY-MM-DD）。 */
export const shanghaiDate = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })

/** 合同编号前缀：HT + 日期，例如 HT20261030；同一天按顺序编号 HT20261030-01、-02 … */
export const contractNumberPrefix = (d = new Date()) => `HT${shanghaiDate(d).replaceAll('-', '')}`

export const fmtLongDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }) : ''
