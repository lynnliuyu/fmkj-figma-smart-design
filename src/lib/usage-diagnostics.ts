import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { relId } from './access'
import { getPayloadClient } from './payload'
import { normalizeScene, scenePoints, sceneSheets, type StoredScene } from './point-scene'

export type UploadDiagnosticEvent = {
  id: string
  createdAt: string
  fileName: string
  mediaId: string
  url: string
  method:
    | 'cad-color'
    | 'vision-snap'
    | 'vision-fusion'
    | 'dxf-vector'
    | 'cad-bw'
    | 'empty'
    | 'non-plan'
  totalPoints: number
  switches: number
  lights: number
  areas: number
  durationMs: number
}

export type AiErrorDiagnosticEvent = {
  id: string
  createdAt: string
  userId: string
  userName: string
  modelId: string
  modelName: string
  projectId: string | null
  promptPreview: string
  errorMessage: string
}

type PersistedDiagnostics = {
  uploads: UploadDiagnosticEvent[]
  errors: AiErrorDiagnosticEvent[]
}

const DIAG_FILE = '/tmp/fmkj-usage-diagnostics.json'
let memoryDiag: PersistedDiagnostics | null = null

function readDiagnostics(): PersistedDiagnostics {
  if (memoryDiag) return memoryDiag
  try {
    if (existsSync(DIAG_FILE)) {
      const parsed = JSON.parse(readFileSync(DIAG_FILE, 'utf8')) as Partial<PersistedDiagnostics>
      memoryDiag = {
        uploads: Array.isArray(parsed.uploads) ? parsed.uploads : [],
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      }
      return memoryDiag
    }
  } catch {
    // ignore read error
  }
  memoryDiag = { uploads: [], errors: [] }
  return memoryDiag
}

function writeDiagnostics(data: PersistedDiagnostics) {
  memoryDiag = data
  try {
    mkdirSync(path.dirname(DIAG_FILE), { recursive: true })
    writeFileSync(DIAG_FILE, JSON.stringify(data))
  } catch {
    // ignore write error
  }
}

export function recordUploadDiagnostic(ev: Omit<UploadDiagnosticEvent, 'id' | 'createdAt'>) {
  const store = readDiagnostics()
  store.uploads.unshift({
    ...ev,
    id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  })
  if (store.uploads.length > 120) store.uploads.length = 120
  writeDiagnostics(store)
}

export function recordAiErrorDiagnostic(ev: Omit<AiErrorDiagnosticEvent, 'id' | 'createdAt'>) {
  const store = readDiagnostics()
  store.errors.unshift({
    ...ev,
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  })
  if (store.errors.length > 120) store.errors.length = 120
  writeDiagnostics(store)
}

export type CustomerUsageRow = {
  userId: string
  name: string
  email: string
  phone: string
  aiCredits: number
  creditsConsumed: number
  projectCount: number
  sheetCount: number
  pointCount: number
  quoteCount: number
  contractCount: number
  conversationCount: number
  messageCount: number
  lastActiveAt: string
}

export type ModelUsageStat = {
  model: string
  calls: number
  credits: number
  autoRoutedCount: number
}

export type ToolUsageStat = {
  toolName: string
  calls: number
}

export type SheetInspectionItem = {
  id: string
  projectName: string
  projectId: string
  ownerName: string
  sheetName: string
  url: string
  pointCount: number
  switchCount: number
  lightCount: number
  updatedAt: string
  method?: string
}

export type RecentConversationLog = {
  id: string
  title: string
  userName: string
  projectName: string | null
  model: string
  messageCount: number
  toolCount: number
  totalCost: number
  updatedAt: string
  lastAssistantPreview: string
}

export type CustomerUsageReport = {
  generatedAt: string
  kpis: {
    totalCustomers: number
    activeCustomers7d: number
    totalProjects: number
    totalSheets: number
    zeroPointSheets: number
    totalQuotes: number
    totalContracts: number
    totalAiMessages: number
    totalCreditsConsumed: number
    aiErrorCount: number
  }
  customers: CustomerUsageRow[]
  modelStats: ModelUsageStat[]
  toolStats: ToolUsageStat[]
  sheetInspections: SheetInspectionItem[]
  uploadLogs: UploadDiagnosticEvent[]
  errorLogs: AiErrorDiagnosticEvent[]
  recentConversations: RecentConversationLog[]
}

