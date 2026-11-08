/**
 * 繁梦空间（FMKJ）用户手册数据源（单一事实来源）。
 *
 * 同步维护约定：
 * 1. AI 积分计费单价与各工具调用费率直接引自 `@/plugins/ai-copilot/billing`；
 * 2. 插件清单直接引自 `@/plugins`；方案模板引自 `@/plugins/proposal/templates`；文档风格引自 `@/documents/registry`；
 * 3. 后续若新增或修改核心功能、操作流程、计费规则或快捷键，必须同步更新本文件与 `docs/USER_MANUAL.md`。
 * 平台已取消会员分级：所有功能统一按 AI 积分扣除（积分余额与流水见 `src/collections/AiCreditLedger.ts`）。
 */
import { allStyles, DOC_KIND_LIST, DOC_KINDS } from '@/documents/registry'
import { DEVICE_GROUPS } from '@/lib/device-types'
import { PLUGINS } from '@/plugins'
import { DEFAULT_TOOL_COST, INPUT_PER_1K, OUTPUT_PER_1K, TOOL_COSTS } from '@/plugins/ai-copilot/billing'
import { AI_PROVIDER_PRESETS, type AiModelConfig } from '@/plugins/ai-copilot/templates'
import { PROPOSAL_TEMPLATES } from '@/plugins/proposal/templates'

export const MANUAL_LAST_UPDATED = '2026-11'

export type WorkflowStepGuide = {
  step: string
  title: string
  routeLabel: string
  summary: string
  bullets: string[]
}

