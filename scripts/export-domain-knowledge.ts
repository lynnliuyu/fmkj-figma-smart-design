/**
 * 领域规则与知识库导出及自检脚本（无需连接数据库即可运行）。
 *
 * 用法：
 *   导出更新 JSON：pnpm run knowledge:export
 *   校验与跑测试：pnpm run knowledge:check
 *
 * 导出目录（./knowledge）：
 *   - devices.json            设备大类、34 种设备类型字典、房间区域类型字典
 *   - room-rules.json         各房间必备/推荐/可选点位规则、推荐场景与 AI 布点设计规范
 *   - selection-rules.json    智能选型价格分位数、各生态平台逐级放宽链与品牌统一规则
 *   - proposal-templates.json 方案章节编排规范、版式框架、视觉主题、方案模板与内置场景库
 *   - plugins.json            12 款插件清单及各自的 AI 元数据（tools / skills / knowledge / guidance / permissions）
 *   - ai-tools.json           AI 工具完整 Schema、权限字典、技能模板与 Token 计费规则
 *   - domain-knowledge.json   合并后的单文件完整知识库（可直接投喂 RAG / 外部知识库）
 *   - tests/domain-cases.json 声明式测试用例（可直接改 JSON 增删测试，无需读改业务代码）
 */
import fs from 'node:fs'
import path from 'node:path'

import { analyzeArea, ROOM_ANALYSIS_RULES } from '@/lib/area-analysis'
import { AREA_TYPES, inferAreaType } from '@/lib/area-types'
import { BUILTIN_SCENES, SCENE_CHAPTERS } from '@/lib/builtin-scenes'
import {
  AUTO_DESIGN_TYPES,
  CAMERA_PER_FLOOR,
  DESIGN_RULE_TEXT,
  DRAWING_ONLY_CATEGORIES,
  NEEDS_SWITCH_TYPES,
  ONE_PER_AREA_TYPES,
  SPEAKER_AREA_TYPES,
  VRF_PER_FLOOR,
} from '@/lib/design-rules'
import { DEVICE_CATEGORIES, DEVICE_TYPES, inferDeviceType, symbolUrl } from '@/lib/device-types'
import { PROJECT_PLATFORMS } from '@/lib/projects'
import {
  AI_PERMISSIONS,
  allAiSkillSpecs,
  allAiToolSpecs,
  PLUGINS,
  validatePluginAiPermissions,
} from '@/plugins'
import { CREDIT_VALUE_CNY, DEFAULT_TOOL_COST, INPUT_PER_1K, OUTPUT_PER_1K, TOOL_COSTS } from '@/plugins/ai-copilot/billing'
import { DECK_THEMES } from '@/plugins/proposal/deck/themes'
import { DECK_SECTIONS, normalizeSections, ORCHESTRATION_RULES, PROPOSAL_FRAMEWORKS } from '@/plugins/proposal/framework'
import { BUILTIN_PROPOSAL_TEMPLATES, recommendTemplates } from '@/plugins/proposal/templates'
import { PLATFORM_PREFS, SELECTION_TIERS } from '@/plugins/smart-select/auto-select'

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) || './knowledge')

