import { randomInt } from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'

import { APP_NAME } from '@/lib/brand'
import { hashToken } from '@/lib/mp/auth'
import { getPayloadClient } from '@/lib/payload'

export type OtpPurpose = 'register' | 'reset'

const OTP_TTL_MS = 10 * 60 * 1000
const OTP_COOLDOWN_MS = 60 * 1000

export function emailOtpConfigured(): boolean {
  return Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    (process.env.RESEND_API_KEY && process.env.SMTP_FROM),
  )
}

const otpHash = (purpose: OtpPurpose, email: string, code: string) =>
  hashToken(`email-otp:${purpose}:${email.toLowerCase()}:${code}`)

const clientTag = (purpose: OtpPurpose, email: string) =>
  `email-otp:${purpose}:${email.toLowerCase()}`

/** 签发并发送 6 位邮箱验证码（同一邮箱 60 秒内限发 1 次，10 分钟内有效）。 */
export async function issueAndSendEmailOtp(
  emailRaw: string,
  purpose: OtpPurpose,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: '请输入有效的邮箱地址' }
  }
  if (!emailOtpConfigured()) {
    return { ok: false, error: '服务器尚未配置发信邮箱（SMTP_HOST / SMTP_USER / SMTP_PASS）' }
  }

  const payload = await getPayloadClient()
  const userRes = await payload
    .find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  const exists = Boolean(userRes?.docs.length)

  if (purpose === 'register' && exists) {
    return { ok: false, error: '该邮箱已注册，请直接登录' }
  }
  if (purpose === 'reset' && !exists) {
    return { ok: false, error: '该邮箱尚未注册账号' }
  }

  const tag = clientTag(purpose, email)
  const recent = await payload
    .find({
      collection: 'mp-sessions',
      where: { and: [{ kind: { equals: 'bind' } }, { client: { equals: tag } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)

  const prev = recent?.docs[0]
  if (prev?.lastUsedAt && Date.now() - new Date(prev.lastUsedAt).getTime() < OTP_COOLDOWN_MS) {
    return { ok: false, error: '验证码发送过于频繁，请 60 秒后再试' }
  }

  const code = String(randomInt(100000, 1000000))
  const nowIso = new Date().toISOString()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // 清理该邮箱同用途的旧验证码
  await payload
    .delete({
      collection: 'mp-sessions',
      where: { and: [{ kind: { equals: 'bind' } }, { client: { equals: tag } }] },
      overrideAccess: true,
      depth: 0,
    })
    .catch(() => null)

  await payload.create({
    collection: 'mp-sessions',
    data: {
      tokenHash: otpHash(purpose, email, code),
      kind: 'bind',
      client: tag,
      expiresAt,
      lastUsedAt: nowIso,
    },
    overrideAccess: true,
    depth: 0,
  })

  const subject = `【${APP_NAME}】你的${purpose === 'register' ? '注册' : '重置密码'}验证码：${code}`
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;max-width:480px;margin:0 auto;padding:28px 24px;border:1px solid #e5e7eb;border-radius:12px;color:#111827;">
      <div style="font-size:16px;font-weight:600;margin-bottom:16px;">${APP_NAME} · 邮箱验证</div>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px;">
        你正在进行<strong>${purpose === 'register' ? '新账号注册' : '登录密码重置'}</strong>，请在页面输入以下 6 位验证码：
      </p>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;padding:14px 16px;background:#f3f4f6;border-radius:8px;color:#111827;">
        ${code}
      </div>
      <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:16px 0 0;">
        验证码 10 分钟内有效，如非本人操作请忽略本邮件。
      </p>
    </div>
  `.trim()

  const sent = await sendMail({ to: email, subject, html, text: `${subject}（10分钟内有效）` })
  if (!sent.ok) {
    return { ok: false, error: sent.error }
  }
  return { ok: true }
}

/** 校验并消费 6 位邮箱验证码（一次性有效）。 */
export async function verifyAndConsumeEmailOtp(
  emailRaw: string,
  purpose: OtpPurpose,
  codeRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase()
  const code = codeRaw.trim()
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: '请输入 6 位数字邮箱验证码' }
  }
  const payload = await getPayloadClient()
  const found = await payload
    .find({
      collection: 'mp-sessions',
      where: {
        and: [
          { tokenHash: { equals: otpHash(purpose, email, code) } },
          { kind: { equals: 'bind' } },
          { client: { equals: clientTag(purpose, email) } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)

  const doc = found?.docs[0]
  if (!doc) {
    return { ok: false, error: '验证码不正确，请核对后重试' }
  }
  await payload
    .delete({ collection: 'mp-sessions', id: doc.id, overrideAccess: true, depth: 0 })
    .catch(() => null)
  if (new Date(doc.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: '验证码已过期，请重新发送' }
  }
  return { ok: true }
}

async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.RESEND_API_KEY && process.env.SMTP_FROM) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM,
          to: [to],
          subject,
          html,
          text,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return { ok: false, error: '邮件服务发送失败，请稍后重试' }
      return { ok: true }
    } catch {
      return { ok: false, error: '连接邮件服务超时，请稍后重试' }
    }
  }

  const host = process.env.SMTP_HOST?.trim() ?? ''
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER?.trim() ?? ''
  const pass = process.env.SMTP_PASS ?? ''
  const fromAddr = process.env.SMTP_FROM?.trim() || user

  if (!host || !user || !pass) {
    return { ok: false, error: '未配置 SMTP 邮箱参数' }
  }

  return sendViaSmtp({ host, port, user, pass, fromAddr, to, subject, html })
}

/** 轻量原生 SMTP 发信（支持 465 SSL/TLS 直连，兼容腾讯企业邮、QQ邮箱、阿里云邮、163、网易企业邮等） */
function sendViaSmtp({
  host,
  port,
  user,
  pass,
  fromAddr,
  to,
  subject,
  html,
}: {
  host: string
  port: number
  user: string
  pass: string
  fromAddr: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const useTls = port === 465
    const socket: net.Socket | tls.TLSSocket = useTls
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
      : net.connect({ host, port })

    let settled = false
    const finish = (res: { ok: true } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {}
      resolve(res)
    }

    socket.setTimeout(12000, () => finish({ ok: false, error: '连接邮件服务器超时' }))
    socket.on('error', () => finish({ ok: false, error: '无法连接 SMTP 邮件服务器，请检查配置' }))

    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
    const mime = [
      `From: "=?UTF-8?B?${b64(APP_NAME)}?=" <${fromAddr}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html),
      '',
      '.',
    ].join('\r\n')

    const steps: Array<{ expect: string; send: string | null }> = [
      { expect: '220', send: `EHLO fmkj.local` },
      { expect: '250', send: 'AUTH LOGIN' },
      { expect: '334', send: b64(user) },
      { expect: '334', send: b64(pass) },
      { expect: '235', send: `MAIL FROM:<${fromAddr}>` },
      { expect: '250', send: `RCPT TO:<${to}>` },
      { expect: '250', send: 'DATA' },
      { expect: '354', send: mime },
      { expect: '250', send: 'QUIT' },
    ]

    let stepIdx = 0
    let buffer = ''

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\r\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.length < 3) continue
        // 多行响应如 250-xxx 继续等待最后一行 250 xxx
        if (line[3] === '-') continue
        const step = steps[stepIdx]
        if (!step) {
          finish({ ok: true })
          return
        }
        if (!line.startsWith(step.expect)) {
          finish({
            ok: false,
            error: `发信失败（SMTP ${line.slice(0, 3)}），请检查邮箱授权码与发信配置`,
          })
          return
        }
        stepIdx += 1
        if (step.send !== null) {
          socket.write(`${step.send}\r\n`)
        }
        if (stepIdx >= steps.length) {
          finish({ ok: true })
          return
        }
      }
    })
  })
}
