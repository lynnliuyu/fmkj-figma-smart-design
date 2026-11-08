import { execFileSync } from 'node:child_process'
import type { Endpoint, PayloadRequest } from 'payload'

import { isCmsAdmin } from '@/lib/access'
import {
  AI_PROVIDER_CHANNELS,
  AI_PROVIDER_PRESETS,
  isAiProviderChannelId,
  parseCustomChannels,
} from '@/plugins/ai-copilot/templates'
import { resolveModelEndpoint } from '@/plugins/ai-copilot/server'

type Body = {
  channelId?: string
  customChannel?: string
  models?: string[]
  presetKeys?: string[]
  testModel?: string
  index?: number
  patch?: Record<string, unknown>
  deleteIndex?: number
}

async function readBody(req: PayloadRequest): Promise<Body> {
  try {
    return ((await req.json?.()) ?? {}) as Body
  } catch {
    return {}
  }
}

/** 按渠道解析接口地址与密钥（自定义渠道只认已保存、已校验的配置，不接受请求里传来的地址或变量名） */
async function resolveChannel(req: PayloadRequest, body: Body) {
  if (body.channelId === 'custom') {
    const g = await req.payload.findGlobal({ slug: 'ai-settings', depth: 0, overrideAccess: true })
    const ch = parseCustomChannels((g as { customChannels?: unknown }).customChannels).find(
      (c) => c.key === body.customChannel,
    )
    if (!ch) return { error: '找不到这个自定义渠道：请先在上方填写并保存渠道' }
    const ep = resolveModelEndpoint({
      channelId: 'custom',
      baseUrl: ch.baseUrl,
      apiKeyEnv: ch.apiKeyEnv,
    })
    return { ...ep, label: ch.label, customChannel: ch.key }
  }
  if (!isAiProviderChannelId(body.channelId)) return { error: '请选择渠道' }
  const ep = resolveModelEndpoint({ channelId: body.channelId })
  return { ...ep, label: AI_PROVIDER_CHANNELS[body.channelId].label, customChannel: undefined }
}

const json = (data: unknown, status = 200) => Response.json(data, { status })

