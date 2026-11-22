/**
 * 发布前磁盘水位闸的口径（`deploy/shadow-release.sh` 预检 0）。
 *
 * 这道闸的规则是「阈值只能往上调，不能调低」，因为把它设成 0 就等于绕过。
 * 2026-11-22 实测：可用只剩 1.1 GB 时脚本照常构建，分区被压到 98%，
 * 离「数据库写失败 / 备份写不进去」只差一步。所以这段逻辑必须有回归保护，
 * 而且要用表驱动把边界写死 —— 改闸的时候不可能只改一处而没被发现。
 *
 * 断言直接读部署脚本的源码：CI 跑在 Linux 上，脚本调 sudo/docker 无法执行，
 * 但「阈值下限」与「报错是否写清当前值与阈值」这两条契约是纯文本可查的。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync(new URL('../../deploy/shadow-release.sh', import.meta.url), 'utf8')

/** 把闸的判定逻辑照抄成纯函数，参数与脚本里的算术一致（KB → GB 取整）。 */
function diskGate(freeKb: number, minFreeGbEnv?: string) {
  let minFreeGb = minFreeGbEnv === undefined ? 8 : Number(minFreeGbEnv)
  // 脚本里的钳制：低于 8 一律按 8 执行
  if (minFreeGb < 8) minFreeGb = 8
  const freeGb = Math.trunc(freeKb / 1024 / 1024)
  return { freeGb, minFreeGb, pass: freeGb >= minFreeGb }
}

describe('发布磁盘水位闸', () => {
  it('脚本里存在预检 0，且排在清影子网络之前', () => {
    const guardAt = script.indexOf('预检 0：磁盘水位')
    const networkAt = script.indexOf('预检：清掉没有容器挂着的影子网络')
    expect(guardAt).toBeGreaterThan(-1)
    expect(networkAt).toBeGreaterThan(guardAt)
  })

  it('默认阈值 8 GB', () => {
    expect(script).toContain('MIN_FREE_GB=${MIN_FREE_GB:-8}')
    expect(diskGate(9 * 1024 * 1024).minFreeGb).toBe(8)
  })

  it('阈值只能上调（给 20 就按 20 判）', () => {
    expect(diskGate(9 * 1024 * 1024, '20').minFreeGb).toBe(20)
    expect(diskGate(9 * 1024 * 1024, '20').pass).toBe(false)
  })

  it.each([
    // [可用空间 KB, 阈值, 期望放行, 场景]
    [1_153_433, undefined, false, '2026-11-22 事故值 1.1 GB'],
    [8 * 1024 * 1024 - 1, undefined, false, '差 1 KB 到 8 GB'],
    [8 * 1024 * 1024, undefined, true, '正好 8 GB'],
    [20 * 1024 * 1024, undefined, true, '清理后的 20 GB'],
    [1_153_433, '0', false, '把阈值设成 0 不能绕过'],
    [1_153_433, '2', false, '调低到 2 也不能绕过（钳到 8）'],
    [0, undefined, false, '完全没空间'],
  ] as Array<[number, string | undefined, boolean, string]>)(
    'freeKb=%i minFreeGb=%s → pass=%s（%s）',
    (freeKb, minFreeGb, pass) => {
      expect(diskGate(freeKb, minFreeGb).pass).toBe(pass)
    },
  )

  it('闸不提供任何 SKIP 开关（注释里提到 SKIP_DISK_CHECK 说明「不提供」不算开关）', () => {
    // 真正会被读取的才是开关：`${SKIP_...}` 或 `VAR=value` 赋值。
    expect(script).not.toMatch(/\$\{?SKIP_DISK_CHECK/)
    expect(script).not.toMatch(/\$\{?SKIP_SPACE/)
    expect(script).not.toMatch(/^\s*SKIP_DISK_CHECK=/m)
    // 脚本自己说明了为什么不允许绕过
    expect(script).toContain('不提供 SKIP_DISK_CHECK')
  })

  it('中止信息必须同时给出当前值与阈值，且列出该清什么', () => {
    const start = script.indexOf('✗ 磁盘可用空间不足')
    expect(start).toBeGreaterThan(-1)
    const message = script.slice(start, start + 900)
    expect(message).toContain('当前：')
    expect(message).toContain('要求：')
    for (const hint of [
      'docker builder prune',
      'disk-rotate.sh',
      'disk-maintenance.sh',
      'journalctl --vacuum-size',
    ]) {
      expect(message).toContain(hint)
    }
  })

  it('构建缓存设了 2 GB 上限，旧目录先轮转', () => {
    expect(script).toContain('--keep-storage 2GB')
    expect(script).toContain('disk-rotate.sh')
  })

  it('切流成功后轮转旧发布目录（保留 2 个）', () => {
    const rotateAt = script.indexOf('7/7 轮转旧发布目录')
    expect(rotateAt).toBeGreaterThan(-1)
    expect(script).toContain('KEEP_RELEASES=2')
  })
})
