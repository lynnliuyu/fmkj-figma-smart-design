import type { CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'
import { categoryOfType, DEVICE_TYPE_OPTIONS, isDeviceType } from '@/lib/device-types'

import { cmsAdminOnly, cmsAdminOrMember } from '@/lib/access'

export const PRODUCT_PLATFORMS = [
  'Apple Home',
  '米家',
  '华为',
  '涂鸦',
  'Matter',
  'KNX',
  '通用',
] as const

export const Products: CollectionConfig = {
  slug: 'products',
  graphQL: false,
  labels: { singular: '产品', plural: '产品' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sku', 'brand', 'deviceType', 'price', 'status'],
    group: '产品库',
  },
  defaultSort: 'name',
  // 所有成员都可以查看（包括成本）；2026-11-13 owner 批准：新增/改价放开给所有成员，
  // 删除产品仍只允许后台 CMS 管理员。
  access: {
    read: cmsAdminOrMember,
    create: cmsAdminOrMember,
    update: cmsAdminOrMember,
    delete: cmsAdminOnly,
  },
  hooks: {
    beforeValidate: [
      // 分类由设备类型自动带出，保证产品库只有字典里的 11 个类别。
      async ({ data, originalDoc, req }) => {
        if (!data) return data
        const type = data.deviceType ?? originalDoc?.deviceType
        const slug = categoryOfType(type)?.slug
        if (!slug) return data
        const found = await req.payload.find({
          collection: 'categories',
          where: { slug: { equals: slug } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
          select: { slug: true },
        })
        if (found.docs[0]) data.category = found.docs[0].id
        return data
      },
    ],
    afterChange: [expireOnChange(CACHE_TAGS.catalog)],
    afterDelete: [expireOnDelete(CACHE_TAGS.catalog)],
  },
  fields: [
    { name: 'name', label: '产品名称', type: 'text', required: true },
    {
      name: 'shortName',
      label: '短名',
      type: 'text',
      maxLength: 24,
      admin: {
        description:
          '选填，只用于报价列表、手机端等空间有限的地方（如「易来 T2 开关」）。产品名称仍是正式名称，会出现在打印报价单、合同和导出文件里；留空则列表直接显示产品名称。',
      },
    },
    { name: 'sku', label: '型号 / SKU', type: 'text', required: true, unique: true, index: true },
    {
      name: 'deviceType',
      label: '设备类型 *',
      type: 'select',
      index: true,
      options: DEVICE_TYPE_OPTIONS,
      // 必填由校验保证（数据库列保持可空，兼容整理前的存量数据）
      validate: (value: unknown) => (isDeviceType(value) ? true : '请选择设备类型'),
      admin: { description: '点位图和报价按设备类型匹配产品；分类会根据设备类型自动设置。' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'brand',
          label: '品牌',
          type: 'relationship',
          relationTo: 'brands',
          required: true,
        },
        {
          name: 'category',
          label: '分类（自动）',
          type: 'relationship',
          relationTo: 'categories',
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'platforms',
      label: '适用平台',
      type: 'select',
      hasMany: true,
      options: PRODUCT_PLATFORMS.map((value) => ({ label: value, value })),
    },
    { name: 'image', label: '产品图片', type: 'upload', relationTo: 'media' },
    { name: 'description', label: '产品说明', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'price', label: '售价（元）', type: 'number', required: true, min: 0 },
        {
          name: 'cost',
          label: '成本（元）',
          type: 'number',
          min: 0,
        },
        { name: 'unit', label: '单位', type: 'text', required: true, defaultValue: '个' },
        { name: 'stock', label: '库存', type: 'number', min: 0, defaultValue: 0 },
      ],
    },
    // ── 价格参考（issue #195）────────────────────────────────────────
    // 京东/天猫到手价只写到这里，**绝不自动改写 price（对外售价）**。
    // 三者一起构成「参考价 + 来源 + 核对时间」，人工确认后才可能由人改 price。
    {
      type: 'collapsible',
      label: '价格参考（京东/天猫到手价，不自动改售价）',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'marketPrice',
          label: '参考价（到手价，元）',
          type: 'number',
          min: 0,
          admin: {
            description: '抓取或人工录入的电商到手价；留空表示未核对。不会写进对外售价。',
          },
        },
        {
          name: 'priceSource',
          label: '来源链接',
          type: 'text',
          admin: { description: '商品页 URL（京东自营 / 天猫官方旗舰店）。' },
        },
        {
          name: 'priceCheckedAt',
          label: '核对时间',
          type: 'date',
          admin: { description: '写入参考价的时间；留空表示未核对。' },
        },
      ],
    },
    { name: 'tags', label: '标签', type: 'text', hasMany: true },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: '在售', value: 'active' },
        { label: '下架', value: 'inactive' },
      ],
      admin: { position: 'sidebar' },
    },
  ],
}
