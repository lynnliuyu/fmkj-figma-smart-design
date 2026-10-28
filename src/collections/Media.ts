import type { CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'

import { createFolderField, createTagField } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [expireOnChange(CACHE_TAGS.catalog)],
    afterDelete: [expireOnDelete(CACHE_TAGS.catalog)],
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
