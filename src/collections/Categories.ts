import type { CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'

import { cmsAdminOrActiveStaff } from '@/lib/access'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: '产品分类', plural: '产品分类' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'sortOrder'],
    group: '产品库',
    description: '类别固定为设备类型字典中的 11 个，由系统维护，不能在后台增删改。',
  },
  defaultSort: 'sortOrder',
  access: {
    read: cmsAdminOrActiveStaff,
    // 与 src/lib/device-types.ts 的类别一一对应，锁定为只读。
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    afterChange: [expireOnChange(CACHE_TAGS.catalog)],
    afterDelete: [expireOnDelete(CACHE_TAGS.catalog)],
  },
  fields: [
    { name: 'name', label: '分类名称', type: 'text', required: true },
    { name: 'slug', label: '标识', type: 'text', required: true, unique: true, index: true },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
  ],
}
