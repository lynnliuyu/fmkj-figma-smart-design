'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AiMessageBubble,
  AiPromptComposer,
  type AiAttachment,
  type AiChatMessage,
  type AiConnectablePlugin,
  type AiModelOption,
  type AiProjectContext,
  type AiToolCall,
} from '@/components/ai/ai-elements'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AI_MODELS, DEFAULT_AI_TEMPLATES, fillPromptTemplate } from '@/plugins/ai-copilot/templates'

type ConvSummary = { id: string; title: string }
type StoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  model: string | null
  cost: number | null
  toolCalls: AiToolCall[] | null
  createdAt: string
}

const resolveStoredModelName = (
  rawModel: string | null,
  modelList: AiModelOption[],
): string | undefined => {
  if (!rawModel) return undefined
  if (rawModel.startsWith('auto:')) {
    const subId = rawModel.slice(5)
    const found =
      modelList.find((x) => x.id === subId)?.name ??
      AI_MODELS.find((x) => x.id === subId)?.name ??
      subId
    const short = found.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || found
    return `Auto · ${short}`
  }
  return (
    modelList.find((x) => x.id === rawModel)?.name ??
    AI_MODELS.find((x) => x.id === rawModel)?.name ??
    rawModel
  )
}

const IMAGE_KIND_TEXT: Record<string, string> = {
  'floor-plan': '户型/点位图纸',
  'quote-document': '报价单/清单截图',
  photo: '实景照片',
  rendering: '效果图',
  other: '图片',
}

/** 附件上的识别摘要：图纸显示识别数量与视觉复核进度，其他图片显示视觉判断的类型 */
function attachmentSummary(d: {
  imageKind?: string
  visionStatus?: string
  status?: string
  detectedPointCount?: number
  detectedSwitchCount?: number
  detectedLightCount?: number
}) {
  const kind = d.imageKind ?? 'floor-plan'
  if (kind !== 'floor-plan')
    return `已识别为${IMAGE_KIND_TEXT[kind] ?? '图片'} · 发送后视觉模型看图`
  const vs = d.visionStatus ?? d.status
  const sw = d.detectedSwitchCount ?? 0
  const lt = d.detectedLightCount ?? 0
  const counts =
    (d.detectedPointCount ?? 0) > 0 || sw || lt
      ? `开关 ${sw}${lt ? ` · 灯具 ${lt}` : ''}`
      : '暂未识别到点位'
  if (vs === 'pending') return `${counts} · 视觉复核中…`
  if (vs === 'done') return `${counts} · 已视觉复核`
  if (vs === 'failed') return `${counts} · 视觉复核未完成`
  return counts
}

const toChat = (m: StoredMessage, modelList: AiModelOption[]): AiChatMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
  ...(m.role === 'user' ? { rawContent: m.content } : {}),
  createdAt: m.createdAt,
  modelName: resolveStoredModelName(m.model, modelList),
  cost: m.cost ?? undefined,
  toolCalls: m.toolCalls ?? undefined,
})

