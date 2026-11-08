import type { Access, CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'
import { fieldCmsAdminOnly, isCmsAdmin, isMember } from '@/lib/access'
import { DEFAULT_CONTRACT_TERMS } from '@/lib/contracts'
import { cloneDemoProjectForUser } from '@/lib/demo-project'

/** 成员只能读取和修改自己的账号资料，防止通过 /api/users 遍历其他用户的邮箱与手机号。 */
const selfOrCmsAdmin: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (isMember(req) && req.user) return { id: { equals: req.user.id } }
  return false
}

/**
 * 成员账号（系统登录用）。与 Payload 后台的 admins 账号完全分开：
 * 成员不能登录 /admin；账号由后台创建，不开放自助注册。
 * 系统只有一种成员角色，所有成员权限相同。
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: '成员', plural: '成员' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'aiCredits', 'status'],
    group: '账号',
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    maxLoginAttempts: 0,
  },
  access: {
    admin: () => false,
    create: ({ req }) => isCmsAdmin(req),
    read: selfOrCmsAdmin,
    update: selfOrCmsAdmin,
    delete: ({ req }) => isCmsAdmin(req),
  },
  hooks: {
    afterChange: [
      expireOnChange(CACHE_TAGS.staff),
      async ({ doc, operation, req }) => {
        if (operation === 'create' && doc?.id) {
          await cloneDemoProjectForUser(doc.id, req)
        }
        return doc
      },
    ],
    afterDelete: [expireOnDelete(CACHE_TAGS.staff)],
  },
  fields: [
    { name: 'name', label: '姓名', type: 'text', required: true },
    {
      name: 'phone',
      label: '手机号',
      type: 'text',
      admin: { description: '会作为联系人显示在报价单上' },
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: '启用', value: 'active' },
        { label: '停用', value: 'disabled' },
      ],
      admin: { description: '停用后无法登录，已有项目保留' },
      access: { create: fieldCmsAdminOnly, update: fieldCmsAdminOnly },
    },
    {
      // 只能通过「积分流水」变动（发放 / 扣减时由服务端写回），任何人都不能直接改
      name: 'aiCredits',
      label: 'AI 积分',
      type: 'number',
      defaultValue: 0,
      min: 0,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: '在「积分流水」里新建一条记录来发放积分',
      },
      access: { update: () => false, create: () => false },
    },
    {
      name: 'companyProfile',
      label: '个人抬头与默认设置',
      type: 'group',
      admin: {
        description:
          '每个账号独立的报价单/合同抬头、联系方式、Logo、二维码与文档默认模板；未填写时回退使用系统默认抬头。',
      },
      fields: [
        { name: 'name', label: '抬头名称', type: 'text', maxLength: 60 },
        { name: 'slogan', label: '副标题', type: 'text', maxLength: 80 },
        {
          type: 'row',
          fields: [
            { name: 'phone', label: '联系电话', type: 'text', maxLength: 30 },
            { name: 'email', label: '邮箱', type: 'text', maxLength: 80 },
          ],
        },
        { name: 'address', label: '地址', type: 'text', maxLength: 200 },
        {
          type: 'row',
          fields: [
            { name: 'logo', label: 'Logo', type: 'upload', relationTo: 'media' },
            { name: 'qrCode', label: '二维码', type: 'upload', relationTo: 'media' },
          ],
        },
        { name: 'qrCaption', label: '二维码说明', type: 'text', maxLength: 40 },
        { name: 'quoteNotes', label: '新报价默认备注', type: 'textarea', maxLength: 2000 },
        {
          name: 'contractTerms',
          label: '合同默认条款',
          type: 'textarea',
          maxLength: 5000,
          defaultValue: DEFAULT_CONTRACT_TERMS,
        },
        {
          name: 'printProductImages',
          label: '打印报价单时显示产品图片',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'documentDefaults',
          label: '文档默认模板',
          type: 'json',
        },
        {
          name: 'disabledPlugins',
          label: '已关闭的插件',
          type: 'json',
        },
        {
          // { brandRates: [{ brand: 品牌标识, rate: 0.65 }], defaultRate, feeCostPercent, minMarginPercent }，见 src/lib/quote-costs.ts
          name: 'costSettings',
          label: '报价成本与毛利设置',
          type: 'json',
          admin: {
            description:
              '在系统「设置 → 报价成本与毛利」里修改：品牌拿货折扣、附加费用成本占比与毛利率底线，仅本人在报价台可见',
          },
        },
      ],
    },
  ],
}
