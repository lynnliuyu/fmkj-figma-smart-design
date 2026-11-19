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

### 2.3 新增集合：单价表（版本化，见 §9）

拆两张表，才能同时满足「后台可改价」+「改价带版本与生效时间」+「已生成报价不动」：

**`pricing-plans`（一张逻辑单价表 / 一个地区或项目）**

| 字段        | 类型                    | 说明                                           |
| ----------- | ----------------------- | ---------------------------------------------- |
| `name`      | text required           | 如「长沙 2026 标准」「XX 项目专用」            |
| `region`    | text index              | 地区标识（`default` / `changsha` / …）         |
| `scope`     | select                  | `region` / `project`                           |
| `project`   | relationship → projects | 仅 scope=project                               |
| `isDefault` | checkbox                | 同 region 同 scope 只允许一个默认（hook 保证） |
| `status`    | select                  | `active` / `archived`                          |

**`pricing-versions`（单价表的版本，价格只存在这里）**

| 字段                          | 类型                         | 说明                                                                  |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `plan`                        | relationship → pricing-plans | 所属逻辑表                                                            |
| `version`                     | number                       | 自增（1,2,3…），同 plan 唯一                                          |
| `status`                      | select                       | `draft` / `scheduled` / `active` / `retired`                          |
| `effectiveFrom`               | date                         | 生效时间（可未来）；到点自动成为 active                               |
| `items`                       | array                        | `{ key, label, unit, unitPrice, calc, appliesTo, note }`（见 §9.2）   |
| `fees`                        | group                        | `{ commissioningPerSet, designFee, travelFee }`（**无管理费百分比**） |
| `exclusions`                  | text[]                       | 不含项声明（默认 5 条，见 §9.4）                                      |
| `changeNote`                  | text                         | 改价原因（审计用）                                                    |
| `publishedBy` / `publishedAt` | rel/user + date              | 发布人与时间                                                          |

**唯一性规则（hook）**：同一 plan 同时最多一个 `active`；发布新版本时把旧的置 `retired`（不删除）。

### 2.4 新增字段

- `Projects.area`（number，㎡）
- `Projects.needLead`（relationship → need-leads，可空）
- `Projects.pricingTable`（relationship → pricing-tables，可空 → 取默认表）
- `need-leads.pricingTable`（同上，草稿阶段先选定，项目继承）
- `need-leads.pricing`（json：三行明细 + 合计 + 工期，见 §9.4）
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

| 期     | 内容                                                                                                                                                                                                                                  | 可验证判据                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1** | `need-leads` + `pricing-tables`(seed 默认表) + `Projects.area/needLead/pricingTable` + `need-defaults` + `need-pricing` + `catalog`/`structure`/`submit`/`pricing-tables` 接口 + 小程序 S0/S1（问卷 Tab）+ S2（含三行报价）+ 草稿生成 | ①3 组户型（80/140/260㎡）默认值符合规则表（开关数、网关 2 个提示、必配水暖烟）②**报价单三段+不含项齐全**：设备费=京东日常价×数量（可展开看来源）、安装费逐项（v2 减半价）、合计+工期、不含项 5 条；**改价发布新版本后：新草稿用新价、旧报价快照完全不变**；版本时间线可查 ③生成的草稿工作台可打开且字段正确 ④单测覆盖默认值 + 计价 + 数量推导（含 >200㎡ 调试 2 套） |
| **P2** | 演示对照素材（§4 全部 8 类，自绘/合成）+ S1 各步内嵌素材                                                                                                                                                                              | ①每个选项都有图/视频且 alt+一句话解释 ②素材在 390px 窄屏可读 ③不引入实景照（无 public:false 依赖）                                                                                                                                                                                                                                                                   |
| **P3** | 生态对比知识库 + AI 答疑（知识库约束、禁报价）+ 三入口互通（场景/预算 Tab）                                                                                                                                                           | ①AI 回答生态问题引用知识库原文，不出现自造价格 ②AI 超时/额度不足时问卷仍可独立完成 ③场景/预算 Tab 与问卷 answers 双向合并无丢失                                                                                                                                                                                                                                      |
| **P4** | 分享/续填/保存、S3 一页建议打磨、S5 结果页                                                                                                                                                                                            | ①退出再进入（换设备）能续填 ②建议页可生成图片分享 ③超长输入/答非所问有明确提示且不丢已答                                                                                                                                                                                                                                                                             |

