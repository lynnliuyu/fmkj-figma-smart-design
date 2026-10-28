"use client"

import * as React from "react"
import {
  LockKeyhole,
  ShieldCheck,
  UserPlus,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { teamRoleNames as roleLabels, teamRolePermissionSummary, type TeamRoleCode } from "@/lib/account-team-roles"

type AccountTeamMember = {
  email: string
  id: string
  name: string
  projects: number
  roleCode: TeamRoleCode
  roleName: string
  status: "active" | "invited" | "disabled" | "removed"
  userId: string
}

type AccountTeam = {
  canManage: boolean
  memberLimit: number | null
  members: AccountTeamMember[]
  organization: {
    id: string
    name: string
    ownerUserId: string
  } | null
  plan: {
    code: string
    name: string
  } | null
  roles: Array<{ code: TeamRoleCode; id: string; name: string }>
}

const defaultRoles: AccountTeam["roles"] = [
  { code: "admin", id: "admin", name: "经理-老板" },
  { code: "editor", id: "editor", name: "销售" },
  { code: "viewer", id: "viewer", name: "工程师" },
]

export function AccountTeamSettings() {
  const [team, setTeam] = React.useState<AccountTeam | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createEmail, setCreateEmail] = React.useState("")
  const [createName, setCreateName] = React.useState("")
  const [createPassword, setCreatePassword] = React.useState("")
  const [createRole, setCreateRole] = React.useState<TeamRoleCode>("editor")
  const [savingCreate, setSavingCreate] = React.useState(false)
  const [selectedRole, setSelectedRole] = React.useState<TeamRoleCode>("admin")
  const [loadError, setLoadError] = React.useState("")
  const [managedMember, setManagedMember] = React.useState<AccountTeamMember | null>(null)
  const [managedRole, setManagedRole] = React.useState<TeamRoleCode>("editor")
  const [managedStatus, setManagedStatus] = React.useState<"unchanged" | "active" | "disabled">("unchanged")
  const [transferToUserId, setTransferToUserId] = React.useState("")
  const [savingMember, setSavingMember] = React.useState(false)

  const roles = team?.roles.length ? team.roles : defaultRoles
  const members = team?.members ?? []
  const activeMembers = members.filter((member) => member.status === "active").length
  const memberLimit = team?.memberLimit ?? null
  const projectCount = members.reduce((sum, member) => sum + member.projects, 0)
  const canManage = Boolean(team?.canManage)

  const loadTeam = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/account/team", { cache: "no-store" })
      const data = (await response.json()) as { team?: AccountTeam; error?: string }
      if (!response.ok || !data.team) {
        setLoadError(formatTeamError(data.error))
        return
      }
      setTeam(data.team)
      setLoadError("")
    } catch {
      setLoadError("团队资料读取失败，请检查网络后重试。")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadTeam(), 0)
    return () => window.clearTimeout(timer)
  }, [loadTeam])

  async function createMember() {
    if (!createEmail.trim()) {
      toast.error("请输入成员邮箱")
      return
    }

    if (!createPassword.trim()) {
      toast.error("请设置初始密码")
      return
    }

    setSavingCreate(true)
    try {
      const response = await fetch("/api/account/team", {
        body: JSON.stringify({
          email: createEmail,
          name: createName,
          password: createPassword,
          roleCode: createRole,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const data = (await response.json()) as { team?: AccountTeam; error?: string }
      if (!response.ok || !data.team) {
        toast.error(formatTeamError(data.error))
        return
      }

      setTeam(data.team)
      setCreateOpen(false)
      setCreateEmail("")
      setCreateName("")
      setCreatePassword("")
      setCreateRole("editor")
      toast.success("成员已创建")
    } catch {
      toast.error("成员创建失败，请检查网络后重试；填写的内容仍然保留。")
    } finally {
      setSavingCreate(false)
    }
  }

  function selectRole(role: TeamRoleCode) {
    setSelectedRole(role)
  }

  function openMemberSettings(member: AccountTeamMember) {
    setManagedMember(member)
    setManagedRole(member.roleCode)
    setManagedStatus("unchanged")
    setTransferToUserId("")
  }

  async function saveMemberSettings() {
    if (!managedMember || savingMember) return
    if (managedStatus === "disabled" && !transferToUserId) {
      toast.error("请选择接手项目的成员")
      return
    }
    setSavingMember(true)
    try {
      const response = await fetch(`/api/account/team/members/${encodeURIComponent(managedMember.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleCode: managedRole,
          ...(managedStatus !== "unchanged" ? { status: managedStatus } : {}),
          ...(managedStatus === "disabled" ? { transferToUserId } : {}),
        }),
      })
      const data = (await response.json()) as { team?: AccountTeam; error?: string }
      if (!response.ok || !data.team) {
        toast.error(formatTeamError(data.error))
        return
      }
      setTeam(data.team)
      setManagedMember(null)
      toast.success("成员设置已更新")
    } catch {
      toast.error("成员设置保存失败，请检查网络后重试。")
    } finally {
      setSavingMember(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">客户自身管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            管理自己企业的套餐、团队成员、角色权限和协作边界，不包含总平台账号和系统开关。
          </p>
        </div>
        <Button disabled={!canManage || loading} onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" />
          创建成员
        </Button>
      </div>

      {loadError ? <div role="alert" className="rounded-lg border p-4 text-sm"><p>{loadError}</p><Button className="mt-3" variant="outline" disabled={loading} onClick={() => void loadTeam()}>重新加载团队</Button></div> : null}

      {!canManage && !loading ? (
        <Card className="border-destructive/20 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive-strong">
            当前账号没有企业团队管理权限。客户主账号或拥有成员管理权限的账号才能创建成员、调整角色和查看团队席位。
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-2 md:grid-cols-4">
        <SummaryTile label="当前企业" value={team?.organization?.name ?? "未创建企业"} detail={team?.plan?.name ?? "暂无企业套餐"} />
        <UsageTile label="项目协作" current={projectCount} max={null} loading={loading} />
        <UsageTile label="成员席位" current={activeMembers} max={memberLimit} loading={loading} />
        <SummaryTile label="角色权限" value={`${roles.length} 类`} detail="覆盖销售、工程师、经理-老板角色" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">团队成员</CardTitle>
              <CardDescription>成员绑定角色，角色决定能看到和能操作的业务范围。</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>成员</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>项目</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.roleName || roleLabels[member.roleCode]}</Badge>
                      </TableCell>
                      <TableCell>{member.projects}</TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "default" : "secondary"}>
                          {formatMemberStatus(member.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => selectRole(member.roleCode)}>查看权限</Button>
                          {canManage && member.userId !== team?.organization?.ownerUserId ? <Button size="sm" variant="outline" onClick={() => openMemberSettings(member)}>管理成员</Button> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!members.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                        {loading ? "正在加载团队成员" : "暂无团队成员"}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">角色</CardTitle>
                <CardDescription>选择角色查看权限矩阵。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {roles.map((role) => (
                  <Button
                    key={role.code}
                    variant={selectedRole === role.code ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setSelectedRole(role.code)}
                  >
                    <ShieldCheck className="size-4" />
                    {role.name || roleLabels[role.code]}
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{roleLabels[selectedRole]}权限矩阵</CardTitle>
                <CardDescription>系统角色的基础权限。实际操作还受套餐、成员状态和项目授权限制。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {teamRolePermissionSummary(selectedRole).map(([label, permissions]) => (
                  <PermissionRow key={label} label={label} permissions={permissions} />
                ))}
              </CardContent>
            </Card>
          </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>创建成员</DialogTitle>
            <DialogDescription>直接创建企业成员账号，并为他分配初始角色和登录密码。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="member-name">姓名</Label>
              <Input id="member-name" value={createName} onChange={(event) => setCreateName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-email">邮箱</Label>
              <Input
                id="member-email"
                type="email"
                value={createEmail}
                onChange={(event) => setCreateEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-password">初始密码</Label>
              <Input
                id="member-password"
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>角色</Label>
              <Select value={createRole} onValueChange={(value) => setCreateRole(value as TeamRoleCode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.code} value={role.code}>
                      {role.name || roleLabels[role.code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button disabled={savingCreate} onClick={() => void createMember()}>
              <UserPlus className="size-4" />
              {savingCreate ? "创建中" : "创建成员"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={managedMember !== null} onOpenChange={(open) => { if (!open && !savingMember) setManagedMember(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>管理成员</DialogTitle><DialogDescription>{managedMember?.name || managedMember?.email}：调整角色或成员状态。停用时会一并交接其项目。</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="managed-member-role">角色</Label><Select value={managedRole} disabled={savingMember} onValueChange={(value) => setManagedRole(value as TeamRoleCode)}><SelectTrigger id="managed-member-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.code} value={role.code}>{role.name || roleLabels[role.code]}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="managed-member-status">成员状态</Label><Select value={managedStatus} disabled={savingMember} onValueChange={(value) => setManagedStatus(value as typeof managedStatus)}><SelectTrigger id="managed-member-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unchanged">保持当前状态（{managedMember ? formatMemberStatus(managedMember.status) : ""}）</SelectItem>{managedMember?.status !== "active" ? <SelectItem value="active">启用</SelectItem> : null}{managedMember?.status !== "disabled" ? <SelectItem value="disabled">停用并交接项目</SelectItem> : null}</SelectContent></Select></div>
            {managedStatus === "disabled" ? <div className="grid gap-2"><Label htmlFor="member-transfer">接手项目的成员</Label><Select value={transferToUserId} disabled={savingMember} onValueChange={setTransferToUserId}><SelectTrigger id="member-transfer" className="w-full"><SelectValue placeholder="请选择接手成员" /></SelectTrigger><SelectContent>{team?.organization && !members.some((member) => member.userId === team.organization!.ownerUserId && member.status === "active") ? <SelectItem value={team.organization.ownerUserId}>企业主账号</SelectItem> : null}{members.filter((member) => member.userId !== managedMember?.userId && member.status === "active").map((member) => <SelectItem key={member.userId} value={member.userId}>{member.name || member.email}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">停用后，该成员不能再访问企业项目；接手成员会获得相应项目权限。</p></div> : null}
          </div>
          <DialogFooter><Button variant="outline" disabled={savingMember} onClick={() => setManagedMember(null)}>取消</Button><Button disabled={savingMember || (managedStatus === "disabled" && !transferToUserId)} onClick={() => void saveMemberSettings()}>{savingMember ? "保存中" : "保存成员设置"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function SummaryTile({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <Card className="py-0">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold leading-6">{value}</div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

function UsageTile({ current, label, loading, max }: { current: number; label: string; loading: boolean; max: number | null }) {
  const unlimited = max === null
  const value = unlimited ? 28 : Math.min(100, Math.round((current / max) * 100))

  return (
    <Card className="py-0">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-semibold leading-6">
              {loading ? "-" : current} / {unlimited ? "不限" : max}
            </div>
          </div>
          <LockKeyhole className="size-4 text-muted-foreground" />
        </div>
        <Progress value={loading ? 0 : value} />
      </CardContent>
    </Card>
  )
}

function PermissionRow({ label, permissions }: { label: string; permissions: string[] }) {
  return (
    <div className="grid gap-3 rounded-lg bg-muted/40 p-3 lg:grid-cols-[120px_1fr] lg:items-center">
      <div className="font-medium">{label}</div>
      <div className="flex flex-wrap gap-2">
        {permissions.length > 0 ? (
          permissions.map((permission) => (
            <label key={permission} className="flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm">
              <Switch checked disabled size="sm" />
              {permission}
            </label>
          ))
        ) : (
          <Badge variant="outline">无权限</Badge>
        )}
      </div>
    </div>
  )
}

function formatMemberStatus(status: AccountTeamMember["status"]) {
  if (status === "active") return "已启用"
  if (status === "invited") return "待启用"
  if (status === "disabled") return "已停用"
  return "已移除"
}

function formatTeamError(error: string | undefined) {
  if (error === "NOT_AUTHENTICATED") return "请先登录"
  if (error === "ORGANIZATION_REQUIRED") return "当前账号尚未绑定企业，请联系企业负责人"
  if (error === "ORGANIZATION_NOT_FOUND") return "企业信息不存在，请联系管理员"
  if (error === "VALID_EMAIL_REQUIRED") return "请输入有效邮箱"
  if (error === "USER_ALREADY_EXISTS") return "该邮箱已注册，请换一个邮箱"
  if (error === "MEMBER_ALREADY_EXISTS") return "该成员已存在"
  if (error === "MEMBER_LIMIT_REACHED") return "成员席位已满"
  if (error === "ROLE_NOT_FOUND") return "角色不存在"
  if (error === "ROLE_PERMISSION_DENIED") return "当前账号无权管理团队"
  if (error === "TRANSFER_TARGET_REQUIRED") return "请选择接手项目的成员"
  if (error === "TRANSFER_TARGET_INVALID") return "接手成员已不可用，请重新选择"
  if (error === "OWNER_CANNOT_BE_DISABLED") return "企业主账号不能停用"
  if (error === "MEMBER_NOT_FOUND") return "成员已不存在，请重新加载团队"
  if (error === "INVALID_MEMBER_STATUS") return "成员状态无效，请重新选择"
  return error ?? "操作失败"
}
