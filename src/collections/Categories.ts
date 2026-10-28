import type { CollectionConfig } from 'payload'

import { cmsAdminOrActiveStaff, cmsAdminOrManager } from '@/lib/access'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: '产品分类', plural: '产品分类' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug', 'sortOrder'], group: '产品库' },
  defaultSort: 'sortOrder',
  access: {
    read: cmsAdminOrActiveStaff,
    create: cmsAdminOrManager,
    update: cmsAdminOrManager,
    delete: cmsAdminOrManager,
  },
  fields: [
    { name: 'name', label: '分类名称', type: 'text', required: true },
    { name: 'slug', label: '标识', type: 'text', required: true, unique: true, index: true },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
  ],
}
