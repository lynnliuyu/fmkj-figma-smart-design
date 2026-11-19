# 智能家居需求小助手 · 设计方案 v2（issue #194，待拍板）

> v2 依据 issue #194 评论 `#issuecomment-7005568572` 的完整规划重写。
> 本文件是**方案**，不动代码。业主端小程序，免登录可填，生成草稿后可绑手机。

## 1. 小程序页面结构（7 屏）

| 屏              | 路由                  | 内容                                                                               | 入口                     |
| --------------- | --------------------- | ---------------------------------------------------------------------------------- | ------------------------ |
| **S0 开始**     | `need/start`          | 一句话价值主张 + 三张大卡片：按场景选 / 按预算选 / 六步问卷 + 「已有进度，继续填」 | 分享卡片/二维码、我的页  |
| **S1 采集**     | `need/collect`        | 单页向导，顶部三 Tab（场景 / 预算 / 问卷），**同一份 answers**                     | 从 S0 进入，Tab 可随时切 |
| **S2 清单**     | `need/list`           | 需求清单：房间 × 场景 × 设备类型 × 数量 × 估算价；每行可改数量/删                  | S1 完成任一条            |
| **S3 一页建议** | `need/advice`         | 业主视角一页：要达到什么效果 / 需要什么 / 大概多少钱 / 为什么这么配                | S2 确认                  |
| **S4 提交**     | `need/submit`         | 生成项目草稿 +（可选）绑手机看后续                                                 | S3                       |
| **S5 结果**     | `need/done`           | 「已提交，顾问会联系你」+ 方案摘要卡片（可分享）                                   | S4                       |
| **S6 补充**     | `need/collect?step=N` | 续填（同一页，定位到指定步）                                                       | S0「继续填」/ 短信链接   |

**三条入口如何合并**

- 三 Tab 写同一个 `answers`，切换不丢内容（先场景选完再切问卷，只补面积/装修阶段）。
- 任一条都能独立走完：场景 Tab 只需点卡片 → 直接进 S2；预算 Tab 只需给区间 → 直接进 S2；
  问卷 Tab 六步可逐步跳过，跳过的项进「还差 N 项」提示，不阻止进 S2。
- 三条都走完后 `source` 记最后一条完成的路径，用于分析哪种入口更常用。

**六步问卷（S1 的问卷 Tab）** 0. 房子：户型类型（平层/复式/别墅，必填）→ 几室几厅（默认 3室2厅）→ 面积 → 装修阶段

1. 灯光：设计要求（传统主灯/全屋无主灯/客厅无主灯其余主灯）+ 光色（单色暖光/冷暖可调/多彩）
2. 智能程度：轻智能/全屋智能（能力矩阵）+ 使用偏好（手按/语音/混合）+ 是否接受 App/自动化
3. 安防：监控（不需要/仅门口/仅室内/门口+室内）+ 传感器（水浸/烟雾/燃气/门窗磁/人体存在）
4. 面板交互：带屏开关 / 中控屏 / 智能门锁 / 晾衣 / 家电接入
5. 场景模式：回家/离家/睡眠/观影/起床/用餐/节能/访客（多选，每个一句话解释）
6. 生态品牌：见 §5 生态库；支持混合方案（主体 + 面板层）

每屏都带 **「为什么问这个」+ 一句话解释 + 对照素材**（见 §4）。

## 2. 数据结构

### 2.1 新增集合 `need-leads`（需求单）

| 字段         | 类型                    | 说明                                                      |
| ------------ | ----------------------- | --------------------------------------------------------- |
| `token`      | text unique index       | 分享凭证（≥16 随机，复用 `project-access` 的 token 生成） |
| `status`     | select                  | `draft` / `submitted` / `converted`                       |
| `source`     | select                  | `scene` / `budget` / `wizard`                             |
| `answers`    | json                    | 原始答案（六步 + 三入口共用，增量合并）                   |
| `structured` | json                    | 归一化清单 + 估算 + 一页建议（见 2.2）                    |
| `phone`      | text                    | 业主手机（可选）                                          |
| `project`    | relationship → projects | 生成的草稿                                                |
| `owner`      | relationship → users    | 分享方（公开链接为空）                                    |
| access       | —                       | create 公开（限流+体积上限）；read/update 仅 owner/admin  |

### 2.2 `structured` 结构（需求清单 + 建议，同一份）

