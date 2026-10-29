import type { CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'

import { cmsAdminOrActiveStaff, cmsAdminOrManager } from '@/lib/access'

export const Brands: CollectionConfig = {
  slug: 'brands',
  labels: { singular: '品牌', plural: '品牌' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug'], group: '产品库' },
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
    { name: 'name', label: '品牌名称', type: 'text', required: true },
    { name: 'slug', label: '标识', type: 'text', required: true, unique: true, index: true },
    { name: 'logo', label: 'Logo', type: 'upload', relationTo: 'media' },
  ],
}
