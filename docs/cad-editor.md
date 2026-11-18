# CAD 编辑预览（issue #178）

> 入口：能力中心 → 工具 →「CAD 编辑（预览）」，或直接打开 `/capabilities/cad`。
> 前提：已登录工作区。图纸只在当前浏览器里处理，**不上传、不外发**。

## 1. 上游与许可证（2026-11 核对）

上游：<https://github.com/mlightcad/cad-viewer>（浏览器端 DWG/DXF 查看与编辑，无需后端）。

| 包 / 资源                                        | 版本（本项目锁定） | 许可证                  | 用途                                                |
| ------------------------------------------------ | ------------------ | ----------------------- | --------------------------------------------------- |
| `@mlightcad/cad-simple-viewer`                   | 1.7.8              | MIT                     | 核心查看/编辑引擎（我们只用它 + 自建 React 工具栏） |
| `@mlightcad/data-model`                          | 1.15.21            | MIT                     | 图纸数据模型（含 DXF 写出 `dxfOut`）                |
| `@mlightcad/three-renderer`                      | 1.7.8              | MIT                     | THREE.js 渲染                                       |
| `@mlightcad/mtext-renderer` / `mtext-parser`     | 0.13.7 / 1.5.7     | MIT                     | 文字渲染（worker）                                  |
| `lodash-es`                                      | 4.17.21            | MIT                     | 上游 peer 依赖                                      |
| `@mlightcad/cad-editor`                          | 1.8.0-preview      | MIT                     | Vue 3 完整编辑器组件；本项目是 React，**未使用**    |
| `@mlightcad/libredwg-converter` / `libredwg-web` | —                  | **GPL-3.0**             | DWG 解析（开源方案）——**未引入**                    |
| `@mlightcad/dwg-converter`                       | —                  | 商业授权（$3,000 永久） | DWG 解析（闭源方案）——**未引入**                    |

**结论：只开放 DXF。** 上游默认就不注册 DWG 解析器（`AcApWebworkerFiles.dwgWebParser` 注释明确说明 LibreDWG 是 GPL）；接入 DWG 要么把 GPL-3.0 代码带进产物，要么购买商业授权。两者都需要产品/法务决策，不属于本次范围。

参考：上游 `PROPRIETARY-PARSER.zh-CN.md`、`packages/cad-simple-viewer/src/app/AcApDocManager.ts`（worker 说明）、Next.js 官方示例 <https://github.com/mlightcad/cad-viewer-nextjs-demo>（`components/LiveViewer.tsx`、`scripts/copy-workers.mjs`、`scripts/sync-cad-data.mjs`）。

## 2. 格式支持边界（实测）

| 方向 | 格式                                                | 状态                                                    |
| ---- | --------------------------------------------------- | ------------------------------------------------------- |
| 输入 | DXF（R12/AC1009 样例实测；上游支持更广的 DXF 版本） | ✅ 打开、缩放、图层、编辑                               |
| 输入 | DWG                                                 | ❌ 明确拒绝并提示（许可证边界）                         |
| 输出 | DXF 副本（`AcApDxfConvertor` → `database.dxfOut`）  | ✅ 下载后可重新打开                                     |
| 输出 | DWG                                                 | ❌ 不支持                                               |
| 编辑 | 选择、平移、缩放到范围、移动、删除、撤销/重做       | ✅（命令由上游提供）                                    |
| 编辑 | 圆/文字等细线实体                                   | 可选中，但需要点在描边/字形上；本验证用直线做确定性断言 |

已知上游限制（未绕过）：复杂实体（部分 DIMENSION/HATCH/外部参照）可能只渲染、不参与编辑；没有服务端预渲染（`cad-html-exporter` / `cad-pdf-exporter` 是另外的服务端包）；没有「另存为 DWG」。

## 3. 自托管资源（无第三方 CDN）

| 路径                                                          | 来源                                    | 说明                                                                   |
| ------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `public/workers/mtext-renderer-worker.js`                     | 上游包 `dist/`                          | 文字/MTEXT 解析 worker（1.43MB）。`node scripts/cad-assets.mjs` 可刷新 |
| `public/cad-data/fonts/fonts.json` + `txt/simplex/romans.shx` | <https://github.com/mlightcad/cad-data> | 字体清单与常用 SHX（按需加载）                                         |
| `public/cad-data/templates/acad.dxf`                          | 同上                                    | 新建图纸模板（QNew 用；本期不开放新建）                                |
| `public/cad-data/samples/demo-plan.dxf`                       | `node scripts/make-cad-sample.mjs`      | 完全合成的户型样例（12m×8m、3 图层、6 线/2 圆/3 文字）                 |

`baseUrl` 指向同源 `/cad-data/`，worker 指向同源 `/workers/`；CSP 的 `worker-src 'self' blob:` 已允许。验证脚本会记录所有外部请求，实测为 **0**。

## 4. 隔离预览做法

- 独立路由 `/capabilities/cad`，不接项目点位图/报价流程；不新增 Payload 集合；不写服务器。
- 插件登记为 `cad-editor`（tool / design），能力中心卡片 → 详情页 →「打开 CAD 编辑器」。
- 未保存提示：编辑提交事件置脏 → `beforeunload` + 站内 `registerLeaveGuard` 双重提醒。
- 加载错误：非法文件/解析失败走页面 Banner；DWG 明确拒绝。
- 已知非目标：多文件管理、云端保存、协作、把 CAD 点位导入点位图。

## 5. 验证（真实浏览器，本机）

```
node scripts/cad-assets.mjs            # 需要时刷新 worker
node scripts/make-cad-sample.mjs       # 重新生成合成样例
SMOKE_BASE=http://127.0.0.1:3001 node e2e/issue178-cad.mjs
```

> 测试用开发句柄：`cad-editor` 在 `NODE_ENV !== 'production'` 时把引擎挂到 `window.__cad`，
> 便于 e2e 读取实体数/图层与做坐标映射；生产构建不会挂载。

e2e 覆盖（全部通过，console 错误 0，外部请求 0）：

1. 能力中心出现「CAD 编辑（预览）」卡片
2. 详情页「打开 CAD 编辑器」跳转正确
3. 打开合成 DXF（图层 4）
4. 缩放到范围
5. 点选顶部外墙线 → 删除 → 出现「有未保存修改」
6. 保存 DXF 副本：`LINE 6→5`、`CIRCLE 2`、`TEXT 3`
7. 用保存的副本重新打开：文件名/图层保留（保存副本 `LINE 6`、`CIRCLE 1`、`TEXT 3`）
8. 非法 DXF → 错误 Banner
9. DWG → 明确拒绝（许可证）
10. 脏状态点侧栏跳转 → 出现未保存确认
11. 录屏与逐步截图（`.export-artifacts/issue178/`）

## 6. 升级 / 维护

1. `pnpm add @mlightcad/cad-simple-viewer@<v> @mlightcad/data-model@<peer> @mlightcad/three-renderer@<peer> @mlightcad/mtext-renderer@<peer> @mlightcad/mtext-parser@<peer>`
   （按 `cad-simple-viewer` 的 peerDependencies 成套升级，不要只升一个）
2. `node scripts/cad-assets.mjs` 刷新 worker
3. 重跑第 5 节 e2e；若上游命令/API 变更，先看 `pnpm exec astryx`…（不适用）——直接看包内 `lib/*.d.ts` 与官方 Next.js 示例
4. 若未来要开 DWG：先做许可证决策（GPL 或商业授权），单独 PR，并同步文档与入口提示。
