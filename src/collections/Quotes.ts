import {
  APIError,
  type Access,
  type CollectionConfig,
  type PayloadRequest,
  type Where,
} from 'payload'

import { cmsAdminOrMember, isCmsAdmin, isMember, relId } from '@/lib/access'
import { DEVICE_TYPE_OPTIONS } from '@/lib/device-types'
import { assertProjectEditable } from '@/lib/project-guards'
import {
  isPositiveQuotePrice,
  QUOTE_STATUSES,
  quoteTotals,
  requiresManualQuotePrice,
} from '@/lib/quotes'

/** 行级读取控制：只能读取自己有权访问的项目的报价单。 */
const readQuoteAccess: Access = ({ req }) => {
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

/** 报价被合同引用时的限制：已签订合同的报价不能再改；被任何合同引用的报价不能删除。 */
async function contractUsing(req: PayloadRequest, quoteId: string, signedOnly: boolean) {
  const found = await req.payload.find({
    collection: 'contracts',
    where: signedOnly
      ? { and: [{ quote: { equals: quoteId } }, { status: { equals: 'signed' } }] }
      : { quote: { equals: quoteId } },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
    select: { number: true },
  })
  return found.docs[0] ?? null
}

export const Quotes: CollectionConfig = {
  slug: 'quotes',
  graphQL: false,
  labels: { singular: '报价', plural: '报价' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'project', 'status', 'total', 'updatedAt'],
    group: '项目',
  },
  defaultSort: '-updatedAt',
  access: {
    read: readQuoteAccess,
    create: cmsAdminOrMember,
    update: readQuoteAccess,
    delete: readQuoteAccess,
  },
  hooks: {
    beforeChange: [
      // 已归档项目的报价只读；已用于已签订合同的报价锁定，避免合同附件和报价对不上
      async ({ data, operation, originalDoc, req }) => {
        if (!isMember(req)) return data
        await assertProjectEditable(req, relId(data.project ?? originalDoc?.project))
        if (
          operation === 'update' &&
          originalDoc?.id &&
          (await contractUsing(req, String(originalDoc.id), true))
        ) {
          throw new APIError('这份报价已用于已签订的合同，撤销签订后才能修改', 403)
        }
        return data
      },
      // 金额始终由服务端按明细重新计算，不信任客户端提交的合计。
      ({ data, originalDoc }) => {
        const items = data.items ?? originalDoc?.items ?? []
        const fees = data.fees ?? originalDoc?.fees ?? []
        const discount = data.discount ?? originalDoc?.discount ?? 0
        const totals = quoteTotals(items, fees, discount)
        data.productTotal = totals.productTotal
        data.feeTotal = totals.feeTotal
        data.total = totals.total
        return data
      },
      // 直接写报价的入口（含后台复制）也必须遵守手工报价商品的单价规则。
      async ({ data, originalDoc, req }) => {
        const items = (data.items ?? originalDoc?.items ?? []) as {
          product?: unknown
          price?: unknown
        }[]
        const ids = [
          ...new Set(
            items
              .filter((item) => !isPositiveQuotePrice(item.price))
              .map((item) => relId(item.product))
              .filter(Boolean),
          ),
        ]
        if (!ids.length) return data
        const { docs } = await req.payload.find({
          collection: 'products',
          where: { id: { in: ids } },
          pagination: false,
          depth: 0,
          req,
          user: req.user,
          overrideAccess: !req.user,
          select: { name: true, status: true, tags: true },
        })
        const product = docs.find(requiresManualQuotePrice)
        if (product) throw new APIError(`「${product.name}」请填写大于 0 的单价`, 400)
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        if (!isMember(req)) return
        const quote = await req.payload
          .findByID({
            collection: 'quotes',
            id,
            depth: 0,
            req,
            overrideAccess: true,
            select: { project: true },
          })
          .catch(() => null)
        await assertProjectEditable(req, relId(quote?.project))
        if (await contractUsing(req, String(id), false))
          throw new APIError('这份报价已用于合同，不能删除', 403)
      },
    ],
  },
  fields: [
    { name: 'title', label: '报价名称', type: 'text', required: true, maxLength: 120 },
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
          name: 'status',
          label: '状态',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          options: QUOTE_STATUSES.map(({ value, label }) => ({ value, label })),
        },
      ],
    },
    {
      name: 'items',
      label: '产品明细',
      type: 'array',
      labels: { singular: '产品', plural: '产品' },
      fields: [
        // 产品关联用于追溯；名称、型号、单位、单价在生成时快照，产品库后续调价不影响已出的报价。
        { name: 'product', label: '产品', type: 'relationship', relationTo: 'products' },
        {
          type: 'row',
          fields: [
            // 设备类型用于「更换型号」时只列出同类产品
            { name: 'deviceType', label: '设备类型', type: 'select', options: DEVICE_TYPE_OPTIONS },
            // 生成时的产品图片快照；产品库换图不影响已出的报价
            { name: 'image', label: '产品图片', type: 'upload', relationTo: 'media' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'name', label: '名称', type: 'text', required: true, maxLength: 200 },
            // 产品短名的快照；只用于报价台列表显示，打印 / 合同 / 导出仍用 name
            { name: 'shortName', label: '短名', type: 'text', maxLength: 24 },
            { name: 'sku', label: '型号', type: 'text', maxLength: 100 },
            { name: 'unit', label: '单位', type: 'text', maxLength: 10 },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'price', label: '单价', type: 'number', required: true, min: 0 },
            {
              name: 'quantity',
              label: '数量',
              type: 'number',
              required: true,
              min: 0,
              defaultValue: 1,
            },
          ],
        },
      ],
    },
    {
      name: 'fees',
      label: '附加费用',
      type: 'array',
      labels: { singular: '费用', plural: '费用' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', label: '名称', type: 'text', required: true, maxLength: 100 },
            { name: 'amount', label: '金额', type: 'number', required: true },
          ],
        },
      ],
    },
    { name: 'discount', label: '优惠金额', type: 'number', min: 0, defaultValue: 0 },
    { name: 'notes', label: '备注（打印在报价单上）', type: 'textarea', maxLength: 2000 },
    {
      type: 'row',
      fields: [
        { name: 'productTotal', label: '产品小计', type: 'number', admin: { readOnly: true } },
        { name: 'feeTotal', label: '费用小计', type: 'number', admin: { readOnly: true } },
        { name: 'total', label: '报价总额', type: 'number', admin: { readOnly: true } },
      ],
    },
  ],
}
