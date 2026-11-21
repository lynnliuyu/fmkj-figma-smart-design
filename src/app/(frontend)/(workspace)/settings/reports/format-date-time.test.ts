import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('report time formatting', () => {
  it.each(['UTC', 'Asia/Shanghai'])('uses Shanghai time when the process is set to %s', (tz) => {
    const moduleUrl = new URL('./format-date-time.ts', import.meta.url).href
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { formatDateTime } from ${JSON.stringify(moduleUrl)};
         console.log(JSON.stringify({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
           label: formatDateTime('2026-11-21T20:22:00.000Z') }));`,
      ],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
    )
    expect(JSON.parse(result)).toEqual({ zone: tz, label: '11/22 04:22' })
  })
})
