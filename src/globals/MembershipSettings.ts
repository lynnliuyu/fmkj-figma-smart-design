import type { GlobalConfig } from 'payload'

import { cmsAdminOnly, cmsAdminOrMember } from '@/lib/access'

/** 会员设置：平台已取消会员分级，这里只保留「怎么获得 AI 积分」的引导文案。 */
export const MembershipSettings: GlobalConfig = {
  slug: 'membership-settings',
  label: '会员设置',
  admin: { group: '账号', description: '平台不再有会员等级；所有功能统一按 AI 积分计费，这里只配置积分充值引导文案。' },
  access: { read: cmsAdminOrMember, update: cmsAdminOnly },
  fields: [
    {
      name: 'upgradeHint',
      label: '积分充值方式说明',
      type: 'textarea',
      defaultValue: '联系服务顾问获取兑换码，在「积分与账单」页输入兑换码即可充值 AI 积分。',
      admin: { description: '显示在积分页的充值引导处，例如客服微信、购买链接、活动说明' },
    },
  ],
}
