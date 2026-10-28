# 中文系统架构图

## 可编辑细化版

**推荐：Docker（可复用到其他项目）**

```sh
sh docker/architecture-editor/set-token.sh
docker compose -f docker/architecture-editor/docker-compose.yml up -d --build
```

打开 **http://127.0.0.1:8767/**，从项目列表进入流程图编辑；保存写回数据目录里该项目的 `system-map.drawio`，保存前自动备份上一版。
一个容器同时服务多个项目（数据目录 `projects/<项目名>/`），其他项目挂着同一镜像用自己的数据目录即可。
部署、端口、局域网访问与复用方式见 [流程图编辑器 Docker 部署](../architecture-editor-docker.md)。

**不用 Docker 时**，在仓库里直跑同一服务：

```sh
python3 scripts/architecture-editor-server.py --data-dir docs/architecture-data \
  --drawio-assets .local/architecture-tools/drawio-source/src/main/webapp \
  --token-file docs/architecture-data/.editor-token.sha256
```

打开同一个地址即可。旧的 `scripts/architecture-editor.py` 仍可用，它固定读写本仓库的 `docs/architecture/system-map.drawio` 单个文件；原来的 `/architecture-delta-zh.html` 地址在两种方式下都打开同一编辑器。

docker 数据目录里的 `docs/architecture-data/projects/繁梦空间设计站/system-map.drawio` 是编辑主文件；本目录（`docs/architecture/`）里的 `system-map.drawio` 与 `system-map.editable.registry.json` 是 Git 版本，**容器保存成功后会把两份一起复制过来**（compose 的 `ARCH_EDITOR_MIRROR`）。

离线直接改了主文件（或跑批量脚本改了 `status` / `notes`）时，不必打开浏览器保存一次，按编辑主文件重建清单并同步两份副本即可（不改 `.drawio` 内容）：

```sh
python3 scripts/architecture-editor-server.py --rebuild-registry 繁梦空间设计站 \
  --data-dir docs/architecture-data --root . \
  --mirror "繁梦空间设计站=docs/architecture/system-map.drawio"
```

Agent 读取流程用 `pnpm arch:read`（即 `node scripts/architecture-graph.mjs`；`--json` / `--page` / `--find` / `--diff`），规则与闭环见 [流程图 ↔ Agent 协作](../architecture-agent-collaboration.md)。图中的 `code` 是人工声明的实现位置，Agent 仍须打开代码核对。

**总关系图**（第 1 页，`pnpm arch:overview` 重新生成）：把各分图收拢成一张总览——中间是主业务线（收到客户需求 → 设计布点 → 报价保存 → 固定 V 版本 → 导出并交付），上方是支撑线（账号权限、产品选型、数据保存、CAD 导出），下方是保障线（本地与线上部署、软件更新、官方同步、备份恢复）。每个方框的 `notes` 写明对应分图页，`code` 给出主要入口，供 Agent 先定位再展开细节。生成器只替换这一页，其余页原样保留。

编辑时的快捷操作：双击改文字、拖动改位置、拖动箭头改关系、**Alt+滚轮缩放**（以光标为中心；Ctrl/⌘+滚轮原生也可用）、**Alt+左键拖动平移画布**。页面顶部的提示条与底部页签可随时切换分图。

主文件现在全部使用流程图表达，共 16 页：上面这张总关系图，加 15 张分图——业务总流程、账号登录与项目访问、产品维护与点位选型、上传图纸与户型图产物、点位设计与保存、报价保存与固定交付、CAD 上传导出与复核、线上与本地部署交付、两版并行与发行流程、两版仓库模块共用分析、软件检查更新、官方产品同步、业务备份恢复、业务数据与文件保存，以及**项目总设计**。「项目总设计」是产品整体视图：上带是两种交付形态（托管版 / 自部署版），中带是主业务线（登录建项目 → 导入图纸与图片 → 分析选点 → 产品选型 → 报价 → 模板与固定版本 → 客户确认与合同），下带是支撑线与保障线，最后一带只放尚未实现的规划；由 `pnpm arch:design`（`scripts/build-architecture-product-design.py`）生成，**只替换这一页**，其余页原样保留。「两版仓库模块共用分析」按 2026-10-21 的实测列出两个 GitHub 仓库（私有主干与公开自部署版）各自的可公开子集、非共用模块、导出同步的六步与门禁结果。「上传图纸与户型图产物」记录「准备并确认底图」之后的两条上传路径与两种产物，其中对接外部 CAD 服务、户型图带点位标记、自动布点/自动报价为规划，依据 [设计记录](../upload-floorplan-and-marker-outputs.md)。

**2026-10-21 状态刷新**（依据 `plans/033` 的黑豹 X2 真机结果）：部署、更新、备份三页里已真机验证的节点改为「现有代码流程」并在节点说明里写明证据，仍未做的继续标「规划」——部署页剩 3 个（线上企业隔离未验收、官方产品来源未实现、未正式发货），更新页剩 1 个（可信版本清单/发布渠道），备份页剩 2 个（多实例选择、恢复授权）。总关系图的保障线随之重生成。其余页仍需结合最新代码核对。各页包含判断与失败处理，不把模块关系简单改名为操作步骤。

