import type { Access, CollectionConfig } from 'payload'

import { isCmsAdmin, isMember } from '@/lib/access'

const ownOnly: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (isMember(req) && req.user) return { owner: { equals: req.user.id } }
  return false
}

/** AI 对话消息：只读记录。写入由服务端对话接口完成（成员无法直接新建或修改，防止伪造积分消耗）。 */
export const AiMessages: CollectionConfig = {
  slug: 'ai-messages',
  graphQL: false,
  labels: { singular: 'AI 消息', plural: 'AI 消息' },
  admin: {
    useAsTitle: 'role',
    defaultColumns: ['conversation', 'role', 'model', 'cost', 'createdAt'],
    group: 'AI 对话',
  },
  access: {
    read: ownOnly,
    create: ({ req }) => isCmsAdmin(req),
    update: ({ req }) => isCmsAdmin(req),
    delete: ownOnly,
  },
  fields: [
    {
      name: 'conversation',
      label: '会话',
      type: 'relationship',
      relationTo: 'ai-conversations',
      required: true,
      index: true,
    },
    {
      name: 'owner',
      label: '成员',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'role',
      label: '角色',
      type: 'select',
      required: true,
      options: [
        { label: '成员', value: 'user' },
        { label: 'AI', value: 'assistant' },
      ],
    },
    { name: 'content', label: '内容', type: 'textarea', required: true },
    { name: 'model', label: '模型', type: 'text', maxLength: 60 },
    { name: 'cost', label: '消耗积分', type: 'number', min: 0 },
    { name: 'toolCalls', label: '调用的插件', type: 'json' },
  ],
  timestamps: true,
}
