import { revalidatePath } from 'next/cache'

import { invalidateTag } from '@/lib/memo-cache'

/** 模板库示例数据（示例母版项目的方案数据）的进程内缓存标签 */
export const TEMPLATE_PREVIEW_TAG = 'template-preview'

/** 命令行、初始化脚本等不在 Next.js 请求里的环境调用 revalidatePath 会报错，忽略即可（页面按小时兜底重建） */
const safeRevalidate = (path: string, type?: 'page' | 'layout') => {
  try {
    revalidatePath(path, type)
  } catch {
    /* 非 Next.js 环境 */
  }
}

/**
 * 方案模板、场景库或它们引用的图片变动后，立即让公开模板库（/templates）和示例样张重新生成：
 * - 传入模板标识：只刷新这些模板（改名时把旧标识和新标识一起传入）；
 * - 'all'：刷新所有模板详情页（场景库、图片变动会影响每一份样张）。
 */
export function revalidateTemplatePages(slugs: (string | null | undefined)[] | 'all' = 'all') {
  invalidateTag(TEMPLATE_PREVIEW_TAG)
  safeRevalidate('/templates')
  if (slugs === 'all') {
    safeRevalidate('/templates/[slug]', 'page')
    safeRevalidate('/templates/[slug]/slides', 'page')
    return
  }
  for (const slug of new Set(
    slugs.filter((v): v is string => typeof v === 'string' && v.length > 0),
  )) {
    safeRevalidate(`/templates/${slug}`)
    safeRevalidate(`/templates/${slug}/slides`)
  }
}