```ts
type NeedStructured = {
  house: {
    type: 'flat' | 'duplex' | 'villa'
    rooms: number
    area: number | null
    stage: 'rough' | 'mep' | 'moved'
  }
  lighting: { design: 'main' | 'none' | 'partial'; color: 'warm' | 'tunable' | 'rgb' }
  tier: 'light' | 'full'
  habits: { prefer: 'button' | 'voice' | 'mixed'; app: boolean; automation: boolean }
  security: { camera: 'none' | 'door' | 'indoor' | 'both'; sensors: string[] }
  panels: {
    screenSwitch: boolean
    centralScreen: 'none' | 'wall' | 'desk'
    lock: boolean
    dryer: boolean
  }
  scenes: string[]
  ecosystem: { primary: string; panelLayer: string | null } // 支持混合
  rooms: {
    key: string
    label: string
    devices: { deviceType: string; qty: number; reason: string; from: 'default' | 'user' }[]
  }[]
  estimate: { min: number; max: number; basis: 'market' | 'mixed' | 'none'; gaps: string[] }
  advice: { headline: string; effects: string[]; why: string[]; priceLine: string }
  missing: string[]
}
```

### 2.3 新增字段

- `Projects.area`（number，㎡）——草稿需要写面积（现有集合没有）
- `Projects.needLead`（relationship → need-leads，可空）——反向追溯「这个项目来自哪份需求」
- **素材引用**不进库：选项定义与素材路径放在代码常量（§3），`structured` 只存选项 key

## 3. 默认值规则：放**后端纯函数模块**

位置：`src/lib/need-defaults.ts`（纯函数 + 单测），理由：

1. 默认值直接决定估算与草稿，必须可审计、可测（前端预设无法单测覆盖规则）
2. 小程序、工作台、AI 三条通道共用同一份规则，避免漂移
3. 前端只做「首次渲染初值」：进 S1 时调 `GET /mp/v1/need-leads/catalog` 拿默认值与选项

规则表（issue 原文，落到函数）：

| 规则                                                         | 实现                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| 卧室/书房开关 3 个、客厅 3 个、餐厅/玄关 2 个、卫生间 1–2 个 | `defaultSwitchCount(roomKey)`                                    |
| 中枢网关 1 个；面积 >150 ㎡ 或别墅 → 提示 2 个               | `defaultGateways(house)` 返回 `{ qty, hint }`                    |
| 有窗房间默认窗帘电机 1 个                                    | `defaultCurtains(rooms)`                                         |
| 厨房/卫生间/阳台必配水浸+烟雾；每 2 房 1 个                  | `defaultSensors(rooms)`（必配项标记 `required: true`，不可取消） |
| 监控按面积给默认数量                                         | `defaultCameras(area, cameraChoice)`                             |

## 4. 演示对照素材清单（现有够不够）

**现有可复用**（`public/`）

| 素材                               | 数量 | 可复用为                                           |
| ---------------------------------- | ---- | -------------------------------------------------- |
| `demo-plans/gy-*f-showcase.png`    | 3    | 点位铺法示意（房间×设备位置）                      |
| `board/symbols/mono/{white,gold}`  | 67   | 设备类型图标（清单/建议页）                        |
| `ecosystem/*`                      | 23   | 生态对比卡片图标                                   |
| `style-templates/style-01..10.jpg` | 10   | **灯光氛围示意**（需逐张核对，标注「示意非实景」） |
| `point-icons/*`                    | 28   | 设备小图标                                         |

**缺失，需要新增（P2）**

| 素材                       | 形式               | 是否需拍摄                                              |
| -------------------------- | ------------------ | ------------------------------------------------------- |
| 有主灯 vs 无主灯           | 同角度 2 张对照    | 否——用**同一户型点位图 + 自绘光照示意**（SVG/合成）即可 |
| 色温 2700/3000/4000K       | 1 张三联图         | 否——自绘色块 + 同场景叠色                               |
| 冷暖 vs 多彩               | 1 段 5–8s 视频/GIF | 否——合成渐变循环                                        |
| 轻智能 vs 全屋（能力矩阵） | 1 张信息图         | 否——HTML/SVG 生成                                       |
| 手按 vs 语音               | 1 段 5s 演示       | 否——UI 动效合成（按键高亮/声波）                        |
| 生态六家对比               | 1 张信息图         | 否——SVG 生成                                            |
| 8 个场景联动示意           | 8 张小卡图         | 否——信息图                                              |

**结论**：全部可用**自绘信息图 + 合成动效**完成，**不依赖实景照** —— 规避 #173 的实景照 `public:false` 阻塞。
素材统一放 `public/need-assets/`，附 `manifest.json`（asset → alt → 一句话解释），与 #179 素材库同思路。

## 5. 生态对比知识库（P3 资产）

落库形式：`src/lib/need-ecosystem.ts` 常量 + `knowledge/` 同步一份（AI 读同一份，不重复维护）。

六家：Apple Home / 米家 / 华为鸿蒙智家 / 欧瑞博 / KNX / Home Assistant，
每家 4 字段：`positioning`（一句话定位）/ `pros` / `cons` / `who`（适合谁）。