/** 第一章：核心业务主链路 5 步操作指南 */
export const CORE_WORKFLOW_GUIDES: WorkflowStepGuide[] = [
  {
    step: '01',
    title: '项目信息与团队协作',
    routeLabel: '项目列表 -> 新建项目 / 项目概览',
    summary: '录入客户姓名、电话、楼盘小区、房号、客户预算与主生态平台（米家 / Aqara / Apple Home / 华为鸿蒙智家 / KNX 等），作为后续自动选型、报价单与合同抬头的基准信息。',
    bullets: [
      '自动命名：项目名称留空时，系统自动按「小区 + 房号」或客户姓名生成标准项目名。',
      '主平台绑定：选定主平台后，智能选型插件与 AI 助手会优先匹配兼容该生态的设备型号。',
      '链接分享与多人协作：支持生成只读分享链接发给业主查看，或生成协作邀请链接供团队工程师共同编辑点位与报价（协作成员人数不限）。',
      '业主方案对比与意向确认：业主打开分享链接后，可同屏对比「已发送 / 已确认」的多套报价（按设备类别看数量与差价），把暂时不需要的设备标记为「暂缓」，手写签名提交意向；反馈出现在项目「报价」页，可一键生成去掉暂缓设备的调整版报价（原报价不变）。',
    ],
  },
  {
    step: '02',
    title: '点位图设计工作台（fmkj-board-system）',
    routeLabel: '项目 -> 点位图',
    summary: '支持多楼层图纸管理、DWG 转换导入、比例标定、多边形房间区域划分、标准化 SVG 设备/灯光图标放置与一键智能生成点位。',
    bullets: [
      '上传图纸与比例标定：支持上传 PNG/JPG/WebP 户型图（自动裁切图框适配 3:2 标准图纸）或导入 DWG。点击工具栏「标定比例（C）」沿门洞或已知墙段拖一条线并输入实际米数，即可开启 25cm 真实比例网格与灯具按尺寸落图。',
      '多边形房间区域划分：点击工具栏「画区域（A）」，依次点击房间拐角可描出任意多边形轮廓（如 L 型走廊或异形客厅），也可直接拖拽画矩形区域。点位落入区域后自动按房间归类统计。',
      '智能设备与灯光设计：右侧面板分「智能设备」与「灯光设计」两栏，支持点击画布连续放置或拖拽放置；选中点位后可旋转角度、切换灯具款式尺寸、复制或切换设备类型。',
      '智能生成点位（覆盖提示 + 可撤销）：点击顶部或画布工具栏的「智能生成点位」按钮，系统会根据已划分的房间区域（未划区域时自动创建标准户型区域）自动排布全屋智能与照明点位。点击时会明确提示覆盖当前图纸已有点位，生成后可随时点击通知栏/工具栏「撤销」或按 Ctrl/Cmd + Z 一键恢复原有点位。',
      '视图过滤与导出：底部可按「全部 / 强电开关 / 照明灯具 / 弱电网络 / 智能设备」切换显示范围；左上角导出菜单支持导出带标准图例的 PNG 点位图（图上直接展示设备图标而非纯数字编号）或画板 JSON。',
      '智能辅助图层：在画布工具栏「显示与隐藏」里打开「信号覆盖圈」（吸顶 AP 8m、面板 AP / 路由 6m、网关 10m，按标定比例换算，未标定时虚线估算），一眼看出大平层、别墅的信号盲区；打开「开关控灯关联」按房间推断每盏灯由哪个开关控制（门外 3.5m 内的开关也算），没有开关控制的灯具标红，图纸检查同步提示。',
    ],
  },
  {
    step: '03',
    title: '报价台（与点位图双向无缝联动）',
    routeLabel: '项目 -> 报价',
    summary: '点位图画完即可一键生成或同步到报价单；在报价台可按系统或按房间核对明细、替换品牌型号、修改单价、设置优惠与附加服务费。',
    bullets: [
      '一键生成与增量同步：在点位图顶部点击「生成报价」或「同步到报价」，系统自动按点位数量汇总并匹配产品库默认型号；已手动在报价单改过的型号与单价在同步时会智能保留。',
      '替换产品与改价：点击任意报价行可从 728 款产品库中按品牌/平台搜索替换型号，或直接修改单价、数量、备注；支持设置整单抹零优惠与安装调试费、辅材费等附加项。',
      '双向定位：在报价单中点击任意房间或设备点位代号，可一键跳回点位图画布并自动聚焦放大到对应点位或区域。',
      '多套报价版式与风格：支持切换 6 种版式（系统分类明细、按房间分组、预算速览、含图清单等）与 7 套视觉风格。',
      '内部毛利核算（仅自己可见）：在「设置 → 报价成本与毛利」里填写各品牌拿货折扣（如 Aqara 6.5 折）、附加费用成本占比与毛利率底线；报价台右下角的毛利胶囊实时显示成本、毛利率、底线价与还能让利的空间，一键隐藏防止业主看到，打印与分享页不含任何成本。',
      '竞品报价单转配单：在 AI 助手里选择「竞品报价单识图转配单」技能，上传外店报价单截图或粘贴 Excel 表格，AI 逐行匹配产品库同级型号并生成对比报价单与差价分析。',
    ],
  },
  {
    step: '04',
    title: '施工合同与分期收款管理',
    routeLabel: '项目 -> 合同',
    summary: '基于确认的报价单自动带入合同总金额、客户信息与公司抬头，配置分期付款节点、工期与质保条款。',
    bullets: [
      '三阶段分期付款：默认支持签约首付、设备进场、完工验收三阶段比例设置（如 40% / 50% / 10%），自动校验比例合计为 100% 并计算各期金额。',
      '收款与状态追踪：支持逐期标记「已收款」及切换合同状态（草稿 / 已签署 / 履行中 / 已完结）。',
      '默认条款复用：可在工作台「设置」中保存公司默认合同条款与报价说明，新建合同时自动带入。',
    ],
  },
  {
    step: '05',
    title: '归档与多模板 PDF / 交付资料包导出',
    routeLabel: '项目 -> 归档',
    summary: '在归档中心统一预览、切换风格并导出面向业主与施工团队的全套交付文档。',
    bullets: [
      '8 章 A4 横版方案演示：含封面、设计理念、点位平面图（直接显示设备图标）、AC+AP 网络与中控系统拓扑图、分房间配置、智能联动场景、预算投资汇总与服务交付确认。',
      '施工与工程专业单据：支持导出正式报价单、施工合同、A4 横版点位布置图、施工交底核对清单（自动隐去价格）、现场勘测单、强弱电布线表、场景与账号移交单、采购与备货核验单。',
      '业主交付资料包：支持在归档页勾选任意文档，一键合并为单份完整 PDF 或打包为 ZIP 压缩包下载交付业主。',
      '售后维保：在归档页进入「售后维保」，登记交付验收后质保自动倒计时（到期前 30 天提醒），记录巡检、上门检修、设备更换与收费；一键留存全屋设备台账作为配置备份，并打印售后维保卡交给业主。项目归档后仍可继续登记。',
    ],
  },
]

