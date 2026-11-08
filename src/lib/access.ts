import type { Access, FieldAccess, PayloadRequest } from 'payload'

type ReqUser = PayloadRequest['user'] & { status?: string }

/** Payload 后台（/admin）的 CMS 管理员，负责产品库和成员账号。 */
export const isCmsAdmin = (req: PayloadRequest) => req.user?.collection === 'admins'

/**
 * 已登录且启用中的成员账号。
 * 系统只有一种成员角色：所有成员的权限相同，都可以管理项目、点位、报价、合同和抬头设置。
 */
export const isMember = (req: PayloadRequest) => {
  const user = req.user as ReqUser | null
  return user?.collection === 'users' && user.status === 'active'
}

export const cmsAdminOrMember: Access = ({ req }) => isCmsAdmin(req) || isMember(req)
export const cmsAdminOnly: Access = ({ req }) => isCmsAdmin(req)
export const fieldCmsAdminOnly: FieldAccess = ({ req }) => isCmsAdmin(req)

/** 关系字段的值可能是 ID，也可能是展开后的文档，统一取 ID。 */
export const relId = (v: unknown): string | null =>
  v && typeof v === 'object'
    ? String((v as { id?: unknown }).id ?? '') || null
    : v
      ? String(v)
      : null
