# 智能家居需求小助手 · 设计方案（issue #194）

> 状态：**待拍板**（本文件是方案，不是实现）。业主端小程序，免登录可填，草稿生成后可绑手机。

## 1. 三条进入路径，汇聚同一份清单

```
① 按场景选   场景卡片多选 → 自动带出房间×设备类型×建议数量
② 按预算选   预算区间 → 反推可覆盖场景与档次（smart-select 价格分位）
③ 问卷模式   分步问答（面积/房间/装修阶段/预算/场景/生态/已有设备）
        ↓ 任意一条都能独立走完
   结构化需求清单（同一 schema，同一份草稿载体）
        ↓
   Projects 草稿（status=draft，销售在工作台接管）
```

**可互相切换补充**：三条路径写同一个 `answers` 对象；切换时不丢已答内容
（例如先按场景选了照明+安防，再切问卷只补面积/装修阶段）。

## 2. 数据表

### 新增集合 `need-leads`（业主需求单）

| 字段         | 类型                    | 说明                                                                |
| ------------ | ----------------------- | ------------------------------------------------------------------- |
| `token`      | text, unique, index     | 分享链接/二维码凭证（≥16 字符随机）                                 |
| `source`     | select                  | `scene` / `budget` / `wizard`（最后一条完成的路径）                 |
| `answers`    | json                    | 三条路径共用的原始答案（可增量合并）                                |
| `structured` | json                    | 归一化后的需求清单（见 §3）                                         |
| `status`     | select                  | `draft`（采集中）/ `submitted`（已提交）/ `converted`（已生成项目） |
| `phone`      | text                    | 业主手机（可选，提交后绑）                                          |
| `project`    | relationship → projects | 生成的项目草稿                                                      |
| `owner`      | relationship → users    | 销售/顾问（分享方；公开链接可为空）                                 |
| `access`     | —                       | `create: 公开（限流+白名单）`、`read/update: 仅 owner 或 admin`     |

### Projects 变更（最小）

- 新增 `area`（number，面积 m²）：issue 要求草稿写面积，现有集合没有该字段
- 其余复用：`customerName` / `customerPhone` / `community` / `budget` / `platform` / `notes` / `defaultProducts` / `status`

> `notes` 写人类可读的需求摘要；`defaultProducts` 由选型结果填充，销售打开即可继续报价。

## 3. 结构化需求清单（同一 schema）

```ts
type NeedStructured = {
  house: { area: number | null; rooms: number | null; stage: 'rough' | 'mep' | 'moved' | null }
  budget: {
    min: number | null
    max: number | null
    tier: 'economy' | 'standard' | 'premium' | null
  }
  scenes: string[] // lighting / security / curtain / hvac / av / lock
  platform: string | null // 米家 / Aqara Home / Apple Home / 华为鸿蒙智家 / KNX / 不确定
  existingDevices: string | null
  rooms: {
    key: string // entrance / living / bedroom …
    label: string
    scenes: string[]
    devices: { deviceType: string; qty: number; reason?: string }[]
  }[]
  estimate: { min: number | null; max: number | null; basis: 'library' | 'none' }
  missing: string[] // 还缺哪些关键项（用于继续追问）
}
```

## 4. 三条路径如何产出同一份清单

### ① 按场景选（最快）

- 卡片：照明 / 安防 / 窗帘 / 暖通 / 影音 / 门锁
- 选中后，按 **`knowledge/domain-knowledge.json` 的 `room-rules.rooms[].needs[].matchingDevices`**
  自动带出「房间 × 设备类型」与数量（每个房间该场景的 `level: core` 才默认勾选）
- 用户可增减数量；预算未知时 `estimate` 用产品库中位价估算并标 `basis: 'library'`

### ② 按预算选

- 输入/选择预算区间（如 2–3 万）
- 用 `SELECTION_TIERS`（economy 20% / standard 50% / premium 85% 分位）与汇总价格，
  从「场景集合」里挑出**能覆盖的场景集**，给出「这个预算能做到：照明+安防+窗帘（标准档）」
- 用户可在结果上加减场景，实时重算

### ③ 问卷模式（最完整）

