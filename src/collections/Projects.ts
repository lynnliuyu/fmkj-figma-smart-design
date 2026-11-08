import { APIError, type Access, type CollectionConfig, type RelationshipFieldSingleValidation, type Where } from 'payload'

import { cmsAdminOrMember, fieldCmsAdminOnly, isCmsAdmin, isMember, relId } from '@/lib/access'
import { countScenePoints } from '@/lib/point-count'
import { canEditProject, canManageProject, type CollaboratorItem } from '@/lib/project-access'
import { ARCHIVED_MESSAGE } from '@/lib/project-guards'
import { autoProjectName, PROJECT_PLATFORMS, PROJECT_STATUSES } from '@/lib/projects'

const opts = (list: readonly { value: string; label: string }[]) => list.map(({ value, label }) => ({ value, label }))

/** 行级读取控制：成员只能看到自己创建的项目或受邀协作的项目（演示模板项目在用户注册时单独克隆发放）。 */
export const readProjectAccess: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (!isMember(req) || !req.user) return false
  const where: Where = {
    or: [
      { owner: { equals: req.user.id } },
      { 'collaborators.user': { equals: req.user.id } },
    ],
  }
  return where
}

/** 定稿报价只能选本项目的报价单 */
const validateFinalQuote: RelationshipFieldSingleValidation = async (value, { req, id }) => {
  const qid = relId(value)
  if (!qid) return true
  const quote = await req.payload.findByID({ collection: 'quotes', id: qid, depth: 0, overrideAccess: true, select: { project: true } }).catch(() => null)
  if (!quote) return '报价单不存在'
  if (id !== undefined && relId(quote.project) !== String(id)) return '只能选择本项目的报价单'
  return true
}

/** 只有 CMS 管理员或项目创建者可以删除项目。 */
const deleteProjectAccess: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (!isMember(req) || !req.user) return false
  const where: Where = {
    owner: { equals: req.user.id },
  }
  return where
}

/** 成员在已归档项目上可以改的字段：只有状态（恢复项目）。 */
const EDITABLE_WHEN_ARCHIVED = new Set(['status', 'archivedAt', 'pointCount', 'updatedAt', 'createdAt', 'id'])
const sameValue = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v && typeof v === 'object' && 'id' in (v as object) && !Array.isArray(v) ? relId(v) : (v ?? null))
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

