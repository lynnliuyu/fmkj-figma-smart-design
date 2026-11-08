import type { CollectionConfig } from 'payload'

import { cmsAdminOnly, cmsAdminOrMember, isCmsAdmin } from '@/lib/access'
import { AREA_TYPES } from '@/lib/area-types'
import { DEVICE_TYPES } from '@/lib/device-types'
import { revalidateTemplatePages } from '@/lib/revalidate-templates'

const deviceOptions = DEVICE_TYPES.map((t) => ({ label: t.name, value: t.value }))

/**
 * 场景库：方案里展示的智能场景（回家、离家、观影、起夜……）。
 * 生成方案时按项目实际的房间和设备匹配：只有满足条件的场景才会出现，并且只引用项目里真实存在的设备。
 * 场景库一条启用的都没有时，方案使用内置场景库（lib/builtin-scenes.ts），「生活场景」章节不会空白。
 */
export const Scenes: CollectionConfig = {
  slug: 'scenes',
  labels: { singular: '场景', plural: '场景库' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'scope', 'chapter', 'enabled', 'sortOrder'],
    group: '方案',
    description:
      '方案中的智能场景。生成方案时按房间类型和设备自动匹配，条件不满足的场景不会出现；文案只写匹配条件里的设备能做到的事。全部停用时方案改用内置场景库。',
    components: { beforeListTable: ['@/components/admin/library-banner#ScenesLibraryBanner'] },
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
      // 补齐内置场景（含图片）；已有的场景按标识跳过
      path: '/seed-builtins',
      method: 'post',
      handler: async (req) => {
        if (!isCmsAdmin(req)) return Response.json({ error: '无权限' }, { status: 403 })
        const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
        const proto =
          req.headers.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
        const { seedBuiltinScenes } = await import('@/lib/proposal-library')
        const result = await seedBuiltinScenes(req.payload, {
          origin: host ? `${proto}://${host}` : undefined,
        })
        revalidateTemplatePages('all')
        return Response.json(result)
      },
    },
  ],
  hooks: {
    // 场景会出现在每一份示例样张里：变动后刷新整个模板库
    afterChange: [
      ({ doc }) => {
        revalidateTemplatePages('all')
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidateTemplatePages('all')
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          label: '场景名称',
          type: 'text',
          required: true,
          admin: { description: '如：回家模式、起夜模式' },
        },
        { name: 'slug', label: '标识', type: 'text', required: true, unique: true, index: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'enabled', label: '启用', type: 'checkbox', defaultValue: true },
        { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: '文案',
          fields: [
            {
              name: 'summary',
              label: '一句话说明',
              type: 'text',
              required: true,
              admin: { description: '方案里显示为「场景名称：一句话说明」' },
            },
            {
              name: 'headline',
              label: '标题',
              type: 'text',
              admin: { description: '场景页大标题，如：进门的那一刻，生活开始切换。' },
            },
            { name: 'subtitle', label: '副标题', type: 'text' },
            {
              name: 'tagline',
              label: '英文标签',
              type: 'text',
              admin: { description: '如：ARRIVE & LEAVE' },
            },
            {
              name: 'steps',
              label: '联动步骤',
              type: 'array',
              labels: { singular: '步骤', plural: '步骤' },
              fields: [{ name: 'text', label: '步骤', type: 'text', required: true }],
            },
            {
              name: 'image',
              label: '场景图片',
              type: 'upload',
              relationTo: 'media',
              admin: { description: '请使用自有或已获授权的图片' },
            },
          ],
        },
        {
          label: '匹配规则',
          fields: [
            {
              name: 'scope',
              label: '范围',
              type: 'select',
              defaultValue: 'room',
              options: [
                { label: '按房间', value: 'room' },
                { label: '全屋', value: 'house' },
              ],
              admin: {
                description:
                  '按房间：在符合条件的每个房间里判断；全屋：按整套房子的设备判断，只出现一次',
              },
            },
            {
              name: 'chapter',
              label: '方案章节',
              type: 'select',
              defaultValue: 'arrive',
              options: [
                { label: '回家与离家', value: 'arrive' },
                { label: '休息与睡眠', value: 'rest' },
                { label: '安全与关怀', value: 'care' },
                { label: '专注与休闲', value: 'focus' },
                { label: '网络与基础', value: 'network' },
              ],
            },
            {
              name: 'roomTypes',
              label: '适用房间',
              type: 'select',
              hasMany: true,
              options: AREA_TYPES.map((t) => ({ label: t.label, value: t.value })),
              admin: { description: '留空表示任何房间都适用' },
            },
            {
              name: 'requiredDevices',
              label: '必须具备的设备',
              type: 'select',
              hasMany: true,
              options: deviceOptions,
              admin: { description: '全部都有才显示' },
            },
            {
              name: 'anyDevices',
              label: '至少有一种的设备',
              type: 'select',
              hasMany: true,
              options: deviceOptions,
              admin: { description: '其中任意一种即可；留空不限' },
            },
          ],
        },
      ],
    },
  ],
}
