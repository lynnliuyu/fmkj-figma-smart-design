export function formatDateTime(iso: string) {
  if (!iso || iso.startsWith('1970-')) return '暂无记录'
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
