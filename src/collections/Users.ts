import type { Access, CollectionConfig } from 'payload'

import { CACHE_TAGS, expireOnChange, expireOnDelete } from '@/lib/cache-tags'
import { fieldCmsAdminOrStaffAdmin, hasStaffRole, isActiveStaff, isCmsAdmin, STAFF_ROLES } from '@/lib/access'

/** CMS 管理员与员工管理员可看全部账号；其他员工只能看自己。 */
const readUsers: Access = ({ req }) => {
  if (isCmsAdmin(req) || hasStaffRole(req, ['admin'])) return true
  if (isActiveStaff(req) && req.user) return { id: { equals: req.user.id } }
  return false
}

const updateUsers: Access = ({ req }) => {
  if (isCmsAdmin(req) || hasStaffRole(req, ['admin'])) return true
  if (isActiveStaff(req) && req.user) return { id: { equals: req.user.id } }
  return false
}

/**
 * 员工账号（系统登录用）。与 Payload 后台的 admins 账号完全分开：
 * 员工不能登录 /admin，账号由管理员创建，不开放自助注册。
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: '员工账号', plural: '员工账号' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'status'],
    group: '账号与权限',
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
  },
  access: {
    admin: () => false,
    create: ({ req }) => isCmsAdmin(req) || hasStaffRole(req, ['admin']),
    read: readUsers,
    update: updateUsers,
    delete: ({ req }) => isCmsAdmin(req),
  },
  hooks: {
    afterChange: [expireOnChange(CACHE_TAGS.staff)],
    afterDelete: [expireOnDelete(CACHE_TAGS.staff)],
  },
  fields: [
    { name: 'name', label: '姓名', type: 'text', required: true },
    { name: 'phone', label: '手机号', type: 'text' },
    {
      name: 'role',
      label: '角色',
      type: 'select',
      required: true,
      defaultValue: 'sales',
      options: [
        { label: '管理员', value: 'admin' },
        { label: '经理', value: 'manager' },
        { label: '设计师', value: 'designer' },
        { label: '销售', value: 'sales' },
        { label: '只读', value: 'viewer' },
      ] satisfies { label: string; value: (typeof STAFF_ROLES)[number] }[],
      access: { update: fieldCmsAdminOrStaffAdmin },
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: '启用', value: 'active' },
        { label: '停用', value: 'disabled' },
      ],
      access: { update: fieldCmsAdminOrStaffAdmin },
    },
  ],
}
