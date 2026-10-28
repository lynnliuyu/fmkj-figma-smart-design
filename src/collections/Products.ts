import type { CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'

import { cmsAdminOrActiveStaff, cmsAdminOrManager, fieldCmsAdminOrManager } from '@/lib/access'

export const PRODUCT_PLATFORMS = ['Apple Home', '米家', '涂鸦', 'Matter', '通用'] as const

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: '产品', plural: '产品' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sku', 'brand', 'category', 'price', 'status'],
    group: '产品库',
  },
  defaultSort: 'name',
  access: {
    read: cmsAdminOrActiveStaff,
    create: cmsAdminOrManager,
    update: cmsAdminOrManager,
    delete: cmsAdminOrManager,
  },
  hooks: {
    afterChange: [expireOnChange(CACHE_TAGS.catalog)],
    afterDelete: [expireOnDelete(CACHE_TAGS.catalog)],
  },
  fields: [
    { name: 'name', label: '产品名称', type: 'text', required: true },
    { name: 'sku', label: '型号 / SKU', type: 'text', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'brand', label: '品牌', type: 'relationship', relationTo: 'brands', required: true },
        { name: 'category', label: '分类', type: 'relationship', relationTo: 'categories', required: true },
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
          // 成本只给管理员和经理看
          access: { read: fieldCmsAdminOrManager },
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
