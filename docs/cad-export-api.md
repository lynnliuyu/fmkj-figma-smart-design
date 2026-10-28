# CADCraft 快速导出接口

这是供可信后端或本机工具调用的独立 HTTP 服务。Mac / Linux 无需打开 CADCraft 桌面窗口；服务调用同一份 `export-cad-review.mjs`，不另建图纸导出逻辑。另提供本机上传与导出测试网页。Next.js 客户项目的图片上传入口保持原行为；此工具尚未部署到远程服务器。

## 本机网页试用

在仓库根目录运行 `pnpm run cad:web`，访问 **http://127.0.0.1:4318/**。启动器自动查找已安装的 CADCraft CLI（包括下载目录解压包）、Poppler、带 pypdf / ezdxf / PyMuPDF 的 Python；尊重下面的显式环境变量配置，缺少依赖时说明原因。本机已有的 Codex 运行时和 `.local/cad-review/python-tools` 也在查找范围。

页面支持选择 / 拖入 CAD、添加内置合成样例、选择配色、查看当前阶段和实际用时、按图名筛选、预览 PNG、下载逐页 PDF / PNG 与全部图纸 PDF。刷新可恢复最近一个任务。计时展示上传、排队、导出与总用时；原色模式跳过阅读配色处理，不能据此认定所有图纸一定更快。

“导出范围”可明确选择整份原图，或指定原始布局名称并跳过总览。例如填写 `平面图` 只导出该布局中的识别图框，不包括 Model 历史方案及立面图。结果与警告会标明范围；页面下方“显示图纸”的筛选仅改变显示，不缩短渲染耗时。

网页模式只允许监听回环地址。首页通过 HttpOnly / SameSite=Strict Cookie 建立临时本机会话，服务端令牌不发送到页面；写请求校验同源 Origin，并校验 Host 与实际监听端口，防止其他网站借用本机服务。普通 `cad:api` 模式仍使用 Bearer Token，不默认开放网页会话。网页会话不能用于对外多客户服务。

2026-10-21 在真实浏览器跑通内置 DXF：约 0.02 MB、3 个图框、2 张总览，共 5 页，白底深色及原色导出本次总用时 **2.5 秒**；最终回归同一小图为 1.9 秒、5 页预览均加载成功；这些是小样本实测，不能外推大型施工 DWG。相关 35 项 Vitest 测试、类型检查通过；另有 6 项 Python 回归通过；检查了桌面和 390px 移动端，页面无横向溢出。方案研究见[技术比较与 GitHub 源码](reports/2026-10-21-cad-export-options.md)。

使用流程：上传 DWG / DXF → 获得任务 ID → 轮询状态 → 下载 PDF / PNG。默认保留 Model 与所有布局总览、可识别图框、原图来源 SHA-256 和需复核事项；保留重复方案。显式指定布局时只输出该范围，保留全图 `inventory` 与原页号，不能将其表述为整份原图已导出。`category` 是基于原图标题的 `layout` / `lighting` / `switch` / `other`，不能保证识别全部平面图；未识别或特殊图框请查总览。结果不是项目固定交付版本，不自动写入项目、报价或数据库。

## 启动

依赖 Node.js 24+、本机 CADCraft CLI、Poppler（`pdftoppm`）和 Python 3。当前真实验收使用 CADCraft CLI 0.5.0；官网较新版本须先用自己的图纸验收兼容性。

在仓库根目录运行（环境变量只配置在服务端）：

```sh
python3 -m venv .local/cad-api-venv
.local/cad-api-venv/bin/python -m pip install -r scripts/cadcraft/api-requirements.txt

export CAD_EXPORT_API_TOKEN="$(openssl rand -hex 32)"
export CADCRAFT_CLI='/absolute/path/to/cadcraft-cli'
export CAD_REVIEW_PYTHON="$PWD/.local/cad-api-venv/bin/python"
# pdftoppm 已在 PATH 时不需要设置：
# export PDFTOPPM='/absolute/path/to/pdftoppm'
pnpm run cad:api
```

Linux 还需安装中文字体，并配置其真实路径；例如安装 `fonts-noto-cjk` 后，在启动前设置：

```sh
export CAD_REVIEW_FALLBACK_FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
export CADCRAFT_FONTALT='Noto Sans CJK SC'
export CADCRAFT_FONTFALLBACK='Noto Sans CJK SC'
```

