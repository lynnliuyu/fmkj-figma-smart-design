'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Eraser,
  FolderOpen,
  Maximize,
  MousePointer2,
  Move,
  Redo2,
  Save,
  SunMedium,
  Undo2,
} from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { isSupportedCadFile } from '@/lib/cad-formats'
import { registerLeaveGuard } from '@/lib/leave-guard'
import { cn } from '@/lib/utils'

/**
 * CAD 编辑预览（issue #178）。
 *
 * 上游：https://github.com/mlightcad/cad-viewer（MIT）。这里只用 MIT 的
 * `@mlightcad/cad-simple-viewer` DXF 链路：
 * - 文件在浏览器本地解析/渲染，**不上传**；
 * - 字体/模板/worker 全部同源自托管（/cad-data、/workers）；
 * - DWG 暂不支持：上游 DWG 解析依赖 libredwg（GPL-3.0）或商业授权解析器，
 *   本项目不引入 GPL 代码。DWG 入口会明确提示并拒绝。
 *
 * 这个组件只做「打开 → 查看/图层 → 几何编辑 → 保存 DXF 副本 → 重开」，
 * 不接项目点位图流程，属于隔离预览。
 */

type ViewerModule = typeof import('@mlightcad/cad-simple-viewer')

type CadState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  fileName: string | null
  layers: number | null
  dirty: boolean
  error: string | null
}

const CAD_DATA_BASE = '/cad-data/'
const SAMPLE_URL = `${CAD_DATA_BASE}samples/demo-plan.dxf`
const WORKER_URL = '/workers/mtext-renderer-worker.js'

const initialState: CadState = {
  status: 'idle',
  fileName: null,
  layers: null,
  dirty: false,
  error: null,
}