function buildKnowledgeBundle() {
  const devices = {
    categories: DEVICE_CATEGORIES.map((c) => ({
      slug: c.slug,
      name: c.name,
      codePrefix: c.code,
      color: c.color,
      sortOrder: c.sortOrder,
    })),
    deviceTypes: DEVICE_TYPES.map((t) => ({
      value: t.value,
      name: t.name,
      category: t.category,
      symbol: t.symbol,
      symbolSvg: symbolUrl(t.symbol),
      keys: 'keys' in t ? (t.keys ?? null) : null,
      keywordPattern: t.keywords.source,
    })),
    areaTypes: AREA_TYPES.map((a) => ({
      value: a.value,
      label: a.label,
      keywordPattern: a.keywords.source,
    })),
  }

  const roomRules = {
    scoringRule: 'score = 已满足的(必备 core + 推荐 recommended)项数量 / 总(必备 core + 推荐 recommended)项数量 × 100（四舍五入，可选 optional 不计入分母）',
    designRules: {
      summaryText: DESIGN_RULE_TEXT,
      drawingOnlyCategories: [...DRAWING_ONLY_CATEGORIES],
      autoDesignTypes: [...AUTO_DESIGN_TYPES],
      needsSwitchTypes: [...NEEDS_SWITCH_TYPES],
      speakerAreaTypes: [...SPEAKER_AREA_TYPES],
      onePerAreaTypes: [...ONE_PER_AREA_TYPES],
      vrfPerFloor: VRF_PER_FLOOR,
      cameraPerFloor: CAMERA_PER_FLOOR,
    },
    rooms: ROOM_ANALYSIS_RULES,
  }

  const selectionRules = {
    platforms: [...PROJECT_PLATFORMS],
    tiers: SELECTION_TIERS.map((t) => ({
      value: t.value,
      label: t.label,
      pricePercentile: t.percentile,
      description: `在候选池中按价格从低到高排序，取 ${Math.round(t.percentile * 100)}% 分位数的产品`,
    })),
    platformFallbackChains: Object.fromEntries(
      Object.entries(PLATFORM_PREFS).map(([platform, chain]) => [
        platform,
        chain.map((step) => ({
          brandPattern: step.brands ? step.brands.source : null,
          platforms: step.platforms ?? null,
        })),
      ]),
    ),
    brandUnificationRule: '同一设备大类内统计选中次数最多的主品牌；若同大类其他设备类型存在该主品牌产品，且价差 ≤ max(30元, 原选中产品价格 × 40%)，自动替换为该主品牌产品以保持面板与设备外观统一。',
  }

  const proposalTemplates = {
    orchestrationRules: [...ORCHESTRATION_RULES],
    sections: DECK_SECTIONS.map((s) => ({ ...s })),
    frameworks: PROPOSAL_FRAMEWORKS.map((f) => ({
      value: f.value,
      label: f.label,
      description: f.description,
      audience: f.audience,
      occasion: f.occasion,
      sections: [...f.sections],
    })),
    themes: Object.values(DECK_THEMES).map((th) => ({
      id: th.id,
      label: th.label,
      description: th.description,
      coverLayout: th.cover,
      chapterStyle: th.chapter,
      tableStyle: th.table,
      mood: th.mood,
      headline: th.headline,
      tagline: th.tagline,
      coverTagline: th.coverTagline,
      coverPhoto: th.coverPhoto,
      colors: th.style.colors,
    })),
    templates: BUILTIN_PROPOSAL_TEMPLATES.map((t) => ({
      slug: t.value,
      name: t.label,
      kind: t.kind,
      framework: t.framework,
      theme: t.theme,
      description: t.description,
      audience: t.audience,
      occasion: t.occasion,
      highlights: t.highlights,
      sections: t.sections,
    })),
    sceneChapters: [...SCENE_CHAPTERS],
    builtinScenes: BUILTIN_SCENES.map((s) => ({
      slug: s.slug,
      name: s.name,
      summary: s.summary,
      headline: s.headline,
      tagline: s.tagline,
      scope: s.scope,
      chapter: s.chapter,
      roomTypes: s.roomTypes,
      requiredDevices: s.requiredDevices,
      anyDevices: s.anyDevices,
      steps: s.steps,
      photo: s.image?.url ?? null,
      credit: s.credit,
    })),
  }

  const plugins = {
    plugins: PLUGINS.map((p) => ({
      id: p.id,
      name: p.name,
      stage: p.stage,
      status: p.status,
      tagline: p.tagline,
      description: p.description,
      where: p.where,
      provides: p.provides,
      ai: p.ai
        ? {
            permissions: [...p.ai.permissions],
            guidance: [...p.ai.guidance],
            knowledge: p.ai.knowledge.map((k) => ({ ...k, rules: [...k.rules] })),
            tools: p.ai.tools.map((t) => t.name),
            skills: p.ai.skills.map((s) => s.id),
          }
        : null,
    })),
  }

  const aiTools = {
    billing: {
      creditValueCny: CREDIT_VALUE_CNY,
      inputPer1kTokens: INPUT_PER_1K,
      outputPer1kTokens: OUTPUT_PER_1K,
      defaultToolCost: DEFAULT_TOOL_COST,
      formula:
        '若模型配置了真实价格（元/百万 tokens，区分工作日 9:00-12:00 / 14:00-18:00 高峰与空闲、缓存命中与未命中）：credits = ceil(model.cost * costCny / 0.1 + sum(toolCosts))；未配置价格时回退旧公式：credits = ceil(model.cost * (inputTokens/1000 * 0.1 + outputTokens/1000 * 0.5) + sum(toolCosts))',
      toolCosts: TOOL_COSTS,
    },
    permissions: AI_PERMISSIONS.map((p) => ({ ...p })),
    tools: allAiToolSpecs().map((t) => ({
      name: t.name,
      title: t.title,
      pluginId: t.pluginId,
      cost: t.cost,
      scope: t.scope,
      mutates: t.mutates,
      permissions: [...t.permissions],
      description: t.description,
      parameters: t.parameters,
    })),
    skills: allAiSkillSpecs().map((s) => ({ ...s })),
  }

  return {
    devices,
    'room-rules': roomRules,
    'selection-rules': selectionRules,
    'proposal-templates': proposalTemplates,
    plugins,
    'ai-tools': aiTools,
  }
}

