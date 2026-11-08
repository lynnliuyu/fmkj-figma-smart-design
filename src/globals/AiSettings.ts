import type { ArrayField, Field, GlobalConfig } from 'payload'

import { CACHE_TAGS, expireGlobalOnChange } from '@/lib/cache-tags'
import { fieldCmsAdminOnly, isCmsAdmin } from '@/lib/access'
import { AI_PROVIDER_CHANNEL_LIST, CUSTOM_KEY_ENV_RE, normalizeCustomBaseUrl } from '@/plugins/ai-copilot/templates'

import { aiSettingsEndpoints } from './ai-settings-endpoints'

/** 全局 AI 模型列表（网页与小程序共用）。密钥不入库，只从服务端环境变量读取。 */
export const aiModelsField = {
    // 全局 AI 模型与网关配置（仅限 /admin 超级管理员查看与修改，前台普通用户无权读取或修改）
    name: 'aiModels',
    label: 'AI 模型',
    type: 'array',
    labels: { singular: 'AI 模型', plural: 'AI 模型' },
    access: {
      read: fieldCmsAdminOnly,
      update: fieldCmsAdminOnly,
    },
    admin: {
      description:
        '仅超级管理员在 /admin 后台配置，对全局所有网页与小程序用户生效。留空时默认使用内置 DeepSeek 模型。使用 NewAPI 聚合网关时请在环境变量配置 NEWAPI_BASE_URL 与 NEWAPI_API_KEY。',
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'name',
            label: '显示名称（展示给用户）',
            type: 'text',
            required: true,
            maxLength: 80,
            admin: { placeholder: '如：DeepSeek V3 / 通义千问 Qwen-VL-Max / 智谱 GLM-4V-Plus' },
          },
          {
            name: 'channelId',
            label: '接口渠道',
            type: 'select',
            required: true,
            defaultValue: 'deepseek',
            options: [
              ...AI_PROVIDER_CHANNEL_LIST.map((ch) => ({
                label: `${ch.label}（${ch.apiKeyEnv}）`,
                value: ch.id,
              })),
              { label: '自定义渠道（见上方「自定义渠道」）', value: 'custom' },
            ],
          },
          {
            name: 'customChannel',
            label: '自定义渠道标识',
            type: 'text',
            maxLength: 40,
            admin: {
              condition: (_: unknown, sibling: { channelId?: string } | undefined) => sibling?.channelId === 'custom',
              description: '填写上方自定义渠道的「标识」，如 cloudbase',
            },
          },
          {
            name: 'apiModel',
            label: '接口模型名（model 参数）',
            type: 'text',
            required: true,
            maxLength: 120,
            admin: { placeholder: '如：deepseek-chat / qwen-vl-max / deepseek-reasoner' },
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'cost',
            label: '计费倍率',
            type: 'number',
            required: true,
            defaultValue: 1,
            min: 0,
            max: 100,
            admin: {
              width: '22%',
              description: '按用量计费：每次对话积分 = 倍率 ×（每 1K 输入 tokens 0.1 + 每 1K 输出 tokens 0.5）+ 工具调用费用，向上取整、最少 1。贵的模型可设 2、3。',
            },
          },
          {
            name: 'tag',
            label: '展示标签',
            type: 'text',
            defaultValue: '工具调用',
            maxLength: 40,
            admin: { width: '25%' },
          },
          {
            name: 'description',
            label: '模型简介',
            type: 'text',
            maxLength: 200,
            admin: { width: '25%' },
          },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'enabled', label: '启用该模型', type: 'checkbox', defaultValue: true },
          { name: 'isDefault', label: '设为默认模型', type: 'checkbox', defaultValue: false },
          { name: 'reasoning', label: '支持深度思考过程（如 R1）', type: 'checkbox', defaultValue: false },
        ],
      },
      {
        type: 'collapsible',
        label: '计费价格（元 / 百万 tokens）',
        admin: {
          initCollapsed: true,
          description: '1 AI 积分 = 0.1 元。填模型真实价格；不填则回退旧倍率公式。高峰时段：北京时间工作日 9:00–12:00、14:00–18:00。',
        },
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'peakInputPrice', label: '高峰输入价', type: 'number', defaultValue: 0, min: 0 },
              { name: 'peakOutputPrice', label: '高峰输出价', type: 'number', defaultValue: 0, min: 0 },
              { name: 'peakCachedInputPrice', label: '高峰缓存命中价', type: 'number', defaultValue: 0, min: 0 },
            ],
          },
          {
            type: 'row',
            fields: [
              { name: 'offPeakInputPrice', label: '空闲输入价', type: 'number', defaultValue: 0, min: 0 },
              { name: 'offPeakOutputPrice', label: '空闲输出价', type: 'number', defaultValue: 0, min: 0 },
              { name: 'offPeakCachedInputPrice', label: '空闲缓存命中价', type: 'number', defaultValue: 0, min: 0 },
            ],
          },
        ],
      },
    ],
  } satisfies ArrayField