/** 第三章：AI 工具调用费率说明表（与 TOOL_COSTS 实时同步） */
export const AI_TOOL_BILLING_ITEMS: {
  toolName: string
  label: string
  category: '查询与检索' | '项目与选型修改' | '图纸与单据生成'
  cost: number
  description: string
}[] = [
  {
    toolName: 'list_projects',
    label: '查询/切换项目列表',
    category: '查询与检索',
    cost: TOOL_COSTS.list_projects ?? DEFAULT_TOOL_COST,
    description: '按关键词、状态筛选项目或切换当前会话关联项目',
  },
  {
    toolName: 'get_project_details',
    label: '读取项目点位与报价详情',
    category: '查询与检索',
    cost: TOOL_COSTS.get_project_details ?? DEFAULT_TOOL_COST,
    description: '获取项目房间、点位统计、待选型数量与当前报价概况',
  },
  {
    toolName: 'get_document_links',
    label: '生成打印与导出文档直达链接',
    category: '查询与检索',
    cost: TOOL_COSTS.get_document_links ?? DEFAULT_TOOL_COST,
    description: '生成方案演示、报价单、合同、点位图与交底单的预览导出链接',
  },
  {
    toolName: 'recommend_proposal_template',
    label: '按客户画像智能推荐方案模板',
    category: '查询与检索',
    cost: TOOL_COSTS.recommend_proposal_template ?? DEFAULT_TOOL_COST,
    description: '根据业主装修风格、汇报时机与预算敏感度匹配最佳方案模板并返回预览链接',
  },
  {
    toolName: 'search_products',
    label: '检索 728 款产品库',
    category: '查询与检索',
    cost: TOOL_COSTS.search_products ?? DEFAULT_TOOL_COST,
    description: '按设备类型、品牌、生态平台、最高单价检索在售产品型号与价格',
  },
  {
    toolName: 'room_insights',
    label: '房间点位完整度审查',
    category: '查询与检索',
    cost: TOOL_COSTS.room_insights ?? DEFAULT_TOOL_COST,
    description: '按房间逐一检查必备/推荐点位遗漏、开关回路匹配度与联动场景建议',
  },
  {
    toolName: 'create_project',
    label: '新建全屋智能项目',
    category: '项目与选型修改',
    cost: TOOL_COSTS.create_project ?? DEFAULT_TOOL_COST,
    description: '创建新项目并录入客户、小区、主平台与预算信息',
  },
  {
    toolName: 'update_project',
    label: '修改项目信息或归档状态',
    category: '项目与选型修改',
    cost: TOOL_COSTS.update_project ?? DEFAULT_TOOL_COST,
    description: '更新项目名称、客户信息、主平台、预算或切换归档状态',
  },
  {
    toolName: 'set_project_defaults',
    label: '指定设备类型默认产品型号',
    category: '项目与选型修改',
    cost: TOOL_COSTS.set_project_defaults ?? DEFAULT_TOOL_COST,
    description: '为项目某类点位指定默认匹配的 SKU 产品型号',
  },
  {
    toolName: 'add_floor_sheet',
    label: '上传户型图并识别点位',
    category: '图纸与单据生成',
    cost: TOOL_COSTS.add_floor_sheet ?? DEFAULT_TOOL_COST,
    description: '将上传的户型图添加为标准图纸，并写入真实识别到的点位符号坐标',
  },
  {
    toolName: 'import_points_json',
    label: '导入 fmkj-points 点位 JSON',
    category: '图纸与单据生成',
    cost: TOOL_COSTS.import_points_json ?? DEFAULT_TOOL_COST,
    description: '将识别出的区域与点位比例坐标 JSON 批量导入项目点位图',
  },
  {
    toolName: 'create_or_update_quote',
    label: '生成或修改项目报价单',
    category: '图纸与单据生成',
    cost: TOOL_COSTS.create_or_update_quote ?? DEFAULT_TOOL_COST,
    description: '从点位图生成报价单、同步最新点位或修改优惠金额、附加费与报价状态',
  },
  {
    toolName: 'create_quote_from_competitor',
    label: '竞品报价单转配单',
    category: '图纸与单据生成',
    cost: TOOL_COSTS.create_quote_from_competitor ?? DEFAULT_TOOL_COST,
    description: '把外店报价单逐行匹配到产品库同级型号，生成对比报价单并计算整单差价',
  },
  {
    toolName: 'create_or_update_contract',
    label: '生成或修改项目施工合同',
    category: '图纸与单据生成',
    cost: TOOL_COSTS.create_or_update_contract ?? DEFAULT_TOOL_COST,
    description: '创建合同、设置分期付款比例、修改工期质保或登记分期收款状态',
  },
  {
    toolName: 'setup_rooms_and_points',
    label: '无图纸项目自动创建房间与点位',
    category: '图纸与单据生成',
    cost: TOOL_COSTS.setup_rooms_and_points ?? DEFAULT_TOOL_COST,
    description: '针对未上传户型图的纯文字需求项目，在空白示意图上自动生成房间框与智能点位',
  },
  {
    toolName: 'smart_select',
    label: '按生态平台与预算档次一键选型',
    category: '项目与选型修改',
    cost: TOOL_COSTS.smart_select ?? DEFAULT_TOOL_COST,
    description: '按指定生态平台（米家/Aqara/Apple Home/华为/KNX）和经济/标准/高端档次自动配齐整屋默认产品',
  },
]

