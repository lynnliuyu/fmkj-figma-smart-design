# 营销个人工作台（B 级任务）—— 执行手册

> **给新会话用。** 读完这份就能直接开工，不用重新摸仓库。
> owner 2026-11-09 决定：B 级任务（营销工作台）单独开会话做，主线会话继续推进其他事。

---

## 0. 一句话背景

owner 要一个**自己的**营销工作台：**独立、放本地（已指定部署到 106.15.10.225）、能读取主站项目素材**，
用来做**图文 / 视频**，并**管理和发布到社交平台**。

owner 原话：

> 「b 是我的**独立个人工作台**，放在**本地**吧，可以**获取项目的素材**等等，
> 就是你说的那些功能。」

---

## 1. 开工前必须问 owner 的 3 件事

**不要自己拍板，这三条决定架构。**

| #   | 问题                 | 选项                                               | 我的建议                                                 |
| --- | -------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| 1   | **数据源**           | (a) 连主站生产库只读 (b) 导出快照 (c) 直连主站 API | **(b) 导出快照** —— 最「独立」，不碰生产库               |
| 2   | **视频做到什么程度** | (a) 只出分镜脚本+配图 (b) 真合成 mp4               | **(a) 先做 (a)**，验证需求后再上 ffmpeg                  |
| 3   | **发布平台**         | 小红书 / 抖音 / 视频号 / 公众号 / 朋友圈           | **先做「一键生成 + 一键下载 + 发布清单」，不做自动发布** |

> 第 3 条很关键：多数平台**没有开放发布 API**，自动发往往要模拟登录，维护成本极高。
> 建议先做「素材准备好，人来发」。

---

## 2. 仓库里已有的可复用件（**别重造**）

### 2.1 社媒海报 —— 已经能生成了 ⭐

`src/lib/social-poster.ts` 是**核心资产**，已实现：

```ts
buildSocialPosterPages(data: SocialPosterData): SocialPosterPage[]
// 生成三类页面：
//   cover       案例封面
//   plan-N      户型点位图（每层一张）
//   equipment-N 配置清单（每 6 个设备类型一页）
```

配套 UI：`src/app/(frontend)/(workspace)/projects/[id]/archive/social-poster-dialog.tsx`
（`SocialPosterDialog` 组件 + 高清图导出）

**能直接复用**：把 `SocialPosterData` 喂给 `buildSocialPosterPages` 就有图。

### 2.2 项目数据

| 文件                      | 能力                                                            |
| ------------------------- | --------------------------------------------------------------- |
| `src/lib/project-docs.ts` | `loadProjectDocs(id, user, scope, quoteId)` —— 完整项目文档数据 |
| `src/lib/point-scene.ts`  | 点位图场景（`normalizeScene` / `scenePoints` / `sceneSheets`）  |
| `src/lib/quotes.ts`       | 报价与金额计算                                                  |
| `src/lib/device-types.ts` | 设备类型中文字典（`deviceTypeLabel`）                           |

### 2.3 AI 生图

- `src/app/api/ai/images/route.ts` —— 生图接口（主站版带积分扣费）
- `src/app/(frontend)/(workspace)/ai/image/style/` —— 户型图风格化

> ⚠️ 本地个人工具**不要走主站积分池**，用自己的 API key。

### 2.4 截图/渲染套路（做视频配图会用到）

- `review/shots.mjs` —— Playwright 整页截图 + 健康指标采集
- `fmkj-latest/scripts/generate-template-thumbnails.mjs` —— 「渲染页面 → 截图 → sharp 压缩」现成例子
- `fmkj-latest/e2e/smoke.mjs` —— 真浏览器验证的完整写法

---

## 3. 目标机器现状（106.15.10.225）

**owner 已指定：新个人工作台部署到这台。**

```text
系统      Debian GNU/Linux 12 (bookworm)
主机名    iZuf617w6hrk63ci9tl5w9Z
SSH       admin@106.15.10.225  密钥 ~/.ssh/wb_salvage_20261109
内存      1.6G（可用约 1.0G）   ⚠️ 偏小，构建要注意
磁盘      40G，已用 16G，可用 22G
Node      未安装（要装）
sudo      免密可用
```

### 现有的东西（可以清）

| 路径                                    | 大小     | 说明                                            |
| --------------------------------------- | -------- | ----------------------------------------------- |
| `/opt/personal-workbench-dev-release`   | **1.2G** | 旧工作台源码（**已备份到本机** `salvage-106/`） |
| `/opt/backups`                          | 182M     | 旧备份                                          |
| `/opt/personal-workbench-dev`           | 43M      | 旧工作台目录                                    |
| `/opt/personal-workbench-build-51ca1d2` | 120K     | 旧构建目录                                      |

### 在跑的容器

```text
personal-workbench-dev_postgres_1  postgres:17-alpine  127.0.0.1:5437->5432
pitr-bootstrap-registry            registry:2.8.3      127.0.0.1:5000->5000
```

> 旧工作台的 postgres 还活着，但业务已死（web 容器 6 周前 Exited）。
> **开工前先确认 owner：旧数据还要不要？** 备份已在 `salvage-106/`：
>
> - `workbench-src-2026-11-09-1424.tar.gz`（1.2G，2083 文件）
> - `workbench-db-2026-11-09-1424.sql.gz`（7.1M，16 万行 SQL）

