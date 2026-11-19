import { randomBytes } from 'node:crypto'
import type { Access, CollectionConfig } from 'payload'

import { cmsAdminOnly, isCmsAdmin, isMember } from '@/lib/access'

const adminOrLeadOwner: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (isMember(req) && req.user) return { owner: { equals: req.user.id } }
  return false
}

/**
 * 需求小助手：业主需求单（issue #194）。
 *
 * 免登录可填（凭 token 访问），生成项目草稿后可绑手机。
 * - `answers`：三入口（场景/预算/问卷）共用的原始答案，增量合并
 * - `structured`：归一化清单（房间×设备×数量 + 估算 + 一页建议）
 * - `pricing`：报价快照（plan/version/单价/合计），生成后不随改价变化
 */
export const NeedLeads: CollectionConfig = {
  slug: 'need-leads',
  labels: { singular: '需求单', plural: '需求单' },
  admin: {
    useAsTitle: 'token',
    defaultColumns: ['token', 'status', 'source', 'phone', 'createdAt'],
    group: '营销与线索',
  },
  access: {
    // 匿名创建只经需求单接口，避免绕过草稿凭证、字段校验与限流。
    create: cmsAdminOnly,
    // 公开读写走专用接口按 token 精确查。工作台成员只管理被指派的需求单。
    read: adminOrLeadOwner,
    update: adminOrLeadOwner,
    delete: adminOrLeadOwner,
  },
  fields: [
    {
      name: 'token',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: '分享凭证，自动生成' },
      hooks: {
        beforeValidate: [
          ({ value, operation }) =>
            operation === 'create' && !value ? randomBytes(16).toString('base64url') : value,
        ],
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: '采集中', value: 'draft' },
        { label: '已提交', value: 'submitted' },
        { label: '已生成项目', value: 'converted' },
      ],
      index: true,
    },
    {
      name: 'source',
      type: 'select',
      options: [
        { label: '按场景', value: 'scene' },
        { label: '按预算', value: 'budget' },
        { label: '问卷', value: 'wizard' },
      ],
      admin: { description: '最后完成的一条入口' },
    },
    {
      name: 'answers',
      type: 'json',
      admin: { description: '三入口共用的原始答案（增量合并，不丢已答）' },
    },
    {
      name: 'structured',
      type: 'json',
      admin: { description: '归一化需求清单：房间×设备×数量 + 估算 + 建议' },
    },
    {
      name: 'pricing',
      type: 'json',
      admin: { description: '报价快照：单价表版本 + 明细 + 合计（生成后不随改价变化）' },
    },
    { name: 'phone', type: 'text', maxLength: 30, admin: { description: '业主手机（可选）' } },
    { name: 'project', type: 'relationship', relationTo: 'projects', admin: { readOnly: true } },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
    {
      name: 'note',
      type: 'textarea',
      maxLength: 500,
      admin: { description: '内部备注（业主不可见）' },
    },
  ],
}
