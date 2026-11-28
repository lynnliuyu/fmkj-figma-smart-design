const pad = (n) => (n < 10 ? '0' + n : String(n))

/** ¥12,345 / ¥12,345.50（整数不显示小数） */
function yuan(n, digits) {
  const v = Number(n) || 0
  const d = digits === undefined ? (Number.isInteger(v) ? 0 : 2) : digits
  const parts = Math.abs(v).toFixed(d).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (v < 0 ? '-¥' : '¥') + parts.join('.')
}

function date(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function dateTime(iso) {
  const day = date(iso)
  if (day === '—') return day
  const d = new Date(iso)
  return day + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function relTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前'
  return date(iso)
}

const quoteBadge = (status) => (status === 'accepted' ? 'badge-success' : status === 'sent' ? 'badge-warning' : '')
const contractBadge = (status) => (status === 'signed' ? 'badge-success' : 'badge-warning')

module.exports = { yuan, date, dateTime, relTime, quoteBadge, contractBadge, pad }