必含解释（业主语言）：

- **Matter**：跨生态「通用插头」，选 Matter 设备未来能换平台
- **协议一句话**：Zigbee（省电、要网关）/ 蓝牙 Mesh（便宜、响应稍慢）/ Thread（低功耗 mesh、需边界路由）/ WiFi（不用网关、费电占网）/ KNX（有线、必须预埋）
- **混合方案**：「Aqara/米家 做主体 + Apple Home 做面板层」是常见现实，**不逼二选一**

## 6. 接口清单（mp/v1 新增）

| 方法 | 路径                                  | 用途                                            | 备注                                        |
| ---- | ------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| GET  | `/mp/v1/need-leads/catalog`           | 选项定义 + 默认值 + 素材引用 + 生态库           | 可缓存；免登录                              |
| POST | `/mp/v1/need-leads`                   | 创建/更新草稿（按 token 或新建）                | 限流（IP+token）、字段白名单、体积上限 64KB |
| GET  | `/mp/v1/need-leads/[token]`           | 读回已填（续填）                                | 免登录                                      |
| POST | `/mp/v1/need-leads/[token]/structure` | 归一化 + 默认值 + 选型 + 估算 → 返回 structured | **不写库**（预览用）                        |
| POST | `/mp/v1/need-leads/[token]/submit`    | 落 structured + 建 Projects 草稿                | 幂等（已 converted 直接返回）               |
| POST | `/mp/v1/need-leads/[token]/bind`      | 可选绑手机                                      | 走现有 auth                                 |
| POST | `/mp/v1/need-leads/[token]/chat`      | AI 答疑（P3）                                   | 走 `handleAiChat`，知识库约束，禁报价       |

工作台：`/capabilities/need-leads` 列表 + 「打开草稿」（P1 末）。

## 7. 估算如何用 #195 的京东日常价

```
估算单价(deviceType) = median(该类型在售产品的 marketPrice)
                      ├─ marketPrice 缺失 → 回退 price，标记 basis='mixed'
                      └─ 两者都缺 → 不计入，写入 estimate.gaps（业主端显示「该项待补价」）
小计 = Σ(默认/用户数量 × 估算单价)
区间 = [小计 × 0.9, 小计 × 1.25]（安装+辅材+损耗，比例写在常量，可调）
```

业主端展示规则（与 #195 口径一致）：

- **只展示一个价**：京东日常价（`marketPrice`）作为市场参考；**不并列显示内部售价**
- 清单行展示「设备类型 × 数量 × 参考价」，不展示单个 SKU 的内部定价
- 缺价时不显示假价，写「待补价」，并在建议页说明「估算略低」
- 业主端不给正式报价（issue 明确不做）

## 8. 分期与可验证判据

| 期     | 内容                                                                                                                                        | 可验证判据                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | `need-leads` + `Projects.area/needLead` + `need-defaults` + `catalog`/`structure`/`submit` 三接口 + 小程序 S0/S1（问卷 Tab）+ S2 + 草稿生成 | ①3 组不同户型/面积（80㎡平层 / 140㎡平层 / 260㎡别墅）跑问卷 → 默认值符合规则表（开关数、网关 2 个提示、必配水暖烟）②生成的草稿在工作台可打开，字段正确 ③单测覆盖默认值全部规则 |
| **P2** | 演示对照素材（§4 全部 8 类，自绘/合成）+ S1 各步内嵌素材                                                                                    | ①每个选项都有图/视频且 alt+一句话解释 ②素材在 390px 窄屏可读 ③不引入实景照（无 public:false 依赖）                                                                              |
| **P3** | 生态对比知识库 + AI 答疑（知识库约束、禁报价）+ 三入口互通（场景/预算 Tab）                                                                 | ①AI 回答生态问题引用知识库原文，不出现自造价格 ②AI 超时/额度不足时问卷仍可独立完成 ③场景/预算 Tab 与问卷 answers 双向合并无丢失                                                 |
| **P4** | 分享/续填/保存、S3 一页建议打磨、S5 结果页                                                                                                  | ①退出再进入（换设备）能续填 ②建议页可生成图片分享 ③超长输入/答非所问有明确提示且不丢已答                                                                                        |

## 9. 待你确认

1. **可供货品牌清单**：默认值/选型只推实际能供货的品牌（影响 `need-defaults` 的品牌白名单）
2. **轻智能 / 全屋智能 价格区间**（每套或每㎡），用于 S1 第 2 步的对比表与估算校准
3. `need-leads` 命名是否接受
4. `Projects.area` 与 `Projects.needLead` 是否 P1 就加（草稿需要）
5. 素材用「自绘/合成」是否可接受（避免实景照阻塞）
