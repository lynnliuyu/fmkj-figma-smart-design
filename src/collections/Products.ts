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
  // 产品库由后台（/admin）维护，所有成员都可以查看（包括成本）。
  access: {
    read: cmsAdminOrMember,
    create: cmsAdminOnly,
    update: cmsAdminOnly,
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