- 分步：面积 → 房间数 → 装修阶段 → 预算 → 场景 → 生态偏好 → 已有设备
- 每步可跳过；跳过的项进 `missing[]`，结果页显示「还差 2 项，补完估算更准」
- 说需求（自由文本）可选：走 `AiConversations` 解析成同上结构，失败降级为表单

## 5. 复用点（不另造）

| 能力      | 复用                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 选型      | `autoSelectProducts(all, deviceTypes, { platform, tier })` + `SELECTION_TIERS`                                                  |
| 场景→设备 | `knowledge/domain-knowledge.json` 的 `room-rules`（已有 12 类房间的 needs/scenes）                                              |
| AI 能力   | 现有 `AiConversations` + `mp/v1/ai/chat`（NDJSON 流），额度与渠道设置不变                                                       |
| 草稿生成  | 服务层新增 `createProjectDraftFromNeed()`，内部用 `payload.create({collection:'projects'})`，与 `saveProjectInput` 同等字段校验 |
| 分享凭证  | 复用项目分享的 token 思路（`lib/project-access.ts` 的随机 token 与过期/密码机制）                                               |

## 6. 接口

| 方法   | 路径                               | 说明                                                                          |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `POST` | `/mp/v1/need-leads`                | 创建/更新草稿（按 token）；**免登录**、限流（IP+token）、字段白名单、体积上限 |
| `GET`  | `/mp/v1/need-leads/[token]`        | 读回已答内容（中途退出再进入不丢）                                            |
| `POST` | `/mp/v1/need-leads/[token]/submit` | 归一化 + 选型 + 生成 Projects 草稿；返回 `need` + `projectId`                 |
| `POST` | `/mp/v1/need-leads/[token]/bind`   | 可选：绑手机号（短信/微信手机号，走现有 auth 能力）                           |
| `POST` | `/mp/v1/need-leads/[token]/chat`   | 可选：AI 解析自由文本（走 handleAiChat，限制积分与长度）                      |

工作台侧：`/capabilities/need-leads`（或项目页「需求线索」）列表 + 一键「接管为项目」。

## 7. 小程序页面

- `pages/need-wizard/index`：单页三 Tab（场景 / 预算 / 问卷），共享同一 state
- `pages/need-result/index`：清单确认页 + 估算区间 + 「生成项目草稿」
- 入口：分享卡片/二维码直达（带 token）、「我的」页「帮我出方案」
- 兜底：答非所问/超长输入/AI 超时/额度不足 → 明确提示 + 已答内容不丢（本地草稿 + 服务端 answers 双写）

## 8. 改动面与 PR 拆分

| PR           | 内容                                                                                 | 估算 |
| ------------ | ------------------------------------------------------------------------------------ | ---- |
| ① 数据与接口 | `need-leads` 集合 + `Projects.area` + 4 个接口 + `createProjectDraftFromNeed` + 单测 | 中   |
| ② 小程序页   | 三 Tab 采集页 + 结果页 + 入口 + 本地草稿兜底                                         | 中   |
| ③ 工作台接管 | 线索列表 + 打开草稿 + 权限校验                                                       | 小   |

不改动：报价/合同/售价口径、现有项目主链路、`price` 语义。

## 9. 验收判据映射（issue → 实现点）

| issue 判据                                          | 对应                                         |
| --------------------------------------------------- | -------------------------------------------- |
| 3 个不同户型/预算场景跑通                           | ② 的 e2e：3 组合成答案 → 3 份清单 → 3 个草稿 |
| 草稿能在工作台打开且字段正确                        | ① 的 `createProjectDraftFromNeed` + ③ 的列表 |
| 答非所问/中途退出/超长/AI 超时/额度不足有提示且不丢 | ② 的兜底：answers 双写 + 错误态              |
| 独立验证员 PASS                                     | 每 PR 单独派独立验收                         |

## 10. 待你确认

1. `need-leads` 命名是否接受（或叫 `demand-leads` / `client-needs`）
2. 免登录是否加**轻量防滥用**：单 IP 每小时 N 次 + 单 token 体积上限（默认加）
3. 估算预算只给区间、不给正式报价（默认按 issue）
4. `Projects.area` 是否现在就加（草稿需要写面积；也可先只存在 `need-leads.structured.house.area`，项目侧后补）
