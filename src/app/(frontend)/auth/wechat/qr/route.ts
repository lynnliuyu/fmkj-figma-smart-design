import { randomBytes } from 'node:crypto'

import { relId } from '@/lib/access'
import { appAuth } from '@/lib/app-auth'
import { hashToken, issueToken, loadActiveUser, wechatConfigured } from '@/lib/mp/auth'
import { getPayloadClient } from '@/lib/payload'
import { renderQrSvgDataUrl } from '@/lib/qr-svg'
import { safeRedirectPath } from '@/lib/safe-redirect'

const QR_TTL_MS = 3 * 60 * 1000

const QR_RATE_WINDOW_MS = 60 * 1000
const QR_RATE_MAX = 20
const qrRateMap = new Map<string, { count: number; resetAt: number }>()

function checkQrRateLimit(ip: string): boolean {
  const now = Date.now()
  if (qrRateMap.size > 500) {
    for (const [k, v] of qrRateMap) {
      if (v.resetAt < now) qrRateMap.delete(k)
    }
  }
  const cur = qrRateMap.get(ip)
  if (!cur || cur.resetAt < now) {
    qrRateMap.set(ip, { count: 1, resetAt: now + QR_RATE_WINDOW_MS })
    return true
  }
  if (cur.count >= QR_RATE_MAX) return false
  cur.count += 1
  return true
}

/** 尝试调用微信官方 getwxacodeunlimit 生成小程序码；若未配置或小程序尚未发布正式版则返回 null，自动降级为标准 QR 码。 */
async function tryCreateWxacodeDataUrl(
  scene: string,
  requestedEnv?: string,
): Promise<string | null> {
  if (!wechatConfigured()) return null
  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'client_credential',
      appid: process.env.WECHAT_MP_APPID!,
      secret: process.env.WECHAT_MP_SECRET!,
    })
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?${tokenParams.toString()}`,
      {
        signal: AbortSignal.timeout(5000),
      },
    )
    const tokenJson = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null
    if (!tokenJson?.access_token) return null

    const rawEnv = (requestedEnv || process.env.WECHAT_MP_ENV_VERSION || '').trim()
    const envVersion = rawEnv === 'trial' || rawEnv === 'develop' ? rawEnv : 'release'
    const codeRes = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(tokenJson.access_token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          page: 'pages/mine/index',
          check_path: false,
          env_version: envVersion,
          width: 280,
        }),
        signal: AbortSignal.timeout(6000),
      },
    )
    const contentType = codeRes.headers.get('content-type') ?? ''
    if (!codeRes.ok || contentType.includes('application/json')) return null
    const buf = Buffer.from(await codeRes.arrayBuffer())
    if (buf.length < 200) return null
    return `data:${contentType || 'image/png'};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * 生成电脑网页端扫码登录二维码票据（3 分钟有效）。
 * ticket 固定 24 位（满足微信 getwxacodeunlimit scene <= 32 位的限制）。
 */
export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'local'
  if (!checkQrRateLimit(ip)) {
    return Response.json({ ok: false, error: '生成二维码太频繁，请稍后再试' }, { status: 429 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    redirectTo?: string
    preferMode?: 'wxacode' | 'qrcode' | 'trial'
  }
  const redirectTo = safeRedirectPath(body.redirectTo, '/projects')

  const ticket = randomBytes(18).toString('base64url') // 24 chars
  const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString()
  const payload = await getPayloadClient()

  await payload.create({
    collection: 'mp-sessions',
    data: {
      tokenHash: hashToken(ticket),
      kind: 'web-ticket',
      redirect: redirectTo,
      client: 'qr-pending',
      expiresAt,
      lastUsedAt: new Date().toISOString(),
    },
    overrideAccess: true,
    depth: 0,
  })
  void payload
    .delete({
      collection: 'mp-sessions',
      where: { expiresAt: { less_than: new Date().toISOString() } },
      overrideAccess: true,
      depth: 0,
    })
    .catch(() => null)

  const wxacode =
    body.preferMode === 'qrcode'
      ? null
      : await tryCreateWxacodeDataUrl(ticket, body.preferMode === 'trial' ? 'trial' : undefined)
  const qrImage = wxacode ?? renderQrSvgDataUrl(`fmkj-login:${ticket}`)

  return Response.json({
    ok: true,
    ticket,
    qrImage,
    mode: wxacode ? (body.preferMode === 'trial' ? 'trial' : 'wxacode') : 'qrcode',
    expiresAt,
  })
}

/**
 * 电脑端轮询二维码扫码状态：
 * - pending：等待手机端扫码确认；
 * - confirmed：手机小程序已确认授权 → 消费票据并写入 mp-web-session Cookie，返回跳转地址；
 * - expired：票据不存在或已过期。
 */
export async function GET(request: Request) {
  const ticket = new URL(request.url).searchParams.get('ticket')?.trim() ?? ''
  if (ticket.length < 20 || ticket.length > 60) {
    return Response.json({ ok: true, status: 'expired' })
  }

  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'mp-sessions',
    where: {
      and: [{ tokenHash: { equals: hashToken(ticket) } }, { kind: { equals: 'web-ticket' } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = docs[0]
  if (!doc) return Response.json({ ok: true, status: 'expired' })

  if (new Date(doc.expiresAt).getTime() < Date.now()) {
    await payload
      .delete({ collection: 'mp-sessions', id: doc.id, overrideAccess: true, depth: 0 })
      .catch(() => null)
    return Response.json({ ok: true, status: 'expired' })
  }

  if (doc.client === 'qr-confirmed' && relId(doc.user)) {
    const user = await loadActiveUser(relId(doc.user))
    await payload
      .delete({ collection: 'mp-sessions', id: doc.id, overrideAccess: true, depth: 0 })
      .catch(() => null)
    if (!user) return Response.json({ ok: false, status: 'expired', error: '该账号已停用' })

    const { token: webToken, expiresAt } = await issueToken('web', {
      userId: String(user.id),
      client: 'mp-qr-web',
    })
    await appAuth.startMpWebSession(webToken, expiresAt)
    return Response.json({
      ok: true,
      status: 'confirmed',
      redirectTo: safeRedirectPath(doc.redirect, '/projects'),
    })
  }

  return Response.json({ ok: true, status: 'pending' })
}
