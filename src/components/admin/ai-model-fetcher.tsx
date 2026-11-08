'use client'

import { useCallback, useEffect, useState } from 'react'

import { AI_PROVIDER_CHANNEL_LIST, AI_PROVIDER_PRESETS } from '@/plugins/ai-copilot/templates'

type Custom = { key: string; label?: string }
type ChannelStatus = {
  id: string
  label: string
  envKey: string
  configured: boolean
  isCustom: boolean
}
type ExistingModel = {
  name: string
  channelId: string
  customChannel?: string
  apiModel: string
  minTier: string
  cost: number
  enabled: boolean
  isDefault: boolean
}

const API = '/api/globals/ai-settings'
const box: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 8,
  padding: 18,
  margin: '12px 0 24px',
  background: 'var(--theme-elevation-50)',
}
const sectionCard: React.CSSProperties = {
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 6,
  padding: 14,
  marginTop: 14,
  background: 'var(--theme-elevation-0)',
}
const btn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid var(--theme-elevation-250)',
  background: 'var(--theme-elevation-0)',
  cursor: 'pointer',
  fontSize: 13,
}
const primaryBtn: React.CSSProperties = {
  ...btn,
  background: 'var(--theme-elevation-800)',
  color: 'var(--theme-elevation-0)',
  borderColor: 'var(--theme-elevation-800)',
  fontWeight: 500,
}

const CORE_STARTER_KEYS = [
  'deepseek:deepseek-chat',
  'dashscope:qwen-plus',
  'dashscope:qwen-vl-max',
  'zhipu:glm-4v-plus',
  'deepseek:deepseek-reasoner',
  'dashscope:qwq-plus',
]

const TIER_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  free: { label: 'Go 基础版 · 1x', bg: 'rgba(16, 185, 129, 0.12)', color: '#059669' },
  pro: { label: 'Plus 专业版 · 2x', bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb' },
  team: { label: 'Pro 旗舰版 · 3x', bg: 'rgba(168, 85, 247, 0.14)', color: '#7c3aed' },
}

