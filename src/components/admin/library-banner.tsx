'use client'

import { useCallback, useEffect, useState } from 'react'

type Status = {
  templates: { builtin: number; existing: number; missing: string[] }
  scenes: { builtin: number; existing: number; missing: string[] }
}
type SeedResult = { created: string[]; filled: string[]; skipped: number; errors: string[] }

const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: '12px 16px',
  margin: '0 0 16px',
  background: 'var(--theme-elevation-50)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 13,
}
const btn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-800)',
  background: 'var(--theme-elevation-800)',
  color: 'var(--theme-elevation-0)',
  cursor: 'pointer',
  fontSize: 13,
}
const link: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-elevation-800)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
}

function useLibrary(kind: 'templates' | 'scenes') {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => {
    fetch('/api/proposal-templates/library-status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => setStatus(d))
      .catch(() => null)
  }, [])
  useEffect(load, [load])
  const seed = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(
        `/api/${kind === 'templates' ? 'proposal-templates' : 'scenes'}/seed-builtins`,
        { method: 'POST', credentials: 'include' },
      )
      const d = (await r.json()) as SeedResult & { error?: string }
      if (!r.ok || d.error) setMsg(d.error ?? '补齐失败')
      else {
        setMsg(
          `已新增 ${d.created.length} 条${d.filled.length ? `，补充说明 ${d.filled.length} 条` : ''}${d.errors.length ? `，失败 ${d.errors.length} 条：${d.errors.slice(0, 2).join('；')}` : ''}，正在刷新…`,
        )
        setTimeout(() => window.location.reload(), 900)
      }
    } catch {
      setMsg('网络错误')
    }
    setBusy(false)
  }
  return { status: status?.[kind] ?? null, busy, msg, seed }
}

/** 后台「方案模板」列表页顶部：内置模板是否齐全，一键补齐（自建服务器初次部署时用） */
export function TemplatesLibraryBanner() {
  const { status, busy, msg, seed } = useLibrary('templates')
  if (!status) return null
  return (
    <div style={box}>
      <div>
        <strong>方案模板库</strong>
        <span style={{ marginLeft: 8, color: 'var(--theme-elevation-600)' }}>
          后台 {status.existing} 套 · 内置 {status.builtin} 套
          {status.missing.length ? `，缺少：${status.missing.join('、')}` : '，内置模板已齐全'}
          。缩略图按模板实时渲染，保存后自动更新。
        </span>
        {msg ? (
          <div style={{ marginTop: 6, color: 'var(--theme-elevation-800)' }}>{msg}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <a href="/templates" target="_blank" rel="noreferrer" style={link}>
          打开模板库 ↗
        </a>
        <button
          type="button"
          style={{ ...btn, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={seed}
        >
          {busy
            ? '处理中…'
            : status.missing.length
              ? `补齐 ${status.missing.length} 套内置模板`
              : '补全空着的模板说明'}
        </button>
      </div>
    </div>
  )
}

/** 后台「场景库」列表页顶部：内置场景是否齐全，一键补齐（含图片） */
export function ScenesLibraryBanner() {
  const { status, busy, msg, seed } = useLibrary('scenes')
  if (!status) return null
  return (
    <div style={box}>
      <div>
        <strong>场景库</strong>
        <span style={{ marginLeft: 8, color: 'var(--theme-elevation-600)' }}>
          后台 {status.existing} 个 · 内置 {status.builtin} 个
          {status.missing.length ? `，缺少：${status.missing.join('、')}` : '，内置场景已齐全'}
          。场景库全部停用时，方案自动改用内置场景，「生活场景」章节不会空白。
        </span>
        {msg ? (
          <div style={{ marginTop: 6, color: 'var(--theme-elevation-800)' }}>{msg}</div>
        ) : null}
      </div>
      {status.missing.length ? (
        <button
          type="button"
          style={{ ...btn, opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={seed}
        >
          {busy ? '处理中…' : `补齐 ${status.missing.length} 个内置场景`}
        </button>
      ) : null}
    </div>
  )
}