export function CadEditor() {
  const hostRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modRef = useRef<ViewerModule | null>(null)
  const managerRef = useRef<import('@mlightcad/cad-simple-viewer').AcApDocManager | null>(null)
  const dirtyRef = useRef(false)
  const [state, setState] = useState<CadState>(initialState)
  const [initError, setInitError] = useState<string | null>(null)

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
    setState((s) => ({ ...s, dirty }))
  }, [])

  const syncLayers = useCallback(() => {
    try {
      const doc = managerRef.current?.curDocument
      const layers = doc?.layerService?.getLayerSummaries?.().length ?? null
      setState((s) => ({ ...s, layers }))
    } catch {
      // 图层服务还没准备好时不阻断主流程
    }
  }, [])

  const openBytes = useCallback(
    async (fileName: string, bytes: ArrayBuffer) => {
      const mod = modRef.current
      const manager = managerRef.current
      if (!mod || !manager) throw new Error('CAD 引擎还没有就绪')
      if (!isSupportedCadFile(fileName)) {
        throw new Error('目前只支持可编辑的 DXF；DWG 解析器涉及 GPL/商业授权，暂不启用')
      }
      setState((s) => ({ ...s, status: 'loading', error: null }))
      const ok = await manager.openDocument(fileName, bytes, {
        mode: mod.AcEdOpenMode.Write,
        // Write 模式默认恢复图纸保存视图；样例没有保存视图，显式缩放到范围。
        openViewMode: mod.AcApOpenViewMode.Extents,
      })
      if (!ok) throw new Error('文件解析失败：请确认是有效的 DXF')
      // 模型空间默认黑底；切换到白底（与页面/打印一致）。已白底时不再切换。
      try {
        const bg = mod.readLayoutBackgroundColor(manager.curDocument.database, true)
        if (bg !== 0xffffff) manager.sendStringToExecute('switchbg')
      } catch {
        // 背景切换失败不影响打开
      }
      setState((s) => ({ ...s, status: 'ready', fileName, error: null, dirty: false }))
      dirtyRef.current = false
      syncLayers()
    },
    [syncLayers],
  )

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch(SAMPLE_URL)
      if (!res.ok) throw new Error(`样例加载失败（HTTP ${res.status}）`)
      await openBytes('demo-plan.dxf', await res.arrayBuffer())
    } catch (e) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  }, [openBytes])

  // 初始化引擎（客户端动态 import；worker/字体均同源）
  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return
    ;(async () => {
      try {
        const mod = await import('@mlightcad/cad-simple-viewer')
        if (cancelled) return
        modRef.current = mod
        mod.AcApI18n.setCurrentLocale('zh')
        mod.acedApplyUiTheme('light', host)
        const existing = mod.AcApDocManager.tryGetInstance()
        if (existing) await existing.destroy()
        const manager = mod.AcApDocManager.createInstance({
          container: host,
          autoResize: true,
          baseUrl: `${window.location.origin}${CAD_DATA_BASE}`,
          webworkerFileUrls: { mtextRender: `${window.location.origin}${WORKER_URL}` },
          builtinOpenFileDialog: false,
          notificationCenter: false,
        })
        if (!manager) throw new Error('CAD 引擎初始化失败')
        managerRef.current = manager
        // 仅开发/测试环境暴露引擎句柄，便于 e2e 断言实体数量；生产构建不挂。
        if (process.env.NODE_ENV !== 'production') {
          ;(window as unknown as { __cad?: unknown }).__cad = { manager, module: mod }
        }
        setState((s) => ({ ...s, status: 'idle' }))

        // 编辑提交事件：用于未保存提示（不依赖具体命令实现）
        mod.eventBus.on('session-db-edit-committed', () => {
          dirtyRef.current = true
          setState((s) => ({ ...s, dirty: true }))
        })
        mod.eventBus.on('failed-to-open-file', (e: { errorMessage?: string }) => {
          setState((s) => ({
            ...s,
            status: 'error',
            error: e?.errorMessage || '文件解析失败',
          }))
        })
      } catch (e) {
        if (!cancelled) setInitError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      const manager = managerRef.current
      managerRef.current = null
      if (manager) void manager.destroy().catch(() => {})
    }
  }, [])

  // 未保存提示：关页/刷新 + 站内跳转守卫
  useEffect(() => {
    if (!state.dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    const release = registerLeaveGuard(() => window.confirm('CAD 图纸还没有保存副本，确定离开吗？'))
    return () => {
      window.removeEventListener('beforeunload', warn)
      release()
    }
  }, [state.dirty])

  const runCommand = (command: string) => {
    managerRef.current?.sendStringToExecute(command)
  }

  const saveDxf = () => {
    const mod = modRef.current
    if (!mod || !managerRef.current?.curDocument) return
    new mod.AcApDxfConvertor().convert()
    setDirty(false)
  }

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    try {
      await openBytes(file.name, await file.arrayBuffer())
    } catch (e) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      }))
    }
  }

  return (
    <div className="flex w-full flex-col gap-3" data-slot="cad-editor">
      <Banner
        status="info"
        title="预览版 · 图纸只在浏览器本地处理"
        description="不会上传到服务器，也不会外发。支持 DXF 的打开、图层、几何编辑与保存副本；DWG 因上游解析器许可证（GPL-3.0 / 商业授权）暂未启用。"
      />

      {initError ? (
        <Banner status="error" title="CAD 引擎加载失败" description={initError} />
      ) : null}
      {state.error ? (
        <Banner status="error" title="图纸加载/处理失败" description={state.error} />
      ) : null}

      <Card padding={0} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
          <Button
            size="sm"
            variant="secondary"
            label="打开样例 DXF"
            icon={<FolderOpen />}
            onClick={() => void loadSample()}
            data-action="open-sample"
          />
          <Button
            size="sm"
            variant="secondary"
            label="打开本地 DXF"
            icon={<FolderOpen />}
            onClick={() => fileInputRef.current?.click()}
            data-action="open-file"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".dxf"
            className="hidden"
            data-slot="cad-file-input"
            onChange={(e) => {
              void onPickFile(e.target.files?.[0])
              e.currentTarget.value = ''
            }}
          />

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          <IconButton label="选择" icon={<MousePointer2 />} onClick={() => runCommand('select')} />
          <IconButton label="平移" icon={<MousePointer2 />} onClick={() => runCommand('pan')} />
          <IconButton
            label="缩放到范围"
            icon={<Maximize />}
            onClick={() => runCommand('zoom\nextents')}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <IconButton
            label="移动选中对象"
            icon={<Move />}
            onClick={() => runCommand('move')}
            data-action="move"
          />
          <IconButton
            label="删除选中对象"
            icon={<Eraser />}
            onClick={() => runCommand('erase')}
            data-action="erase"
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <IconButton
            label="切换画布背景"
            icon={<SunMedium />}
            onClick={() => runCommand('switchbg')}
            data-action="switch-bg"
          />
          <IconButton label="撤销" icon={<Undo2 />} onClick={() => runCommand('undo')} />
          <IconButton label="重做" icon={<Redo2 />} onClick={() => runCommand('redo')} />

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="primary"
              label="保存 DXF 副本"
              icon={<Save />}
              onClick={saveDxf}
              isDisabled={!state.fileName || state.status !== 'ready'}
              data-action="save-dxf"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          <span data-slot="cad-file">{state.fileName ?? '未打开文件'}</span>
          <span data-slot="cad-layers">
            {state.layers == null ? '图层 —' : `图层 ${state.layers}`}
          </span>
          <span data-slot="cad-dirty" className={cn(state.dirty && 'text-warning-foreground')}>
            {state.dirty ? '有未保存修改' : '已同步'}
          </span>
          <span className="ml-auto">输入格式：DXF（可编辑）· 输出：DXF 副本</span>
        </div>

        <div className="relative h-[min(70vh,760px)] w-full bg-white">
          <div ref={hostRef} className="h-full w-full" data-slot="cad-canvas" />
          {state.status === 'loading' ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 text-sm">
              正在解析图纸…
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
