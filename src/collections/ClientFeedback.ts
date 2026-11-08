import {
  APIError,
  type Access,
  type CollectionConfig,
  type TextFieldSingleValidation,
  type Where,
} from 'payload'

import { fieldCmsAdminOnly, isCmsAdmin, isMember, relId } from '@/lib/access'
import {
  CLIENT_FEEDBACK_DECISIONS,
  CLIENT_FEEDBACK_STATUSES,
  MAX_SIGNATURE_CHARS,
} from '@/lib/client-feedback'
import { canEditProject, shareLinkMatches } from '@/lib/project-access'
import { READONLY_COLLAB_MESSAGE } from '@/lib/project-guards'

/** 设计师（项目负责人和协作者）可以查看本项目收到的业主反馈；业主本人提交后不能再读取 */
const readFeedbackAccess: Access = ({ req }) => {
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

/** 业主在分享页手写的签名：只接受 PNG data URL，且限制大小 */
const validateSignature: TextFieldSingleValidation = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))
    return '签名格式无效'
  if (value.length > MAX_SIGNATURE_CHARS) return '签名图片过大'
  return true
}

/** 同一项目 10 分钟内最多接收的反馈条数（防止分享链接被刷） */
const BURST_LIMIT = 5
const BURST_WINDOW_MS = 10 * 60 * 1000

/** 业主提交后，这些内容只能由 CMS 管理员更正，设计师只能改处理状态 */
const customerOwned = { create: () => true, update: fieldCmsAdminOnly }

/**
 * 业主意向反馈：业主在免登录分享页对比方案、勾选「暂缓」的设备并签名确认意向（不改动原报价）。
 * 只能通过分享页的服务端操作提交：调用时在 context.clientShareToken 里带上分享凭证，
 * 集合钩子核对凭证、项目与报价的归属，并限制提交频率；处理状态由设计师在项目里更新。
 */
export const ClientFeedback: CollectionConfig = {
  slug: 'client-feedback',
  graphQL: false,
  labels: { singular: '业主反馈', plural: '业主意向反馈' },
  admin: {
    useAsTitle: 'customerName',
    defaultColumns: ['customerName', 'project', 'decision', 'intentTotal', 'status', 'createdAt'],
    group: '项目',
  },
  defaultSort: '-createdAt',
  access: {
    read: readFeedbackAccess,
    create: ({ req }) => isCmsAdmin(req) || typeof req.context?.clientShareToken === 'string',
    update: readFeedbackAccess,
    delete: readFeedbackAccess,
  },
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        if (operation !== 'create' || !data || isCmsAdmin(req)) return data
        const projectId = relId(data.project)
        const quoteId = relId(data.quote)
        if (!projectId || !quoteId) throw new APIError('反馈需要关联项目和报价', 400)
        const project = await req.payload
          .findByID({
            collection: 'projects',
            id: projectId,
            depth: 0,
            req,
            overrideAccess: true,
            select: { shareConfig: true } as never,
          })
          .catch(() => null)
        if (
          !project ||
          !shareLinkMatches(
            (project as { shareConfig?: unknown }).shareConfig,
            req.context?.clientShareToken,
          )
        ) {
          throw new APIError('分享链接已失效，请联系设计师获取新链接', 403)
        }
        const quote = await req.payload
          .findByID({
            collection: 'quotes',
            id: quoteId,
            depth: 0,
            req,
            overrideAccess: true,
            select: { project: true },
          })
          .catch(() => null)
        if (!quote || relId(quote.project) !== projectId)
          throw new APIError('所选方案不属于这个项目', 400)
        const recent = await req.payload.count({
          collection: 'client-feedback',
          where: {
            and: [
              { project: { equals: projectId } },
              { createdAt: { greater_than: new Date(Date.now() - BURST_WINDOW_MS).toISOString() } },
            ],
          },
          req,
          overrideAccess: true,
        })
        if (recent.totalDocs >= BURST_LIMIT) throw new APIError('提交太频繁了，请稍后再试', 429)
        data.status = 'new'
        return data
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation !== 'update') return data
        if (relId(data.project ?? originalDoc?.project) !== relId(originalDoc?.project))
          throw new APIError('反馈不能改到其他项目', 400)
        if (isMember(req) && req.user) {
          const project = await req.payload
            .findByID({
              collection: 'projects',
              id: relId(originalDoc?.project) ?? '',
              depth: 0,
              req,
              overrideAccess: true,
              select: { owner: true, collaborators: true },
            })
            .catch(() => null)
          if (!project || !canEditProject(project as never, req.user.id))
            throw new APIError(READONLY_COLLAB_MESSAGE, 403)
        }
        if (data.status === 'handled' && originalDoc?.status !== 'handled') {
          data.handledAt = new Date().toISOString()
          data.handledBy = req.user?.collection === 'users' ? req.user.id : null
        }
        if (data.status !== 'handled') {
          data.handledAt = null
          data.handledBy = null
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (!isMember(req) || !req.user) return
        const doc = await req.payload
          .findByID({
            collection: 'client-feedback',
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
    {
      type: 'row',
      fields: [
        {
          name: 'customerName',
          label: '业主称呼',
          type: 'text',
          required: true,
          maxLength: 40,
          access: customerOwned,
        },
        {
          name: 'customerPhone',
          label: '联系电话',
          type: 'text',
          maxLength: 30,
          access: customerOwned,
        },
      ],
    },
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
          access: customerOwned,
        },
        {
          name: 'quote',
          label: '意向方案（报价）',
          type: 'relationship',
          relationTo: 'quotes',
          required: true,
          access: customerOwned,
        },
      ],
    },
    {
      name: 'quoteTitle',
      label: '方案名称（提交时）',
      type: 'text',
      maxLength: 120,
      access: customerOwned,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'decision',
          label: '业主意向',
          type: 'select',
          required: true,
          defaultValue: 'confirm',
          options: CLIENT_FEEDBACK_DECISIONS.map(({ value, label }) => ({ value, label })),
          access: customerOwned,
        },
        {
          name: 'quoteTotal',
          label: '方案原价合计',
          type: 'number',
          min: 0,
          access: customerOwned,
          admin: { readOnly: true },
        },
        {
          name: 'intentTotal',
          label: '意向合计（不含暂缓）',
          type: 'number',
          min: 0,
          access: customerOwned,
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'message',
      label: '业主留言',
      type: 'textarea',
      maxLength: 1000,
      access: customerOwned,
    },
    {
      // 业主标记「暂缓」的报价明细快照：[{ itemId, name, sku, quantity, amount }]
      name: 'deferredItems',
      label: '暂缓的设备',
      type: 'json',
      access: customerOwned,
      admin: { readOnly: true },
    },
    {
      name: 'signature',
      label: '业主签名',
      type: 'text',
      validate: validateSignature,
      access: customerOwned,
      admin: { hidden: true },
    },
    {
      name: 'status',
      label: '处理状态',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: CLIENT_FEEDBACK_STATUSES.map(({ value, label }) => ({ value, label })),
      access: { create: fieldCmsAdminOnly },
      admin: { position: 'sidebar' },
    },
    {
      name: 'handledAt',
      label: '处理时间',
      type: 'date',
      access: { create: fieldCmsAdminOnly, update: fieldCmsAdminOnly },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'handledBy',
      label: '处理人',
      type: 'relationship',
      relationTo: 'users',
      access: { create: fieldCmsAdminOnly, update: fieldCmsAdminOnly },
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