/** 后台「AI 设置」里的国产模型快捷配置工作台：密钥状态监控 + Go/Plus/Pro 精选国产模型一键导入 + 远端模型拉取与连通性测试 */
export function AiModelFetcher() {
  const [customs, setCustoms] = useState<Custom[]>([])
  const [channelStatuses, setChannelStatuses] = useState<ChannelStatus[]>([])
  const [existingModels, setExistingModels] = useState<ExistingModel[]>([])
  const [channel, setChannel] = useState('deepseek')
  const [testModel, setTestModel] = useState('deepseek-chat')
  const [models, setModels] = useState<string[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [manual, setManual] = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | 'free' | 'pro' | 'team'>('all')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const refreshStatus = useCallback(() => {
    fetch(`${API}?depth=0`, { credentials: 'include' })
      .then((r) => r.json())
      .then((g: { customChannels?: Custom[] }) =>
        setCustoms((g.customChannels ?? []).filter((c) => c.key)),
      )
      .catch(() => null)
    fetch(`${API}/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { channels?: ChannelStatus[]; existingModels?: ExistingModel[] }) => {
        if (d.channels) setChannelStatuses(d.channels)
        if (d.existingModels) setExistingModels(d.existingModels)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const body = () =>
    channel.startsWith('custom:')
      ? { channelId: 'custom', customChannel: channel.slice(7) }
      : { channelId: channel }

  const addPresets = async (presetKeys?: string[]) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`${API}/presets`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presetKeys ? { presetKeys } : {}),
      })
      const d = (await r.json()) as { added?: number; skipped?: number; error?: string }
      if (!r.ok || d.error) {
        setMsg({ ok: false, text: d.error ?? '添加预设失败' })
        setBusy(false)
        return
      }
      setMsg({
        ok: true,
        text: `已导入 ${d.added ?? 0} 个国产模型${d.skipped ? `（${d.skipped} 个已在列表中，自动跳过）` : ''}，正在刷新下方模型列表…`,
      })
      setTimeout(() => window.location.reload(), 700)
    } catch {
      setMsg({ ok: false, text: '网络错误' })
      setBusy(false)
    }
  }

  const probeChannel = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`${API}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), testModel }),
      })
      const d = (await r.json()) as {
        ok?: boolean
        latencyMs?: number
        reply?: string
        error?: string
      }
      if (!r.ok || !d.ok) {
        setMsg({ ok: false, text: d.error ?? '连通性测试未通过' })
      } else {
        setMsg({ ok: true, text: `连通性正常（耗时 ${d.latencyMs}ms，模型返回：${d.reply}）` })
      }
    } catch {
      setMsg({ ok: false, text: '网络错误' })
    }
    setBusy(false)
  }

  const load = async () => {
    setBusy(true)
    setMsg(null)
    setModels([])
    setPicked(new Set())
    try {
      const r = await fetch(`${API}/models`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body()),
      })
      const d = (await r.json()) as { models?: string[]; error?: string }
      if (!r.ok || d.error) setMsg({ ok: false, text: d.error ?? '获取失败' })
      else {
        setModels(d.models ?? [])
        setMsg({ ok: true, text: `获取到 ${d.models?.length ?? 0} 个模型，勾选要启用的模型` })
      }
    } catch {
      setMsg({ ok: false, text: '网络错误' })
    }
    setBusy(false)
  }

  const add = async () => {
    const list = [
      ...picked,
      ...manual
        .split(/[\s,，]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ]
    if (!list.length) return setMsg({ ok: false, text: '请勾选或手动填写模型名' })
    setBusy(true)
    try {
      const r = await fetch(`${API}/models/add`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), models: list }),
      })
      const d = (await r.json()) as { added?: number; skipped?: number; error?: string }
      if (!r.ok || d.error) {
        setMsg({ ok: false, text: d.error ?? '添加失败' })
        setBusy(false)
        return
      }
      setMsg({
        ok: true,
        text: `已启用 ${d.added} 个模型${d.skipped ? `（${d.skipped} 个已存在，已跳过）` : ''}，正在刷新…`,
      })
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setMsg({ ok: false, text: '网络错误' })
      setBusy(false)
    }
  }

  const shown = models.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
  const toggle = (m: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(m)) n.delete(m)
      else n.add(m)
      return n
    })

  const filteredPresets = AI_PROVIDER_PRESETS.filter((p) =>
    tierFilter === 'all' ? true : p.minTier === tierFilter,
  )
  const isPresetAdded = (channelId: string, apiModel: string) =>
    existingModels.some((m) => m.channelId === channelId && m.apiModel === apiModel)

  const quickUpdateRow = async (payload: {
    index?: number
    patch?: Record<string, unknown>
    deleteIndex?: number
  }) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`${API}/quick-update`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !d.ok) {
        setMsg({ ok: false, text: d.error ?? '更新失败' })
        setBusy(false)
        return
      }
      setMsg({ ok: true, text: '已保存修改，正在同步刷新…' })
      setTimeout(() => window.location.reload(), 500)
    } catch {
      setMsg({ ok: false, text: '网络错误' })
      setBusy(false)
    }
  }

  const testSpecificModel = async (m: ExistingModel) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`${API}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: m.channelId,
          customChannel: m.customChannel,
          testModel: m.apiModel,
        }),
      })
      const d = (await r.json()) as {
        ok?: boolean
        latencyMs?: number
        reply?: string
        error?: string
      }
      if (!r.ok || !d.ok) {
        setMsg({ ok: false, text: `「${m.name}」测试未通过：${d.error ?? '请求失败'}` })
      } else {
        setMsg({
          ok: true,
          text: `「${m.name}」连通正常（耗时 ${d.latencyMs}ms，返回：${d.reply}）`,
        })
      }
    } catch {
      setMsg({ ok: false, text: '网络错误' })
    }
    setBusy(false)
  }

  return (
    <div style={box}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            国产 AI 大模型快捷配置工作台（Go / Plus / Pro）
          </div>
          <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
            一键载入精选国产模型或从渠道拉取模型。添加后可在下方「AI
            模型」列表中随时修改显示名称、计费倍率、所需会员等级（Go / Plus /
            Pro）及默认模型，点击右上角 <strong>Save</strong> 即刻对全站与小程序生效。
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={primaryBtn}
            disabled={busy}
            onClick={() => addPresets(CORE_STARTER_KEYS)}
          >
            一键载入推荐 6 款国产核心套件
          </button>
          <button type="button" style={btn} disabled={busy} onClick={() => addPresets()}>
            导入全部 {AI_PROVIDER_PRESETS.length} 款国产预设
          </button>
        </div>
      </div>

      {msg ? (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            background: msg.ok ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
            color: msg.ok ? 'var(--theme-success-600, #16a34a)' : 'var(--theme-error-600, #dc2626)',
          }}
        >
          {msg.text}
        </div>
      ) : null}

      {/* 0. 当前已生效给客户使用的模型速览与快捷调级 */}
      {existingModels.length > 0 ? (
        <div style={sectionCard}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            当前开放给客户使用的 AI 模型（共 {existingModels.length} 个 ·
            可直接切换会员档位、计费倍率或启停，详细字段可在页面最下方表单编辑）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {existingModels.map((m, idx) => (
              <div
                key={`${m.channelId}:${m.apiModel}:${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--theme-elevation-150)',
                  background: m.enabled ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-50)',
                  opacity: m.enabled ? 1 : 0.65,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    minWidth: 220,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</span>
                  <code
                    style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'var(--theme-elevation-100)',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    }}
                  >
                    {m.apiModel}
                  </code>
                  {m.isDefault ? (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#059669',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      默认模型
                    </span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--theme-elevation-500)' }}>会员档位:</span>
                    <select
                      value={m.minTier}
                      disabled={busy}
                      onChange={(e) =>
                        void quickUpdateRow({ index: idx, patch: { minTier: e.target.value } })
                      }
                      style={{ ...btn, padding: '3px 8px', fontSize: 12 }}
                    >
                      <option value="free">Go 基础版（全员可用）</option>
                      <option value="pro">Plus 专业版</option>
                      <option value="team">Pro 旗舰版</option>
                      <option value="auto">自动推断</option>
                    </select>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--theme-elevation-500)' }}>倍率:</span>
                    <select
                      value={String(m.cost)}
                      disabled={busy}
                      onChange={(e) =>
                        void quickUpdateRow({ index: idx, patch: { cost: Number(e.target.value) } })
                      }
                      style={{ ...btn, padding: '3px 8px', fontSize: 12 }}
                    >
                      <option value="1">1x 标准</option>
                      <option value="2">2x 高阶</option>
                      <option value="3">3x 旗舰</option>
                      <option value="5">5x 尊享</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void quickUpdateRow({ index: idx, patch: { enabled: !m.enabled } })
                    }
                    style={{ ...btn, padding: '3px 8px', fontSize: 12 }}
                  >
                    {m.enabled ? '已启用（点此停用）' : '已停用（点此启用）'}
                  </button>

                  {!m.isDefault ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void quickUpdateRow({ index: idx, patch: { isDefault: true } })
                      }
                      style={{ ...btn, padding: '3px 8px', fontSize: 12 }}
                    >
                      设为默认
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void testSpecificModel(m)}
                    style={{ ...btn, padding: '3px 8px', fontSize: 12 }}
                  >
                    测试连接
                  </button>

                  {existingModels.length > 1 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void quickUpdateRow({ deleteIndex: idx })}
                      style={{ ...btn, padding: '3px 8px', fontSize: 12, color: '#dc2626' }}
                    >
                      移除
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 1. 服务端渠道环境变量状态 */}
      {channelStatuses.length > 0 ? (
        <div style={sectionCard}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            1. 渠道密钥（环境变量）就绪状态
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: 8,
            }}
          >
            {channelStatuses.map((ch) => (
              <div
                key={ch.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 5,
                  border: '1px solid var(--theme-elevation-150)',
                  fontSize: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ch.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--theme-elevation-500)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {ch.envKey}
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    padding: '2px 7px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 500,
                    background: ch.configured
                      ? 'rgba(22, 163, 74, 0.12)'
                      : 'var(--theme-elevation-100)',
                    color: ch.configured ? '#16a34a' : 'var(--theme-elevation-500)',
                  }}
                >
                  {ch.configured ? '已配置' : '未设密钥'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 2. 精选国产大模型库（按 Go / Plus / Pro 分档一键添加） */}
      <div style={sectionCard}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            2. 精选国产大模型库（点击即可加入下方模型列表）
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { k: 'all', l: '全部档位' },
                { k: 'free', l: 'Go 基础高速 (1x)' },
                { k: 'pro', l: 'Plus 视觉/长文本 (2x)' },
                { k: 'team', l: 'Pro 满血推理 (3x)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.k}
                type="button"
                onClick={() => setTierFilter(tab.k)}
                style={{
                  ...btn,
                  padding: '4px 10px',
                  fontSize: 12,
                  background:
                    tierFilter === tab.k
                      ? 'var(--theme-elevation-800)'
                      : 'var(--theme-elevation-0)',
                  color: tierFilter === tab.k ? 'var(--theme-elevation-0)' : 'inherit',
                }}
              >
                {tab.l}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {filteredPresets.map((p) => {
            const key = `${p.channelId}:${p.apiModel}`
            const added = isPresetAdded(p.channelId, p.apiModel)
            const tierMeta = TIER_STYLE[p.minTier ?? 'free'] ?? TIER_STYLE.free
            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid var(--theme-elevation-150)',
                  background: 'var(--theme-elevation-50)',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span
                      style={{
                        flexShrink: 0,
                        padding: '2px 7px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: tierMeta.bg,
                        color: tierMeta.color,
                      }}
                    >
                      {tierMeta.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--theme-elevation-500)',
                      marginTop: 3,
                      fontFamily: 'monospace',
                    }}
                  >
                    {p.provider} · {p.apiModel}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--theme-elevation-600)',
                      marginTop: 6,
                      lineHeight: 1.45,
                    }}
                  >
                    {p.description}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 4,
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--theme-elevation-500)' }}>
                    {p.reasoning ? '支持深度思考链' : '标准对话/工具调用'}
                  </span>
                  <button
                    type="button"
                    disabled={busy || added}
                    onClick={() => addPresets([key])}
                    style={{
                      ...btn,
                      padding: '4px 10px',
                      fontSize: 12,
                      opacity: added ? 0.6 : 1,
                      cursor: added ? 'default' : 'pointer',
                    }}
                  >
                    {added ? '✓ 已在列表中' : '+ 加入模型列表'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. 从渠道接口在线拉取模型 / 连通性测试 / 手动输入添加 */}
      <div style={sectionCard}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
          3. 在线拉取渠道模型列表 / 测试连通性 / 手动添加
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={channel}
            onChange={(e) => {
              const v = e.target.value
              setChannel(v)
              if (v === 'deepseek') setTestModel('deepseek-chat')
              else if (v === 'dashscope') setTestModel('qwen-plus')
              else if (v === 'ark') setTestModel('doubao-1-5-pro-32k-250115')
              else if (v === 'zhipu') setTestModel('glm-4-flash')
              else if (v === 'moonshot') setTestModel('kimi-k2-0711-preview')
              else if (v === 'siliconflow') setTestModel('deepseek-ai/DeepSeek-V3')
            }}
            style={{ ...btn, minWidth: 240 }}
          >
            {AI_PROVIDER_CHANNEL_LIST.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            {customs.map((c) => (
              <option key={c.key} value={`custom:${c.key}`}>
                自定义 · {c.label || c.key}
              </option>
            ))}
          </select>
          <button type="button" style={btn} disabled={busy} onClick={load}>
            {busy ? '处理中…' : '从接口拉取 /models 列表'}
          </button>
          <input
            placeholder="测试用模型名（如 deepseek-chat）"
            value={testModel}
            onChange={(e) => setTestModel(e.target.value)}
            style={{ ...btn, width: 200, cursor: 'text', fontFamily: 'monospace', fontSize: 12 }}
          />
          <button type="button" style={btn} disabled={busy} onClick={probeChannel}>
            测试渠道连通性
          </button>
        </div>
        {models.length ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <input
                placeholder="搜索拉取到的模型"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ ...btn, flex: 1, cursor: 'text' }}
              />
              <button
                type="button"
                style={btn}
                onClick={() => setPicked(new Set([...picked, ...shown]))}
              >
                全选
              </button>
              <button type="button" style={btn} onClick={() => setPicked(new Set())}>
                清空
              </button>
            </div>
            <div
              style={{
                marginTop: 8,
                maxHeight: 240,
                overflow: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 4,
                border: '1px solid var(--theme-elevation-100)',
                borderRadius: 4,
                padding: 8,
                background: 'var(--theme-elevation-50)',
              }}
            >
              {shown.map((m) => (
                <label
                  key={m}
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                >
                  <input type="checkbox" checked={picked.has(m)} onChange={() => toggle(m)} />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m}
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <input
            placeholder="或手动填写模型名（如 qwen-vl-max, glm-4v-plus，多个用逗号分隔）"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            style={{ ...btn, flex: 1, cursor: 'text' }}
          />
          <button type="button" style={primaryBtn} disabled={busy} onClick={add}>
            启用所选{picked.size ? `（${picked.size}）` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 挂载在 /admin 首页顶部的快捷配置入口卡片，方便管理员一进后台就能直接点进「AI 设置」与「会员设置」 */
export function AdminAiQuickBanner() {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const syncGithub = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await fetch(`${API}/github-sync`, { method: 'POST', credentials: 'include' })
      const d = (await r.json()) as { ok?: boolean; commit?: string; repo?: string; error?: string }
      if (!r.ok || !d.ok) {
        setSyncMsg({ ok: false, text: d.error ?? '推送失败' })
      } else {
        setSyncMsg({ ok: true, text: `已同步至 GitHub ${d.repo} (${d.commit})` })
      }
    } catch {
      setSyncMsg({ ok: false, text: '网络错误' })
    }
    setSyncing(false)
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 20,
        background: 'var(--theme-elevation-50)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          国产 AI 大模型与会员权益配置中心（Go / Plus / Pro）
        </div>
        <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          在这里随时增删国产大模型（DeepSeek / 通义千问 / 豆包 / 智谱 /
          Kimi）、修改模型会员等级与计费倍率，或管理会员限制模式与兑换码。
        </div>
        {syncMsg ? (
          <div style={{ marginTop: 6, fontSize: 12, color: syncMsg.ok ? '#16a34a' : '#dc2626' }}>
            {syncMsg.text}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href="/admin/globals/ai-settings"
          style={{
            ...primaryBtn,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          配置 AI 模型与渠道 →
        </a>
        <a
          href="/admin/globals/membership-settings"
          style={{
            ...btn,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          会员限制模式设置
        </a>
        <a
          href="/admin/collections/redemption-codes"
          style={{
            ...btn,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          会员/积分兑换码
        </a>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncGithub()}
          style={{ ...btn, opacity: syncing ? 0.6 : 1 }}
        >
          {syncing ? '推送 GitHub 中…' : '推送更新至 GitHub'}
        </button>
      </div>
    </div>
  )
}