export const aiSettingsEndpoints: Endpoint[] = [
  {
    // 服务端 GitHub 同步端点（Next.js 进程内拥有 Make Secrets 注入的 GITHUB_PAT）
    path: '/github-sync',
    method: 'post',
    handler: async (req) => {
      const localSecret = req.headers.get('x-local-sync-token')
      if (!isCmsAdmin(req) && localSecret !== process.env.PAYLOAD_SECRET) {
        return json({ error: '无权限' }, 403)
      }
      const token = (process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '').trim()
      if (!token) {
        return json({ ok: false, error: '服务端未读取到 GITHUB_PAT 环境变量' }, 400)
      }
      try {
        const helper = `!f() { echo "username=x-access-token"; echo "password=${token}"; }; f`
        const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
          encoding: 'utf8',
        }).trim()
        const subj = execFileSync('git', ['log', '-1', '--pretty=%s', 'HEAD'], {
          encoding: 'utf8',
        }).trim()
        execFileSync(
          'git',
          [
            '-c',
            `credential.helper=${helper}`,
            'fetch',
            'https://github.com/lynnliuyu/fmkj-figma-smart-design.git',
            '+refs/heads/main:refs/remotes/github/main',
          ],
          { stdio: 'pipe', timeout: 60_000 },
        )
        const ghTree = execFileSync('git', ['rev-parse', 'refs/remotes/github/main^{tree}'], {
          encoding: 'utf8',
        }).trim()
        // 使用临时索引构建推送到 GitHub 的树：剔除 Figma Make 沙盒专用的 .figma 内部脚本（仅保留 .figma/make/site.json）及任何临时目录
        const tmpIdx = `/tmp/git-gh-index-${Date.now()}`
        const envWithIdx = { ...process.env, GIT_INDEX_FILE: tmpIdx }
        execFileSync('git', ['read-tree', 'HEAD'], { env: envWithIdx, stdio: 'pipe' })
        execFileSync(
          'git',
          [
            'rm',
            '--cached',
            '--ignore-unmatch',
            '-r',
            '.tmp',
            '.figaro',
            '.impeccable',
            '.export-artifacts',
            '.figma/README.md',
            '.figma/make/analyze-routes',
            '.figma/make/deploy',
            '.figma/make/deploy-preview',
            '.figma/make/dev',
            '.figma/make/dev.json',
            '.figma/make/format',
            '.figma/make/install',
            '.figma/make/langserver',
            '.figma/make/template-transition.json',
          ],
          { env: envWithIdx, stdio: 'pipe' },
        )
        const headTree = execFileSync('git', ['write-tree'], {
          env: envWithIdx,
          encoding: 'utf8',
        }).trim()
        execFileSync('rm', ['-f', tmpIdx], { stdio: 'pipe' })
        if (ghTree === headTree) {
          return json({
            ok: true,
            commit: head,
            repo: 'lynnliuyu/fmkj-figma-smart-design',
            branch: 'main',
            note: 'GitHub 已是最新代码',
          })
        }
        const syncCommit = execFileSync(
          'git',
          [
            'commit-tree',
            headTree,
            '-p',
            'refs/remotes/github/main',
            '-m',
            `sync: Figma Make 最新代码（${subj} · ${head}）`,
          ],
          { encoding: 'utf8' },
        ).trim()
        execFileSync(
          'git',
          [
            '-c',
            `credential.helper=${helper}`,
            'push',
            'https://github.com/lynnliuyu/fmkj-figma-smart-design.git',
            `${syncCommit}:refs/heads/main`,
          ],
          { stdio: 'pipe', timeout: 60_000 },
        )
        const headsRaw = execFileSync(
          'git',
          [
            '-c',
            `credential.helper=${helper}`,
            'ls-remote',
            '--heads',
            'https://github.com/lynnliuyu/fmkj-figma-smart-design.git',
          ],
          { encoding: 'utf8', timeout: 30_000 },
        ).trim()
        const branches = headsRaw
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\t')[1]?.replace('refs/heads/', '') ?? line)
        return json({
          ok: true,
          commit: syncCommit.slice(0, 7),
          sourceCommit: head,
          repo: 'lynnliuyu/fmkj-figma-smart-design',
          branch: 'main',
          branches,
        })
      } catch (e) {
        const msg =
          (e as { stderr?: Buffer; message?: string })?.stderr?.toString() ||
          (e as Error)?.message ||
          'git push failed'
        const scrubbed = msg.replace(token, '***')
        return json({ ok: false, error: scrubbed.slice(0, 300) }, 500)
      }
    },
  },
  {
    /**
     * 清理 GitHub 上的历史临时分支（服务端执行，PAT 不离开 Next.js 进程）：
     * - body.delete 为空或 dryRun=true 时只列出各分支的合并情况，不做任何修改；
     * - 已合并到 main 的分支直接删除；未完全合并的分支先打上 archive/<分支名> 标签保留全部提交，再删除分支；
     * - main 与 desktop-release 永不删除。
     */
    path: '/github-branches',
    method: 'post',
    handler: async (req) => {
      const localSecret = req.headers.get('x-local-sync-token')
      if (!isCmsAdmin(req) && localSecret !== process.env.PAYLOAD_SECRET) {
        return json({ error: '无权限' }, 403)
      }
      const token = (process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '').trim()
      if (!token) return json({ ok: false, error: '服务端未读取到 GITHUB_PAT 环境变量' }, 400)
      let body: { delete?: unknown; dryRun?: unknown } = {}
      try {
        body = ((await req.json?.()) ?? {}) as typeof body
      } catch {
        body = {}
      }
      const repo = 'https://github.com/lynnliuyu/fmkj-figma-smart-design.git'
      const PROTECTED = new Set(['main', 'desktop-release'])
      const helper = `!f() { echo "username=x-access-token"; echo "password=${token}"; }; f`
      const git = (args: string[], timeout = 60_000) =>
        execFileSync('git', ['-c', `credential.helper=${helper}`, ...args], {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout,
        }).trim()
      const local = (args: string[]) =>
        execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim()
      const listHeads = () =>
        git(['ls-remote', '--heads', repo], 30_000)
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [sha, ref] = line.split('\t')
            return { sha: sha ?? '', branch: (ref ?? '').replace('refs/heads/', '') }
          })
      const wanted = new Set(
        Array.isArray(body.delete)
          ? body.delete.filter((b): b is string => typeof b === 'string')
          : [],
      )
      const dryRun = body.dryRun === true || wanted.size === 0
      try {
        git(['fetch', '--no-tags', repo, '+refs/heads/main:refs/remotes/github/main'])
        const results: {
          branch: string
          sha?: string
          protected?: boolean
          merged?: boolean
          ahead?: number
          archivedTag?: string | null
          deleted?: boolean
        }[] = []
        for (const h of listHeads()) {
          if (PROTECTED.has(h.branch)) {
            results.push({ branch: h.branch, sha: h.sha.slice(0, 7), protected: true })
            continue
          }
          if (!/^[A-Za-z0-9._/-]+$/.test(h.branch)) {
            results.push({ branch: h.branch, sha: h.sha.slice(0, 7), deleted: false })
            continue
          }
          git([
            'fetch',
            '--no-tags',
            repo,
            `+refs/heads/${h.branch}:refs/remotes/github-cleanup/${h.branch}`,
          ])
          let merged = false
          try {
            local(['merge-base', '--is-ancestor', h.sha, 'refs/remotes/github/main'])
            merged = true
          } catch {
            merged = false
          }
          const ahead =
            Number(local(['rev-list', '--count', `refs/remotes/github/main..${h.sha}`])) || 0
          const entry = {
            branch: h.branch,
            sha: h.sha.slice(0, 7),
            merged,
            ahead,
            archivedTag: null as string | null,
            deleted: false,
          }
          if (!dryRun && wanted.has(h.branch)) {
            if (!merged) {
              const tag = `archive/${h.branch.replace(/\//g, '-')}`
              git(['push', repo, `${h.sha}:refs/tags/${tag}`])
              entry.archivedTag = tag
            }
            git(['push', repo, `:refs/heads/${h.branch}`])
            entry.deleted = true
          }
          try {
            local(['update-ref', '-d', `refs/remotes/github-cleanup/${h.branch}`])
          } catch {
            /* 临时引用清理失败不影响结果 */
          }
          results.push(entry)
        }
        return json({ ok: true, dryRun, results, remaining: listHeads().map((h) => h.branch) })
      } catch (e) {
        const msg =
          (e as { stderr?: Buffer | string; message?: string })?.stderr?.toString() ||
          (e as Error)?.message ||
          'git failed'
        return json({ ok: false, error: msg.split(token).join('***').slice(0, 300) }, 500)
      }
    },
  },
  {
    // 查询所有内置渠道与自定义渠道的密钥配置状态 + 当前已配置的模型列表摘要
    path: '/status',
    method: 'get',
    handler: async (req) => {
      if (!isCmsAdmin(req)) return json({ error: '无权限' }, 403)
      const g = await req.payload.findGlobal({
        slug: 'ai-settings',
        depth: 0,
        overrideAccess: true,
      })
      const customs = parseCustomChannels((g as { customChannels?: unknown }).customChannels)
      const rows =
        ((g as { aiModels?: unknown }).aiModels as Record<string, unknown>[] | null) ?? []

      const channels: {
        id: string
        label: string
        envKey: string
        configured: boolean
        isCustom: boolean
      }[] = Object.values(AI_PROVIDER_CHANNELS).map((ch) => {
        const ep = resolveModelEndpoint({ channelId: ch.id })
        return {
          id: ch.id,
          label: ch.label,
          envKey: ep.envKey,
          configured: Boolean(ep.apiKey && ep.url),
          isCustom: false,
        }
      })
      for (const c of customs) {
        const ep = resolveModelEndpoint({
          channelId: 'custom',
          baseUrl: c.baseUrl,
          apiKeyEnv: c.apiKeyEnv,
        })
        channels.push({
          id: `custom:${c.key}`,
          label: `自定义 · ${c.label || c.key}`,
          envKey: c.apiKeyEnv,
          configured: Boolean(ep.apiKey && ep.url),
          isCustom: true,
        })
      }

      const existingModels = rows.map((r) => ({
        name: String(r.name ?? ''),
        channelId: String(r.channelId ?? 'deepseek'),
        customChannel: r.customChannel ? String(r.customChannel) : undefined,
        apiModel: String(r.apiModel ?? ''),
        minTier: String(r.minTier ?? 'auto'),
        cost: Number(r.cost ?? 1),
        enabled: r.enabled !== false,
        isDefault: Boolean(r.isDefault),
      }))

      return json({ channels, existingModels })
    },
  },
  {
    // 在 /admin 的 AI 设置工作台中直接快速修改某一行模型的等级、倍率、启用、默认状态或删除某行（仅限 CMS 管理员）
    path: '/quick-update',
    method: 'post',
    handler: async (req) => {
      if (!isCmsAdmin(req)) return json({ error: '无权限' }, 403)
      const body = await readBody(req)
      const g = await req.payload.findGlobal({
        slug: 'ai-settings',
        depth: 0,
        overrideAccess: true,
      })
      const rows = (
        ((g as { aiModels?: unknown }).aiModels as Record<string, unknown>[] | null) ?? []
      ).map(({ id: _id, ...r }) => ({ ...r }))

      if (
        typeof body.deleteIndex === 'number' &&
        body.deleteIndex >= 0 &&
        body.deleteIndex < rows.length
      ) {
        rows.splice(body.deleteIndex, 1)
      } else if (
        typeof body.index === 'number' &&
        body.index >= 0 &&
        body.index < rows.length &&
        body.patch &&
        typeof body.patch === 'object'
      ) {
        const p = body.patch
        if (p.isDefault === true) {
          for (const r of rows) r.isDefault = false
        }
        const target = rows[body.index]
        if (typeof p.minTier === 'string' && ['auto', 'free', 'pro', 'team'].includes(p.minTier))
          target.minTier = p.minTier
        if (typeof p.cost === 'number' && Number.isFinite(p.cost) && p.cost >= 0 && p.cost <= 100)
          target.cost = Math.round(p.cost)
        if (typeof p.enabled === 'boolean') target.enabled = p.enabled
        if (typeof p.isDefault === 'boolean') {
          target.isDefault = p.isDefault
          if (p.isDefault) target.enabled = true
        }
        if (typeof p.reasoning === 'boolean') target.reasoning = p.reasoning
      } else {
        return json({ error: '参数无效' }, 400)
      }

      await req.payload.updateGlobal({
        slug: 'ai-settings',
        data: { aiModels: rows } as never,
        overrideAccess: false,
        user: req.user,
        req,
      })
      return json({ ok: true })
    },
  },
  {
    // 一键导入精选国产模型预设（可传单个或多个 presetKeys = `${channelId}:${apiModel}`，不传则导入推荐的 Go/Plus/Pro 核心国产套件）
    path: '/presets',
    method: 'post',
    handler: async (req) => {
      if (!isCmsAdmin(req)) return json({ error: '无权限' }, 403)
      const body = await readBody(req)
      const requestedKeys = Array.isArray(body.presetKeys) ? body.presetKeys.map(String) : null
      const selectedPresets = requestedKeys?.length
        ? AI_PROVIDER_PRESETS.filter((p) => requestedKeys.includes(`${p.channelId}:${p.apiModel}`))
        : AI_PROVIDER_PRESETS

      if (!selectedPresets.length) return json({ error: '未找到匹配的预设模型' }, 400)

      const g = await req.payload.findGlobal({
        slug: 'ai-settings',
        depth: 0,
        overrideAccess: true,
      })
      const rows = (
        ((g as { aiModels?: unknown }).aiModels as Record<string, unknown>[] | null) ?? []
      ).map(({ id: _id, ...r }) => r)
      const hasDefault = rows.some((r) => Boolean(r.isDefault))

      let added = 0
      let skipped = 0
      for (const p of selectedPresets) {
        const exists = rows.some((r) => r.channelId === p.channelId && r.apiModel === p.apiModel)
        if (exists) {
          skipped++
          continue
        }
        rows.push({
          name: p.name,
          channelId: p.channelId,
          apiModel: p.apiModel,
          minTier: p.minTier ?? 'auto',
          cost: p.cost,
          tag: p.tag,
          description: p.description,
          enabled: true,
          isDefault: !hasDefault && added === 0 && p.minTier === 'free',
          reasoning: Boolean(p.reasoning),
        })
        added++
      }

      await req.payload.updateGlobal({
        slug: 'ai-settings',
        data: { aiModels: rows } as never,
        overrideAccess: false,
        user: req.user,
        req,
      })
      return json({ added, skipped })
    },
  },
  {
    // 测试指定渠道与模型的连通性
    path: '/test',
    method: 'post',
    handler: async (req) => {
      if (!isCmsAdmin(req)) return json({ error: '无权限' }, 403)
      const body = await readBody(req)
      const ch = await resolveChannel(req, body)
      if ('error' in ch) return json({ error: ch.error }, 400)
      if (!ch.url) return json({ error: '接口地址未配置或不是公网 HTTPS' }, 400)
      if (!ch.apiKey) return json({ error: `尚未配置密钥环境变量 ${ch.envKey}` }, 400)

      const testModel =
        (typeof body.testModel === 'string' && body.testModel.trim()) || 'deepseek-chat'
      const t0 = Date.now()
      try {
        const res = await fetch(ch.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ch.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: testModel,
            max_tokens: 12,
            messages: [{ role: 'user', content: '请回复OK' }],
          }),
          signal: AbortSignal.timeout(15000),
        })
        const latencyMs = Date.now() - t0
        const data = (await res.json().catch(() => null)) as {
          choices?: { message?: { content?: string } }[]
          error?: { message?: string }
        } | null
        if (!res.ok) {
          return json({
            ok: false,
            error: `HTTP ${res.status}：${data?.error?.message || '请求被拒绝，请检查模型名称或账户余额'}`,
          })
        }
        const reply = data?.choices?.[0]?.message?.content?.trim() || 'OK'
        return json({ ok: true, latencyMs, reply: reply.slice(0, 40) })
      } catch {
        return json({
          ok: false,
          error:
            '连接超时或网络不可达（在预览沙盒中部分外部接口受限，可在正式站点或自建服务器测试）',
        })
      }
    },
  },
  {
    // 拉取渠道的模型列表（OpenAI 兼容 GET /models）
    path: '/models',
    method: 'post',
    handler: async (req) => {
      if (!isCmsAdmin(req)) return json({ error: '无权限' }, 403)
      const body = await readBody(req)
      const ch = await resolveChannel(req, body)
      if ('error' in ch) return json({ error: ch.error }, 400)
      if (!ch.url) return json({ error: '接口地址未配置或不是公网 HTTPS' }, 400)
      if (!ch.apiKey)
        return json(
          { error: `没有读到密钥：请在 Figma Make「设置 → Secrets」中添加 ${ch.envKey}` },
          400,
        )
      const url = ch.url.replace(/\/chat\/completions$/, '/models')
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${ch.apiKey}` },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok)
          return json(
            { error: `接口返回 ${res.status}：该服务可能不支持 /models，可直接手动添加模型名` },
            502,
          )
        const data = (await res.json()) as {
          data?: { id?: unknown }[]
          models?: { id?: unknown; name?: unknown }[]
        }
        const list = (data.data ?? data.models ?? [])
          .map((m) => String(m.id ?? (m as { name?: unknown }).name ?? ''))
          .filter(Boolean)
        return json({ models: [...new Set(list)].sort() })
      } catch {
        return json({ error: '请求超时或无法连接该地址' }, 502)
      }
    },
  },
  {
    // 把勾选的模型加入「AI 模型」（已存在的同渠道同模型名跳过）
    path: '/models/add',
    method: 'post',
    handler: async (req) => {
      if (!isCmsAdmin(req)) return json({ error: '无权限' }, 403)
      const body = await readBody(req)
      const ch = await resolveChannel(req, body)
      if ('error' in ch) return json({ error: ch.error }, 400)
      const picks = (Array.isArray(body.models) ? body.models : [])
        .map((m) => String(m).trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 50)
      if (!picks.length) return json({ error: '请至少勾选一个模型' }, 400)
      const g = await req.payload.findGlobal({
        slug: 'ai-settings',
        depth: 0,
        overrideAccess: true,
      })
      const rows = (
        ((g as { aiModels?: unknown }).aiModels as Record<string, unknown>[] | null) ?? []
      ).map(({ id: _id, ...r }) => r)
      const exists = (m: string) =>
        rows.some(
          (r) =>
            r.apiModel === m &&
            r.channelId === body.channelId &&
            (body.channelId !== 'custom' || r.customChannel === ch.customChannel),
        )
      const added = picks.filter((m) => !exists(m))
      for (const m of added) {
        const isPro = /reason|r1|qwq|qvq|think/i.test(m)
        const isPlus = !isPro && /vl|vision|qwen-max|glm-4v|kimi/i.test(m)
        rows.push({
          name: m,
          channelId: body.channelId,
          ...(ch.customChannel ? { customChannel: ch.customChannel } : {}),
          apiModel: m,
          minTier: isPro ? 'team' : isPlus ? 'pro' : 'free',
          cost: isPro ? 3 : isPlus ? 2 : 1,
          tag: ch.label,
          enabled: true,
          isDefault: false,
          reasoning: isPro,
        })
      }
      await req.payload.updateGlobal({
        slug: 'ai-settings',
        data: { aiModels: rows } as never,
        overrideAccess: false,
        user: req.user,
        req,
      })
      return json({ added: added.length, skipped: picks.length - added.length })
    },
  },
]
