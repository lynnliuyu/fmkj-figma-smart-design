import type { CollectionConfig } from 'payload'

import { cmsAdminOrActiveStaff, cmsAdminOrManager, hasStaffRole, isCmsAdmin } from '@/lib/access'
import { DEVICE_TYPE_OPTIONS } from '@/lib/device-types'
import { QUOTE_STATUSES, quoteTotals } from '@/lib/quotes'

const canEdit = ({ req }: { req: Parameters<typeof isCmsAdmin>[0] }) =>
  isCmsAdmin(req) || hasStaffRole(req, ['admin', 'manager', 'designer', 'sales'])

export const Quotes: CollectionConfig = {
  slug: 'quotes',
  labels: { singular: '报价', plural: '报价' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'project', 'status', 'total', 'updatedAt'],
    group: '项目',
  },
  defaultSort: '-updatedAt',
  access: {
    read: cmsAdminOrActiveStaff,
    create: canEdit,
    update: canEdit,
    delete: cmsAdminOrManager,
  },
  hooks: {
    beforeChange: [
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
    ],
  },
  fields: [
    { name: 'title', label: '报价名称', type: 'text', required: true, maxLength: 120 },
    {
      type: 'row',
      fields: [
        { name: 'project', label: '项目', type: 'relationship', relationTo: 'projects', required: true, index: true },
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
            { name: 'sku', label: '型号', type: 'text', maxLength: 100 },
            { name: 'unit', label: '单位', type: 'text', maxLength: 10 },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'price', label: '单价', type: 'number', required: true, min: 0 },
            { name: 'quantity', label: '数量', type: 'number', required: true, min: 0, defaultValue: 1 },
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
