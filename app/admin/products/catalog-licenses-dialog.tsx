"use client"

import * as React from "react"
import { KeyRound, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type License = {
  id: string
  enabled: boolean
  instanceId: string | null
  keyPrefix: string
  label: string
  lastSeenAt: string | null
  note: string | null
}

/**
 * 设备凭据（一机一密）：每台客户设备一份取资料凭据。
 *
 * 明文只在创建时显示一次（库里只存哈希），所以这里要提醒运营方立刻复制走。
 * 停用而不是删除：能看出这台设备曾经存在过、什么时候最后取过资料。
 */
export function CatalogLicensesDialog() {
  const [open, setOpen] = React.useState(false)
  const [licenses, setLicenses] = React.useState<License[]>([])
  const [message, setMessage] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [freshKey, setFreshKey] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const lifecycle = React.useRef(0)
  const requestId = React.useRef(0)

  async function load() {
    const epoch = lifecycle.current
    const request = ++requestId.current
    setLoading(true)
    try {
      const response = await fetch("/api/admin/catalog-licenses", { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !Array.isArray(data.licenses)) throw new Error(String(data?.message ?? data?.error ?? "凭据列表读取失败，请重试"))
      if (epoch !== lifecycle.current || request !== requestId.current) return false
      setLicenses(data.licenses as License[])
      setLoaded(true)
      return true
    } catch (error) {
      if (epoch === lifecycle.current && request === requestId.current) setMessage(error instanceof Error ? error.message : "凭据列表读取失败，请重试")
      return false
    } finally {
      if (epoch === lifecycle.current && request === requestId.current) setLoading(false)
    }
  }

  async function call(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const epoch = lifecycle.current
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/admin/catalog-licenses", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(data?.message ?? data?.error ?? "操作失败"))
      if (epoch !== lifecycle.current) return false
      if (method === "POST") {
        if (typeof data.key !== "string" || !data.key) throw new Error("服务器没有返回新凭据，请先刷新列表核对，避免重复创建")
        setFreshKey(data.key)
      }
      const refreshed = await load()
      if (epoch !== lifecycle.current) return false
      setMessage(`${method === "POST" ? "已创建，请把上面的凭据填进设备" : "凭据状态已更新"}${refreshed ? "" : "；列表刷新失败，请点“重新读取”重试"}`)
      return true
    } catch (error) {
      if (epoch === lifecycle.current) setMessage(error instanceof Error ? error.message : "操作失败，请稍后重试")
      return false
    } finally {
      if (epoch === lifecycle.current) setBusy(false)
    }
  }

  async function copyFreshKey() {
    const epoch = lifecycle.current
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(freshKey)
      if (epoch === lifecycle.current) setMessage("已复制到剪贴板")
    } catch {
      if (epoch === lifecycle.current) setMessage("未能自动复制，请选中上面的凭据手动复制保存。")
    }
  }

  return (
    <Dialog onOpenChange={(next) => {
      // 创建中的凭据只返回一次，不能关闭窗口后丢掉它的唯一明文。
      if (!next && busy) return
      lifecycle.current += 1
      setOpen(next)
      setMessage("")
      setLoading(false)
      if (next) { setLoaded(false); setLicenses([]); void load() }
      else setFreshKey("")
    }} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline"><KeyRound /> 设备凭据</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>设备凭据（一机一密）</DialogTitle>
          <DialogDescription>
            每台客户设备一份取资料凭据。填进设备的 LICENSE_KEY 后，它就能取官方资料。
            明文只在创建时显示一次（库房只存哈希），请立刻复制走；设备不用了就停用它。
          </DialogDescription>
        </DialogHeader>

        {message ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p> : null}

        {freshKey ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
            <div className="mb-1 font-medium">新凭据（只显示这一次，请复制保存）</div>
            <code className="block break-all rounded bg-background px-2 py-1 text-xs">{freshKey}</code>
            <Button className="mt-2" size="sm" variant="outline" onClick={() => void copyFreshKey()}>复制</Button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input disabled={busy} placeholder="这台设备是谁在用，例如 张先生家 / 展厅机" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Button
            disabled={busy}
            onClick={async () => {
              if (!label.trim()) return setMessage("请填一个名字，方便日后分辨是哪台设备")
              if (await call("POST", { label })) setLabel("")
            }}
            type="button"
          >
            <Plus /> 新建凭据
          </Button>
        </div>

        <div className="space-y-2">
          <Button disabled={busy || loading} onClick={() => { setMessage(""); void load() }} size="sm" variant="outline">{loading ? "正在读取…" : "重新读取"}</Button>
          {loaded && licenses.length === 0 ? <p className="text-sm text-muted-foreground">还没有设备凭据。</p> : null}
          {licenses.map((license) => (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" key={license.id}>
              <div>
                <div className="font-medium">
                  {license.label}
                  {license.enabled ? null : <span className="ml-2 text-xs text-muted-foreground">已停用</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {license.keyPrefix}… · 最后取用：{license.lastSeenAt ? new Date(license.lastSeenAt).toLocaleString("zh-CN") : "从未"}
                  {license.instanceId ? ` · 设备标识 ${license.instanceId.slice(0, 12)}` : ""}
                </div>
              </div>
              <Button
                disabled={busy}
                onClick={() => void call("PATCH", { enabled: !license.enabled, id: license.id })}
                size="sm"
                type="button"
                variant="outline"
              >
                {license.enabled ? "停用" : "启用"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