`CAD_REVIEW_FALLBACK_FONT` 用于保留 XCLIP 的渲染路径，`CADCRAFT_FONT*` 用于 CADCraft 原生渲染。字体文件需实际存在，否则带裁剪图纸会失败。服务账号需能执行依赖、读取字体、写数据目录；Linux 运行不需要图形桌面。本轮没有在 Linux 主机实测。

默认监听 `127.0.0.1:4318`。如需让设计站调用，可在 Linux 长驻进程中运行，由设计站服务端转发。对外提供时应通过 HTTPS 网关；共享令牌表示同一个可信调用方，持有令牌即可读取 / 删除该服务所有任务，不能作为多客户隔离机制。不要把令牌放进浏览器、URL 或版本库。

## 调用

普通 API 模式下，所有端点，包括健康检查和下载，都使用 `Authorization: Bearer ...`；不接受 URL 密钥，也不启用跨域浏览器调用。上面的本机网页模式另外支持受限的同源会话。示例中的 `$CAD_EXPORT_API_TOKEN` 与启动服务时一致。

1. 上传原始文件字节，不是 multipart 表单：

```sh
curl --fail-with-body -X POST \
  'http://127.0.0.1:4318/v1/exports?filename=input.dwg&colorMode=readable' \
  -H "Authorization: Bearer $CAD_EXPORT_API_TOKEN" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary '@/absolute/path/to/input.dwg'
```

`filename` 必填，支持 URL 编码的中文文件名，只能是文件名，不能包含路径。`colorMode` 可省略，默认 `readable`（白底深色，另存原色）；也支持 `original`。不接受客户端指定命令、CLI 路径、源文件路径或输出目录。

可选 `space=原始布局名` 精确指定布局；`overviews=skip` 跳过总览，默认 `include`。布局名必须与原 CAD 一致。限定导出会返回全图 `inventory`、`selection` 和范围警告，页号按全图识别顺序保留。找不到布局或限定范围没有图框时失败，不返回假成功。

成功立即返回 HTTP **202** 和 `Location`，例如：

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "filename": "input.dwg",
  "status": "queued",
  "colorMode": "readable",
  "createdAt": "2026-10-21T00:00:00.000Z",
  "statusUrl": "/v1/exports/10000000-0000-4000-8000-000000000001"
}
```

2. 每隔 2–5 秒查询 `statusUrl`：

```sh
curl --fail-with-body \
  'http://127.0.0.1:4318/v1/exports/替换为返回的任务ID' \
  -H "Authorization: Bearer $CAD_EXPORT_API_TOKEN"
```

`status` 依次为 `queued`、`running`、`succeeded` 或 `failed`。`running` 的 `progress` 提供阶段说明；不提供虚构的百分比。`failed` 的错误摘要供调用方展示，具体原因记录在服务日志。失败任务不能下载半成品。

成功时 `result` 包含：

| 字段 | 含义 |
| --- | --- |
| `completeness` | 固定为 `requires-human-review`，导出成功不代表原图完整性确认 |
| `sourceSha256` | 上传文件的 SHA-256 |
| `overviewCount` / `sheetCount` | 空间总览数 / 已识别图框数 |
| `warnings` | 未识别图框等需复核事项 |
| `pages[]` | 每页的 ID、空间、原始图名、分类、警告、PDF / PNG 下载地址，以及 `displayName`（界面显示名）和 `fileNames`（下载文件名，按图号-图名） |
| `pages[].originalPdfUrl` / `originalPngUrl` | CAD 原色单页地址（`colorMode=readable` 时才有） |
| `files[]` | 全部可下载文件名与地址，包括清单、对照 HTML、原色文件及已生成的合并 PDF |

如只展示平面布置图，按 `result.pages[].category === "layout"` 筛选，同时保留“查看全部原图”的入口。单页警告在 `pages[].warning`，不能只显示顶层 `warnings`。

3. 从 `pdfUrl`、`pngUrl` 或 `files[].url` 下载，仍携带同一令牌：

```sh
curl --fail-with-body \
  'http://127.0.0.1:4318/v1/exports/替换为任务ID/files/all-pages.pdf' \
  -H "Authorization: Bearer $CAD_EXPORT_API_TOKEN" \
  -o all-pages.pdf
