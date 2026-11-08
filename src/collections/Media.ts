import type { CollectionConfig } from 'payload'

import { isCmsAdmin, isMember } from '@/lib/access'
import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'
import { revalidateTemplatePages } from '@/lib/revalidate-templates'

import { createFolderField, createTagField } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // 允许单文件下载（/api/media/file/:filename）与按 ID 读取，禁止未登录匿名请求直接列举 /api/media 全部媒体列表
    read: ({ req, id }) =>
      isCmsAdmin(req) || isMember(req) || Boolean(id || req.routeParams?.filename),
  },
  hooks: {
    afterChange: [
      expireOnChange(CACHE_TAGS.catalog),
      // 替换已有图片（模板封面、场景图片）时刷新公开模板库；新上传的图片还没被引用，不需要刷新
      ({ doc, operation }) => {
        if (operation === 'update') revalidateTemplatePages('all')
        return doc
      },
    ],
    afterDelete: [
      expireOnDelete(CACHE_TAGS.catalog),
      ({ doc }) => {
        revalidateTemplatePages('all')
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: true,
}