**2026-10-22 状态刷新**（依据本轮实现，均在临时库或真实 HTTP 上验证过）：① 官方产品资料同步页从「整页未实施」改为已实现——表格批量导入、从运营方服务器同步（快照式第一版）、应用内定时同步，页内新留一个规划节点写明缺口（验签、增量游标、素材下载、订阅到期）；② 业务备份与恢复页新增客户自助分支（网页导出 / 传回还原），并把「恢复预检与授权通过」从规划改为现有代码（超管 + 手工确认 + 结构指纹与逐表摘要校验，失败整体回滚），多实例选择仍为规划；③ 软件检查与更新页新增「每天检查有无新版本」（只提醒、不自动装），「可信版本清单/发布渠道」仍为规划；④ 总关系图的保障线三项据此重生成；⑤ 新增第 16 页「项目总设计」。
**2026-10-22 凌晨追加**：登录页新增「登录失败次数闸门」「上传按类型判归属」两个现有代码节点；同步页的缺口收窄为「增量游标与分批」（验签与图片取回已完成）；更新页「管理员检查可信版本」改为现有代码（版本清单可验签）。

转换前的完整编辑文档保存在 [system-map-components.drawio](system-map-components.drawio)，包含原 9 张架构分图与业务总流程，保留原文字、坐标和元数据，供对照及恢复；不会随着流程图编辑自动更新。

首张“业务流程图”描述含点位项目从需求、图纸准备、布点选型、点位保存、报价核对与独立保存，到固定交付版本及导出的完整主线。20 个操作/判断节点和 23 条走向包含保存失败重试、交付检查失败重试，以及历史 V 版本直接使用原快照的旁路。已有历史交付可直接选择，无需重存当前草稿。默认型号允许明确标识的未核验客户报价，不把它误判为正式采购通过。纯报价 PDF 分支在图下注明范围，不在本图展开。

双击修改文字、拖动模块与连接箭头、使用左侧图形库添加内容。右键模块选择“编辑数据”可查看或维护 `moduleId`、`code`、`status`、`notes`。先放大画布再编辑细节；窄面板可扩大浏览器显示区域。

点击页面上方 **保存到项目** 或在画布中按 `⌘S` / `Ctrl+S`：

- 主文件为 [system-map.drawio](system-map.drawio)，可在 draw.io 桌面版继续编辑。
- 保存时刷新 [system-map.editable.registry.json](system-map.editable.registry.json)，供 Agent 读取节点、主要关系与代码依据；普通新图形也纳入清单。
- 每次保存前在 `.local/architecture-editor/backups/` 留存上一版；其他窗口或 Agent 改过文件时拒绝覆盖，先下载副本再刷新对照。
- “下载副本”保留当前页面编辑内容；它与保存到项目是两个操作。关闭前检查保存状态。

`.drawio` 是细化设计的编辑主文件。静态阅读版不会随其自动重绘；图中“现有代码/规划”是带日期的人工声明，改图不会修改业务代码或证明功能已实现。Agent 应读取最新 `.drawio`（含新增节点与连线）及对应代码，报告差异，经任务授权后实施；不应从旧生成器覆盖用户修改。

本机编辑器来自 [jgraph/drawio](https://github.com/jgraph/drawio)，本次固定提交 `17b367b91dbab91804f852645788d7ffb46dcb79`。第三方资源保留在忽略目录中，不纳入业务源码。换电脑时可安装 draw.io 桌面版打开主文件，或按以下步骤准备同一份网页资源后运行上述脚本：

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/jgraph/drawio.git .local/architecture-tools/drawio-source
git -C .local/architecture-tools/drawio-source fetch --depth 1 origin 17b367b91dbab91804f852645788d7ffb46dcb79
git -C .local/architecture-tools/drawio-source checkout --detach 17b367b91dbab91804f852645788d7ffb46dcb79
git -C .local/architecture-tools/drawio-source sparse-checkout set src/main/webapp
```

## 静态阅读版

打开 [system-map.html](system-map.html) 查看当前架构、目标部署、点位到客户交付流程、待建设差异和模块代码对应表。HTML 自包含，可直接用浏览器打开；宽图支持左右滚动。

基线为 2026-10-21 的原业务工作区，包含未提交代码；它与开源发行副本不同。实线节点表示代码中已有的模块，目标部署图的虚线节点表示规划，不能作为部署或运行验收证据。

[system-map.registry.json](system-map.registry.json) 保存固定模块编号、职责、状态、代码位置和文件 SHA-256。它便于 Agent 定位与识别基线变化，不会自动判断实现是否符合设计。后续可用“检查 CAT-01 与当前实现的差异”这类指令开始核对；应重新读取代码、报告差异，再更新图和证据清单。

领域规则仍以 `CONTEXT.md` 和 `docs/adr/` 为准；目标部署依据 ADR 0010、`docs/deployment-and-catalog-architecture.md` 与 Plan 028。修改业务规则时同步维护这些文档。

绘图采用 [Diagram Design](https://github.com/cathrynlavery/diagram-design) 规范（2.6.115，来源提交 `f2f4d49`），许可见 [LICENSE-diagram-design.txt](LICENSE-diagram-design.txt)。这是静态架构文档，不具备拖拽编辑和自动代码审计能力。
