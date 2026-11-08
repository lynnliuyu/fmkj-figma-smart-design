import type { CollectionConfig } from 'payload'

import { cmsAdminOnly } from '@/lib/access'

/**
 * 小程序令牌：只保存令牌的 SHA-256 哈希，原文只在签发时返回给小程序一次。
 * - session：小程序登录（30 天，使用时滑动续期）
 * - bind：微信已授权、等待绑定成员账号的票据（10 分钟，一次性）
 * - web-ticket：小程序打开网页打印页的一次性票据（2 分钟）
 * - web：web-view 里的网页会话（2 小时）
 * 只由服务端写入；后台可以查看和删除（删除即强制下线）。
 */
export const MpSessions: CollectionConfig = {
  slug: 'mp-sessions',
  graphQL: false,
  labels: { singular: '小程序登录', plural: '小程序登录' },
  admin: {
    useAsTitle: 'kind',
    defaultColumns: ['kind', 'user', 'client', 'lastUsedAt', 'expiresAt'],
    group: '账号',
    description: '微信小程序的登录记录。删除某条记录，对应设备会立即退出登录。',
  },
  access: {
    read: cmsAdminOnly,
    create: () => false,
    update: () => false,
    delete: cmsAdminOnly,
  },
  fields: [
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { hidden: true },
    },
    {
      name: 'kind',
      label: '类型',
      type: 'select',
      required: true,
      defaultValue: 'session',
      index: true,
      options: [
        { label: '小程序登录', value: 'session' },
        { label: '待绑定账号', value: 'bind' },
        { label: '网页查看票据', value: 'web-ticket' },
        { label: '网页查看会话', value: 'web' },
      ],
    },
    { name: 'user', label: '成员', type: 'relationship', relationTo: 'users', index: true },
    { name: 'openid', label: 'OpenID', type: 'text', admin: { readOnly: true } },
    { name: 'unionid', label: 'UnionID', type: 'text', admin: { readOnly: true } },
    { name: 'redirect', label: '跳转页面', type: 'text', admin: { readOnly: true } },
    { name: 'client', label: '登录方式', type: 'text', admin: { readOnly: true } },
    {
      name: 'expiresAt',
      label: '过期时间',
      type: 'date',
      required: true,
      index: true,
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'lastUsedAt',
      label: '最近使用',
      type: 'date',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
