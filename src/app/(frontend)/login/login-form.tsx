'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import {
  AlertCircle,
  CheckCircle2,
  Gift,
  KeyRound,
  Loader2,
  LogIn,
  Mail,
  Phone,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const LOGIN_METHOD_KEY = 'fmkj-login-method'
const rememberMethod = (method: 'wechat' | 'password') => {
  try {
    window.localStorage.setItem(LOGIN_METHOD_KEY, method)
  } catch {}
}

/**
 * 登录表单。qrAvailable 由服务端判断（见 qrLoginAvailable）：只有小程序连接的那台服务器才显示扫码登录；
 * 其他环境（Figma Make 预览、Figma 托管站点、本地开发）直接显示邮箱密码表单。
 */
export function LoginForm({
  redirectTo,
  qrAvailable,
  otpRequired = false,
  previewDemo = false,
  initialMode = 'login',
  initialCode = '',
}: {
  redirectTo: string
  qrAvailable: boolean
  otpRequired?: boolean
  previewDemo?: boolean
  initialMode?: 'login' | 'register'
  initialCode?: string
}) {
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>(initialMode)
  const [loginTab, setLoginTab] = useState<'wechat' | 'password'>(
    qrAvailable ? 'wechat' : 'password',
  )
  // 记住上次成功登录的方式：用邮箱登录过的人下次直接看到邮箱表单
  useEffect(() => {
    if (!qrAvailable) return
    try {
      if (window.localStorage.getItem(LOGIN_METHOD_KEY) === 'password') setLoginTab('password')
    } catch {}
  }, [qrAvailable])
  const [email, setEmail] = useState(previewDemo ? 'demo@fmkj.dev' : '')
  const [password, setPassword] = useState(previewDemo ? 'demo1234' : '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [redeemCode, setRedeemCode] = useState(initialCode)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  async function handleSendOtp(purpose: 'register' | 'reset') {
    if (!email.trim()) {
      setError('请先输入邮箱地址')
      return
    }
    setSendingOtp(true)
    setError('')
    try {
      const res = await fetch('/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), purpose }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? '验证码发送失败，请稍后重试')
        return
      }
      setCountdown(60)
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setSendingOtp(false)
    }
  }

  // 小程序扫码登录状态
  const [qrTicket, setQrTicket] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [qrPreferMode, setQrPreferMode] = useState<'wxacode' | 'qrcode'>('wxacode')
  const [qrStatus, setQrStatus] = useState<'loading' | 'pending' | 'confirmed' | 'expired'>(
    'loading',
  )

  const createQr = useCallback(
    async (modeOverride?: 'wxacode' | 'qrcode') => {
      const activeMode = modeOverride ?? qrPreferMode
      setQrStatus('loading')
      setError('')
      try {
        const res = await fetch('/auth/wechat/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirectTo, preferMode: activeMode }),
        })
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          ticket?: string
          qrImage?: string
        } | null
        if (!res.ok || !data?.ok || !data.ticket || !data.qrImage) {
          setQrStatus('expired')
          return
        }
        setQrTicket(data.ticket)
        setQrImage(data.qrImage)
        setQrStatus('pending')
      } catch {
        setQrStatus('expired')
      }
    },
    [redirectTo, qrPreferMode],
  )

  useEffect(() => {
    if (qrAvailable && loginTab === 'wechat') void createQr()
  }, [qrAvailable, loginTab, createQr])

  useEffect(() => {
    if (loginTab !== 'wechat' || qrStatus !== 'pending' || !qrTicket) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/auth/wechat/qr?ticket=${encodeURIComponent(qrTicket)}`, {
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean
          status?: 'pending' | 'confirmed' | 'expired'
          redirectTo?: string
          error?: string
        } | null
        if (!data) return
        if (data.status === 'confirmed') {
          setQrStatus('confirmed')
          clearInterval(timer)
          rememberMethod('wechat')
          window.location.assign(data.redirectTo || redirectTo)
        } else if (data.status === 'expired') {
          setQrStatus('expired')
          if (data.error) setError(data.error)
          clearInterval(timer)
        }
      } catch {
        // 忽略偶发网络抖动，继续轮询
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [loginTab, qrStatus, qrTicket, redirectTo])

  async function doLogin(targetEmail: string, targetPassword: string) {
    if (!targetEmail.trim() || !targetPassword) {
      setError('请输入邮箱和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (
        typeof document !== 'undefined' &&
        window.self !== window.top &&
        'requestStorageAccess' in document
      ) {
        await (document as Document & { requestStorageAccess?: () => Promise<void> })
          .requestStorageAccess?.()
          .catch(() => {})
      }
      const response = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim(), password: targetPassword }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? '登录失败，请重试')
        setLoading(false)
        return
      }
      rememberMethod('password')
      window.location.replace(redirectTo)
    } catch {
      setError('网络错误，请稍后重试')
      setLoading(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await doLogin(email, password)
  }

  async function submitRegister(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('请输入你的姓名或工作室名称')
      return
    }
    if (!email.trim()) {
      setError('请输入邮箱地址')
      return
    }
    if (otpRequired && !/^\d{6}$/.test(otpCode.trim())) {
      setError('请输入 6 位数字邮箱验证码')
      return
    }
    if (!password || password.length < 8) {
      setError('密码长度至少为 8 位')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (
        typeof document !== 'undefined' &&
        window.self !== window.top &&
        'requestStorageAccess' in document
      ) {
        await (document as Document & { requestStorageAccess?: () => Promise<void> })
          .requestStorageAccess?.()
          .catch(() => {})
      }
      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          code: otpCode.trim() || undefined,
          password,
          phone: phone.trim() || undefined,
          redeemCode: redeemCode.trim() || undefined,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? '注册失败，请重试')
        setLoading(false)
        return
      }
      rememberMethod('password')
      window.location.assign(redirectTo)
    } catch {
      setError('网络错误，请稍后重试')
      setLoading(false)
    }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim()) {
      setError('请输入注册邮箱')
      return
    }
    if (!/^\d{6}$/.test(otpCode.trim())) {
      setError('请输入 6 位数字邮箱验证码')
      return
    }
    if (!password || password.length < 8) {
      setError('新密码长度至少为 8 位')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: otpCode.trim(), password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? '重置失败，请重试')
        setLoading(false)
        return
      }
      window.location.assign(redirectTo)
    } catch {
      setError('网络错误，请稍后重试')
      setLoading(false)
    }
  }

  const errorAlert = error ? (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-strong"
    >
      <AlertCircle className="size-4 shrink-0" />
      {error}
    </div>
  ) : null

  const passwordForm = (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {errorAlert}
      <div className="grid gap-2">
        <Label htmlFor="email">邮箱</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            className="h-10 rounded-lg pl-9"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            autoFocus={!qrAvailable}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">密码</Label>
          {otpRequired ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs font-normal text-muted-foreground hover:text-foreground"
              onClick={() => {
                setAuthMode('reset')
                setPassword('')
                setOtpCode('')
                setError('')
              }}
            >
              忘记密码？
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            className="h-10 rounded-lg pl-9"
            type="password"
            placeholder="输入密码"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
        </div>
      </div>
      <Button
        type="submit"
        className="h-10 w-full rounded-full bg-foreground text-background hover:bg-foreground/85"
        disabled={loading}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        {loading ? '登录中' : '登录'}
      </Button>
      {previewDemo ? (
        <div className="space-y-2 rounded-xl border border-border/80 bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>预览环境快捷体验账号</span>
            <span className="font-mono text-[11px]">密码：demo1234</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                setEmail('demo@fmkj.dev')
                setPassword('demo1234')
                void doLogin('demo@fmkj.dev', 'demo1234')
              }}
              className="h-8 text-xs"
            >
              演示管理员登录
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                setEmail('sales@fmkj.dev')
                setPassword('demo1234')
                void doLogin('sales@fmkj.dev', 'demo1234')
              }}
              className="h-8 text-xs"
            >
              销售小王登录
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  )

  const registerForm = (
    <form className="space-y-4" onSubmit={submitRegister} noValidate>
      {errorAlert}
      <div className="grid gap-2">
        <Label htmlFor="reg-name">姓名 / 团队名称</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reg-name"
            className="h-10 rounded-lg pl-9"
            placeholder="例如：张工 / 栖序智能设计"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reg-email">邮箱</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reg-email"
            className="h-10 rounded-lg pl-9"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
          />
        </div>
      </div>
      {otpRequired ? (
        <div className="grid gap-2">
          <Label htmlFor="reg-otp">邮箱验证码</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reg-otp"
                className="h-10 rounded-lg pl-9 font-mono tracking-widest"
                inputMode="numeric"
                maxLength={6}
                placeholder="6位数字验证码"
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setError('')
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-lg px-3.5 text-xs"
              disabled={sendingOtp || countdown > 0}
              onClick={() => void handleSendOtp('register')}
            >
              {sendingOtp ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="reg-password">设置密码</Label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reg-password"
            className="h-10 rounded-lg pl-9"
            type="password"
            placeholder="至少 8 位密码"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="grid gap-2">
          <Label htmlFor="reg-phone">手机号（选填）</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="reg-phone"
              className="h-10 rounded-lg pl-9"
              type="tel"
              placeholder="报价单联系人"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="reg-code">兑换码（选填）</Label>
          <div className="relative">
            <Gift className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="reg-code"
              className="h-10 rounded-lg pl-9 font-mono uppercase"
              placeholder="FMKJ-..."
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            />
          </div>
        </div>
      </div>
      <Button
        type="submit"
        className="h-10 w-full rounded-full bg-foreground text-background hover:bg-foreground/85"
        disabled={loading}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        {loading ? '正在创建工作台…' : '注册并进入工作台'}
      </Button>
    </form>
  )

  return (
    <div className="space-y-7">
      <h1 className="text-center text-3xl font-medium tracking-tight">
        {authMode === 'register'
          ? '注册繁梦空间'
          : authMode === 'reset'
            ? '重置登录密码'
            : '登录繁梦空间'}
      </h1>

      {authMode === 'register' ? (
        registerForm
      ) : authMode === 'reset' ? (
        <form className="space-y-4" onSubmit={submitReset} noValidate>
          {errorAlert}
          <div className="grid gap-2">
            <Label htmlFor="reset-email">注册邮箱</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reset-email"
                className="h-10 rounded-lg pl-9"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reset-otp">邮箱验证码</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reset-otp"
                  className="h-10 rounded-lg pl-9 font-mono tracking-widest"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6位数字验证码"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    setError('')
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 rounded-lg px-3.5 text-xs"
                disabled={sendingOtp || countdown > 0}
                onClick={() => void handleSendOtp('reset')}
              >
                {sendingOtp ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reset-password">设置新密码</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reset-password"
                className="h-10 rounded-lg pl-9"
                type="password"
                placeholder="至少 8 位新密码"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError('')
                }}
              />
            </div>
          </div>
          <Button
            type="submit"
            className="h-10 w-full rounded-full bg-foreground text-background hover:bg-foreground/85"
            disabled={loading}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? '正在重置密码…' : '重置密码并登录'}
          </Button>
        </form>
      ) : qrAvailable ? (
        <Tabs
          value={loginTab}
          onValueChange={(v) => {
            setLoginTab(v === 'password' ? 'password' : 'wechat')
            setError('')
          }}
          className="gap-6"
        >
          <TabsList className="w-full">
            <TabsTrigger value="wechat">
              <QrCode className="size-3.5" />
              微信扫码登录
            </TabsTrigger>
            <TabsTrigger value="password">
              <Mail className="size-3.5" />
              邮箱密码登录
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wechat" className="space-y-4">
            {errorAlert}
            <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center">
              {/* 二维码需要白底才能被稳定识别，深色模式下也保持白底 */}
              <div className="relative flex size-48 items-center justify-center overflow-hidden rounded-xl border bg-white p-2 shadow-2xs">
                {qrStatus === 'loading' ? (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                ) : qrImage ? (
                  <Image
                    src={qrImage}
                    alt="微信小程序扫码登录"
                    width={176}
                    height={176}
                    unoptimized
                    className="size-full object-contain"
                  />
                ) : null}

                {qrStatus === 'expired' ? (
                  <Button
                    variant="ghost"
                    onClick={() => void createQr()}
                    className="absolute inset-0 h-auto flex-col gap-2 rounded-none bg-background/90 text-xs backdrop-blur-xs hover:bg-background/95"
                  >
                    <RefreshCw className="size-5 text-primary" />
                    <span>二维码已过期，点击刷新</span>
                  </Button>
                ) : qrStatus === 'confirmed' ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/95 text-xs font-medium text-success">
                    <CheckCircle2 className="size-6" />
                    <span>扫码成功，正在进入工作台…</span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">请使用微信小程序扫码登录</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {qrPreferMode === 'wxacode'
                    ? '直接用微信扫一扫，或打开小程序点「扫码登录电脑」'
                    : '请打开小程序 → 点击首页或「我的」里的「扫码登录电脑」扫此码'}
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const next = qrPreferMode === 'wxacode' ? 'qrcode' : 'wxacode'
                    setQrPreferMode(next)
                    void createQr(next)
                  }}
                >
                  {qrPreferMode === 'wxacode'
                    ? '扫码后只进小程序没弹窗？切换为「小程序内扫码」'
                    : '切换回「微信扫一扫小程序码」'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="password">{passwordForm}</TabsContent>
        </Tabs>
      ) : (
        passwordForm
      )}
      <div className="text-center text-sm text-muted-foreground">
        {authMode === 'register' || authMode === 'reset' ? (
          <p>
            {authMode === 'reset' ? '想起密码了？ ' : '已有账号？ '}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm font-medium text-foreground"
              onClick={() => {
                setAuthMode('login')
                setError('')
              }}
            >
              直接登录
            </Button>
          </p>
        ) : (
          <p>
            还没有账号？{' '}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm font-medium text-foreground"
              onClick={() => {
                setAuthMode('register')
                if (previewDemo && email === 'demo@fmkj.dev') {
                  setEmail('')
                  setPassword('')
                }
                setError('')
              }}
            >
              免费注册账号
            </Button>
          </p>
        )}
      </div>
    </div>
  )
}
