import type { Access, CollectionConfig } from 'payload'

import { isCmsAdmin, isMember } from '@/lib/access'

/** 成员只能看到、改名、删除自己的会话；后台管理员可以查看全部。 */
const ownOnly: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (isMember(req) && req.user) return { owner: { equals: req.user.id } }
  return false
}

/** AI 对话会话。消息和积分扣减只由服务端对话接口写入。 */
export const AiConversations: CollectionConfig = {
  slug: 'ai-conversations',
  graphQL: false,
  labels: { singular: 'AI 会话', plural: 'AI 会话' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'owner', 'model', 'updatedAt'],
    group: 'AI 对话',
  },
  access: {
    read: ownOnly,
    create: ({ req }) => isCmsAdmin(req) || isMember(req),
    update: ownOnly,
    delete: ownOnly,
  },
  hooks: {
    beforeChange: [
      // 归属人只能由服务端按当前登录成员设置，不接受客户端提交
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user?.collection === 'users') data.owner = req.user.id
        if (operation === 'update') delete data.owner
        return data
      },
    ],
  },
  fields: [
    { name: 'title', label: '标题', type: 'text', required: true, maxLength: 80 },
    {
      name: 'owner',
      label: '成员',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'project',
      label: '关联项目',
      type: 'relationship',
      relationTo: 'projects',
      admin: { position: 'sidebar' },
    },
    {
      name: 'model',
      label: '最近使用的模型',
      type: 'text',
      maxLength: 60,
      admin: { position: 'sidebar' },
    },
  ],
  timestamps: true,
}
