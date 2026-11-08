import { invalidateTag } from '@/lib/memo-cache'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

/** 缓存标签：产品库（含品牌、分类、图片）、员工名单、公司信息。 */
export const CACHE_TAGS = {
  catalog: 'catalog',
  staff: 'staff',
  company: 'company-settings',
} as const

/** 立即清除缓存，保证后台改完下一次打开页面就是新数据。 */
export function expireTag(tag: string) {
  invalidateTag(tag)
}

export const expireOnChange =
  (tag: string): CollectionAfterChangeHook =>
  ({ doc }) => {
    expireTag(tag)
    return doc
  }

export const expireOnDelete =
  (tag: string): CollectionAfterDeleteHook =>
  ({ doc }) => {
    expireTag(tag)
    return doc
  }

export const expireGlobalOnChange =
  (tag: string): GlobalAfterChangeHook =>
  ({ doc }) => {
    expireTag(tag)
    return doc
  }