/** 第五章：点位图工作台快捷键速查表 */
export const BOARD_SHORTCUTS: { keys: string; action: string; scope: string }[] = [
  { keys: 'V', action: '切换到「选择 / 移动」工具', scope: '画布全局' },
  { keys: 'H / 按住空格拖拽', action: '平移画布视野', scope: '画布全局' },
  { keys: 'A', action: '切换到「画区域」工具（点击描多边形轮廓，拖拽画矩形）', scope: '编辑模式' },
  { keys: 'C', action: '切换到「标定比例」工具（沿已知尺寸墙段拖线标定）', scope: '编辑模式' },
  { keys: 'G', action: '开启 / 关闭 25cm 比例网格', scope: '画布全局' },
  { keys: 'Shift + R', action: '显示 / 隐藏顶部与左侧标尺', scope: '画布全局' },
  { keys: 'R', action: '将选中点位顺时针旋转 90 度', scope: '选中点位时' },
  { keys: '方向键 / Shift + 方向键', action: '微调选中对象位置（1 单位 / 10 单位）', scope: '选中对象时' },
  { keys: 'Ctrl/Cmd + Z', action: '撤销上一步操作（含撤销「智能生成点位」覆盖）', scope: '编辑模式' },
  { keys: 'Ctrl/Cmd + Shift + Z', action: '重做上一步撤销的操作', scope: '编辑模式' },
  { keys: 'Ctrl/Cmd + C / V', action: '复制选中点位或区域 / 粘贴到鼠标位置并自动重编号', scope: '编辑模式' },
  { keys: 'Ctrl/Cmd + D', action: '快速原地复制选中点位或区域', scope: '编辑模式' },
  { keys: 'Ctrl/Cmd + A', action: '全选当前可见范围内的所有设备点位', scope: '编辑模式' },
  { keys: 'Delete / Backspace', action: '删除选中的点位或区域', scope: '选中对象时' },
  { keys: 'Ctrl/Cmd + 0', action: '将当前图纸 100% 居中铺满画布', scope: '画布全局' },
  { keys: 'Ctrl/Cmd + S', action: '立即保存点位图到云端', scope: '编辑模式' },
  { keys: 'Esc', action: '结束连续放置设备 / 退出区域绘制 / 取消选中', scope: '画布全局' },
]

/** 汇总当前系统实时配置，供用户手册页面直接渲染 */
export function getManualSnapshot(activeModels?: AiModelConfig[]) {
  const models = (activeModels?.length ? activeModels : AI_PROVIDER_PRESETS).map((m) => ({
    name: m.name,
    provider: m.provider,
    apiModel: m.apiModel,
    cost: m.cost,
    reasoning: Boolean(m.reasoning),
    description: m.description,
  }))

  const plugins = PLUGINS.map((p) => ({
    id: p.id,
    name: p.name,
    where: p.where,
    description: p.description,
    provides: p.provides,
    aiTools: p.ai?.tools.map((t) => t.name) ?? [],
    aiPermissions: p.ai?.permissions ?? [],
  }))

  const proposalTemplates = PROPOSAL_TEMPLATES.map((t) => ({
    id: t.value,
    name: t.label,
    subtitle: t.framework,
    kind: t.kind,
    audience: t.audience,
    occasion: t.occasion,
    highlights: t.highlights,
    description: t.description,
  }))

  const docStyles = allStyles().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    isBuiltin: s.id === 'minimal',
  }))

  const docKinds = DOC_KIND_LIST.map((k) => ({
    kind: k,
    label: DOC_KINDS[k].label,
    layouts: DOC_KINDS[k].layouts.map((l) => l.label),
  }))

  const deviceCategories = DEVICE_GROUPS.map((g) => ({
    categoryName: g.category.name,
    codePrefix: g.category.code,
    types: g.types.map((t) => t.name),
  }))

  return {
    lastUpdated: MANUAL_LAST_UPDATED,
    billing: {
      inputPer1k: INPUT_PER_1K,
      outputPer1k: OUTPUT_PER_1K,
      defaultToolCost: DEFAULT_TOOL_COST,
      tools: AI_TOOL_BILLING_ITEMS,
    },
    models,
    plugins,
    proposalTemplates,
    docStyles,
    docKinds,
    deviceCategories,
    workflows: CORE_WORKFLOW_GUIDES,
    shortcuts: BOARD_SHORTCUTS,
  }
}
