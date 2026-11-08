import { APIError, type Access, type CollectionConfig, type Where } from 'payload'

import { isCmsAdmin, isMember, relId } from '@/lib/access'
import { SERVICE_BILLING, SERVICE_RECORD_STATUSES, SERVICE_RECORD_TYPES } from '@/lib/after-sales'
import { canEditProject } from '@/lib/project-access'
import { READONLY_COLLAB_MESSAGE } from '@/lib/project-guards'

/** 只能看到自己负责或参与协作的项目的维保记录 */
const readServiceAccess: Access = ({ req }) => {
  if (isCmsAdmin(req)) return true
  if (!isMember(req) || !req.user) return false
  const where: Where = {
    or: [
      { 'project.owner': { equals: req.user.id } },
      { 'project.collaborators.user': { equals: req.user.id } },
    ],
  }
  return where
}

/** 快照最多约 300KB，防止把整张点位图之类的大数据塞进来 */
const MAX_SNAPSHOT_CHARS = 300_000

/**
 * 售后维保记录（插件「售后维保记录」）：交付验收、巡检、检修、设备更换、远程调试与配置备份。
 * 与项目分开存放：项目归档（只读）之后仍然可以继续登记售后，仅查看的协作者不能新增或修改。
 * 登记人与最后修改人由 Payload 内置的 createdBy / updatedBy 自动记录。
 */
export const ServiceRecords: CollectionConfig = {
  slug: 'service-records',
  graphQL: false,
  labels: { singular: '维保记录', plural: '售后维保记录' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'project', 'type', 'serviceDate', 'status'],
    group: '项目',
  },
  defaultSort: '-serviceDate',
  access: {
    read: readServiceAccess,
    create: ({ req }) => isCmsAdmin(req) || isMember(req),
    update: readServiceAccess,
    delete: readServiceAccess,
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const projectId = relId(data.project ?? originalDoc?.project)
        if (!projectId) throw new APIError('维保记录需要关联项目', 400)
        if (operation === 'update' && relId(originalDoc?.project) !== projectId)
          throw new APIError('维保记录不能改到其他项目', 400)
        if (isMember(req) && req.user) {
          const project = await req.payload
            .findByID({
              collection: 'projects',
              id: projectId,
              depth: 0,
              req,
              overrideAccess: true,
              select: { owner: true, collaborators: true },
            })
            .catch(() => null)
          if (!project) throw new APIError('项目不存在或已被删除', 404)
          // 售后发生在交付之后：已归档项目也允许登记，只拦截仅查看的协作者
          if (!canEditProject(project as never, req.user.id))
            throw new APIError(READONLY_COLLAB_MESSAGE, 403)
        }
        if (data.type !== 'backup') data.snapshot = null
        else if (data.snapshot && JSON.stringify(data.snapshot).length > MAX_SNAPSHOT_CHARS)
          throw new APIError('配置备份内容过大', 400)
        if (data.billing !== 'paid') data.fee = null
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (!isMember(req) || !req.user) return
        const doc = await req.payload
          .findByID({
            collection: 'service-records',
            id,
            depth: 0,
            req,
            overrideAccess: true,
            select: { project: true },
          })
          .catch(() => null)
        if (!doc) return
        const project = await req.payload
          .findByID({
            collection: 'projects',
            id: relId(doc.project) ?? '',
            depth: 0,
            req,
            overrideAccess: true,
            select: { owner: true, collaborators: true },
          })
          .catch(() => null)
        if (project && !canEditProject(project as never, req.user.id))
          throw new APIError(READONLY_COLLAB_MESSAGE, 403)
      },
    ],
  },
  fields: [
    { name: 'title', label: '摘要', type: 'text', required: true, maxLength: 120 },
    {
      type: 'row',
      fields: [
        {
          name: 'project',
          label: '项目',
          type: 'relationship',
          relationTo: 'projects',
          required: true,
          index: true,
        },
        {
          name: 'type',
          label: '类型',
          type: 'select',
          required: true,
          defaultValue: 'repair',
          index: true,
          options: SERVICE_RECORD_TYPES.map(({ value, label }) => ({ value, label })),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'serviceDate',
          label: '服务日期',
          type: 'date',
          required: true,
          index: true,
          admin: { date: { pickerAppearance: 'dayOnly' } },
        },
        {
          name: 'status',
          label: '状态',
          type: 'select',
          required: true,
          defaultValue: 'done',
          options: SERVICE_RECORD_STATUSES.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'nextVisitAt',
          label: '下次回访',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayOnly' } },
        },
      ],
    },
    { name: 'detail', label: '处理过程与结果', type: 'textarea', maxLength: 2000 },
    { name: 'devices', label: '涉及设备 / 更换明细', type: 'textarea', maxLength: 500 },
    {
      type: 'row',
      fields: [
        {
          name: 'billing',
          label: '收费方式',
          type: 'select',
          required: true,
          defaultValue: 'warranty',
          options: SERVICE_BILLING.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'fee',
          label: '收费金额（元）',
          type: 'number',
          min: 0,
          admin: { condition: (data) => data?.billing === 'paid' },
        },
        { name: 'technician', label: '服务人员', type: 'text', maxLength: 40 },
      ],
    },
    {
      // 配置备份：当时的设备台账快照（type = backup 时由系统生成）
      name: 'snapshot',
      label: '配置备份快照',
      type: 'json',
      admin: { readOnly: true, condition: (data) => data?.type === 'backup' },
    },
  ],
}
