import type { CollectionConfig } from 'payload'

/**
 * 单价表（逻辑表）：按地区或按项目维护一套安装/调试单价（issue #194 市场价调整）。
 *
 * 价格本身只存在 `pricing-versions`（版本化，带生效时间），
 * 这样改价不会动到已生成的报价快照。
 */
export const PricingPlans: CollectionConfig = {
  slug: 'pricing-plans',
  labels: { singular: '单价表', plural: '单价表' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'region', 'scope', 'isDefault', 'status'],
    group: '营销与线索',
  },
  access: {
    // 业主端只读「当前生效版本」通过接口；管理后台由 CMS 管理员维护
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: '如「长沙 2026 标准」' } },
    {
      name: 'region',
      type: 'text',
      index: true,
      defaultValue: 'default',
      admin: { description: '地区标识：default / changsha …（不同城市人工不同价）' },
    },
    {
      name: 'scope',
      type: 'select',
      required: true,
      defaultValue: 'region',
      options: [
        { label: '按地区', value: 'region' },
        { label: '按项目', value: 'project' },
      ],
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      admin: { condition: (data) => data?.scope === 'project' },
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: '同地区同范围只允许一个默认（保存时校验）' },
      hooks: {
        beforeChange: [
          async ({ value, data, req, operation }) => {
            if (!value) return value
            const doc = (data ?? {}) as { region?: string; scope?: string; id?: string }
            const conflict = await req.payload.find({
              collection: 'pricing-plans',
              where: {
                and: [
                  { isDefault: { equals: true } },
                  { region: { equals: doc.region ?? 'default' } },
                  { scope: { equals: doc.scope ?? 'region' } },
                  ...(operation === 'update' && doc.id ? [{ id: { not_equals: doc.id } }] : []),
                ],
              },
              limit: 1,
              overrideAccess: true,
            })
            if (conflict.docs.length) {
              throw new Error('同地区同范围已有默认单价表，请先取消原默认')
            }
            return value
          },
        ],
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: '启用', value: 'active' },
        { label: '归档', value: 'archived' },
      ],
    },
  ],
}
