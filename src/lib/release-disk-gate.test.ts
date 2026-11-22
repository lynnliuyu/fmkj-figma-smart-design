import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync(new URL('../../deploy/shadow-release.sh', import.meta.url), 'utf8')

// 执行实际 Bash 预检，用事故数据替换 df 输出。sudo 桩只记录调用。
function diskGate(freeKiB: number, minFreeGb = '') {
  const start = script.indexOf('# ── 预检 0')
  const end = script.indexOf('# ── 预检：清掉', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)

  return spawnSync(
    'bash',
    [
      '-c',
      `
        set -euo pipefail
        RELEASES=/test-only
        log() { printf '%s\n' "$*"; }
        die() { log "$*" >&2; exit 1; }
        df() { printf 'header\n/dev/test 0 0 %s 0%% /\n' "$TEST_FREE_KIB"; }
        sudo() { printf 'sudo %s\n' "$*"; }
        ${script.slice(start, end)}
      `,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, TEST_FREE_KIB: String(freeKiB), MIN_FREE_GB: minFreeGb },
    },
  )
}

describe('发布磁盘水位闸', () => {
  it.each([
    { free: 1_153_433, min: '', status: 1, label: '事故值 1.1 GB' },
    { free: 8_388_607, min: '', status: 1, label: '距下限差 1 KiB' },
    { free: 8_388_608, min: '', status: 0, label: '正好 8 GB' },
    { free: 20_971_520, min: '', status: 0, label: '20 GB' },
    { free: 1_153_433, min: '0', status: 1, label: '设置 0 不能放行' },
    { free: 1_153_433, min: '2', status: 1, label: '设置 2 不能放行' },
    { free: 9_437_184, min: '20', status: 1, label: '允许提高阈值' },
    { free: 0, min: '', status: 1, label: '空间耗尽' },
    { free: 1_153_433, min: 'invalid', status: 1, label: '拒绝无效阈值' },
  ])('$label', ({ free, min, status }) => {
    const result = diskGate(free, min)
    expect(result.status).toBe(status)
    expect(result.stdout.includes('sudo docker builder prune -f --keep-storage 2GB')).toBe(
      status === 0,
    )
  })

  it('中止时显示实际水位、下限和清理项', () => {
    const { stdout, stderr } = diskGate(1_153_433, '0')
    expect(stdout).toContain('可用 1153433 KiB / 要求 ≥8 GB')
    expect(stderr).toContain('当前：1 GB 可用（1126 MB）')
    expect(stderr).toContain('要求：≥ 8 GB')
    for (const item of [
      'docker builder prune',
      'disk-rotate.sh',
      'disk-maintenance.sh',
      'journalctl',
    ]) {
      expect(stderr).toContain(item)
    }
  })
})