/** 自定义渠道：任意 OpenAI 兼容接口（腾讯云 CloudBase、自建网关等） */
const customChannelsField: Field = {
  name: 'customChannels',
  label: '自定义渠道',
  type: 'array',
  labels: { singular: '渠道', plural: '渠道' },
  access: { read: fieldCmsAdminOnly, update: fieldCmsAdminOnly },
  admin: {
    initCollapsed: false,
    description:
      '任意兼容 OpenAI 接口（/chat/completions、/models）的服务。密钥不在这里填：在 Figma Make「设置 → Secrets」里新建一个以 AI_ 开头的变量（如 AI_CLOUDBASE_KEY），再把变量名填到下面。',
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'key', label: '标识', type: 'text', required: true, maxLength: 40, admin: { placeholder: '如 cloudbase', width: '20%' }, validate: (v: unknown) => (typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v)) || '只能用字母、数字、- 和 _' },
        { name: 'label', label: '显示名称', type: 'text', maxLength: 60, admin: { placeholder: '如 腾讯云 CloudBase', width: '25%' } },
        {
          name: 'apiKeyEnv',
          label: '密钥环境变量名',
          type: 'text',
          required: true,
          maxLength: 64,
          admin: { placeholder: 'AI_CLOUDBASE_KEY', width: '25%' },
          validate: (v: unknown) => (typeof v === 'string' && CUSTOM_KEY_ENV_RE.test(v)) || '必须以 AI_ 开头，只含大写字母、数字和下划线',
        },
      ],
    },
    {
      name: 'baseUrl',
      label: '接口根地址（Base URL）',
      type: 'text',
      required: true,
      maxLength: 300,
      admin: { placeholder: 'https://<环境ID>.api.tcloudbasegateway.com/v1/ai/<模型服务>/v1', description: '填到 /v1 这一级即可；系统自动拼接 /chat/completions 和 /models。必须是公网 HTTPS。' },
      validate: (v: unknown) => Boolean(normalizeCustomBaseUrl(v)) || '请填写公网 HTTPS 地址',
    },
  ],
}

/** 后台「设置 → AI 设置」：仅 CMS 管理员可见可改。 */
export const AiSettings: GlobalConfig = {
  slug: 'ai-settings',
  label: 'AI 设置',
  admin: {
    group: '设置',
    description:
      'API 密钥不在这里填写：请在 Figma Make「设置 → Secrets」中添加对应环境变量（如 DEEPSEEK_API_KEY、DASHSCOPE_API_KEY、ARK_API_KEY；聚合网关为 NEWAPI_BASE_URL + NEWAPI_API_KEY）。这里只配置给用户使用的模型列表。',
  },
  access: {
    read: ({ req }) => isCmsAdmin(req),
    update: ({ req }) => isCmsAdmin(req),
  },
  hooks: { afterChange: [expireGlobalOnChange(CACHE_TAGS.company)] },
  endpoints: aiSettingsEndpoints,
  fields: [customChannelsField, { name: 'modelFetcher', type: 'ui', admin: { components: { Field: '@/components/admin/ai-model-fetcher#AiModelFetcher' } } }, aiModelsField],
}