## 9. 计价模型 v2 + 市场价调整

### 9.1 总价公式（v2）

```
业主总价 = 设备费（京东日常价 × 数量，原样计入）
         + 安装费（按件/按米 单价表 v2）
         + 型材费（轨道/磁吸导轨/灯槽 按米）
         + 调试编程费（= 服务费，按套；不另收管理费百分比）
         + 可选：设计费 / 上门差旅
```

三条 v2 修正：

1. **不含水电范围** —— 删除「弱电点位布线」「回路改造」两项；报价单固定声明不含项
2. **服务费 = 调试编程费**，不收管理费/服务费百分比
3. **安装单价全部减半**（下表 v2）；调试费 800/套未减半（唯一利润项，用户 2026-11-19 已确认）

### 9.2 单价表 v2（默认值，后台可改）

| key                      | 类别                            | 单位 | v1  | **v2 现行**       | calc       |
| ------------------------ | ------------------------------- | ---- | --- | ----------------- | ---------- |
| `switch_panel`           | 智能开关面板                    | 个   | 40  | **20**            | per_unit   |
| `scene_panel`            | 场景/带屏面板                   | 个   | 60  | **30**            | per_unit   |
| `curtain_motor`          | 窗帘电机                        | 套   | 220 | **110**           | per_unit   |
| `curtain_track`          | 窗帘轨道型材                    | 米   | 90  | **45**            | per_meter  |
| `light_strip`            | 灯带                            | 米   | 45  | **22**            | per_meter  |
| `magnetic_track`         | 磁吸轨道/铝型材                 | 米   | 110 | **55**            | per_meter  |
| `downlight_install`      | 筒灯/射灯开孔安装               | 个   | 25  | **12**            | per_unit   |
| `sensor_install`         | 传感器（水浸/烟雾/门磁/人体）   | 个   | 25  | **12**            | per_unit   |
| `gateway_install`        | 网关/中控屏                     | 台   | 80  | **40**            | per_unit   |
| `camera_install`         | 摄像头                          | 个   | 120 | **60**            | per_unit   |
| `lock_install`           | 智能门锁                        | 把   | 200 | **100**           | per_unit   |
| ~~`weak_current_point`~~ | ~~弱电点位布线~~                | —    | 180 | **已删除**        | —          |
| ~~`circuit_modify`~~     | ~~回路/开关位改造~~             | —    | 260 | **已删除**        | —          |
| `commissioning`          | 系统调试 + 场景编程（= 服务费） | 套   | 800 | **800（已确认）** | per_system |
| `design`                 | 方案设计                        | 套   | 0   | 0（默认免费）     | per_system |

### 9.3 数量推导（纯函数 `need-pricing.ts`，与 §3 默认值同源）

| 项           | 推导                                                            |
| ------------ | --------------------------------------------------------------- |
| 开关面板     | 逐房间默认值之和（卧室/书房 3、客厅 3、餐厅玄关 2、卫生间 1–2） |
| 窗帘电机     | 有窗房间数；轨道米数 = Σ(窗宽 × 1.2)                            |
| 灯带米数     | 无主灯房间周长 × 0.6                                            |
| 磁吸轨道米数 | 无主灯区域面积 ÷ 4                                              |
| 传感器       | 厨卫阳台必配 + 其余每 2 房 1 个                                 |
| 调试套数     | 1 套；面积 > 200 ㎡ → 2 套                                      |

### 9.4 业主端报价单（三段 + 不含项声明）

```
① 设备费          ¥ 12,340  [展开明细 ▾]   ← 每条：设备 × 数量 × 京东日常价 [查看来源]
② 安装调试费       ¥ 4,660  [逐项 ▾]       ← 开关 12 个 × 20；窗帘 3 套 × 110；轨道 14.4 米 × 45；服务费 1 套 × 800
③ 合计 + 工期      ¥ 16,200  约 5–7 个工作日
④ 不含项          水电改造 / 开槽布线 / 强电施工 / 吊顶墙面修复 / 家电本体
```

