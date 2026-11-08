import {
  APIError,
  type Access,
  type CollectionConfig,
  type PayloadRequest,
  type Where,
} from 'payload'

import { cmsAdminOrMember, isCmsAdmin, isMember, relId } from '@/lib/access'
import { CONTRACT_STATUSES, contractNumberPrefix, paymentPercentTotal } from '@/lib/contracts'
import { assertProjectEditable } from '@/lib/project-guards'

const readContractAccess: Access = ({ req }) => {
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

/** 当天的下一个合同编号：HT20261030-01、-02 … */
async function nextContractNumber(req: PayloadRequest) {
  const prefix = contractNumberPrefix()
  const existing = await req.payload.find({
    collection: 'contracts',
    where: { number: { like: prefix } },
    limit: 500,
    depth: 0,
    req,
    overrideAccess: true,
    select: { number: true },
  })
  const max = existing.docs.reduce((m, d) => {
    const n = Number(String(d.number ?? '').split('-')[1])
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `${prefix}-${String(max + 1).padStart(2, '0')}`
}

/** 签订后锁定的内容（收款登记除外）。 */
const LOCKED_WHEN_SIGNED = [
  'number',
  'quote',
  'amount',
  'customerName',
  'customerPhone',
  'address',
  'durationDays',
  'warrantyMonths',
  'terms',
] as const
const norm = (v: unknown) =>
  v && typeof v === 'object' ? relId(v) : v === '' || v === undefined ? null : v
type Payment = { name?: string | null; percent?: number | null; received?: boolean | null }

/**
 * 合同：每个项目一份，依据项目里的一份报价生成。
 * 待签订时可以随意修改；签订后只能登记收款，撤销签订后才能改其他内容。
 */
export const Contracts: CollectionConfig = {
  slug: 'contracts',
  graphQL: false,
  labels: { singular: '合同', plural: '合同' },
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'project', 'status', 'amount', 'signedAt'],
    group: '项目',
  },
  defaultSort: '-updatedAt',
  access: {
    read: readContractAccess,
    create: cmsAdminOrMember,
    update: readContractAccess,
    delete: readContractAccess,
  },
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        if (data && operation === 'create' && !String(data.number ?? '').trim())
          data.number = await nextContractNumber(req)
        return data
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const projectId = relId(data.project)
        const quoteId = relId(data.quote)
        if (!projectId || !quoteId) throw new APIError('合同需要关联项目和报价', 400)
        if (operation === 'update' && relId(originalDoc?.project) !== projectId)
          throw new APIError('合同不能改到其他项目', 400)
        await assertProjectEditable(req, projectId)

        if (operation === 'create') {
          const existing = await req.payload.count({
            collection: 'contracts',
            where: { project: { equals: projectId } },
            req,
            overrideAccess: true,
          })
          if (existing.totalDocs) throw new APIError('这个项目已经有合同了', 400)
        }
        // 依据的报价必须属于同一个项目
        if (operation === 'create' || quoteId !== relId(originalDoc?.quote)) {
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
            throw new APIError('所选报价不属于这个项目', 400)
        }

        const payments = (data.payments ?? []) as Payment[]
        if (payments.length && Math.abs(paymentPercentTotal(payments) - 100) > 0.001) {
          throw new APIError(`付款比例合计需为 100%（当前 ${paymentPercentTotal(payments)}%）`, 400)
        }

        const before = originalDoc?.status === 'signed' ? 'signed' : 'draft'
        const after = data.status === 'signed' ? 'signed' : 'draft'
        if (isMember(req) && before === 'signed' && after === 'signed' && originalDoc) {
          const old = (originalDoc.payments ?? []) as Payment[]
          const fieldChanged = LOCKED_WHEN_SIGNED.some(
            (k) => JSON.stringify(norm(data[k])) !== JSON.stringify(norm(originalDoc[k])),
          )
          const termsChanged =
            old.length !== payments.length ||
            payments.some(
              (p, i) => p.name !== old[i]?.name || Number(p.percent) !== Number(old[i]?.percent),
            )
          if (fieldChanged || termsChanged)
            throw new APIError('合同已签订，只能登记收款；如需修改请先撤销签订', 403)
        }
        // 签订日期跟随状态：签订时默认当天，撤销签订时清空
        if (after === 'signed' && !data.signedAt) data.signedAt = new Date().toISOString()
        if (after === 'draft') data.signedAt = null
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (!isMember(req)) return
        const doc = await req.payload
          .findByID({
            collection: 'contracts',
            id,
            depth: 0,
            req,
            overrideAccess: true,
            select: { status: true, project: true },
          })
          .catch(() => null)
        if (!doc) return
        await assertProjectEditable(req, relId(doc.project))
        if (doc.status === 'signed') throw new APIError('已签订的合同不能删除，请先撤销签订', 403)
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          label: '合同编号',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          maxLength: 40,
          admin: { description: '留空自动生成' },
        },
        {
          name: 'status',
          label: '状态',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          options: CONTRACT_STATUSES.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'signedAt',
          label: '签订日期',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayOnly' } },
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
          unique: true,
          index: true,
        },
        {
          name: 'quote',
          label: '依据报价',
          type: 'relationship',
          relationTo: 'quotes',
          required: true,
        },
      ],
    },
    { name: 'amount', label: '合同金额（元）', type: 'number', required: true, min: 0 },
    {
      type: 'row',
      fields: [
        { name: 'customerName', label: '甲方', type: 'text', maxLength: 60 },
        { name: 'customerPhone', label: '甲方电话', type: 'text', maxLength: 30 },
      ],
    },
    { name: 'address', label: '施工地址', type: 'text', maxLength: 200 },
    {
      type: 'row',
      fields: [
        { name: 'durationDays', label: '工期（天）', type: 'number', min: 1, max: 365 },
        { name: 'warrantyMonths', label: '质保期（月）', type: 'number', min: 0, max: 120 },
      ],
    },
    {
      name: 'payments',
      label: '付款方式',
      type: 'array',
      maxRows: 6,
      labels: { singular: '款项', plural: '款项' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', label: '款项', type: 'text', required: true, maxLength: 40 },
            {
              name: 'percent',
              label: '比例（%）',
              type: 'number',
              required: true,
              min: 0,
              max: 100,
            },
            { name: 'received', label: '已收款', type: 'checkbox', defaultValue: false },
          ],
        },
      ],
    },
    { name: 'terms', label: '合同条款', type: 'textarea', maxLength: 5000 },
  ],
}
