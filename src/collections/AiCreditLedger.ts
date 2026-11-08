import { APIError, type Access, type CollectionConfig } from 'payload'

import { isCmsAdmin, isMember, relId } from '@/lib/access'

const ownOnly: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (isMember(req) && req.user) return { user: { equals: req.user.id } }
  return false
}

/**
 * 积分流水：余额只能通过新增流水改变。
 * - 后台管理员新增一条正数流水 = 给成员发放积分；
 * - 对话接口调用成功后由服务端新增一条负数流水 = 扣减。
 * 新增时计算并写回成员的余额；流水不可修改、不可删除。
 */
export const AiCreditLedger: CollectionConfig = {
  slug: 'ai-credit-ledger',
  graphQL: false,
  labels: { singular: '积分流水', plural: '积分流水' },
  admin: {
    useAsTitle: 'reason',
    defaultColumns: ['user', 'delta', 'balanceAfter', 'reason', 'createdAt'],
    group: 'AI 对话',
    description: '给成员发放积分：新建一条流水，填写成员和正数积分。',
  },
  access: {
    read: ownOnly,
    create: ({ req }) => isCmsAdmin(req),
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      async ({ data, req, operation, context }) => {
        if (operation !== 'create' || context.importing) return data
        const userId = relId(data.user)
        if (!userId) throw new APIError('请选择成员', 400)
        const delta = Number(data.delta)
        if (!Number.isInteger(delta) || delta === 0)
          throw new APIError('积分变动必须是非零整数', 400)
        const user = await req.payload.findByID({
          collection: 'users',
          id: userId,
          depth: 0,
          overrideAccess: true,
          req,
          select: { aiCredits: true },
        })
        const balanceAfter = (user.aiCredits ?? 0) + delta
        if (balanceAfter < 0) throw new APIError('积分不足', 402)
        data.balanceAfter = balanceAfter
        if (!data.reason) data.reason = delta > 0 ? '后台发放' : '扣减'
        return data
      },
    ],
    afterChange: [
      async ({ doc, req, operation, context }) => {
        if (operation !== 'create' || context.importing) return doc
        await req.payload.update({
          collection: 'users',
          id: relId(doc.user)!,
          data: { aiCredits: doc.balanceAfter },
          overrideAccess: true,
          depth: 0,
          req,
          context: { skipCredit: true },
        })
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'user',
      label: '成员',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'delta',
      label: '积分变动',
      type: 'number',
      required: true,
      admin: { description: '正数为发放，负数为扣减' },
    },
    { name: 'balanceAfter', label: '变动后余额', type: 'number', admin: { readOnly: true } },
    { name: 'reason', label: '说明', type: 'text', maxLength: 120 },
    { name: 'model', label: '模型', type: 'text', maxLength: 60, admin: { readOnly: true } },
    {
      name: 'message',
      label: '对应消息',
      type: 'relationship',
      relationTo: 'ai-messages',
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
}
