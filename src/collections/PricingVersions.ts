import type { CollectionConfig } from 'payload'

import { PRICE_EXCLUSIONS, PRICING_ITEMS_V2 } from '@/lib/need-pricing'

/**
 * 单价表版本（issue #194 市场价调整）：
 * - 每次改价 = 新建一个版本（draft/scheduled），填生效时间与改价原因
 * - 同一 plan 同时最多一个 active；发布新版本时把旧的置 retired（保留历史）
 * - 报价单保存版本快照，所以改价只影响新报价
 */
export const PricingVersions: CollectionConfig = {
  slug: 'pricing-versions',
  labels: { singular: '单价版本', plural: '单价版本' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'plan', 'version', 'status', 'effectiveFrom'],
    group: '营销与线索',
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    {
      name: 'plan',
      type: 'relationship',
      relationTo: 'pricing-plans',
      required: true,
      index: true,
    },
    {
      name: 'label',
      type: 'text',
      admin: { readOnly: true, description: '自动生成：表名 v3' },
      hooks: {
        beforeChange: [
          async ({ data, req }) => {
            if (!data?.plan) return data?.label
            const plan = await req.payload
              .findByID({
                collection: 'pricing-plans',
                id: data.plan,
                depth: 0,
                overrideAccess: true,
              })
              .catch(() => null)
            const n = Number(data.version ?? 0)
            return `${plan?.name ?? '单价表'} v${n}`
          },
        ],
      },
    },
    {
      name: 'version',
      type: 'number',
      required: true,
      min: 1,
      admin: { description: '同 plan 内自增' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: '草稿', value: 'draft' },
        { label: '待生效', value: 'scheduled' },
        { label: '生效中', value: 'active' },
        { label: '已停用（保留历史）', value: 'retired' },
      ],
      index: true,
    },
    {
      name: 'effectiveFrom',
      type: 'date',
      required: true,
      admin: { description: '到点生效；可设未来时间' },
    },
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { description: '安装/调试单价（元）。不含水电布线、回路改造' },
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'label', type: 'text', required: true },
        { name: 'unit', type: 'text', required: true },
        { name: 'unitPrice', type: 'number', required: true, min: 0 },
        {
          name: 'calc',
          type: 'select',
          required: true,
          defaultValue: 'per_unit',
          options: [
            { label: '按件', value: 'per_unit' },
            { label: '按米', value: 'per_meter' },
          ],
        },
      ],
      defaultValue: PRICING_ITEMS_V2.map((i) => ({
        key: i.key,
        label: i.label,
        unit: i.unit,
        unitPrice: i.unitPrice,
        calc: i.calc,
      })),
    },
    {
      name: 'commissioningPerSet',
      type: 'number',
      defaultValue: 800,
      admin: {
        description: '调试编程费（= 服务费，唯一利润项）。用户尚未确认，报价默认不计入合计',
      },
    },
    {
      name: 'exclusions',
      type: 'text',
      hasMany: true,
      defaultValue: [...PRICE_EXCLUSIONS],
      admin: { description: '不含项声明（报价单与建议页固定展示）' },
    },
    {
      name: 'changeNote',
      type: 'text',
      admin: { description: '改价原因（审计用）' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc, operation }) => {
        // 发布为 active 时：旧的 active 置 retired（保留历史，不删除）
        if (data.status === 'active') {
          const planId = typeof data.plan === 'object' ? data.plan?.id : data.plan
          const others = await req.payload.find({
            collection: 'pricing-versions',
            where: {
              and: [
                { plan: { equals: planId } },
                { status: { equals: 'active' } },
                ...(operation === 'update' && originalDoc?.id
                  ? [{ id: { not_equals: originalDoc.id } }]
                  : []),
              ],
            },
            limit: 100,
            overrideAccess: true,
          })
          for (const doc of others.docs) {
            await req.payload.update({
              collection: 'pricing-versions',
              id: doc.id,
              data: { status: 'retired' },
              overrideAccess: true,
            })
          }
          data.publishedAt = new Date().toISOString()
        }
        return data
      },
    ],
  },
}
