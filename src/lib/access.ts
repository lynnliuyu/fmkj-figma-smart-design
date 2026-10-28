import type { Access, FieldAccess, PayloadRequest } from 'payload'

/** 员工角色：admin 管理员 / manager 经理 / designer 设计师 / sales 销售 / viewer 只读 */
export const STAFF_ROLES = ['admin', 'manager', 'designer', 'sales', 'viewer'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

type ReqUser = PayloadRequest['user'] & { role?: string; status?: string }

export const isCmsAdmin = (req: PayloadRequest) => req.user?.collection === 'admins'

/** 已登录且启用中的员工账号。 */
export const isActiveStaff = (req: PayloadRequest) => {
  const user = req.user as ReqUser | null
  return user?.collection === 'users' && user.status === 'active'
}

export const hasStaffRole = (req: PayloadRequest, roles: readonly StaffRole[]) => {
  const user = req.user as ReqUser | null
  return isActiveStaff(req) && roles.includes(user?.role as StaffRole)
}

/** 管理员或经理：可维护产品库、查看成本。 */
export const isManager = (req: PayloadRequest) => hasStaffRole(req, ['admin', 'manager'])

export const cmsAdminOrActiveStaff: Access = ({ req }) => isCmsAdmin(req) || isActiveStaff(req)
export const cmsAdminOrManager: Access = ({ req }) => isCmsAdmin(req) || isManager(req)
export const cmsAdminOnly: Access = ({ req }) => isCmsAdmin(req)

export const fieldCmsAdminOrManager: FieldAccess = ({ req }) => isCmsAdmin(req) || isManager(req)
export const fieldCmsAdminOrStaffAdmin: FieldAccess = ({ req }) =>
  isCmsAdmin(req) || hasStaffRole(req, ['admin'])
