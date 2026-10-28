# Agent 使用说明

## 说话方式（优先级最高，每次会话都适用）

**用户不是开发人员，看不懂代码和技术名词。默认用大白话回答。**

- 开头先给结论：**做了什么、结果怎样、对用户有什么影响**。技术细节放到最后单独一小段，标明"想深入再看"。
- 不要罗列文件路径、函数名、命令、参数。必须提到某个东西时，用"哪个页面的哪个按钮""哪张图上的哪一格"来说；实在要说文件名，后面补一句它是干什么的。
- 每个技术名词（接口、门禁、缓存、提交、镜像、registry 之类）第一次出现必须用一句人话解释，或者直接换个说法。宁可说"检查有没有把客户名字带出去"，也不要说"deny 门禁"。
- 需要用户拿主意时，只给 2—3 个选项，每个后面跟一句"选了会怎样"；不要给一长串可能性让用户自己挑。
- 能用表格、清单、图说清就别写大段文字；一次改了很多东西，先给一张总览表。
- 不吓唬用户，也不夸大：没做到的说没做到，不确定的直接说"需要你确认"。
- 篇幅尽量短。用户问一句小事，就不要回一篇报告；需要展开时先问一句"要不要看详细版"。

## 本机端口约定（起静态服务前必看）

- **8080 归 Misty**：用户机器上的代理客户端自带一个本地面板（页面标题 `MISTY CLOUD`），默认就用 8080。任何会话、任何项目都不要再占用 8080——一旦占用，用户打开 Misty 看到的就是别人的 404 页。
- 文档/静态页预览统一走 **8090**：`npm run handbook:preview` → `http://127.0.0.1:8090/appliance-handbook.html`
- 临时验证用的服务沿用 **879x**（8791/8798/8799 等），别用 80xx。
- 起服务前先确认端口空闲：`lsof -nP -iTCP:<端口> -sTCP:LISTEN`；用完记得关掉。

## 本机服务器（常开那台 PVE）

家里所有常驻服务都跑在那台 Proxmox 上（设计站、架构图编辑器、镜像仓库、文件管理器、
容器面板、官方主站、工作台库、设备升级源……）。

- **地址、登录方式、东西放在哪、已知的坑**：见 `docs/agents/local-server.md`——碰服务器之前先读它。
- 免密登录：`ssh -i .local/ssh/pve_ed25519 root@10.0.0.123`（PVE 主机）；容器里的服务在 `10.0.0.202`。
- 改了服务/端口/地址，**回来更新那一页**，别让台账和现实对不上。

## Agent skills

### Issue tracker

本仓库使用 GitHub Issues 跟踪需求、缺陷和 PRD，仓库为 `lynnliuyu1995-hub/fmkj_v3`；外部 PR 不作为 triage 请求入口。详见 `docs/agents/issue-tracker.md`。

### Triage labels

本仓库使用默认 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

本仓库使用 single-context 领域文档结构：根目录 `CONTEXT.md` 加 `docs/adr/` 下的 ADR。详见 `docs/agents/domain.md`。

### 产品采集与入库

收集产品、整理旧产品或新增具体 SKU 时，先读 `docs/product-catalog-agent-guide.md`，按现有字段、证据和业务写入入口操作。

### 一机一密正式验证

改官方产品库凭据、目录发布接口或设备同步落库时，先读并遵循 `.agents/skills/verify-catalog-one-device-auth/SKILL.md`，复跑 `formal/catalog-one-device-auth/check.sh`。

### 点位、报价与客户交付

变更这条工作流前，读 `CONTEXT.md`、相关 ADR（尤其 0005—0007）和 `plans/021-workbench-workflow-consolidation.md`。默认型号允许作明确标识的未核验客户报价；项目换型不改全局；删除来源报价行联动删点位与场景引用。不要根据旧测试或初始架构建议反转这些用户决定。

操作说明分别维护在 `docs/point-map-design-workflow.md` 与 `docs/point-map-visual-presentation-workflow.md`。客户出口使用固定交付版本，草稿检查图不作为历史整套方案。复用现有预览与交付 module，不重新添加客户端采购计算或另一套导出来源。交接必须区分本机预览、数据库已保存、固定版本与实际导出验证；不能以测试通过声称客户项目已完成。