```

只有 `files[]` 中的文件可下载，地址均相对于服务根路径。HTML 作为附件下载；需要离线对照时把 HTML、清单和图片 / PDF 一起下载到同一目录。本接口不提供带 URL 密钥的公开预览链接或 ZIP。

## 图框识别与图名（2026-10-21 修正）

真实图纸不一定把图框放在名为“图框”的图层上，图名也不一定在图框内部的文字里。识别规则现为：

1. **布局（图纸空间）**：图框由“包住视口的块”确定，与图层名无关。
2. **Model（模型空间）**：按顺序尝试
   - 图层名含 `图框 / frame / border` 的插入块；
   - 通用图层（`0`、`Defpoints`）上、尺寸属于 A0–A4 长宽比（±2%）、且**自身带图名文字或图名标注块**的插入块。

   尺寸按**图纸单位的长宽比**判断，不假定 1 单位 = 1mm。出图比例 1:80、1 单位≈28mm 的图纸同样能识别。同一张图纸里反复出现的那个尺寸才算图框尺寸，图例、家具、嵌套块不会单独成页。
3. **图名**来源优先级：
   - 图名标注块（`B-1.图名标注` 一类，图名存在块属性 `图名1 / 图名 / TITLE`，编号存在 `编号 / 图号`）——优先取 `图名1`；标注块常贴在图框角上，按“离图框角最近”配对；
   - 图框图层内的文字；
   - 图框底部标题带里最大的文字。

   取到图名时只显示“编号 + 图名”（如 `PM-13 富二楼平面布置图`），不再混入房间名等图内文字。

不保证识别全部平面图；未识别的图框仍留在总览和 `inventory` 里。`manifest.deferred` 只在使用页面筛选（`pageFilter`）时记录被跳过的页。

### 实测（保利天瑞23栋103平面+吊顶10.3.dwg，1,521,952 字节）

修正前：识别 0 张图框，只导出 2 张总览，图名标注为空。修正后经真实 HTTP 接口与网页会话各导出一次，结果一致：

- **8 张逐页图框**，`overviews=skip`，端到端 18.5 秒（容器）/ 23.1 秒（网页会话）；
- 图名：`PM-15 富二楼顶面布置图`、`YS-02 富一楼原始结构图`、`PM-13 富二楼平面布置图`、`PM-14 富二楼平面布置尺寸图`、`YS-02 富一楼原始结构图`、`PM-19 富一楼平面布置图`、`PM-20 富一楼平面布置尺寸图`、`PM-21 富一楼顶面布置图`；
- 合并 PDF 8 页 8 个书签；`page-002` 与 `page-005` 逐像素相同，是原图里画了两份，不是重复导出；
- Linux 容器与本机渲染同一页的平均通道差 0.95/255、超 32 的像素不足 1%、墨量比 1.005–1.018，差异来自 Noto CJK 替代字体，仍需人工核对。

## 单张交付整理（图片 / PDF）

导出目录里每张图本来就有独立文件，但文件名是 `page-021.png` 这类页号。整理成客户可直接使用的形式：

```bash
pnpm run cad:package -- --dir <导出目录> --out <交付目录> [--modes png,pdf,page-zip,set,csv]
```

| 方式 | 产物 | 适用 |
| --- | --- | --- |
| `png` | `单页图片/PM-13-富二楼平面布置图.png` | 微信 / 沟通看图；原色版加 `-原色` |
| `pdf` | `单页PDF/PM-13-富二楼平面布置图.pdf` | 打印、审图、单张发客户 |
| `page-zip` | `单页压缩包/PM-13-富二楼平面布置图.zip` | 每张图一个包（内含该页 PNG + PDF 两种配色），逐个发送 |
| `set` | `整套/全部图纸-合并.pdf`、`全部图纸-图片.zip`、`全部图纸-PDF.zip` | 整套交付 |
| `csv` | `清单.csv`（图号、图名、页号、文件名、来源） | 核对与归档，带 BOM，Excel 直接打开不乱码 |

要点：

- 文件按**图号-图名**命名，图号取图签块属性；图名与图号在同一标签里（`PM-15 富二楼顶面布置图`）或分开成两个标签（`P-09` + `灯具定位图`）都能识别。
- **原图重复的图纸不去重**，各自成文件，重名加页号（`YS-02-富一楼原始结构图-page-005.pdf`），绝不覆盖。
- 只读取导出目录，不改动原始导出文件。
### 接口方式（已接入，推荐）

导出完成后接口本身就按图号返回，不需要再打包：

- `result.pages[].displayName`：界面显示名，如 `PM-13 富二楼平面布置图`（列表直接用它，不再显示 `page-003`）。
- `result.pages[].fileNames`：下载文件名，如 `PM-13-富二楼平面布置图.pdf` / `-原色.png`；重名页自动加页号。
- `result.pages[].originalPdfUrl` / `originalPngUrl`：原色单页地址。
- 下载时响应头带 `Content-Disposition`，中文名走 RFC 5987（`filename*=UTF-8''…`），并保留 ASCII 回退名，因此浏览器“另存为”得到的是图号名。
- PNG 默认 `inline` 便于页面预览；需要强制下载加 `?download=1`，例如
  `/v1/exports/<id>/files/page-003.png?download=1`。
- 磁盘上的文件名仍是 `page-003.png`，索引与渲染逻辑不变；图名只在下载名与清单里出现，避免中文文件名带来的路径风险。

注意：`curl -OJ` 只认 ASCII 回退名（curl 的历史限制），要拿到中文名请用浏览器或读 `filename*`。图名来自图纸文字，属于不可信输入，服务端会清掉引号、换行、路径分隔符并限制长度后再写响应头。
- 只有识别到逐页图框时才能整理；整份图没有识别出图框会明确报错，不产出空目录。

ZIP 由 Node 内置 zlib 直接生成，不依赖系统 `zip` 命令（容器镜像里也没有装）。

## 其他端点与配置

| 方法与路径 | 含义 |
| --- | --- |
| `GET /health` | HTTP 服务存活及队列数量；不表示 CAD / Python 依赖已经验收 |
| `DELETE /v1/exports/:id` | 删除已结束任务及其上传原图和全部导出；活动任务返回 409 |

| 环境变量 | 默认值 |
| --- | --- |
| `CAD_EXPORT_API_TOKEN` | 必填，至少 32 字符 |
| `CAD_EXPORT_HOST` / `CAD_EXPORT_PORT` | `127.0.0.1` / `4318` |
| `CAD_EXPORT_WEB` | 默认关闭；`1` 开启仅回环地址的网页与同源会话 |
| `CAD_EXPORT_DATA_DIR` | 当前目录下 `.local/cad-export-api` |
| `CAD_EXPORT_MAX_BYTES` | `104857600`（100 MiB） |
| `CAD_EXPORT_MAX_PENDING` | `4`，包含正在上传、排队与运行的任务 |
| `CAD_EXPORT_TIMEOUT_MS` | `3000000`（50 分钟） |
| `CAD_EXPORT_PAGE_TIMEOUT_MS` | `120000`（裁剪渲染单页最多 120 秒，含两种配色与 PNG；超时失败） |
| `CADCRAFT_CLI` / `PDFTOPPM` | 从 PATH 查找 |
| `CAD_REVIEW_PYTHON` | 未指定时沿用现有导出器的 Python 查找；建议显式设置以生成合并 PDF |
| `CAD_REVIEW_FALLBACK_FONT` | 沿用 Mac Arial Unicode；Linux 须显式配置 |

单服务串行运行一个导出子进程，超过队列上限返回 **429** 与 `Retry-After: 10`。文件过大返回 **413**，错误上传格式 **415**，文件头不符合 DWG / DXF **422**，无令牌 **401**。大小限制在读取流时也会检查。CAD / 渲染超时或服务收到 SIGTERM / SIGINT 时终止整个 worker 进程组。

任务状态与文件保存在数据目录，重启后可读取已结束任务；中断任务标记失败，不自动重跑。进度仅在运行内存中更新，状态切换才落盘。数据默认保留，调用方使用 DELETE 清理；需为数据目录安排磁盘监控与备份。同一数据目录仅允许一个服务实例，扩容前应另接持久队列、租户鉴权与共享存储。本实现不是无服务器函数，不能直接放进 Vercel 短时路由运行。

## 本轮验收（2026-10-21）

- Mac + CADCraft CLI 0.5.0：通过真实 HTTP 上传合成 DXF（两个模型图框、一个布局图框与视口），成功生成 3 张图框、2 张总览、23 个文件；所有文件经鉴权端点下载并检查 PDF / PNG 文件头。
- 合并 PDF 为 5 页、5 个目录项，所有 PNG 长边 3000px；查看布局页 PNG，中文图名与视口几何可见。证据在忽略目录 `.local/cad-export-api-qa/`，不含接口令牌。
- 5 个相关 Vitest 文件 / 35 项测试通过，覆盖真实 HTTP 调用、鉴权、流式上传大小限制、文件伪造与路径拒绝、串行队列、失败结果、重启恢复，以及真实 worker 超时后 CAD 子进程的清理。类型检查与本轮文件 ESLint 通过。
- 上述成功用例为合成 DXF；客户 DWG 的失败实测另见下节。本轮未在 Linux 主机验收，未接入项目数据库或部署线上服务。

## 后续修复与真实 DWG 验收（ezdxf 1.4.5）

继续诊断定位到旧 ezdxf 的图块填充重复缩放 / 旋转和原点偏移缺陷，已锁定正式版 **1.4.5** 并拒绝旧版裁剪渲染。上游修复与证据见[填充性能修复报告](reports/2026-10-21-cad-hatch-performance-fix.md)。这不是隐藏填充或降低图片分辨率。

同一DWG的 `平面图` 布局 **13张通过真实HTTP接口完成，总用时99.401秒，渲染峰值物理内存约406.8MiB**；合并PDF有13页、13目录项，所有PNG长边3000px，浏览器13张预览均加载，来源SHA-256不变。当前任务可用 `http://127.0.0.1:4318/?job=e73cd157-ef93-42b5-a5e4-6ab305f3c0f1` 查看。这是指定布局的审阅输出，不是整份源图或客户固定交付完成。

