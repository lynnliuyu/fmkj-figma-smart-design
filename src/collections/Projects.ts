import type { CollectionConfig } from 'payload'

import { cmsAdminOrActiveStaff, cmsAdminOrManager, hasStaffRole, isCmsAdmin } from '@/lib/access'
import { PROJECT_PLATFORMS, PROJECT_RISKS, PROJECT_STAGES, PROJECT_STATUSES, PROJECT_WAITING_ON } from '@/lib/projects'

const opts = (list: readonly { value: string; label: string }[]) => list.map(({ value, label }) => ({ value, label }))

/** 只读角色不能新建或修改项目。 */
const canEditProjects = ({ req }: { req: Parameters<typeof isCmsAdmin>[0] }) =>
  isCmsAdmin(req) || hasStaffRole(req, ['admin', 'manager', 'designer', 'sales'])

export const Projects: CollectionConfig = {
  slug: 'projects',
  labels: { singular: '项目', plural: '项目' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'customerName', 'stage', 'owner', 'updatedAt'],
    group: '项目',
  },
  defaultSort: '-updatedAt',
  access: {
    read: cmsAdminOrActiveStaff,
    create: canEditProjects,
    update: canEditProjects,
    delete: cmsAdminOrManager,
  },
  hooks: {
    beforeChange: [
      // 新建时未指定负责人，默认由当前员工负责（服务端设置，不信任客户端）。
      ({ data, operation, req }) => {
        if (operation === 'create' && !data.owner && req.user?.collection === 'users') data.owner = req.user.id
        return data
      },
    ],
  },
  fields: [
    { name: 'name', label: '项目名称', type: 'text', required: true, maxLength: 120 },
    {
      type: 'row',
      fields: [
        { name: 'customerName', label: '客户姓名', type: 'text', required: true, maxLength: 60 },
        { name: 'customerPhone', label: '客户电话', type: 'text', maxLength: 30 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'community', label: '小区 / 楼盘', type: 'text', maxLength: 80 },
        { name: 'address', label: '详细地址', type: 'text', maxLength: 200 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'stage', label: '阶段', type: 'select', required: true, defaultValue: 'new', options: opts(PROJECT_STAGES), index: true },
        { name: 'status', label: '状态', type: 'select', required: true, defaultValue: 'active', options: opts(PROJECT_STATUSES), index: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'owner', label: '负责人', type: 'relationship', relationTo: 'users' },
        { name: 'platform', label: '主平台', type: 'select', options: PROJECT_PLATFORMS.map((p) => ({ value: p, label: p })) },
        { name: 'budget', label: '预算（元）', type: 'number', min: 0 },
      ],
    },
    {
      type: 'collapsible',
      label: '风险与下一步',
      // 页面流程已简化，不再使用这些字段；保留已有数据，仅在后台隐藏。
      admin: { condition: () => false },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'riskLevel', label: '风险', type: 'select', defaultValue: 'normal', options: opts(PROJECT_RISKS) },
            { name: 'waitingOn', label: '等待对象', type: 'select', defaultValue: 'none', options: opts(PROJECT_WAITING_ON) },
          ],
        },
        { name: 'riskNote', label: '风险说明', type: 'textarea', maxLength: 500 },
        {
          type: 'row',
          fields: [
            { name: 'nextAction', label: '下一步', type: 'text', maxLength: 200 },
            { name: 'nextActionDueAt', label: '下一步截止', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
          ],
        },
      ],
    },
    { name: 'notes', label: '备注', type: 'textarea', maxLength: 2000 },
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
  ],
}