type DomainTestCases = {
  deviceInference: { inputName: string; categorySlug?: string; expectedType: string }[]
  areaInference: { inputName: string; expectedAreaType: string }[]
  roomCompleteness: {
    name: string
    areaType: string
    devices: string[]
    expectedScore: number
    expectedMissingCount: number
  }[]
  sectionNormalization: {
    framework: 'full' | 'story' | 'budget' | 'construction'
    inputSections: string[]
    expectedSections: string[]
  }[]
  templateRecommendation: {
    audience: string
    occasion?: string
    budgetSensitive?: boolean
    expectedTopSlug: string
  }[]
}

const DEFAULT_TEST_CASES: DomainTestCases = {
  deviceInference: [
    { inputName: 'Aqara 智能墙壁开关 H1 零火版（三键）', categorySlug: 'switch', expectedType: 'switch-3' },
    { inputName: 'Yeelight 易来 Pro S20 嵌入式射灯', categorySlug: 'lighting', expectedType: 'spotlight' },
    { inputName: '小米人体存在传感器 Pro', categorySlug: 'sensor', expectedType: 'motion-sensor' },
    { inputName: '华为全屋智能吸顶AP面板', categorySlug: 'network', expectedType: 'ceiling-ap' },
  ],
  areaInference: [
    { inputName: '一层主卧卫生间', expectedAreaType: 'bathroom' },
    { inputName: '步入式衣帽间', expectedAreaType: 'closet' },
    { inputName: '地下室私人影院', expectedAreaType: 'theater' },
    { inputName: '入户门厅', expectedAreaType: 'entrance' },
  ],
  roomCompleteness: [
    {
      name: '满配玄关',
      areaType: 'entrance',
      devices: ['smart-lock', 'downlight', 'motion-sensor', 'switch-2'],
      expectedScore: 100,
      expectedMissingCount: 1, // optional camera/doorbell
    },
    {
      name: '缺烟感与水浸的厨房',
      areaType: 'kitchen',
      devices: ['downlight', 'switch-1'],
      expectedScore: 50,
      expectedMissingCount: 3,
    },
  ],
  sectionNormalization: [
    {
      framework: 'full',
      inputSections: ['zones', 'service', 'plans', 'investment', 'plans'],
      expectedSections: ['cover', 'zones', 'plans', 'investment', 'service'],
    },
    {
      framework: 'construction',
      inputSections: ['cover', 'plans'],
      expectedSections: [],
    },
  ],
  templateRecommendation: [
    { audience: '别墅大平层高净值业主', occasion: '大屏投影现场演示', expectedTopSlug: 'noir' },
    { audience: '新中式东方风别墅业主', occasion: '顶奢项目正式提案', expectedTopSlug: 'jade' },
    { audience: '第一次咨询的客户', budgetSensitive: true, expectedTopSlug: 'quick' },
  ],
}

