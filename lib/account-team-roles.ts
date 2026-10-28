import type { PermissionCode } from "./account-system/domain"

export type TeamRoleCode = "admin" | "editor" | "viewer" | "finance"

export const teamRoleNames: Record<TeamRoleCode, string> = {
  admin: "经理-老板",
  editor: "销售",
  finance: "销售",
  viewer: "工程师",
}

/** Shared by role creation and its on-screen explanation. */
export const teamRolePermissions: Record<TeamRoleCode, PermissionCode[]> = {
  admin: ["enterprise.manage_members", "enterprise.manage_roles", "enterprise.manage_billing", "project.create", "project.edit", "project.view", "project.delete", "point_map.use", "export.advanced", "order.view"],
  editor: ["project.create", "project.edit", "project.view", "point_map.use", "export.advanced"],
  finance: ["project.create", "project.edit", "project.view", "export.advanced"],
  viewer: ["project.edit", "project.view", "point_map.use"],
}

const permissionLabels: Array<[string, Array<[PermissionCode, string]>]> = [
  ["团队设置", [["enterprise.manage_members", "成员管理"], ["enterprise.manage_roles", "角色权限"], ["enterprise.manage_billing", "套餐账单"]]],
  ["项目与报价", [["project.view", "查看"], ["project.create", "新建"], ["project.edit", "修改"], ["project.delete", "删除"]]],
  ["点位设计", [["point_map.use", "使用"]]],
  ["文件导出", [["export.advanced", "高级导出"]]],
  ["订单资料", [["order.view", "查看"]]],
]

export function teamRolePermissionSummary(role: TeamRoleCode): Array<[string, string[]]> {
  const granted = new Set(teamRolePermissions[role])
  return permissionLabels.map(([group, permissions]) => [group, permissions.filter(([permission]) => granted.has(permission)).map(([, label]) => label)])
}
