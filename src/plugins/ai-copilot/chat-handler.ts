import { getCompanyInfo } from '@/lib/cached-data'
import { getPayloadClient } from '@/lib/payload'
import { loadProjectDocs } from '@/lib/project-docs'
import { recordAiErrorDiagnostic } from '@/lib/usage-diagnostics'
import type { User } from '@/payload-types'
import { getPluginFlags } from '@/plugins/state'

import { UsageLedger } from './billing'
import {
  AiError,
  availableTools,
  complete,
  findModel,
  inferRouteScene,
  rankModelsForScene,
  resolveAutoRouteModel,
  resolveModelApiKey,
  runTool,
  streamTurn,
  stripDsml,
  systemPrompt,
  type LlmContentPart,
  type LlmMessage,
  type RouteScene,
  type StreamTurnResult,
  type ToolContext,
} from './server'
import { isVisionCapableModel, type AiModelConfig } from './templates'
import type { ToolImage } from './tools/context'
import {
  awaitRecognition,
  getCachedDetectedBundle,
  IMAGE_KIND_LABEL,
  type UploadImageKind,
} from './upload-handler'
import { callVision, loadImageDataUrlForVision, providerImageUrl, rankVisionModels } from './vision'

const MAX_INPUT = 32000
const HISTORY = 24
const MAX_STEPS = 10
const BRIEF_MARKER = '\n\n【视觉识图结论】'
const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status })

/** 后续追问里出现这些说法时，自动把本会话最近一张图片带上（并重新走视觉看图） */
const IMAGE_FOLLOWUP_RE =
  /这张|那张|刚才|上传的|图纸|图片|照片|截图|效果图|户型|看图|识图|识别|看一下|看看|图上|图里|图中|参考图/

type ImageRef = { name: string; mediaId: string; url: string }
type ToolLogEntry = {
  pluginId: string
  pluginName: string
  summary: string
  href?: string
  hrefLabel?: string
  imageUrl?: string
  details?: string[]
}

/** 从消息文本的【已上传附件】段落中提取上传图片的元信息（name, mediaId, url） */
function parseUploadedImageRefs(text: string): ImageRef[] {
  const refs: ImageRef[] = []
  const re =
    /- \[图片\]\s*([^\s(]+)[^\n]*?mediaId:\s*([^\s,)]*),\s*URL:\s*(\/api\/media\/file\/[^\s,)]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    refs.push({
      name: m[1]?.trim() || '图片',
      mediaId: m[2]?.trim() || '',
      url: m[3]?.trim() || '',
    })
  }
  return refs
}