---

## 4. 技术选型建议

**独立应用，不塞进主站。**

```text
/Users/noonebook/Downloads/DreamStars/marketing/     ← 新目录
├── package.json          独立依赖
├── src/                  下一个 Next.js 或 Vite 应用
├── data/                 项目素材快照（导出的 JSON + 图片）
└── README.md
```

理由：

- 主站是生产应用（`fmkj.top`），塞进去会拖慢构建、增加部署风险
- 独立目录可单独迭代，坏了不影响主站
- 可以**复制**需要的纯函数（`social-poster.ts` 等），不配 alias 引用主站（避免耦合）

**不推荐**做「主站里一个仅本机可见的路由」—— 违背 owner 说的「独立」。

---

## 5. 模块拆解（初稿）

| 模块         | 能力                                               | 复用                                |
| ------------ | -------------------------------------------------- | ----------------------------------- |
| **素材库**   | 按项目聚合：户型图、点位图、方案 PDF、报价单、图片 | `loadProjectDocs` + `social-poster` |
| **图文生成** | 一键出小红书 / 朋友圈套图（封面 + 点位 + 配置）    | `buildSocialPosterPages` 基本够     |
| **视频生成** | 分镜脚本 → 逐镜配图 → 合成短视频                   | 需新建（见 §6）                     |
| **发布管理** | 多平台账号、排期、发布记录                         | 需新建                              |

---

## 6. 视频这块是全新的

仓库里**没有**视频生成能力。最小可行路径：

1. **分镜脚本**：用 LLM 从项目数据生成（几个镜头 × 每镜文案 + 画面描述）
2. **逐镜配图**：复用点位图 / 社媒海报，或调生图接口
3. **合成**：`ffmpeg` 把图片 + 转场 + 字幕 + BGM 拼成 15–30 秒竖屏视频

> 工作区里有个 `video-project/` 和 `video-shotcraft/` 目录，**先看看有没有可复用的素材或脚本**。

---

## 7. 环境备忘

### 主站在本地已跑起来

```bash
cd /Users/noonebook/Downloads/DreamStars/fmkj-latest
bash /tmp/start-dev.sh          # 已固化环境变量，别手动起
# http://localhost:3000 · demo@fmkj.local / demo12345
# ⚠️ 必须用 localhost，不能用 127.0.0.1（Next 16 跨源拦截）
```

### 本地开发库

```text
PostgreSQL 18 @ 127.0.0.1:55432 · 用户 fmkj · 库 fmkj
```

如果库没起来：

```bash
PG=/Users/noonebook/.paperclip/cli/installs/npm/2026.916.1/node_modules/@embedded-postgres/darwin-arm64/native/bin
$PG/pg_ctl -D ~/.fmkj-dev-db -o "-p 55432 -k /tmp" -l /tmp/pg-fmkj.log start
```

### 其他服务器（不要碰）

| IP               | 用途                                  |
| ---------------- | ------------------------------------- |
| `124.222.225.26` | **主站 fmkj.top**（生产，别动）       |
| `150.158.3.164`  | 网关（`*.fmkj.top` 泛解析 + frps）    |
| `106.53.183.96`  | app 生产（`app/copilot/dl.fmkj.top`） |
| `43.155.223.134` | 首尔代理机                            |

详见 `fmkj-latest/INFRA-MAP.md`。

---

## 8. 仓库硬规矩（新会话必须遵守）

- **分支 + PR，不直接推 main**；合并走 squash
- **七道门禁**：`oxfmt --check` / `eslint --max-warnings 0` / `tsc --noEmit` /
  `knowledge:check` / `vitest`（100 tests）/ 生产构建 / **e2e 冒烟（21 页）**
- `pnpm` 必须用 `corepack pnpm@10.34.3`
- 架构变更（新模块 / 数据模型 / 权限 / 模板体系）→ 先写提案进 `proposals/`，
  按 `PROJECT-ARCHITECTURE.md` §0.1 六段式，等 owner 批
- 不碰 `src/app/(payload)/` 生成文件、`miniprogram/`、`desktop/`
- **不碰生产密钥 / .env / 客户数据**
- 验收标准从 owner 嘴里拿，不自己定

---

## 9. owner 的偏好（省得踩坑）

- 中文沟通；决策极简（「1A 2A」四个字母就拍完）
- 给选项要**编号 + 默认值 + 推荐**，别写长段落
- **不要事事请示** —— 只有架构变更需要他批
- 他说话越来越短（「继续」「推进」）= 满意；开始解释细节 = 我做偏了
- 验收要**截图 + 真跑**，不要只说「做完了」

---

## 10. 建议的第一步

1. **问那 3 个问题**（§1），拿到答复再动手
2. 确认旧工作台数据要不要（§3）
3. 做**素材导出脚本** —— 从主站导出项目数据到 `marketing/data/`
   （这是所有后续模块的地基，且不依赖前面 3 个问题的答案中除「数据源」外的部分）
4. 用 `buildSocialPosterPages` 做**第一版图文生成**，跑通「选项目 → 出图 → 下载」的最小闭环
5. 出**截图**给 owner 看，拿到反馈再往下做