同版本的整份68图框+3总览测试在136.799秒失败：Model总览触及单页120秒上限，未完成整套，旧/新失败任务都不提供半成品下载。指定布局通过不能推广为整份导出通过。

另有独立SVG后端实验完成68图框+3总览，渲染子进程总计137.65秒，不含上传、DWG识别或合并；尚未接入网页/API默认流程；图例实心块与标准后端不同，未通过图面一致性筛查，也未进行原CAD逐页保真对照。请勿将实验时间当成当前网页整份任务时间。产物与边界见上面的性能修复报告。

裁剪清单的 `clippingRender` 记录实际ezdxf/PyMuPDF版本及逐页耗时。中文替代字体、缺失外部图片、A3适配输出的限制仍在，需对照原CAD打印核验。旧任务保留失败状态，下面的记录是修复前基线。

## 首轮真实施工 DWG 的性能验收：ezdxf 1.4.4 未通过

2026-10-21 本机测试一份 4,045,515 字节 DWG，识别 68 张图框、3 个空间，包含 35 个图块裁剪对象。整份任务在 **10 分 7 秒**后主动停止：只完成 Model 总览，布局总览渲染进程采样的物理内存峰值约 **25.5 GiB**。单独指定 `平面图` 布局、跳过总览后，13 张识别图框中仅完成前 5 张，**6 分 10 秒**时仍在 `page-026` 地面铺贴图的密集填充 PDF 生成阶段，主动停止。两个任务均为失败，未生成完整清单或合并 PDF；不能把局部页当作整套输出。

抽查 `page-024` 可见墙体、门洞、家具、尺寸与中文图名，但这不是 13 页全量正确性证明。原 DWG SHA-256 在测试后不变。源图引用的 2 个外部 JPG 未随文件提供，裁剪路径还使用中文替代字体，完整还原需要补齐资产并对照源 CAD。证据仅存于忽略目录 `.local/cad-export-api-qa/bangtai/`，客户原图和导出不入库。

已减少裁剪任务的重复 CAD 重开，增加 PDF 操作符缓冲（合成几何的 PDF 内容流和渲染像素与原后端一致）、显式关闭 PDF 文档、实时阶段提示、填充超时拒绝与接口单页超时保护。这些改进不代表真实 DWG 已达到性能目标。这项判断针对修复前1.4.4基线；后续1.4.5指定布局的生成验收见上节，准确性仍需原CAD对照。原 CLI 的完整审阅流程未默认开启接口单页时限。