export async function loadCustomerUsageReport(): Promise<CustomerUsageReport> {
  const payload = await getPayloadClient()
  const diag = readDiagnostics()

  const [usersRes, projectsRes, quotesRes, contractsRes, convsRes, msgsRes, ledgerRes] =
    await Promise.all([
      payload
        .find({
          collection: 'users',
          sort: '-updatedAt',
          limit: 200,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] })),
      payload
        .find({
          collection: 'projects',
          where: { isDemoTemplate: { not_equals: true } },
          sort: '-updatedAt',
          limit: 300,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] })),
      payload
        .find({
          collection: 'quotes',
          sort: '-updatedAt',
          limit: 400,
          depth: 0,
          overrideAccess: true,
          select: { project: true, total: true, status: true, updatedAt: true },
        })
        .catch(() => ({ docs: [] })),
      payload
        .find({
          collection: 'contracts',
          sort: '-updatedAt',
          limit: 300,
          depth: 0,
          overrideAccess: true,
          select: { project: true, status: true, updatedAt: true },
        })
        .catch(() => ({ docs: [] })),
      payload
        .find({
          collection: 'ai-conversations',
          sort: '-updatedAt',
          limit: 200,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] })),
      payload
        .find({
          collection: 'ai-messages',
          sort: '-createdAt',
          limit: 500,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] })),
      payload
        .find({
          collection: 'ai-credit-ledger',
          sort: '-createdAt',
          limit: 500,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] })),
    ])

  const userMap = new Map<
    string,
    { name: string; email: string; phone: string; credits: number; updatedAt: string }
  >()
  for (const u of usersRes.docs) {
    const uid = String(u.id)
    userMap.set(uid, {
      name: u.name || u.email || '未命名用户',
      email: u.email || '',
      phone: (u as { phone?: string | null }).phone || '',
      credits: u.aiCredits ?? 0,
      updatedAt: u.updatedAt,
    })
  }

  const customerRowsMap = new Map<string, CustomerUsageRow>()
  const ensureCustomer = (uid: string): CustomerUsageRow => {
    const existing = customerRowsMap.get(uid)
    if (existing) return existing
    const info = userMap.get(uid)
    const row: CustomerUsageRow = {
      userId: uid,
      name: info?.name ?? `用户 #${uid.slice(-4)}`,
      email: info?.email ?? '',
      phone: info?.phone ?? '',
      aiCredits: info?.credits ?? 0,
      creditsConsumed: 0,
      projectCount: 0,
      sheetCount: 0,
      pointCount: 0,
      quoteCount: 0,
      contractCount: 0,
      conversationCount: 0,
      messageCount: 0,
      lastActiveAt: info?.updatedAt ?? new Date(0).toISOString(),
    }
    customerRowsMap.set(uid, row)
    return row
  }

  for (const uid of userMap.keys()) ensureCustomer(uid)

  const touchTime = (row: CustomerUsageRow, iso?: string | null) => {
    if (iso && iso > row.lastActiveAt) row.lastActiveAt = iso
  }

  const projectMap = new Map<string, { name: string; ownerId: string }>()
  const sheetInspections: SheetInspectionItem[] = []
  let totalSheets = 0
  let zeroPointSheets = 0

  for (const p of projectsRes.docs) {
    const pid = String(p.id)
    const ownerId = relId(p.owner) ?? ''
    // 跳过系统发放且未修改过的内置演示项目，聚焦客户真实动作
    const isUnmodifiedDemo = /^\[示例\]/.test(p.name || '') && p.createdAt === p.updatedAt
    projectMap.set(pid, { name: p.name, ownerId })
    if (!ownerId || isUnmodifiedDemo) continue

    const row = ensureCustomer(ownerId)
    row.projectCount++
    touchTime(row, p.updatedAt)

    const norm = normalizeScene(p.pointMap as Partial<StoredScene> | null)
    const sheets = sceneSheets(norm.elements, norm.files).filter(
      (s) => s.fileId !== 'blank-sheet' && s.url,
    )
    const points = scenePoints(norm.elements, sheets, [])
    row.sheetCount += sheets.length
    row.pointCount += points.length
    totalSheets += sheets.length

    for (const sh of sheets) {
      const shPts = points.filter((pt) => pt.sheetId === sh.id)
      const swCount = shPts.filter((pt) => pt.deviceType.startsWith('switch-')).length
      const ltCount = shPts.filter((pt) => /light|lamp/.test(pt.deviceType)).length
      if (shPts.length === 0) zeroPointSheets++
      if (sheetInspections.length < 40 && sh.url) {
        const matchedDiag = diag.uploads.find((u) => u.url === sh.url)
        sheetInspections.push({
          id: `${pid}-${sh.id}`,
          projectName: p.name,
          projectId: pid,
          ownerName: row.name,
          sheetName: sh.name,
          url: sh.url,
          pointCount: shPts.length,
          switchCount: swCount,
          lightCount: ltCount,
          updatedAt: p.updatedAt,
          method: matchedDiag?.method,
        })
      }
    }
  }

  for (const q of quotesRes.docs) {
    const ownerId = projectMap.get(relId(q.project) ?? '')?.ownerId || ''
    if (!ownerId) continue
    const row = ensureCustomer(ownerId)
    row.quoteCount++
    touchTime(row, q.updatedAt)
  }

  for (const c of contractsRes.docs) {
    const ownerId = projectMap.get(relId(c.project) ?? '')?.ownerId || ''
    if (!ownerId) continue
    const row = ensureCustomer(ownerId)
    row.contractCount++
    touchTime(row, c.updatedAt)
  }

  let totalCreditsConsumed = 0
  for (const l of ledgerRes.docs) {
    const uid = relId(l.user) ?? ''
    const delta = Number(l.delta ?? 0)
    if (delta < 0) {
      const spent = Math.abs(delta)
      totalCreditsConsumed += spent
      if (uid) {
        const row = ensureCustomer(uid)
        row.creditsConsumed += spent
        touchTime(row, l.createdAt)
      }
    }
  }

  const modelMap = new Map<string, ModelUsageStat>()
  const toolMap = new Map<string, number>()
  const convMsgStats = new Map<
    string,
    { count: number; tools: number; cost: number; lastPreview: string; lastModel: string }
  >()

  for (const m of msgsRes.docs) {
    const uid = relId(m.owner) ?? ''
    if (uid) {
      const row = ensureCustomer(uid)
      row.messageCount++
      touchTime(row, m.createdAt)
    }
    const cid = relId(m.conversation) ?? ''
    if (cid) {
      const st = convMsgStats.get(cid) ?? {
        count: 0,
        tools: 0,
        cost: 0,
        lastPreview: '',
        lastModel: '',
      }
      st.count++
      st.cost += Number(m.cost ?? 0)
      if (m.role === 'assistant') {
        if (!st.lastPreview && m.content) st.lastPreview = m.content.slice(0, 100)
        if (!st.lastModel && m.model) st.lastModel = m.model
      }
      if (Array.isArray(m.toolCalls)) {
        st.tools += m.toolCalls.length
      }
      convMsgStats.set(cid, st)
    }

    if (m.role === 'assistant') {
      const rawModel = String(m.model || 'deepseek-flash')
      const isAuto = rawModel.startsWith('auto:')
      const cleanModel = isAuto ? rawModel.slice(5) : rawModel
      const stat = modelMap.get(cleanModel) ?? {
        model: cleanModel,
        calls: 0,
        credits: 0,
        autoRoutedCount: 0,
      }
      stat.calls++
      stat.credits += Number(m.cost ?? 0)
      if (isAuto) stat.autoRoutedCount++
      modelMap.set(cleanModel, stat)

      if (Array.isArray(m.toolCalls)) {
        for (const tc of m.toolCalls as Array<{ pluginName?: string; pluginId?: string }>) {
          const tName = tc.pluginName || tc.pluginId || '系统工具'
          toolMap.set(tName, (toolMap.get(tName) ?? 0) + 1)
        }
      }
    }
  }

  const recentConversations: RecentConversationLog[] = []
  for (const c of convsRes.docs) {
    const uid = relId(c.owner) ?? ''
    if (uid) {
      const row = ensureCustomer(uid)
      row.conversationCount++
      touchTime(row, c.updatedAt)
    }
    const cid = String(c.id)
    const pid = relId(c.project)
    const st = convMsgStats.get(cid)
    if (recentConversations.length < 30) {
      recentConversations.push({
        id: cid,
        title: c.title || '新对话',
        userName: userMap.get(uid)?.name ?? '用户',
        projectName: pid ? (projectMap.get(pid)?.name ?? null) : null,
        model: st?.lastModel || c.model || 'auto',
        messageCount: st?.count ?? 0,
        toolCount: st?.tools ?? 0,
        totalCost: st?.cost ?? 0,
        updatedAt: c.updatedAt,
        lastAssistantPreview: st?.lastPreview || '',
      })
    }
  }

  const customers = Array.from(customerRowsMap.values()).sort((a, b) =>
    b.lastActiveAt.localeCompare(a.lastActiveAt),
  )
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const activeCustomers7d = customers.filter((c) => c.lastActiveAt >= sevenDaysAgo).length

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      totalCustomers: customers.length,
      activeCustomers7d,
      totalProjects: customers.reduce((s, c) => s + c.projectCount, 0),
      totalSheets,
      zeroPointSheets,
      totalQuotes: customers.reduce((s, c) => s + c.quoteCount, 0),
      totalContracts: customers.reduce((s, c) => s + c.contractCount, 0),
      totalAiMessages: msgsRes.docs.length,
      totalCreditsConsumed,
      aiErrorCount: diag.errors.length,
    },
    customers,
    modelStats: Array.from(modelMap.values()).sort((a, b) => b.calls - a.calls),
    toolStats: Array.from(toolMap.entries())
      .map(([toolName, calls]) => ({ toolName, calls }))
      .sort((a, b) => b.calls - a.calls),
    sheetInspections,
    uploadLogs: diag.uploads,
    errorLogs: diag.errors,
    recentConversations,
  }
}