const visiblePart = (text: string) => text.replace(/\n*【已上传附件】[\s\S]*$/, '').trim()
const shortName = (m: AiModelConfig) => m.name.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || m.name
const firstSentence = (s: string) => {
  const plain = s
    .replace(/[#*`>|_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const cut = plain.search(/[。！？；\n]/)
  return (cut > 8 ? plain.slice(0, cut) : plain).slice(0, 60)
}

function describePage(path: unknown, projectName?: string | null): string | null {
  if (typeof path !== 'string' || !path.startsWith('/')) return null
  const p = path.split('?')[0]
  const rules: [RegExp, string][] = [
    [/^\/projects\/new/, '新建项目页'],
    [/^\/projects\/[^/]+\/point-map/, '点位图编辑页'],
    [/^\/projects\/[^/]+\/quotes\/[^/]+/, '报价单编辑页'],
    [/^\/projects\/[^/]+\/quotes/, '项目报价列表'],
    [/^\/projects\/[^/]+\/contract/, '施工合同页'],
    [/^\/projects\/[^/]+\/archive/, '归档与交付页'],
    [/^\/projects\/[^/]+\/after-sales/, '售后维保页'],
    [/^\/projects\/[^/]+$/, '项目概览页'],
    [/^\/projects$/, '项目列表'],
    [/^\/products/, '产品库'],
    [/^\/quotes/, '报价单列表'],
    [/^\/membership/, '会员与积分页'],
    [/^\/settings/, '设置页'],
    [/^\/ai/, 'AI 对话全屏页'],
  ]
  for (const [re, label] of rules) {
    if (!re.test(p)) continue
    return projectName && /^\/projects\/(?!new)[^/]+/.test(p)
      ? `${label}（项目「${projectName}」）`
      : label
  }
  return null
}

/** 较早的历史消息：折叠大段附件内容与旧的看图结论，控制上下文长度 */
function compactHistoryContent(content: string, keepFull: boolean): string {
  if (keepFull) return content
  let out = content.replace(/```(?:json|text)?\n[\s\S]*?```/g, '[附件内容已省略]')
  const bi = out.indexOf(BRIEF_MARKER)
  if (bi >= 0) {
    const brief = out.slice(bi + BRIEF_MARKER.length)
    out = out.slice(0, bi) + BRIEF_MARKER + brief.slice(0, 280) + (brief.length > 280 ? '…' : '')
  }
  return out.length > 6000 ? `${out.slice(0, 6000)}…` : out
}

function imageFacts(
  img: { mediaId?: string | null; url?: string | null; kind?: string | null; name?: string },
  i: number,
) {
  const bundle = getCachedDetectedBundle(img.mediaId, img.url)
  const kind = (bundle?.imageKind ?? img.kind ?? 'floor-plan') as UploadImageKind
  const parts = [`图${i + 1}「${img.name ?? '图片'}」：${IMAGE_KIND_LABEL[kind] ?? '图片'}`]
  if (kind === 'floor-plan' && bundle) {
    if (bundle.summary?.confirmText)
      parts.push(`平台识别结果：${bundle.summary.confirmText.replace(/\n/g, '；')}`)
    if (bundle.vision?.status === 'pending')
      parts.push('视觉复核仍在进行（add_floor_sheet 会自动等待复核完成后再落图）')
    if (bundle.vision?.legend?.length)
      parts.push(`图例：${bundle.vision.legend.slice(0, 8).join('；')}`)
    if (bundle.vision?.issues?.length) parts.push(`识别存疑：${bundle.vision.issues.join('；')}`)
  }
  if (bundle?.vision?.caption) parts.push(`概述：${bundle.vision.caption}`)
  return `- ${parts.join('；')}`
}

const VISION_BRIEF_SYSTEM =
  '你是「繁梦空间」全屋智能设计平台的视觉分析助手，负责替主对话模型看图。只陈述图中能确认的事实；看不清的写「无法辨认」；不要编造型号、数量或价格。'

function buildBriefPrompt(question: string, images: ToolImage[]) {
  return [
    `用户的问题/指令：${question || '（用户只上传了图片，请概括图片内容并判断用途）'}`,
    '平台已知的图片信息：',
    ...images.map((img, i) => imageFacts(img, i)),
    '请输出 Markdown（900 字以内）：',
    '1. 图片类型与整体概况；',
    '2. 关键信息——户型/点位图：房间清单、图例含义、各房间开关/灯具/智能设备的数量与位置特点、图中文字标注（与平台识别结果核对，指出不一致之处）；报价单/清单截图：逐行转写为表格（品名｜品牌｜型号规格｜数量｜单价｜金额）并给出合计；实景照片/效果图：空间类型、风格、材质色调、灯光氛围、可见的智能设备与可改进之处；',
    '3. 与用户问题直接相关的判断与建议；',
    '4. 存疑或看不清的地方。',
  ].join('\n')
}

function truncateToolOutput(json: string) {
  return json.length > 14000 ? `${json.slice(0, 14000)}…（结果过长已截断）` : json
}

/**
 * AI 对话（网页侧栏和微信小程序共用）：{ conversationId?, message, modelId, projectId?, pluginIds?, pagePath? }
 * 返回 NDJSON 流：meta → status* → tool* → reasoning* / delta* → done | error。
 *
 * - 带图片的任务一律先由视觉模型看图（看图结论注入上下文并随消息保存），视觉模型本身也会直接收到图片；
 * - 正文与思考过程流式输出，支持多步连续调用工具；
 * - 模型出错时自动切换到同场景的下一个可用模型；
 * - 按每个模型的真实价格分别计费后合计，调用成功后才扣费。
 */
export async function handleAiChat(request: Request, user: User): Promise<Response> {
  const [flags, company] = await Promise.all([getPluginFlags(user.id), getCompanyInfo(user.id)])
  if (!flags['ai-copilot']) return fail(404, '「AI 对话」插件已关闭')

  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown
    message?: unknown
    modelId?: unknown
    projectId?: unknown
    pluginIds?: unknown
    pagePath?: unknown
  } | null
  // 重新发送历史消息时，去掉上次保存的看图结论，本轮重新看图
  const text =
    typeof body?.message === 'string'
      ? body.message.replace(/\n*【视觉识图结论】[\s\S]*$/, '').trim()
      : ''
  if (!text) return fail(400, '请输入内容')
  if (text.length > MAX_INPUT) return fail(400, `单条消息最多 ${MAX_INPUT} 字`)
  const visibleText = visiblePart(text)

  const requestedModel = findModel(body?.modelId, company.aiModels)
  if (!requestedModel) return fail(400, '不支持的模型')
  const isAutoMode = requestedModel.id === 'auto'
  const pluginIds = Array.isArray(body?.pluginIds)
    ? body.pluginIds.filter((v): v is string => typeof v === 'string')
    : []

  const payload = await getPayloadClient()
  const me = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
    select: { aiCredits: true },
  })
  if ((me.aiCredits ?? 0) < 1)
    return fail(402, '积分已用完，请在「会员与积分」页兑换或联系管理员发放')

  // 会话：沿用自己的会话，或新建
  let conversationId =
    typeof body?.conversationId === 'string' && body.conversationId ? body.conversationId : null
  let history: LlmMessage[] = []
  let convProjectId: string | null = null
  const sessionUploads: ImageRef[] = []
  if (conversationId) {
    const conv = await payload
      .findByID({
        collection: 'ai-conversations',
        id: conversationId,
        depth: 0,
        user,
        overrideAccess: false,
      })
      .catch(() => null)
    if (!conv) return fail(404, '会话不存在')
    if (conv.project)
      convProjectId =
        typeof conv.project === 'object' && conv.project !== null && 'id' in conv.project
          ? String((conv.project as { id: unknown }).id)
          : String(conv.project)
    const { docs } = await payload.find({
      collection: 'ai-messages',
      where: { conversation: { equals: conversationId } },
      sort: '-createdAt',
      limit: HISTORY,
      depth: 0,
      user,
      overrideAccess: false,
      select: { role: true, content: true, toolCalls: true },
    })
    const chronological = docs.reverse()
    for (const m of chronological) {
      if (m.role !== 'user' || typeof m.content !== 'string') continue
      for (const ref of parseUploadedImageRefs(m.content))
        if (!sessionUploads.some((u) => u.url === ref.url)) sessionUploads.push(ref)
    }
    history = chronological.map((m, idx) => {
      let msgContent = compactHistoryContent(m.content, idx >= chronological.length - 4)
      if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
        const toolSummary = (m.toolCalls as Array<{ pluginName?: string; summary?: string }>)
          .map((t) => `${t.pluginName ?? '工具'}：${t.summary ?? '已执行'}`)
          .join('；')
        msgContent = `${msgContent}\n\n[历史已执行工具记录：${toolSummary}]`
      }
      return { role: m.role, content: msgContent } as LlmMessage
    })
  }

  // 本轮图片：本条消息附带的图片；追问里提到图纸/图片时自动带上本会话最近一张
  const currentRefs = parseUploadedImageRefs(text)
  for (const ref of currentRefs)
    if (!sessionUploads.some((u) => u.url === ref.url)) sessionUploads.push(ref)
  let imageRefs = currentRefs
  if (!imageRefs.length && sessionUploads.length && IMAGE_FOLLOWUP_RE.test(visibleText))
    imageRefs = [sessionUploads[sessionUploads.length - 1]]
  imageRefs = imageRefs.slice(0, 3)
  const hasImages = imageRefs.length > 0

  // 若前端未显式传 projectId，自动从当前会话继承上一轮创建或关联的项目
  const projectId =
    (typeof body?.projectId === 'string' && body.projectId ? body.projectId : null) ?? convProjectId
  const [project, loadedImages] = await Promise.all([
    projectId ? loadProjectDocs(projectId, user).catch(() => null) : Promise.resolve(null),
    Promise.all(
      imageRefs.map(async (ref): Promise<ToolImage | null> => {
        const kind = getCachedDetectedBundle(ref.mediaId, ref.url)?.imageKind ?? 'floor-plan'
        const dataUrl = await loadImageDataUrlForVision(
          { mediaId: ref.mediaId, url: ref.url },
          kind === 'floor-plan' ? 2048 : 1600,
        )
        return dataUrl
          ? { dataUrl, mediaId: ref.mediaId, url: ref.url, kind, name: ref.name }
          : null
      }),
    ),
  ])
  const images = loadedImages.filter((i): i is ToolImage => Boolean(i))
  // 平台已取消会员分级：所有已启用且配置了密钥的模型都对用户开放
  const visionModels = rankVisionModels(company.aiModels)

  // 选择本轮主模型：Auto 按场景路由；手动选择时尊重用户选择（出错时才自动切换）
  const initialScene: RouteScene = inferRouteScene({ hasImage: hasImages, userText: visibleText })
  const chainFor = (primary: AiModelConfig | null, scene: RouteScene): AiModelConfig[] => {
    const out: AiModelConfig[] = []
    const add = (m?: AiModelConfig | null) => {
      if (m && m.id !== 'auto' && !out.some((x) => x.id === m.id) && resolveModelApiKey(m))
        out.push(m)
    }
    add(primary)
    for (const m of rankModelsForScene(company.aiModels, scene)) add(m)
    if (scene !== 'fast') for (const m of rankModelsForScene(company.aiModels, 'expert')) add(m)
    for (const m of rankModelsForScene(company.aiModels, 'fast')) add(m)
    return out.slice(0, 3)
  }
  let activeModel: AiModelConfig = isAutoMode
    ? resolveAutoRouteModel(company.aiModels, { hasImage: hasImages, userText: visibleText }).model
    : requestedModel
  if (!resolveModelApiKey(activeModel)) {
    const alt = chainFor(null, initialScene)[0]
    if (!alt)
      return fail(
        503,
        `模型「${activeModel.name}」还没有配置密钥环境变量（${activeModel.apiKeyEnv}），请在设置或环境变量中添加`,
      )
    activeModel = alt
  }

  if (!conversationId) {
    const cleanTitle = visibleText || (hasImages ? '图片识别与处理' : '新对话')
    const conv = await payload.create({
      collection: 'ai-conversations',
      data: {
        title: cleanTitle.slice(0, 30),
        owner: user.id,
        ...(project ? { project: projectId } : {}),
        model: requestedModel.id,
      },
      user,
      overrideAccess: false,
      depth: 0,
    })
    conversationId = String(conv.id)
  }
  const userMsgDoc = await payload.create({
    collection: 'ai-messages',
    data: { conversation: conversationId, owner: user.id, role: 'user', content: text },
    overrideAccess: true,
    depth: 0,
  })

  const tools = availableTools(activeModel.id, pluginIds, flags)
  const toolDefs = tools.map((t) => t.definition)
  const toolTitle = (name: string) => tools.find((t) => t.spec.name === name)?.pluginName ?? name
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: systemPrompt(project, pluginIds, flags, sessionUploads, {
        userName: user.name,
        credits: me.aiCredits ?? 0,
        pageLabel: describePage(body?.pagePath, project?.project.name),
        hasImages,
      }),
    },
    ...history,
    { role: 'user', content: text },
  ]
  const userIndex = messages.length - 1
  const encoder = new TextEncoder()

  /** 视觉模型作为主模型时，同时把原图附在本轮用户消息里，让它自己再看一遍 */
  const messagesFor = (m: AiModelConfig): LlmMessage[] => {
    if (!images.length || !isVisionCapableModel(`${m.id} ${m.apiModel} ${m.name}`)) return messages
    return messages.map((msg, idx) => {
      if (idx !== userIndex || msg.role !== 'user' || typeof msg.content !== 'string') return msg
      const parts: LlmContentPart[] = [
        ...images.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: providerImageUrl(m, img.dataUrl) },
        })),
        { type: 'text', text: msg.content },
      ]
      return { role: 'user', content: parts }
    })
  }
  const displayModelLabel = (m: AiModelConfig) => (isAutoMode ? `Auto · ${shortName(m)}` : m.name)

  const body$ = new ReadableStream({
    async start(controller) {
      let closed = false
      const send = (o: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`))
        } catch {
          closed = true
        }
      }
      // 看图、工具调用与深度推理期间每 8 秒发一次心跳，防止小程序、移动网络或反向代理空闲断开
      const heartbeat = setInterval(() => send({ type: 'ping' }), 8000)
      send({
        type: 'meta',
        conversationId,
        modelId: activeModel.id,
        modelName: displayModelLabel(activeModel),
      })

      const ledger = new UsageLedger()
      const toolLog: ToolLogEntry[] = []
      const ctx: ToolContext = {
        user,
        projectId,
        project,
        mutated: false,
        onProjectChange(proj) {
          send({ type: 'project', project: proj })
        },
        images,
        visionModels,
        recordUsage: (model, usage, fallback) => ledger.add(model, usage, fallback),
        notify: (status) => send({ type: 'status', text: status }),
      }
      const promptText = () =>
        messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n')

      try {
        // 1) 带图任务：视觉模型先看图，结论注入上下文并随用户消息保存
        if (hasImages) {
          let visionBrief = ''
          if (!images.length) {
            send({ type: 'status', text: '图片读取失败，请重新上传后再试' })
          } else if (!visionModels.length) {
            send({ type: 'status', text: '后台尚未配置视觉模型，本轮只能参考平台识别结果' })
          } else {
            send({ type: 'status', text: `正在由视觉模型看图（${images.length} 张）…` })
            const recognitionWait = Promise.all(
              images
                .filter((i) => i.kind === 'floor-plan')
                .map((i) => awaitRecognition(i.mediaId, i.url, 35_000)),
            )
            const [brief] = await Promise.all([
              callVision({
                images: images.map((i) => i.dataUrl),
                system: VISION_BRIEF_SYSTEM,
                prompt: buildBriefPrompt(visibleText, images),
                models: visionModels,
                maxTokens: 1800,
                timeoutMs: 75_000,
                signal: request.signal,
              }),
              recognitionWait,
            ])
            if (brief) {
              ledger.add(brief.model, brief.usage, { input: visibleText, output: brief.text })
              visionBrief = brief.text.trim()
              const entry: ToolLogEntry = {
                pluginId: 'vision',
                pluginName: '视觉识图',
                summary: `已由 ${shortName(brief.model)} 看图：${firstSentence(visionBrief)}`,
                details: [visionBrief.slice(0, 4000)],
              }
              toolLog.push(entry)
              send({ type: 'tool', ...entry })
            } else {
              send({ type: 'status', text: '视觉模型暂时不可用，已改用平台识别结果作答' })
            }
          }
          const facts = images.length
            ? images.map((img, i) => imageFacts(img, i)).join('\n')
            : '- 图片读取失败，无法看图，请提示用户重新上传。'
          const injected = `${BRIEF_MARKER}\n${facts}${visionBrief ? `\n\n${visionBrief}` : '\n（本轮没有视觉看图结论，请只依据上述平台识别结果回答，并提醒用户核对）'}`
          messages[userIndex] = { role: 'user', content: `${text}${injected}` }
          ctx.visionBrief = visionBrief
          void payload
            .update({
              collection: 'ai-messages',
              id: userMsgDoc.id,
              data: { content: `${text}${injected}`.slice(0, 60000) },
              overrideAccess: true,
              depth: 0,
            })
            .catch(() => null)
        }

        // 2) 主对话：流式输出 + 多步工具调用 + 出错自动切换模型
        let fullContent = ''
        let needSeparator = false
        let emittedThisTurn = false
        const pushDelta = (t: string) => {
          if (!t) return
          if (needSeparator && fullContent.trim()) {
            fullContent += '\n\n'
            send({ type: 'delta', text: '\n\n' })
          }
          needSeparator = false
          emittedThisTurn = true
          fullContent += t
          send({ type: 'delta', text: t })
        }
        const onReasoning = (t: string) => send({ type: 'reasoning', text: t })
        const calledToolNames: string[] = []

        const runTurn = async (withTools: boolean): Promise<StreamTurnResult> => {
          const scene = inferRouteScene({
            hasImage: hasImages,
            userText: visibleText,
            calledToolNames,
          })
          let lastError: unknown = null
          for (const candidate of chainFor(activeModel, scene)) {
            emittedThisTurn = false
            const input = promptText()
            let turn: StreamTurnResult | null = null
            try {
              turn = await streamTurn(candidate, messagesFor(candidate), {
                tools: withTools ? toolDefs : undefined,
                onDelta: pushDelta,
                onReasoning,
                signal: request.signal,
              })
            } catch (error) {
              lastError = error
              if (emittedThisTurn) throw error
              try {
                const msg = await complete(
                  candidate,
                  messagesFor(candidate),
                  withTools ? toolDefs : undefined,
                )
                turn = {
                  content: msg.content ?? '',
                  reasoning: '',
                  tool_calls: msg.tool_calls ?? [],
                  usage: msg.usage ?? null,
                }
                if (turn.content) pushDelta(turn.content)
              } catch (error2) {
                lastError = error2
              }
            }
            if (!turn) continue
            ledger.add(candidate, turn.usage, {
              input,
              output: turn.content + turn.reasoning + JSON.stringify(turn.tool_calls),
            })
            if (candidate.id !== activeModel.id) {
              activeModel = candidate
              send({
                type: 'meta',
                conversationId,
                modelId: activeModel.id,
                modelName: displayModelLabel(activeModel),
              })
              send({
                type: 'status',
                text: `原模型暂时不可用，已自动切换到 ${shortName(activeModel)}`,
              })
            }
            return turn
          }
          throw lastError instanceof AiError
            ? lastError
            : new AiError('AI 服务暂时不可用，请稍后重试')
        }

        let finished = false
        for (let step = 0; step < MAX_STEPS; step++) {
          if (request.signal.aborted) break
          if (isAutoMode && calledToolNames.length) {
            const routed = resolveAutoRouteModel(company.aiModels, {
              hasImage: hasImages,
              userText: visibleText,
              calledToolNames,
            }).model
            if (routed.id !== activeModel.id && resolveModelApiKey(routed)) {
              activeModel = routed
              send({
                type: 'meta',
                conversationId,
                modelId: activeModel.id,
                modelName: displayModelLabel(activeModel),
              })
            }
          }
          const turn = await runTurn(toolDefs.length > 0)
          if (!turn.tool_calls.length) {
            finished = true
            break
          }
          messages.push({
            role: 'assistant',
            content: turn.content || null,
            tool_calls: turn.tool_calls,
          })
          for (const call of turn.tool_calls) {
            calledToolNames.push(call.function.name)
            send({ type: 'status', text: `正在执行：${toolTitle(call.function.name)}…` })
            const r = await runTool(tools, call, ctx)
            if (r.tool) {
              ledger.tool(call.function.name)
              const entry: ToolLogEntry = {
                pluginId: r.tool.pluginId ?? 'core',
                pluginName: r.tool.pluginName,
                summary: r.summary ?? '',
                href: r.href,
                hrefLabel: r.hrefLabel,
                imageUrl: r.imageUrl,
              }
              toolLog.push(entry)
              send({ type: 'tool', ...entry })
            }
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: truncateToolOutput(JSON.stringify(r.output)),
            })
          }
          needSeparator = true
        }
        // 工具轮次用完或模型只调用工具不说话：再让模型不带工具总结一次
        if (!request.signal.aborted && (!finished || !fullContent.trim())) {
          if (!fullContent.trim() && toolLog.some((t) => t.pluginId !== 'vision'))
            needSeparator = false
          try {
            await runTurn(false)
          } catch (error) {
            if (!fullContent.trim() && !toolLog.length) throw error
          }
        }
        let content = stripDsml(fullContent)
        if (!content.trim() && toolLog.length) {
          content = `已完成以下操作：\n${toolLog.map((t, i) => `${i + 1}. **${t.pluginName}**：${t.summary}`).join('\n')}`
          send({ type: 'delta', text: content })
        }
        if (!content.trim()) throw new AiError('AI 没有返回内容，请重试')

        // 3) 计费与保存：余额不够本次实际用量时扣到 0 为止（调用前已确认余额 ≥ 1）
        const fresh = await payload.findByID({
          collection: 'users',
          id: user.id,
          depth: 0,
          overrideAccess: true,
          select: { aiCredits: true },
        })
        const cost = Math.min(ledger.credits(), Math.max(0, fresh.aiCredits ?? 0))
        const usage = {
          inputTokens: ledger.inputTokens,
          outputTokens: ledger.outputTokens,
          toolCalls: ledger.tools.length,
          estimated: ledger.estimated > 0,
        }
        const savedModelId = isAutoMode ? `auto:${activeModel.id}` : activeModel.id
        const reply = await payload.create({
          collection: 'ai-messages',
          data: {
            conversation: conversationId,
            owner: user.id,
            role: 'assistant',
            content,
            model: savedModelId,
            cost,
            toolCalls: toolLog.length ? toolLog : undefined,
          },
          overrideAccess: true,
          depth: 0,
        })
        let balance: number | null = null
        if (cost > 0) {
          try {
            const entry = await payload.create({
              collection: 'ai-credit-ledger',
              data: {
                user: user.id,
                delta: -cost,
                reason: `AI 对话 · ${displayModelLabel(activeModel)} · ${ledger.summary()}`.slice(
                  0,
                  120,
                ),
                model: activeModel.id,
                message: reply.id,
              },
              overrideAccess: true,
              depth: 0,
            })
            balance = entry.balanceAfter ?? null
          } catch (error) {
            console.error('[ai] credit deduction failed', error)
          }
        } else balance = fresh.aiCredits ?? 0
        await payload
          .update({
            collection: 'ai-conversations',
            id: conversationId!,
            data: {
              model: requestedModel.id,
              ...(ctx.projectId ? { project: ctx.projectId } : {}),
            },
            overrideAccess: true,
            depth: 0,
          })
          .catch(() => null)
        send({
          type: 'done',
          messageId: String(reply.id),
          cost,
          usage,
          balance,
          mutated: ctx.mutated,
          projectId: ctx.projectId,
          modelId: activeModel.id,
          modelName: displayModelLabel(activeModel),
        })
      } catch (error) {
        const errMsg = error instanceof AiError ? error.message : 'AI 服务出错，请稍后重试'
        recordAiErrorDiagnostic({
          userId: String(user.id),
          userName: user.name || user.email || '用户',
          modelId: activeModel.id,
          modelName: displayModelLabel(activeModel),
          projectId: ctx.projectId,
          promptPreview: visibleText.slice(0, 120),
          errorMessage: errMsg,
        })
        send({ type: 'error', error: errMsg })
        if (!(error instanceof AiError)) console.error('[ai] chat failed', error)
      } finally {
        clearInterval(heartbeat)
        closed = true
        try {
          controller.close()
        } catch {
          // ignore if already closed
        }
      }
    },
  })

  return new Response(body$, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
