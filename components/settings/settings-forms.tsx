"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BellRing,
  Camera,
  CreditCard,
  Save,
  User,
} from "lucide-react"
import { toast } from "sonner"

import { getInitials, notifyAccountProfileUpdated, useAccountProfile } from "@/components/account/use-account-profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ProfileSettingsForm() {
  const { error, loading, profile, reload, setProfile } = useAccountProfile()
  const [name, setName] = useState(profile.name)
  const [companyName, setCompanyName] = useState(profile.companyName ?? "")
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "")
  const [companyAvatarUrl, setCompanyAvatarUrl] = useState(profile.companyAvatarUrl ?? "")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<"avatar" | "company_logo" | null>(null)
  const canManageCompany = profile.isSuperAdmin || profile.permissions.includes("enterprise.manage_members")

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setName(profile.name)
      setCompanyName(profile.companyName ?? "")
      setAvatarUrl(profile.avatarUrl ?? "")
      setCompanyAvatarUrl(profile.companyAvatarUrl ?? "")
    }, 0)

    return () => window.clearTimeout(timer)
  }, [profile])

  async function uploadImage(file: File | null, kind: "avatar" | "company_logo") {
    if (!file || (kind === "company_logo" && !canManageCompany)) return
    setMessage("")
    setUploading(kind)

    const formData = new FormData()
    formData.set("file", file)
    formData.set("kind", kind)
    formData.set("entityId", profile.companyId || "current")

    try {
      const response = await fetch("/api/upload", {
        body: formData,
        method: "POST",
      })
      const data = (await response.json()) as { data?: { url: string }; error?: string }
      if (!response.ok || !data.data?.url) {
        setMessage(data.error ?? "上传失败，请重试")
        return
      }
      if (kind === "avatar") setAvatarUrl(data.data.url)
      else setCompanyAvatarUrl(data.data.url)
    } catch {
      setMessage("图片上传失败，请检查网络后重新选择图片。")
    } finally {
      setUploading(null)
    }
  }

  async function saveProfile() {
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/account/profile", {
        body: JSON.stringify({
          avatarUrl,
          name,
          ...(canManageCompany ? { companyAvatarUrl, companyName } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      })
      const data = (await response.json()) as { profile?: typeof profile; error?: string }
      if (!response.ok || !data.profile) {
        setMessage(data.error === "NAME_REQUIRED" ? "请填写显示名称" : data.error ?? "保存失败，请重试")
        return
      }
      setProfile(data.profile)
      notifyAccountProfileUpdated(data.profile)
      setMessage("资料已更新")
    } catch {
      setMessage("资料保存失败，请检查网络后重试；填写的内容仍在当前页面。")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="size-5" />
          资料
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-2xl gap-6" onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-4 sm:grid-cols-2">
            <AvatarUpload
              label="用户头像"
              name={name}
              url={avatarUrl}
              uploading={uploading === "avatar"}
              disabled={Boolean(error) || loading || saving || uploading !== null}
              onUpload={(file) => void uploadImage(file, "avatar")}
            />
            {canManageCompany ? <AvatarUpload
              label="左上角头像"
              name={companyName || name}
              url={companyAvatarUrl}
              uploading={uploading === "company_logo"}
              disabled={Boolean(error) || loading || saving || uploading !== null}
              onUpload={(file) => void uploadImage(file, "company_logo")}
            /> : null}
          </div>
          <Field label="显示名称" htmlFor="profile-name">
            <Input id="profile-name" disabled={Boolean(error) || loading || saving} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {canManageCompany ? <Field label="公司名称" htmlFor="profile-company">
            <Input id="profile-company" disabled={Boolean(error) || loading || saving} value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
          </Field> : null}
          {message ? <div className="text-sm text-muted-foreground">{message}</div> : null}
          {error ? <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button type="button" variant="outline" onClick={() => void reload()}>重新读取资料</Button></div> : null}
          <Button type="button" className="w-fit" disabled={Boolean(error) || loading || saving || uploading !== null} onClick={() => void saveProfile()}>
            <Save className="size-4" />
            {saving ? "保存中" : "保存资料"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function AccountSettingsForm() {
  function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    toast.success("账户设置已更新")
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            账户信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid max-w-2xl gap-6" onSubmit={saveSettings}>
            <Field label="姓名" htmlFor="account-name">
              <Input id="account-name" defaultValue="Lynn Liu" />
            </Field>
            <Field label="默认角色" htmlFor="account-role">
              <Select defaultValue="owner">
                <SelectTrigger id="account-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">经理-老板</SelectItem>
                  <SelectItem value="sales">销售</SelectItem>
                  <SelectItem value="engineer">工程师</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="系统语言" htmlFor="account-language">
              <Select defaultValue="zh-Hans">
                <SelectTrigger id="account-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-Hans">简体中文</SelectItem>
                  <SelectItem value="zh-Hant">繁体中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="时区" htmlFor="account-timezone">
              <Select defaultValue="Asia/Hong_Kong">
                <SelectTrigger id="account-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Hong_Kong">
                    Asia/Hong_Kong
                  </SelectItem>
                  <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <SaveButton>更新账户</SaveButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">账户状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusLine label="套餐" value="Team" />
          <StatusLine label="双重验证" value="未开启" muted />
          <StatusLine label="席位" value="5 / 20" />
          <StatusLine label="项目" value="3 个进行中" />
        </CardContent>
      </Card>
    </div>
  )
}

export function NotificationsSettingsForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-5" />
          通知设置
        </CardTitle>
      </CardHeader>
      <CardContent className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">当前尚未启用站内提醒、邮件或短信通知，项目变化可以在概览的“最近动态”中查看。</p>
        <p className="text-sm text-muted-foreground">通知发送接通后，再开放相应设置。</p>
        <Button asChild variant="outline"><Link href="/">查看最近动态</Link></Button>
      </CardContent>
    </Card>
  )
}

function AvatarUpload({
  label,
  name,
  onUpload,
  uploading,
  disabled,
  url,
}: {
  label: string
  name: string
  onUpload: (file: File | null) => void
  uploading: boolean
  disabled: boolean
  url: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-muted/40 p-4">
      <Avatar className="size-14">
        <AvatarImage src={url || undefined} alt={name} />
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        <Button asChild type="button" variant="outline" size="sm" className="w-fit" disabled={disabled}>
          <label>
            <Camera className="size-4" />
            {uploading ? "上传中" : "上传图片"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                onUpload(event.target.files?.[0] ?? null)
                event.target.value = ""
              }}
            />
          </label>
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function SaveButton({ children }: { children: ReactNode }) {
  return (
    <Button type="submit" className="w-fit">
      <Save className="size-4" />
      {children}
    </Button>
  )
}

function StatusLine({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>
        {value}
      </span>
    </div>
  )
}
