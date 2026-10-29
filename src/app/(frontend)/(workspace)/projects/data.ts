import { getOwnerOptions } from '@/lib/cached-data'

/** 负责人下拉选项（缓存；员工账号变更时自动失效）。 */
export const listOwnerOptions = getOwnerOptions

export const canEditProjects = (role?: string | null) => ['admin', 'manager', 'designer', 'sales'].includes(role ?? '')