/** 侧边栏 AI 对话：真实调用服务端 /ai/chat（流式），会话和积分存在 Payload。 */
export function AiSidebarDock({
  plugins,
  projects: initialProjects,
  credits: initialCredits,
  configured,
  models: customModels,
  initialInput,
}: {
  plugins: AiConnectablePlugin[]
  projects: AiProjectContext[]
  credits: number
  configured: boolean
  models?: AiModelOption[]
  /** 打开时预先填进输入框的内容（例如从插件页带过来的问题） */
  initialInput?: string
}) {
  const availableModels = customModels?.length ? customModels : AI_MODELS
  const pathname = usePathname()
  const router = useRouter()
  const [projectList, setProjectList] = useState<AiProjectContext[]>(initialProjects)

  useEffect(() => {
    setProjectList(initialProjects)
  }, [initialProjects])

  const routeProjectId = useMemo(() => {
    const id = pathname.match(/^\/projects\/([^/]+)/)?.[1]
    return id && projectList.some((p) => p.id === id) ? id : null
  }, [pathname, projectList])

  const [modelId, setModelId] = useState(availableModels[0].id)
  const [connected, setConnected] = useState<string[]>(() =>
    plugins.filter((p) => p.status === 'ready' && p.enabled).map((p) => p.id),
  )
  const [projectId, setProjectId] = useState<string | null>(routeProjectId)
  const [credits, setCredits] = useState(initialCredits)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [input, setInput] = useState(initialInput ?? '')
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const [dockDragging, setDockDragging] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => setCredits(initialCredits), [initialCredits])
  useEffect(() => {
    if (routeProjectId) setProjectId(routeProjectId)
  }, [routeProjectId])

  const model = availableModels.find((m) => m.id === modelId) ?? availableModels[0]
  const project = projectList.find((p) => p.id === projectId) ?? null
  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? '新对话'

  const loadConversations = useCallback(async () => {
    const res = await fetch('/ai/conversations').catch(() => null)
    const data = (await res?.json().catch(() => null)) as { conversations?: ConvSummary[] } | null
    if (data?.conversations) setConversations(data.conversations)
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages])

  async function openConversation(id: string) {
    if (streaming) return
    setActiveId(id)
    setLoadingHistory(true)
    setMessages([])
    try {
      const res = await fetch(`/ai/conversations/${id}`)
      const data = (await res.json()) as {
        ok?: boolean
        messages?: StoredMessage[]
        error?: string
      }
      if (!res.ok || !data.messages) throw new Error(data.error)
      setMessages(data.messages.map((m) => toChat(m, availableModels)))
    } catch {
      toast.error('读取会话失败')
    } finally {
      setLoadingHistory(false)
    }
  }

  async function deleteConversation(id: string) {
    const res = await fetch(`/ai/conversations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) return toast.error('删除失败')
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (id === activeId) startNew()
  }

  function startNew() {
    if (streaming) return
    setActiveId(null)
    setMessages([])
    setAttachments([])
  }

  /** 轮询户型图的视觉复核结果，完成后更新附件上的识别摘要（最多约 75 秒） */
  async function pollRecognition(attId: string, mediaId: string) {
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const res = await fetch(`/ai/upload?mediaId=${encodeURIComponent(mediaId)}`, {
        cache: 'no-store',
      }).catch(() => null)
      const data = (await res?.json().catch(() => null)) as {
        ok?: boolean
        status?: string
        imageKind?: string
        detectedPointCount?: number
        detectedSwitchCount?: number
        detectedLightCount?: number
      } | null
      if (!data?.ok || data.status === 'pending') continue
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === attId
            ? {
                ...a,
                visionStatus: data.status,
                detectedSwitchCount: data.detectedSwitchCount ?? a.detectedSwitchCount,
                detectedLightCount: data.detectedLightCount ?? a.detectedLightCount,
                summary: attachmentSummary({
                  ...data,
                  imageKind: data.imageKind ?? 'floor-plan',
                  visionStatus: data.status,
                }),
              }
            : a,
        ),
      )
      return
    }
  }

  async function handleAddFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (!files.length) return

    for (const file of files) {
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const lower = file.name.toLowerCase()
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|dxf)$/i.test(lower)
      const isJson = file.type === 'application/json' || /\.(json|excalidraw)$/i.test(lower)
      const isText = file.type.startsWith('text/') || /\.(csv|txt|md|tsv)$/i.test(lower)

      if (!isImage && !isJson && !isText) {
        toast.error(
          `暂不支持「${file.name}」，请拖入 PNG/JPG 户型图、CAD .dxf 文件、JSON 点位文件或 CSV/TXT 清单`,
        )
        continue
      }

      if (isImage) {
        const isDxf = /\.dxf$/i.test(lower)
        const previewUrl = isDxf ? undefined : URL.createObjectURL(file)
        setAttachments((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            kind: 'image',
            size: file.size,
            status: 'uploading',
            url: previewUrl,
            summary: isDxf ? '解析 CAD 中…' : '上传识图中…',
          },
        ])
        try {
          const form = new FormData()
          form.append('file', file)
          const res = await fetch('/ai/upload', { method: 'POST', body: form })
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean
            url?: string
            mediaId?: string
            name?: string
            imageKind?: string
            caption?: string
            visionStatus?: string
            detectedPointCount?: number
            detectedSwitchCount?: number
            detectedLightCount?: number
            detectedPoints?: { type: string; x: number; y: number }[]
            error?: string
          }
          if (!res.ok || !data.ok || !data.url) {
            throw new Error(data.error ?? '上传失败')
          }
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    status: 'ready',
                    url: data.url,
                    mediaId: data.mediaId,
                    imageKind: data.imageKind ?? 'floor-plan',
                    visionStatus: data.visionStatus,
                    detectedPoints: data.detectedPoints ?? [],
                    detectedSwitchCount: data.detectedSwitchCount ?? 0,
                    detectedLightCount: data.detectedLightCount ?? 0,
                    summary: attachmentSummary(data),
                  }
                : a,
            ),
          )
          if (data.visionStatus === 'pending' && data.mediaId)
            void pollRecognition(id, data.mediaId)
        } catch (err) {
          const msg = (err as Error).message || '上传失败'
          toast.error(`${file.name}：${msg}`)
          setAttachments((prev) => prev.filter((a) => a.id !== id))
        }
        continue
      }

      // 读取 JSON 或文本文件
      try {
        const rawText = await file.text()
        const trimmed = rawText.trim()
        if (!trimmed) {
          toast.error(`${file.name} 内容为空`)
          continue
        }
        let summary = `${Math.max(1, Math.round(file.size / 1024))} KB`
        if (isJson) {
          try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>
            const sheets = Array.isArray(parsed.sheets)
              ? (parsed.sheets as Record<string, unknown>[])
              : null
            if (sheets) {
              const pts = sheets.reduce(
                (s, sh) => s + (Array.isArray(sh.points) ? sh.points.length : 0),
                0,
              )
              const ars = sheets.reduce(
                (s, sh) => s + (Array.isArray(sh.areas) ? sh.areas.length : 0),
                0,
              )
              summary = `${sheets.length}图 · ${ars}区域 · ${pts}点位`
            } else if (Array.isArray(parsed.points)) {
              summary = `${parsed.points.length} 个点位`
            }
          } catch {
            // 非标准点位 JSON 仍作为普通 JSON 文本传入
          }
        } else {
          const linesCount = trimmed.split(/\r?\n/).filter(Boolean).length
          summary = `${linesCount} 行`
        }

        setAttachments((prev) => [
          ...prev,
          {
            id,
            name: file.name,
            kind: isJson ? 'json' : 'text',
            size: file.size,
            status: 'ready',
            textContent: trimmed.slice(0, 24000),
            summary,
          },
        ])
      } catch {
        toast.error(`读取文件 ${file.name} 失败`)
      }
    }
  }

  function pickTemplate(id: string) {
    const tpl = DEFAULT_AI_TEMPLATES.find((t) => t.id === id)
    if (!tpl) return
    if (availableModels.some((m) => m.id === tpl.recommendedModelId)) {
      setModelId(tpl.recommendedModelId)
    }
    setConnected((prev) => Array.from(new Set([...prev, ...tpl.requiredPlugins])))
    setInput(fillPromptTemplate(tpl, {}))
  }

  async function send(raw: string) {
    const readyAtts = attachments.filter((a) => a.status === 'ready')
    const text = raw.trim()
    if ((!text && readyAtts.length === 0) || streaming) return
    if (!configured) return toast.error('还没有配置 AI 密钥')
    if (credits < 1) return toast.error('积分已用完，请在「会员与积分」页兑换或联系管理员发放')

    // 如果用户只拖入了附件没有输入文字，自动补一句默认说明
    const planImages = readyAtts.filter(
      (a) => a.kind === 'image' && (a.imageKind ?? 'floor-plan') === 'floor-plan',
    )
    const displayPrompt =
      text ||
      (readyAtts.every((a) => a.kind === 'image')
        ? planImages.length === readyAtts.length
          ? `请将上传的户型图（${readyAtts.map((a) => a.name).join('、')}）添加到当前项目的点位图中。`
          : `请帮我看看上传的图片（${readyAtts.map((a) => a.name).join('、')}），说明图片内容并给出建议。`
        : readyAtts.some((a) => a.kind === 'json')
          ? `请解析并导入上传的点位文件（${readyAtts.map((a) => a.name).join('、')}）到当前项目点位图中。`
          : `请根据上传的文件（${readyAtts.map((a) => a.name).join('、')}）处理项目配置。`)

    let fullPayloadMessage = displayPrompt
    if (readyAtts.length > 0) {
      const blocks = readyAtts.map((att) => {
        if (att.kind === 'image') {
          const sheetTitle = att.name.replace(/\.[^.]+$/, '')
          const kind = att.imageKind ?? 'floor-plan'
          if (kind !== 'floor-plan') {
            return `- [图片] ${att.name} (类型: ${IMAGE_KIND_TEXT[kind] ?? '图片'}, mediaId: ${att.mediaId ?? ''}, URL: ${att.url ?? ''}) —— 这不是户型图纸：请依据视觉识图结论回答，不要调用 add_floor_sheet`
          }
          const pts = att.detectedPoints ?? []
          const pending =
            att.visionStatus === 'pending'
              ? '，视觉复核进行中（工具会自动等待复核完成）'
              : att.visionStatus === 'done'
                ? '，已完成视觉复核'
                : ''
          if (pts.length > 0) {
            return `- [图片] ${att.name} (已自动适配为标准图纸, mediaId: ${att.mediaId ?? ''}, URL: ${att.url ?? ''}, 建议图纸名: ${sheetTitle}, 平台已识别开关 ${att.detectedSwitchCount ?? 0} 个、灯具 ${att.detectedLightCount ?? 0} 个${pending}) —— 请调用 add_floor_sheet 工具并传入 url 与 mediaId（服务端按 mediaId 加载识别结果，无需传 detectedPoints）`
          }
          return `- [图片] ${att.name} (已自动适配为标准图纸, mediaId: ${att.mediaId ?? ''}, URL: ${att.url ?? ''}, 建议图纸名: ${sheetTitle}, 识别点位数: 0${pending}) —— 请调用 add_floor_sheet 工具添加图纸（不传 detectedPoints），严禁调用 setup_rooms_and_points 生成任何默认点位！`
        }
        if (att.kind === 'json') {
          return `- [JSON] ${att.name} (${att.summary ?? ''}) —— 可调用 import_points_json 工具直接导入，内容如下：\n\`\`\`json\n${att.textContent}\n\`\`\``
        }
        return `- [文本清单] ${att.name} (${att.summary ?? ''})，内容如下：\n\`\`\`text\n${att.textContent}\n\`\`\``
      })
      fullPayloadMessage = `${displayPrompt}\n\n【已上传附件】\n${blocks.join('\n\n')}`
    }

    const now = new Date().toISOString()
    const replyId = `pending-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: 'user',
        content: displayPrompt,
        rawContent: fullPayloadMessage,
        createdAt: now,
        attachments: readyAtts.map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          url: a.url,
          summary: a.summary,
        })),
      },
      {
        id: replyId,
        role: 'assistant',
        content: '',
        createdAt: now,
        modelName: model.name,
        toolCalls: [],
      },
    ])
    setInput('')
    setAttachments([])
    setStreaming(true)
    setThinking(true)
    setStatusText(readyAtts.some((a) => a.kind === 'image') ? '正在由视觉模型看图…' : '')
    const patchReply = (fn: (m: AiChatMessage) => AiChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)))
    const dropReply = () => setMessages((prev) => prev.filter((m) => m.id !== replyId || m.content))

    const controller = new AbortController()
    abortRef.current = controller
    let latestProjectId: string | null = projectId
    let touchedPointMap = false
    try {
      const res = await fetch('/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeId,
          message: fullPayloadMessage,
          modelId: model.id,
          projectId,
          pluginIds: connected,
          pagePath: pathname,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? '发送失败，请稍后重试')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line) as { type: string; [k: string]: unknown }
          if (ev.type === 'meta' && typeof ev.conversationId === 'string') {
            const cid = ev.conversationId
            if (!activeId) {
              setActiveId(cid)
              setConversations((prev) => [
                { id: cid, title: displayPrompt.slice(0, 30) },
                ...prev.filter((c) => c.id !== cid),
              ])
            }
            if (typeof ev.modelName === 'string' && ev.modelName) {
              patchReply((m) => ({ ...m, modelName: String(ev.modelName) }))
            }
          } else if (ev.type === 'tool') {
            const href = typeof ev.href === 'string' ? ev.href : undefined
            if (href?.includes('/point-map')) touchedPointMap = true
            patchReply((m) => ({
              ...m,
              toolCalls: [
                ...(m.toolCalls ?? []),
                {
                  pluginId: String(ev.pluginId),
                  pluginName: String(ev.pluginName),
                  action: '',
                  summary: String(ev.summary ?? ''),
                  details: Array.isArray(ev.details)
                    ? (ev.details as unknown[]).filter((d): d is string => typeof d === 'string')
                    : [],
                  href,
                  hrefLabel: ev.hrefLabel as string | undefined,
                  imageUrl: typeof ev.imageUrl === 'string' ? ev.imageUrl : undefined,
                },
              ],
            }))
          } else if (ev.type === 'project' && ev.project && typeof ev.project === 'object') {
            const p = ev.project as AiProjectContext
            latestProjectId = p.id
            setProjectList((prev) => [p, ...prev.filter((x) => x.id !== p.id)])
            setProjectId(p.id)
          } else if (ev.type === 'status' && typeof ev.text === 'string') {
            setStatusText(ev.text)
          } else if (ev.type === 'reasoning' && typeof ev.text === 'string') {
            const piece = ev.text
            setThinking(false)
            patchReply((m) => ({ ...m, reasoning: (m.reasoning ?? '') + piece }))
          } else if (ev.type === 'delta') {
            setThinking(false)
            setStatusText('')
            patchReply((m) => ({ ...m, content: m.content + String(ev.text) }))
          } else if (ev.type === 'done') {
            patchReply((m) => ({
              ...m,
              id: String(ev.messageId),
              cost: Number(ev.cost),
              ...(typeof ev.modelName === 'string' && ev.modelName
                ? { modelName: String(ev.modelName) }
                : {}),
            }))
            if (typeof ev.balance === 'number') setCredits(ev.balance)
            if (ev.mutated) {
              if (
                touchedPointMap &&
                latestProjectId &&
                pathname !== `/projects/${latestProjectId}/point-map`
              ) {
                router.push(`/projects/${latestProjectId}/point-map`)
              } else {
                router.refresh()
              }
            }
          } else if (ev.type === 'error') {
            throw new Error(String(ev.error))
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') dropReply()
      else
        patchReply((m) =>
          m.content
            ? m
            : {
                ...m,
                content: `发送失败：${(error as Error).message || '请稍后重试'}`,
                error: true,
              },
        )
    } finally {
      setStreaming(false)
      setThinking(false)
      setStatusText('')
      abortRef.current = null
    }
  }

  /** 重新生成：把这条回复之前的那条用户消息（含附件信息）原样再发一次 */
  function regenerate(assistantId: string) {
    const idx = messages.findIndex((m) => m.id === assistantId)
    for (let i = idx - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'user') {
        void send(m.rawContent ?? m.content)
        return
      }
    }
  }

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        setDockDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDockDragging(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer?.files?.length) return
        e.preventDefault()
        setDockDragging(false)
        void handleAddFiles(e.dataTransfer.files)
      }}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {dockDragging ? (
        <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-background/95 p-6 text-center shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="size-5" />
          </div>
          <p className="text-sm font-medium text-foreground">松开上传文件</p>
          <p className="text-xs text-muted-foreground">支持户型图、点位 JSON、CSV / TXT 清单</p>
        </div>
      ) : null}

      <div className="flex h-11 items-center justify-between gap-1 px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex max-w-52 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-sidebar-accent"
            >
              <span className="truncate">{activeTitle}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              最近对话
            </DropdownMenuLabel>
            {conversations.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">还没有对话</div>
            ) : null}
            {conversations.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={() => void openConversation(c.id)}
                className="group flex items-center justify-between"
              >
                <span className={cn('truncate', c.id === activeId && 'font-medium')}>
                  {c.title}
                </span>
                <button
                  type="button"
                  aria-label="删除"
                  onClick={(e) => {
                    e.stopPropagation()
                    void deleteConversation(c.id)
                  }}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="新对话"
            onClick={startNew}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <SquarePen className="size-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="更多"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground tabular-nums">
                剩余 {credits} 积分
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/ai">
                  <Maximize2 className="size-4" />
                  全屏打开
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-2">
        {!configured ? (
          <div className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>尚未配置 AI 密钥，请联系管理员在后台配置。</span>
          </div>
        ) : null}
        {loadingHistory ? (
          <Loader2 className="m-auto size-4 animate-spin text-muted-foreground" />
        ) : messages.length === 0 ? (
          <div className="m-auto w-full max-w-xl animate-enter space-y-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span
                aria-hidden
                className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 ring-inset"
              >
                <Sparkles className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="text-lg font-semibold tracking-tight text-foreground">
                  {project ? `关于「${project.name}」，想做点什么？` : '有什么可以帮你？'}
                </p>
                <p className="text-sm text-muted-foreground">
                  选择一个常用任务，或直接描述需求、拖入户型图与清单
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {DEFAULT_AI_TEMPLATES.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t.id)}
                  className="group flex items-center gap-3 rounded-[var(--radius-container)] bg-card px-3.5 py-3 text-left shadow-xs ring-1 ring-border transition-[box-shadow,background-color] duration-150 ease-out-quart hover:bg-subtle hover:ring-border-strong focus-visible:ring-3 focus-visible:ring-ring/35 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{t.name}</span>
                    {t.description ? (
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out-quart group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isLastReply = m.role === 'assistant' && idx === messages.length - 1
            if (m.role === 'assistant' && !m.content && !m.reasoning && thinking) {
              return (
                <div key={m.id} className="flex flex-col gap-1.5">
                  {m.toolCalls?.map((c, i) => (
                    <span key={i} className="text-xs text-muted-foreground">
                      {c.summary ? `${c.pluginName}：${c.summary}` : `已使用 ${c.pluginName}`}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {statusText || (model.reasoning ? '思考中…' : '正在回复…')}
                  </span>
                </div>
              )
            }
            return (
              <div key={m.id} className="flex flex-col gap-1.5">
                <AiMessageBubble
                  message={m}
                  isLast={isLastReply && !streaming}
                  onRegenerate={
                    !streaming && m.role === 'assistant' ? () => regenerate(m.id) : undefined
                  }
                  onQuickAction={!streaming ? (prompt) => void send(prompt) : undefined}
                />
                {isLastReply && streaming && statusText ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    {statusText}
                  </span>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div className="p-3 pt-1.5 pb-3.5">
        {attachments.some(
          (a) =>
            a.status === 'ready' &&
            a.kind === 'image' &&
            (a.imageKind ?? 'floor-plan') === 'floor-plan',
        ) && !streaming ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-[11px] text-muted-foreground">一键导入：</span>
            <button
              type="button"
              onClick={() =>
                void send(
                  '请将上传的户型图添加到当前项目点位图，仅导入识别到的开关点位（importMode=switches）',
                )
              }
              className="rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              仅导入开关
            </button>
            <button
              type="button"
              onClick={() =>
                void send(
                  '请将上传的户型图添加到当前项目点位图，导入识别到的全部开关与灯具点位（importMode=all）',
                )
              }
              className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              导入全部（开关+灯具）
            </button>
            <button
              type="button"
              onClick={() =>
                void send(
                  '请只将上传的户型图作为干净底图添加到点位图，不自动生成任何点位（importMode=none）',
                )
              }
              className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              仅添加干净底图
            </button>
          </div>
        ) : null}
        <AiPromptComposer
          value={input}
          onChange={setInput}
          onSubmit={() => void send(input)}
          streaming={streaming}
          onStop={() => abortRef.current?.abort()}
          models={availableModels}
          selectedModel={model}
          onSelectModel={setModelId}
          plugins={plugins}
          connectedPluginIds={connected}
          onTogglePlugin={(id) =>
            setConnected((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
          projects={projectList}
          selectedProjectId={projectId}
          onSelectProject={setProjectId}
          templates={DEFAULT_AI_TEMPLATES.map((t) => ({ id: t.id, name: t.name }))}
          onPickTemplate={pickTemplate}
          attachments={attachments}
          onAddFiles={(files) => void handleAddFiles(files)}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
        />
      </div>
    </div>
  )
}
