/**
 * HA-MCP 插件的 AI 规格：向助手注册 6 个「智能家居现场」相关工具。
 *
 * ⚠️ 为什么不把 ha-mcp 的 87 个工具全注册进来
 *
 * 助手用的是 OpenAI function calling（每个工具的参数 JSON Schema 常驻上下文）。
 * 87 个工具的 schema 大约要吃掉 15–20k token，而且绝大多数（改 HACS、管理 app、
 * 写 YAML、备份）与「设计报价」主链路无关，会把模型带偏。
 *
 * 所以只挑对本仓业务真正有用的 6 个：
 *   · 读设备/实体状态     —— 报价时确认客户家已有的设备
 *   · 搜索实体            —— 现场对接时快速定位某盏灯/某个开关
 *   · 读区域与楼层        —— 对齐本仓的「房间区域」概念
 *   · 调服务（控制设备）   —— 调试与验收阶段实际点一下
 *   · 读历史              —— 排查「为什么这个自动化没生效」
 *   · 读系统健康          —— 交付前确认 HA 本身没问题
 *
 * 其余工具如果需要，用户在 HA 侧直接用官方客户端即可；本插件不做中转。
 */
import type { PluginAiSpec } from '@/plugins/ai-types'

export const haMcpAiSpec: PluginAiSpec = {
  permissions: ['smart-home:read', 'smart-home:write'],
  guidance: [
    '当用户问「客户家里现在有哪些设备 / 某个房间装了什么 / 这盏灯现在什么状态」时，先调用 ha_get_overview 或 ha_search_entities 拿到真实数据，不要凭印象回答。',
    '当用户要「把某个设备关掉 / 调亮度 / 执行一个场景」时，调用 ha_call_service；调用前必须确认目标实体 ID 准确（先用 ha_search_entities 查）。',
    'ha_call_service 会真的改变客户家里的设备状态。涉及照明的调试请在白天确认，避免夜间突然关灯影响住户。',
    '本插件连接的是客户现场真实的 Home Assistant，不是模拟环境。任何写操作都要先说清楚要做什么，得到确认再执行。',
  ],
  knowledge: [
    {
      id: 'ha-mcp-boundary',
      title: 'HA-MCP 的能力边界',
      summary:
        '本插件通过 MCP 协议操作客户现场的 Home Assistant，只开放读状态、搜实体、读区域、调服务、读历史、读健康六类能力',
      rules: [
        '本插件不提供「改 YAML / 装 HACS / 管理备份」类能力 —— 那些属于运维，交给 HA 官方客户端。',
        '实体 ID 形如 light.living_room_main；服务调用形如 light.turn_on，参数从 ha_list_services 查。',
        '连接地址由项目或全局设置里的 HA-MCP endpoint 提供；未配置时所有工具都返回「未配置」提示，不报错。',
      ],
    },
  ],
  tools: [
    {
      name: 'ha_get_overview',
      title: '读取智能家居总览',
      description:
        '读取客户现场 Home Assistant 的总览：楼层与区域清单、各区域的设备数量、当前有多少实体处于「开」状态、最近有问题的实体。用于在报价或验收前快速了解现场规模。',
      cost: 0,
      permissions: ['smart-home:read'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          include_states: {
            type: 'boolean',
            description: '是否附带各区域的活跃实体列表（默认 false，只给统计）',
          },
        },
      },
    },
    {
      name: 'ha_search_entities',
      title: '搜索智能家居实体',
      description:
        '按关键词或区域搜索现场设备实体（灯、开关、窗帘、传感器、空调…），返回实体 ID、当前状态与所属区域。用于确认「客户说的那盏灯」到底是哪个实体。',
      cost: 0,
      permissions: ['smart-home:read'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词，例如「客厅吊灯」「主卧窗帘」' },
          area: { type: 'string', description: '限定区域名，可选' },
          domain: {
            type: 'string',
            description: '限定设备类型，如 light / switch / cover / sensor，可选',
          },
          limit: { type: 'number', description: '最多返回多少条，默认 20' },
        },
        required: ['query'],
      },
    },
    {
      name: 'ha_list_areas',
      title: '读取区域与楼层',
      description:
        '读取 Home Assistant 里的楼层、区域清单及其包含的实体数量。用于把现场区域与本仓项目的「房间区域」对齐。',
      cost: 0,
      permissions: ['smart-home:read'],
      scope: 'workspace',
      mutates: false,
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'ha_get_history',
      title: '读取设备历史',
      description:
        '读取指定实体在过去一段时间内的状态变化。用于排查「这个自动化为什么没生效」「昨晚这盏灯几点被关的」。',
      cost: 0,
      permissions: ['smart-home:read'],
      scope: 'workspace',
      mutates: false,
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: '实体 ID，如 light.living_room_main' },
          hours: { type: 'number', description: '往前查多少小时，默认 24' },
        },
        required: ['entity_id'],
      },
    },
    {
      name: 'ha_get_system_health',
      title: '检查 Home Assistant 健康',
      description:
        '检查现场 Home Assistant 的运行健康度：核心版本、集成报错、离线设备数量。交付验收前用它确认「现场本身没问题」。',
      cost: 0,
      permissions: ['smart-home:read'],
      scope: 'workspace',
      mutates: false,
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'ha_call_service',
      title: '控制智能家居设备',
      description:
        '调用 Home Assistant 服务控制真实设备（开灯、关灯、调亮度、开合窗帘、执行场景）。⚠️ 会改变客户家里的实际设备状态，调用前必须先确认实体 ID 与动作。',
      cost: 0,
      permissions: ['smart-home:write'],
      scope: 'workspace',
      mutates: true,
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: '服务域，如 light / switch / cover / scene' },
          service: { type: 'string', description: '服务名，如 turn_on / turn_off / toggle' },
          entity_id: { type: 'string', description: '目标实体 ID' },
          data: {
            type: 'object',
            description: '附加参数，例如 {"brightness_pct": 60}',
          },
        },
        required: ['domain', 'service', 'entity_id'],
      },
    },
  ],
  skills: [
    {
      id: 'tpl-ha-site-check',
      name: '现场设备核对',
      category: '点位审查',
      description: '把客户现场 Home Assistant 里的真实设备，与本仓项目的点位清单做一次对照',
      modelHint: 'reasoning',
      recommendedModelId: 'default',
      requiredPlugins: ['ha-mcp'],
      variables: [{ key: 'project', label: '项目名称', defaultValue: '当前项目' }],
      promptTemplate: [
        '请帮我核对 {{project}} 的现场设备：',
        '1) 先调用 ha_get_overview 看现场规模和区域分布；',
        '2) 用 ha_search_entities 按房间逐个列出实际存在的灯、开关、窗帘；',
        '3) 和当前项目点位图里的设备清单对比，指出「点位里规划了但现场没有」以及「现场有但点位没规划」的项；',
        '4) 按房间给结论，不要笼统总结。',
      ].join('\n'),
    },
  ],
}
