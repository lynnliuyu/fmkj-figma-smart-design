'use client'

import { useState } from 'react'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? '登录失败，请重试')
        setBusy(false)
        return
      }
      window.location.assign(redirectTo)
    } catch {
      setError('连接服务失败，请稍后重试')
      setBusy(false)
    }
  }

  const input =
    'h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10'

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">邮箱</span>
        <input className={input} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">密码</span>
        <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="h-11 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {busy ? '正在登录…' : '登录'}
      </button>
    </form>
  )
}
