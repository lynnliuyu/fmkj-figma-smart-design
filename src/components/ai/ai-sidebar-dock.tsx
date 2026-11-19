'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Coins,
  FileText,
  History,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Ruler,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu'
import { IconButton } from '@astryxdesign/core/IconButton'
import { useToast } from '@astryxdesign/core/Toast'
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
import { GuardedLink } from '@/components/guarded-link'
import { ListItem } from '@astryxdesign/core/List'
import {
  aiDraftKey,
  draftOnKeyChange,
  getDraftStorage,
  readAiDraft,
  resolveDraftOnFailure,
  useDraftAcceptedClear,
  writeAiDraft,
  type AiDraftState,
} from '@/lib/ai-draft'
import { cn } from '@/lib/utils'
import { AI_MODELS, DEFAULT_AI_TEMPLATES, fillPromptTemplate } from '@/plugins/ai-copilot/templates'

/** 空态「常用任务」三行的图标，顺序与 DEFAULT_AI_TEMPLATES.slice(0, 3) 对齐。 */
const TASK_ICONS = [Sparkles, Ruler, FileText] as const

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
  userId,
  collapsed = false,
  onToggleCollapsed,
  onClose,
  transitionsEnabled = true,
}: {
  plugins: AiConnectablePlugin[]
  projects: AiProjectContext[]
  credits: number
  configured: boolean
  models?: AiModelOption[]
  /** 打开时预先填进输入框的内容（例如从插件页带过来的问题） */
  initialInput?: string
  /** 当前登录用户：草稿按「用户 + 会话」隔离存储，换账号不会看到别人的草稿 */
  userId: string
  /** 宽屏常驻列是否收起成图标栏；抽屉模式始终为 false */
  collapsed?: boolean
  /** 宽屏常驻列的收起/展开回调；抽屉模式不传（不显示收起按钮） */
  onToggleCollapsed?: () => void
  /** 抽屉模式的关闭回调；传入后 header 最右侧显示关闭按钮 */
  onClose?: () => void
  /**
   * 首帧先不开宽度/淡出过渡，等存储里的收起态落定后再启用，避免刷新时闪一下动画。
   * 与 ai-panel.tsx 的 transitionsEnabled 同源。
   */
  transitionsEnabled?: boolean
}) {
  const availableModels = customModels?.length ? customModels : AI_MODELS
  const pathname = usePathname()
  const router = useRouter()
  const showToast = useToast()
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

  /*
   * 输入框草稿。
   *
   * 面板在 inline / drawer 之间切换、抽屉开关时整个 dock 会卸载，原来放在
   * useState 里的 input 随之丢失（实测：1440 输入 → 1439 → 回 1440 变空；
   * 抽屉输入 → Esc → 重开变空）。这里把草稿按「用户 + 会话」写进 sessionStorage，
   * 重挂时读回来。注意这是**卸载丢 state**，不是发送后清空的顺序问题。
   *
   * 键随 activeId 变化：不同会话独立草稿；新对话用 'new'。发送成功后的
   * `setInput('')`（见 send）会把这个键删掉，不会残留已发送内容。
   */
  const draftKey = aiDraftKey(userId, activeId)
  const [input, setInputState] = useState(() => {
    if (initialInput) return initialInput
    return readAiDraft(getDraftStorage(), draftKey) ?? ''
  })
  const setInput = useCallback(
    (value: string) => {
      setInputState(value)
      writeAiDraft(getDraftStorage(), draftKey, value)
    },
    [draftKey],
  )

  // 首个业务事件（meta / delta / tool）到达 = 服务端已受理这一轮（用户消息已落库、
  // 开始产出），此刻才清空草稿。status / reasoning 之前失败都不算送出。收敛成
  // useDraftAcceptedClear 这个可挂载 hook：它只在首次受理时调用一次 onClear，
  // 测试能对「首次受理真的清空输入与附件」做行为级断言，不再盯源码字符串。
  const handleAcceptedClear = useCallback(
    (t: AiDraftState<AiAttachment>) => {
      setInput(t.input)
      setAttachments(t.attachments)
    },
    [setInput],
  )
  const { acceptedRef, onEvent: emitAcceptedClear } =
    useDraftAcceptedClear<AiAttachment>(handleAcceptedClear)
  // 会话切换时必须**换成目标会话的草稿**（没有就空），不能因为当前输入框非空
  // 就把旧会话内容带过去（实测：A 输入 → 切 B，B 显示 A 的内容）。
  // 用「上一次的键」比较，只在键真正变化时同步一次；键没变（用户正在打字）
  // 时绝不覆盖。
  const draftKeyRef = useRef(draftKey)
  const draftInitRef = useRef(false)
  useEffect(() => {
    const storage = getDraftStorage()
    if (!draftInitRef.current) {
      draftInitRef.current = true
      if (initialInput) {
        // 从插件页带过来的预填问题：写进草稿，跳走再回来还在
        writeAiDraft(storage, draftKey, initialInput)
        return
      }
    }
    const sync = draftOnKeyChange(draftKeyRef.current, draftKey, storage, input)
    if (!sync.changed) return
    draftKeyRef.current = draftKey
    setInputState(sync.value)
  }, [draftKey, initialInput, input])

  // 输入框与附件的实时值镜像：send() 闭包拿到的是发送那一刻的旧快照，等待期间
  // 用户继续输入只会更新 state。失败恢复草稿时要读这里的最新值，
  // 否则「用户新输入优先」永远走不到。layout effect 保证提交后立刻同步。
  const liveDraftRef = useRef({ input, attachments })
  useLayoutEffect(() => {
    liveDraftRef.current = { input, attachments }
  }, [input, attachments])

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
      showToast({ body: '读取会话失败', type: 'error' })
    } finally {
      setLoadingHistory(false)
    }
  }

  async function deleteConversation(id: string) {
    const res = await fetch(`/ai/conversations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      showToast({ body: '删除失败', type: 'error' })
      return
    }
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
        showToast({
          body: `暂不支持「${file.name}」，请拖入 PNG/JPG 户型图、CAD .dxf 文件、JSON 点位文件或 CSV/TXT 清单`,
          type: 'error',
        })
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
          showToast({ body: `${file.name}：${msg}`, type: 'error' })
          setAttachments((prev) => prev.filter((a) => a.id !== id))
        }
        continue
      }

      // 读取 JSON 或文本文件
      try {
        const rawText = await file.text()
        const trimmed = rawText.trim()
        if (!trimmed) {
          showToast({ body: `${file.name} 内容为空`, type: 'error' })
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
        showToast({ body: `读取文件 ${file.name} 失败`, type: 'error' })
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
    if (!configured) {
      showToast({ body: '还没有配置 AI 密钥', type: 'error' })
      return
    }
    if (credits < 1) {
      showToast({ body: '积分已用完，请在「会员与积分」页兑换或联系管理员发放', type: 'error' })
      return
    }

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

    // 草稿快照：请求在受理前失败（500 / 网络中断 / 402）时原样还回输入框与附件。
    const draftSnapshot = { input, attachments }

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
    // 输入框与附件不在这里清空 —— 只有服务端确认受理（收到首个业务事件）后才清。
    // 否则 500 / 网络中断会让用户的正文与附件凭空消失（实测 FAIL-500-DRAFT 复现）。
    acceptedRef.current = false
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
          if (ev.type === 'error') {
            const err = new Error(String(ev.error)) as Error & { code?: string }
            err.code = typeof ev.code === 'string' ? ev.code : undefined
            throw err
          }
          // 首个业务事件时才触发第一次清空；类型不重要，事件类型判断在 hook 内。
          // status/reasoning/done 等非受理事件不会把 accepted 置真，也不会清空。
          emitAcceptedClear(ev.type)
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
            const err = new Error(String(ev.error)) as Error & { code?: string }
            err.code = typeof ev.code === 'string' ? ev.code : undefined
            throw err
          }
        }
      }
    } catch (error) {
      const aborted = (error as Error).name === 'AbortError'
      const billingRejected = (error as Error & { code?: string }).code === 'billing_rejected'
      // 受理前失败：这一轮什么都没发生，把草稿（内存 + sessionStorage）还回去。
      // 受理后失败：用户消息已落库，草稿已在受理时清空，再还回去会重复发送。
      const decision = resolveDraftOnFailure(
        acceptedRef.current,
        getDraftStorage(),
        draftKey,
        draftSnapshot,
        () => liveDraftRef.current,
      )
      if (decision.kind === 'restore-draft') {
        setInputState(decision.draft.input)
        setAttachments(decision.draft.attachments)
        dropReply()
      }
      if (aborted) {
        // 用户主动停止：沿用原行为，收起这条未完成的回复气泡。
        dropReply()
      } else if (billingRejected) {
        // 业务拒绝（如并发扣费时积分不足）：回复内容已经流式发出，但本次没扣费，必须明确告诉用户。
        showToast({
          body: (error as Error).message || '积分不足，本次回复未计费',
          type: 'error',
        })
      } else {
        if (decision.kind === 'restore-draft') {
          showToast({ body: (error as Error).message || '发送失败，请稍后重试', type: 'error' })
        } else {
          patchReply((m) =>
            m.content
              ? m
              : {
                  ...m,
                  content: `发送失败：${(error as Error).message || '请稍后重试'}`,
                  error: true,
                },
          )
        }
      }
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
      className="relative flex h-full min-h-0 flex-col text-sidebar-foreground"
    >
      {/*
        顶部固定行：展开时是「标题 + 会话下拉 / 新对话 / 更多 / 收起」，
        收起时同一批按钮在右侧排成一列图标（收起按钮仍是最先点到的那个节点）。
        抽屉模式不传 onToggleCollapsed，因此不出现收起按钮与图标栏。
      */}
      <div
        data-slot="ai-panel-header"
        className={cn(
          'shrink-0',
          collapsed
            ? 'ml-auto flex w-12 flex-col items-center gap-1 px-1.5 pt-4 pb-2'
            : onToggleCollapsed
              ? 'flex h-12 items-center gap-1 border-b border-sidebar-border px-2'
              : 'flex h-12 items-center gap-1 border-b border-sidebar-border px-2',
        )}
      >
        {/* DOM 顺序与收起态视觉/Tab 顺序一致：展开 → 新对话 → 会话历史 → 更多。
            展开态用 order 把这几个按钮排回「标题 / 新对话 / 更多 / 收起」。 */}
        {onToggleCollapsed ? (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            label={collapsed ? '展开 AI 对话' : '收起 AI 对话'}
            tooltip={collapsed ? '展开 AI 对话' : '收起 AI 对话'}
            icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
            className={cn(!collapsed && 'order-4')}
          />
        ) : null}

        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          label="新对话"
          tooltip="新对话"
          onClick={startNew}
          icon={<SquarePen />}
          className={cn(!collapsed && 'order-2')}
        />

        <DropdownMenu
          menuWidth="16rem"
          // 收起时从图标栏向外展开（右侧没空间时浏览器会自动翻到左侧）。
          placement={collapsed ? 'end' : 'below'}
          renderTrigger={(props) =>
            collapsed ? (
              <IconButton
                {...props}
                type="button"
                variant="ghost"
                size="sm"
                label="会话历史"
                tooltip="会话历史"
                icon={<History />}
              />
            ) : (
              // 与左侧栏 header 的菜单行同一套尺寸/圆角/hover；renderTrigger 的
              // ARIA 与 ref 原样透传，保证下拉的锚点和键盘行为不变。
              <button
                {...props}
                type="button"
                aria-label={`AI 对话：${activeTitle}`}
                className="order-1 flex min-w-0 flex-1 items-center justify-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                  <MessageSquareText className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  {onToggleCollapsed ? (
                    <span className="truncate text-sm font-semibold tracking-wide">AI 对话</span>
                  ) : null}
                  <span
                    className={cn(
                      'truncate',
                      onToggleCollapsed
                        ? 'text-xs font-normal text-muted-foreground'
                        : 'text-sm font-medium',
                    )}
                  >
                    {activeTitle}
                  </span>
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            )
          }
        >
          <DropdownMenuGroup title="最近对话">
            {conversations.length === 0 ? <DropdownMenuItem label="还没有对话" isDisabled /> : null}
            {conversations.map((c) => (
              <DropdownMenuItem
                key={c.id}
                label={
                  <span className={cn('truncate', c.id === activeId && 'font-medium')}>
                    {c.title}
                  </span>
                }
                onClick={() => void openConversation(c.id)}
              />
            ))}
          </DropdownMenuGroup>
        </DropdownMenu>

        <DropdownMenu
          placement={collapsed ? 'end' : 'below'}
          alignment="end"
          menuWidth="12rem"
          renderTrigger={(props) => (
            <IconButton
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              label="更多"
              tooltip="更多"
              icon={<MoreHorizontal />}
              className={cn(!collapsed && 'order-3')}
            />
          )}
        >
          <DropdownMenuGroup title={<span className="tabular-nums">剩余 {credits} 积分</span>} />
          <DropdownMenuDivider />
          {/* 官方的菜单行是唯一可交互目标（不允许在行内再嵌按钮），
              所以删除从「每行悬浮按钮」改为在这里删除当前打开的对话。 */}
          <DropdownMenuItem
            label="删除当前对话"
            icon={<Trash2 className="size-4" />}
            variant="destructive"
            isDisabled={!activeId}
            onClick={() => {
              if (activeId) void deleteConversation(activeId)
            }}
          />
        </DropdownMenu>

        {onClose ? (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            label="关闭 AI 对话"
            tooltip="关闭 AI 对话"
            icon={<X />}
            onClick={onClose}
            className="order-4"
          />
        ) : null}
      </div>

      <div
        data-slot="ai-panel-content"
        inert={collapsed}
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          transitionsEnabled &&
            'transition-opacity duration-200 ease-linear motion-reduce:transition-none',
          collapsed && 'pointer-events-none opacity-0',
        )}
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

        <div
          ref={scroller}
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-2"
        >
          {!configured ? (
            <div className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>尚未配置 AI 密钥，请联系管理员在后台配置。</span>
            </div>
          ) : null}
          {loadingHistory ? (
            <Loader2 className="m-auto size-4 animate-spin text-muted-foreground" />
          ) : messages.length === 0 ? (
            <div className="w-full py-2 animate-enter">
              <p className="px-3 pb-2 text-sm text-muted-foreground">
                {project ? `关于「${project.name}」，` : ''}
                选择一个常用任务，或直接描述需求、拖入户型图与清单。
              </p>
              {/* ⚠️ 官方 ListItem 的根是 grid 项且 min-width:auto：在 320px 面板里
                  会被内容撑到 681px，把整栏内容裁掉（#182 验收 F1）。
                  这里给容器与每行都加 min-w-0，让它按面板宽度收缩。 */}
              <div className="grid min-w-0 gap-1 px-2">
                <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">常用任务</p>
                {DEFAULT_AI_TEMPLATES.slice(0, 3).map((t, index) => {
                  const Icon = TASK_ICONS[index] ?? Sparkles
                  return (
                    <div key={t.id} className="min-w-0">
                      <ListItem
                        label={t.name}
                        description={t.description || undefined}
                        startContent={
                          <span className="flex size-5 shrink-0 items-center justify-center text-sidebar-foreground/70">
                            <Icon />
                          </span>
                        }
                        endContent={
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        }
                        align="start"
                        onClick={() => pickTemplate(t.id)}
                      />
                    </div>
                  )
                })}
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
              <Button
                type="button"
                variant="primary"
                size="sm"
                label="仅导入开关"
                className="rounded-full text-xs"
                onClick={() =>
                  void send(
                    '请将上传的户型图添加到当前项目点位图，仅导入识别到的开关点位（importMode=switches）',
                  )
                }
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                label="导入全部（开关+灯具）"
                className="rounded-full text-xs text-muted-foreground"
                onClick={() =>
                  void send(
                    '请将上传的户型图添加到当前项目点位图，导入识别到的全部开关与灯具点位（importMode=all）',
                  )
                }
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                label="仅添加干净底图"
                className="rounded-full text-xs text-muted-foreground"
                onClick={() =>
                  void send(
                    '请只将上传的户型图作为干净底图添加到点位图，不自动生成任何点位（importMode=none）',
                  )
                }
              />
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

        {/* 与左侧栏 footer 同款的状态行：积分来源与「更多」菜单里的数字一致；
          账户菜单仍只在左侧栏，这里不重复。 */}
        <footer
          data-slot="ai-panel-footer"
          className="flex h-13 shrink-0 items-center gap-1 border-t border-sidebar-border p-2 text-xs text-sidebar-foreground/70"
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
            <Coins className="size-3.5 shrink-0" />
            <span className="truncate">
              剩余{' '}
              <span className="font-medium text-sidebar-foreground tabular-nums">
                {credits.toLocaleString('zh-CN')}
              </span>{' '}
              积分
            </span>
          </span>
          <GuardedLink
            href="/membership"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            会员
          </GuardedLink>
          <GuardedLink
            href="/settings"
            aria-label="设置"
            title="设置"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Settings className="size-4" />
          </GuardedLink>
        </footer>
      </div>
    </div>
  )
}
