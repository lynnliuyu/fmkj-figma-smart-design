import type { CollectionConfig } from 'payload'

import { cmsAdminOnly } from '@/lib/access'

/**
 * 微信小程序账号绑定：一个 openid 对应一个成员，一个成员可以绑定多个微信。
 * 只由服务端（小程序登录接口）写入；后台可以查看和删除（删除即解绑）。
 */
export const WechatAccounts: CollectionConfig = {
  slug: 'wechat-accounts',
  graphQL: false,
  labels: { singular: '微信绑定', plural: '微信绑定' },
  admin: {
    useAsTitle: 'openid',
    defaultColumns: ['openid', 'user', 'nickname', 'lastLoginAt'],
    group: '账号',
    description:
      '成员在微信小程序里绑定的微信账号。删除记录即解除绑定，成员下次需要重新用账号密码绑定。',
  },
  access: {
    read: cmsAdminOnly,
    create: () => false,
    update: () => false,
    delete: cmsAdminOnly,
  },
  fields: [
    {
      name: 'openid',
      label: 'OpenID',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    { name: 'unionid', label: 'UnionID', type: 'text', index: true, admin: { readOnly: true } },
    {
      name: 'user',
      label: '成员',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    { name: 'nickname', label: '微信昵称', type: 'text' },
    {
      name: 'lastLoginAt',
      label: '最近登录',
      type: 'date',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