export const Projects: CollectionConfig = {
  slug: 'projects',
  graphQL: false,
  labels: { singular: '项目', plural: '项目' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'customerName', 'status', 'pointCount', 'updatedAt'],
    group: '项目',
  },
  defaultSort: '-updatedAt',
  access: {
    read: readProjectAccess,
    create: cmsAdminOrMember,
    update: readProjectAccess,
    delete: deleteProjectAccess,
  },
  hooks: {
    beforeValidate: [
      // 项目名称留空时按「小区 + 房号」或客户姓名自动生成
      ({ data }) => {
        if (data && !String(data.name ?? '').trim()) data.name = autoProjectName(data)
        return data
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        // 协作权限检查：仅查看（read）协作者不能修改项目
        if (operation === 'update' && originalDoc && isMember(req) && req.user) {
          // 允许通过协作链接加入时由服务端 overrideAccess 更新 collaborators，普通成员请求需校验编辑权限
          if (!canEditProject(originalDoc as never, req.user.id)) {
            throw new APIError('你对该项目仅有查看权限，无法修改', 403)
          }
          // 只有当前负责人（owner）才能修改或转让负责人字段；协作者不能篡改 owner 夺取项目控制权
          if (Object.prototype.hasOwnProperty.call(data, 'owner') && !sameValue(data.owner, originalDoc.owner)) {
            if (!canManageProject(originalDoc as never, req.user.id)) {
              throw new APIError('只有项目创建者（负责人）可以转让负责人', 403)
            }
            const prevOwnerId = relId(originalDoc.owner)
            const nextOwnerId = relId(data.owner)
            // 原负责人将项目转让给他人时，自动把原负责人保留为可编辑协作者，避免自己失去访问权
            if (prevOwnerId && nextOwnerId && prevOwnerId !== nextOwnerId) {
              const rawCollabs = ((data.collaborators ?? originalDoc.collaborators) as CollaboratorItem[] | undefined) ?? []
              const filtered = rawCollabs.filter((c) => {
                const uid = relId(c.user)
                return Boolean(uid && uid !== nextOwnerId && uid !== prevOwnerId)
              })
              data.collaborators = [
                ...filtered,
                { user: prevOwnerId, role: 'edit', joinedAt: new Date().toISOString() },
              ]
            }
          }
        }
        // 已归档的项目只读：成员只能把它恢复为进行中（Payload 会用原值补齐未提交的字段，所以逐个比较值）
        if (operation === 'update' && originalDoc?.status === 'archived' && data.status === 'archived' && isMember(req)) {
          const changed = Object.keys(data).filter((k) => !EDITABLE_WHEN_ARCHIVED.has(k) && !sameValue(data[k], originalDoc[k]))
          if (changed.length) throw new APIError(ARCHIVED_MESSAGE, 403)
        }
        // 新建时未指定负责人，默认由当前成员负责（服务端设置，不信任客户端）
        if (operation === 'create' && req.user?.collection === 'users') {
          if (!data.owner) data.owner = req.user.id
        }
        // 点位数由点位图自动统计，项目列表和进度不用再读取整张点位图
        data.pointCount = countScenePoints(data.pointMap)
        // 归档时间跟随状态
        if (data.status === 'archived' && originalDoc?.status !== 'archived') data.archivedAt = new Date().toISOString()
        if (data.status !== 'archived') data.archivedAt = null
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      label: '项目名称',
      type: 'text',
      required: true,
      maxLength: 120,
      admin: { description: '留空时按「小区 + 房号」或客户姓名自动生成' },
    },
    {
      type: 'row',
      fields: [
        { name: 'customerName', label: '客户姓名', type: 'text', maxLength: 60 },
        { name: 'customerPhone', label: '客户电话', type: 'text', maxLength: 30 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'community', label: '小区 / 楼盘', type: 'text', maxLength: 80 },
        { name: 'address', label: '房号 / 详细地址', type: 'text', maxLength: 200 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'platform', label: '主平台', type: 'select', options: PROJECT_PLATFORMS.map((p) => ({ value: p, label: p })) },
        { name: 'budget', label: '预算（元）', type: 'number', min: 0 },
        {
          name: 'owner',
          label: '负责人',
          type: 'relationship',
          relationTo: 'users',
          access: {
            update: ({ req, doc }) => {
              if (isCmsAdmin(req)) return true
              if (!isMember(req) || !req.user) return false
              if (!doc) return true
              return canManageProject(doc as never, req.user.id)
            },
          },
        },
      ],
    },
    {
      name: 'status',
      label: '状态',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: opts(PROJECT_STATUSES),
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'archivedAt',
      label: '归档时间',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true, condition: (data) => data?.status === 'archived' },
    },
    {
      name: 'pointCount',
      label: '点位数',
      type: 'number',
      admin: { position: 'sidebar', readOnly: true, description: '保存点位图时自动统计' },
    },
    {
      name: 'isDemoTemplate',
      label: '作为新用户示例模板',
      type: 'checkbox',
      defaultValue: false,
      access: {
        update: fieldCmsAdminOnly,
      },
      admin: {
        position: 'sidebar',
        description: '勾选后，每当新建成员账号时会自动复制一份该项目（含点位图与报价单）发给新用户',
      },
    },
    { name: 'notes', label: '备注', type: 'textarea', maxLength: 2000 },
    {
      type: 'collapsible',
      label: '交付资料',
      admin: { initCollapsed: true, description: '交付资料包使用的定稿报价和方案模板；留空时自动选择（合同依据的报价 → 已接受的报价 → 最新报价）' },
      fields: [
        {
          name: 'finalQuote',
          label: '定稿报价',
          type: 'relationship',
          relationTo: 'quotes',
          filterOptions: ({ id }) => (id ? { project: { equals: id } } : true),
          validate: validateFinalQuote,
        },
        { name: 'proposalTemplate', label: '交付方案模板', type: 'text', maxLength: 60, admin: { description: '方案模板的标识，如 qixu、noir；留空使用默认模板' } },
      ],
    },
    {
      // Excalidraw 场景（elements / appState / files），在前台点位图页面编辑。
      name: 'pointMap',
      label: '点位图',
      type: 'json',
      admin: { hidden: true },
    },
    {
      // 项目默认型号：{ [设备类型]: 产品 ID }。点位未指定产品时，报价按这里取型号。
      name: 'defaultProducts',
      label: '项目默认型号',
      type: 'json',
      admin: { hidden: true },
    },
    {
      name: 'collaborators',
      label: '协作者',
      type: 'array',
      labels: { singular: '协作者', plural: '协作者' },
      admin: { description: '通过项目协作链接加入的成员及其读写权限' },
      access: {
        create: fieldCmsAdminOnly,
        update: fieldCmsAdminOnly,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'user', label: '成员', type: 'relationship', relationTo: 'users', required: true },
            {
              name: 'role',
              label: '权限',
              type: 'select',
              required: true,
              defaultValue: 'read',
              options: [
                { label: '仅查看', value: 'read' },
                { label: '可编辑', value: 'edit' },
              ],
            },
            { name: 'joinedAt', label: '加入时间', type: 'date' },
          ],
        },
      ],
    },
    {
      // 协作分享链接配置：{ enabled: boolean, token: string, role: 'read' | 'edit' }，严禁向普通成员直接返回 token
      name: 'shareConfig',
      label: '协作链接配置',
      type: 'json',
      admin: { hidden: true },
      access: {
        read: fieldCmsAdminOnly,
        create: fieldCmsAdminOnly,
        update: fieldCmsAdminOnly,
      },
    },
  ],
}