function runTestSuite(casesPath: string) {
  const cases: DomainTestCases = fs.existsSync(casesPath)
    ? (JSON.parse(fs.readFileSync(casesPath, 'utf8')) as DomainTestCases)
    : DEFAULT_TEST_CASES
  const failures: string[] = []
  let passed = 0

  // 1. 插件权限一致性检查
  const permCheck = validatePluginAiPermissions()
  if (!permCheck.ok) failures.push(...permCheck.violations)
  else passed++

  // 2. 设备类型推断测试
  for (const c of cases.deviceInference) {
    const actual = inferDeviceType(c.inputName, c.categorySlug)
    if (actual !== c.expectedType) {
      failures.push(`[deviceInference] "${c.inputName}" 期望 ${c.expectedType}，实际 ${actual}`)
    } else passed++
  }

  // 3. 房间区域类型推断测试
  for (const c of cases.areaInference) {
    const actual = inferAreaType(c.inputName)
    if (actual !== c.expectedAreaType) {
      failures.push(`[areaInference] "${c.inputName}" 期望 ${c.expectedAreaType}，实际 ${actual}`)
    } else passed++
  }

  // 4. 房间点位完整度评分测试
  for (const c of cases.roomCompleteness) {
    const res = analyzeArea(
      { id: 'a1', name: c.name, areaType: c.areaType as never },
      c.devices.map((deviceType) => ({ deviceType, areaId: 'a1', sheetId: 's1' })),
    )
    if (res.score !== c.expectedScore || res.missing.length !== c.expectedMissingCount) {
      failures.push(
        `[roomCompleteness] "${c.name}" 期望 score=${c.expectedScore}, missing=${c.expectedMissingCount}，实际 score=${res.score}, missing=${res.missing.length}`,
      )
    } else passed++
  }

  // 5. 方案章节编排规范归一化测试
  for (const c of cases.sectionNormalization) {
    const actual = normalizeSections(c.inputSections, c.framework)
    if (JSON.stringify(actual) !== JSON.stringify(c.expectedSections)) {
      failures.push(`[sectionNormalization] 期望 ${JSON.stringify(c.expectedSections)}，实际 ${JSON.stringify(actual)}`)
    } else passed++
  }

  // 6. 方案模板智能推荐测试
  for (const c of cases.templateRecommendation) {
    const picks = recommendTemplates(BUILTIN_PROPOSAL_TEMPLATES, {
      audience: c.audience,
      occasion: c.occasion,
      budgetSensitive: c.budgetSensitive,
    })
    const actualTop = picks[0]?.template.value
    if (actualTop !== c.expectedTopSlug) {
      failures.push(`[templateRecommendation] "${c.audience}" 期望首选 ${c.expectedTopSlug}，实际 ${actualTop}`)
    } else passed++
  }

  return { passed, failures }
}

const bundle = buildKnowledgeBundle()
const testsDir = path.join(outDir, 'tests')
const casesFile = path.join(testsDir, 'domain-cases.json')

if (!checkOnly) {
  fs.mkdirSync(testsDir, { recursive: true })
  for (const [name, data] of Object.entries(bundle)) {
    const file = path.join(outDir, `${name}.json`)
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
    console.log(`已导出: ${path.relative(process.cwd(), file)}`)
  }
  const combinedFile = path.join(outDir, 'domain-knowledge.json')
  fs.writeFileSync(combinedFile, JSON.stringify(bundle, null, 2) + '\n')
  console.log(`已导出总表: ${path.relative(process.cwd(), combinedFile)}`)
  if (!fs.existsSync(casesFile)) {
    fs.writeFileSync(casesFile, JSON.stringify(DEFAULT_TEST_CASES, null, 2) + '\n')
    console.log(`已生成测试用例文件: ${path.relative(process.cwd(), casesFile)}`)
  }
}

const testResult = runTestSuite(casesFile)
console.log(`领域规则测试：通过 ${testResult.passed} 项，失败 ${testResult.failures.length} 项`)
if (testResult.failures.length > 0) {
  console.error(testResult.failures.join('\n'))
  process.exit(1)
}
process.exit(0)