不含项默认 5 条，存 `pricing-versions.exclusions`，可后台改文案；
**一页建议页与报价单都必须展示**，避免后续扯皮。

### 9.5 市场价调整（版本化 + 快照）

| 需求                   | 设计                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后台可编辑，不写死代码 | 单价只存在于 `pricing-versions.items`；代码里只有 key 常量的默认 seed                                                                              |
| 按地区覆盖             | `pricing-plans.scope=region` + `region` 字段；解析时取同 region 的默认 plan                                                                        |
| 按项目覆盖             | `pricing-plans.scope=project` + `project` 关系；优先级最高                                                                                         |
| 改价带版本与生效时间   | 每次改价 = 新建一个 version（draft/scheduled）→ 发布后 `effectiveFrom` 到点生效，旧的自动 `retired`                                                |
| 已生成报价不动         | 报价/草稿生成时把 `{planId, versionId, version, effectiveFrom, at, items 快照}` 写进 `need-leads.pricing.snapshot`（项目合同/报价单同样存快照）    |
| 价格历史可追溯         | `pricing-versions` 全量保留（retired 不删）；后台按 plan 列出时间线，可对比两版差异                                                                |
| 设备价同样刷新         | 设备价来自 `products.marketPrice`（#195，京东日常价）；报价快照存当次取值，之后刷新只影响新报价；如需完整变价历史，P2 再加 `product-price-history` |

**解析优先级**：项目 plan > 草稿 plan > 同 region 默认 plan > 全局默认 plan；
每个 plan 内取「`effectiveFrom <= now` 的最新 active 版本」。

**后台操作**：`pricing-plans` 列表 → 查看历史版本时间线 → 「复制为新版本并改价」→ 填生效时间与改价原因 → 发布。
（用 Payload 自定义 action / 版本列表视图实现，不需要另做前端后台。）

### 9.6 报价快照结构

```ts
type NeedPricing = {
  equipment: {
    deviceType: string
    productId: string | null
    name: string
    qty: number
    unitMarketPrice: number | null
    subtotal: number | null
    priceSource: string | null
  }[]
  install: {
    key: string
    label: string
    unit: string
    qty: number
    unitPrice: number
    subtotal: number
  }[]
  profile: { key: string; label: string; meters: number; unitPrice: number; subtotal: number }[]
  commissioning: { sets: number; unitPrice: number; subtotal: number }
  totals: {
    equipment: number
    install: number
    profile: number
    commissioning: number
    total: number
  }
  durationDays: { min: number; max: number }
  exclusions: string[]
  gaps: string[] // 缺京东日常价的设备
  snapshot: {
    planId: string
    versionId: string
    version: number
    effectiveFrom: string
    at: string
  }
}
```

## 10. 待你确认

1. **可供货品牌清单**：默认值/选型只推实际能供货的品牌（影响 `need-defaults` 的品牌白名单）
2. **轻智能 / 全屋智能 价格区间**（每套或每㎡），用于 S1 第 2 步的对比表与估算校准
3. `need-leads` 命名是否接受
4. `Projects.area` 与 `Projects.needLead` 是否 P1 就加（草稿需要）
5. 素材用「自绘/合成」是否可接受（避免实景照阻塞）
6. **管理费/服务费**：是否要（按设备费或总价百分比），还是全部并入安装费（默认不单列）
7. **型材/灯带按估算还是实结算**：默认「估算签、多退少补」，需你确认口径
8. 单价表是否按**地区**维护（默认表 + 地区覆盖），还是每项目手工选表
9. 调试费封顶规则：>200㎡ 按 2 套是否需要按点位加收（默认只按套）
10. ~~调试费 800/套是否减半~~ → **已确认 800/套，计入合计**（2026-11-19）
11. 不含项文案是否需要加「弱电点位由业主自装」等更明确表述
12. 设备价是否需要完整变价历史表（当前用报价快照 + `priceCheckedAt` 即可满足「旧报价不动」）
