import type { CollectionConfig } from 'payload'

import { cmsAdminOnly, cmsAdminOrMember, isCmsAdmin } from '@/lib/access'
import { revalidateTemplatePages } from '@/lib/revalidate-templates'
import {
  DECK_SECTIONS,
  ORCHESTRATION_RULES,
  PROPOSAL_FRAMEWORKS,
} from '@/plugins/proposal/framework'

const THEMES = [
  { label: '栖序雅致（暖白 · 灰紫 · 色带封面）', value: 'qixu' },
  { label: '墨金臻选（深色 · 香槟金 · 整幅封面）', value: 'noir' },
  { label: '原木自然（燕麦 · 橄榄绿 · 分栏封面）', value: 'grove' },
  { label: '晨岚现代（冷白 · 深海蓝 · 细线卡片）', value: 'azure' },
  { label: '赤陶中古（羊皮纸 · 赤陶棕 · 画廊封面）', value: 'terra' },
  { label: '素白极简（纯白 · 纯文字大字封面）', value: 'mono' },
  { label: '晨曦暖调（奶油 · 陶土橙 · 竖幅照片）', value: 'dawn' },
  { label: '东方雅韵（宣纸 · 青瓷绿 · 衬线）', value: 'jade' },
  { label: '海盐柔雅（海盐蓝灰 · 拱窗封面 · 衬线）', value: 'linen' },
  { label: '岩灰建筑（冷灰 · 直角线框 · 建筑目录）', value: 'slate' },
]

/**
 * 方案模板 = 版式框架（推荐章节顺序）× 视觉主题，可以再调整章节、换强调色、封面图和文案，并设置导出所需的会员等级。
 * 方案页的模板选择以这里为准；一个模板都没有时使用内置模板。
 * 缩略图与样张由模板定义实时渲染（公开模板库 /templates、选择器、本页顶部预览），改完保存即更新，不需要截图。
 */
export const ProposalTemplates: CollectionConfig = {
  slug: 'proposal-templates',
  labels: { singular: '方案模板', plural: '方案模板' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'framework', 'theme', 'tier', 'enabled', 'sortOrder'],
    group: '方案',
    description: `模板 = 版式框架（有哪些章节）+ 视觉主题（配色与版式），再换上自己的强调色、封面图和标语。编排规范：${ORCHESTRATION_RULES.slice(0, 3).join('；')}。保存后模板库与选择器里的缩略图自动更新。`,
    components: { beforeListTable: ['@/components/admin/library-banner#TemplatesLibraryBanner'] },
  },
  defaultSort: 'sortOrder',
  access: {
    read: cmsAdminOrMember,
    create: cmsAdminOnly,
    update: cmsAdminOnly,
    delete: cmsAdminOnly,
  },
  endpoints: [
    {
      // 方案模板与场景库的内置内容是否齐全（列表页顶部提示用）
      path: '/library-status',
      method: 'get',
      handler: async (req) => {
        if (!isCmsAdmin(req)) return Response.json({ error: '无权限' }, { status: 403 })
        const { proposalLibraryStatus } = await import('@/lib/proposal-library')
        return Response.json(await proposalLibraryStatus(req.payload))
      },
    },
    {
      // 补齐内置方案模板，并给已有的内置模板补上空着的「适合客户 / 使用时机 / 外观特点」
      path: '/seed-builtins',
      method: 'post',
      handler: async (req) => {
        if (!isCmsAdmin(req)) return Response.json({ error: '无权限' }, { status: 403 })
        const { seedBuiltinTemplates } = await import('@/lib/proposal-library')
        const result = await seedBuiltinTemplates(req.payload, { fill: true })
        revalidateTemplatePages('all')
        return Response.json(result)
      },
    },
  ],
  hooks: {
    afterChange: [
      ({ doc, previousDoc }) => {
        revalidateTemplatePages([doc?.slug, previousDoc?.slug])
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidateTemplatePages([doc?.slug])
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'livePreview',
      type: 'ui',
      admin: {
        components: { Field: '@/components/admin/template-preview-field#TemplatePreviewField' },
      },
    },
    {
      type: 'row',
      fields: [
        { name: 'name', label: '模板名称', type: 'text', required: true },
        {
          name: 'slug',
          label: '标识',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          admin: { description: '只用英文、数字和短横线' },
        },
      ],
    },
    {
      name: 'description',
      label: '说明',
      type: 'text',
      admin: { description: '模板选择器里显示' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'audience',
          label: '适合什么客户',
          type: 'text',
          maxLength: 60,
          admin: { description: '如：别墅、大平层等高净值业主；留空沿用版式框架的默认说明' },
        },
        {
          name: 'occasion',
          label: '什么时候用',
          type: 'text',
          maxLength: 60,
          admin: { description: '如：首次方案沟通、签约前定稿' },
        },
      ],
    },
    {
      name: 'highlights',
      label: '外观特点',
      type: 'text',
      hasMany: true,
      maxRows: 4,
      admin: { description: '2–3 个短标签，如「深色画面」「整幅照片封面」，显示在选择器卡片上' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'framework',
          label: '版式框架',
          type: 'select',
          required: true,
          defaultValue: 'full',
          options: PROPOSAL_FRAMEWORKS.map((f) => ({ label: f.label, value: f.value })),
        },
        {
          name: 'theme',
          label: '视觉主题',
          type: 'select',
          defaultValue: 'qixu',
          options: THEMES,
          admin: { description: '施工交底不使用' },
        },
      ],
    },
    {
      name: 'sections',
      label: '章节（按顺序）',
      type: 'select',
      hasMany: true,
      options: DECK_SECTIONS.map((s) => ({ label: s.label, value: s.value })),
      admin: {
        description:
          '留空使用版式框架的推荐章节；按编排规范，封面固定第一页，投资明细与服务交付固定在最后',
      },
    },
    {
      name: 'markers',
      label: '点位显示',
      type: 'select',
      defaultValue: 'symbol',
      options: [
        { label: '设备图标', value: 'symbol' },
        { label: '编号', value: 'number' },
      ],
    },
    {
      name: 'accent',
      label: '强调色',
      type: 'text',
      admin: { description: '十六进制颜色，如 #7a5c22；留空沿用主题配色' },
      validate: (v: unknown) =>
        !v || /^#[0-9a-f]{6}$/i.test(String(v)) || '请填写 #RRGGBB 格式的颜色',
    },
    {
      name: 'headline',
      label: '封面主标语',
      type: 'text',
      admin: { description: '留空沿用主题标语' },
    },
    { name: 'tagline', label: '封面英文标语', type: 'text' },
    {
      name: 'coverImage',
      label: '封面图片',
      type: 'upload',
      relationTo: 'media',
      admin: { description: '请使用自有或已获授权的图片；留空沿用主题封面' },
    },
    {
      type: 'row',
      fields: [
        { name: 'enabled', label: '启用', type: 'checkbox', defaultValue: true },
        { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
      ],
    },
  ],
}
