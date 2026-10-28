# Apple Home 生态产品采集入库 · 批次报告

批次 ID：`20261016-apple-home`　|　执行日期：2026-10-16

## 一、实际环境

| 项 | 值 |
|---|---|
| 工作站 | http://localhost:3000 |
| 数据库 | 127.0.0.1:15432 / fmkj（容器 fmkj-v3-db） |
| 写入入口 | 管理员 API `POST /api/admin/products` 逐条 + `POST /api/admin/products/bulk-review` 目录审核 |
| 备份 | `backups/fmkj-before-applehome-20261016-133603.dump`（54.8MB） |
| 采集底稿 | `.local/product-catalog-collection/20261016-apple-home/collection.json` |

## 二、结果汇总

| 指标 | 数值 |
|---|---:|
| 采集到候选 | 42 条 |
| 新建成功 | 42 条 |
| 跳过 / 重复 | 0 条 |
| 失败 | 0 条 |
| 目录审核批准 | 42 条（approved） |
| 产品库总量 | 747 → **789** 条 |
| Apple Home 平台 | 12 → **54** 条 |

## 三、来源与口径

| 品牌 | 来源 | 说明 |
|---|---|---|
| Apple/苹果 | Apple 中国大陆官网（apple.com.cn）商店页与规格页 | 实际抓取确认，非搜索摘要 |
| Aqara | Aqara 官网产品参数页（`www.aqara.com/{slug}_spec`） | 参数与 Apple 家庭支持均取自官网明文 |

**HomeKit 支持只认官网明文。** Aqara 官网 162 条在售产品中，仅 **49 条**页面明确列出支持 Apple 家庭；其余 113 条官网未提及，一律未收录。

## 四、按设备类型

| 设备类型 | 条数 |
|---|---:|
| `wall-switch` | 14 |
| `（类型字典缺项，待确认）` | 4 |
| `door-lock` | 4 |
| `curtain-motor` | 4 |
| `camera` | 3 |
| `accessory` | 2 |
| `doorbell` | 2 |
| `smart-speaker` | 2 |
| `socket` | 1 |
| `downlight` | 1 |
| `dimmer-controller` | 1 |
| `motion-sensor` | 1 |
| `smart-home-gateway` | 1 |
| `touch-control-panel` | 1 |
| `hvac-controller` | 1 |

## 五、还不能用于点位选型（4 条）

类型字典缺项，按规范**不借用不相干类型**，保留待确认：

| 产品 | 缺什么 |
|---|---|
| Aqara 妙控开关 S1E | 类型字典无「场景面板」，其角色是场景触发而非负载控制 |
| Aqara 无线开关 D1（贴墙式·单键/双键） | 同上，且为免布线无线场景开关 |
| Aqara LED 灯泡 T1（可调色温） | 类型字典无「灯泡」 |

> 这类缺口需要扩展 `lib/device-types.ts` 并配套规则才能解决，不能只插字典表。

## 六、可入库但价格待核（40 条）

**Aqara 官网产品页不公示售价**（只给跳转京东自营的按钮），本机环境无法访问京东价格接口；苏宁搜索页为 JS 渲染取不到可靠价格。
因此这 40 条 `price=0`、`pricingStatus=pending`，证据字段已明确写明「售价与成本未知，0 仅为系统占位，不表示免费或零成本」。

**价格已确认的只有 Apple 官方 2 款：**

| 产品 | 中国大陆官方价 |
|---|---:|
| Apple HomePod mini 2 | ￥1,099 |
| Apple HomePod（第二代） | ￥2,699 |

## 七、采集过程中的重要发现

1. **HomePod 已出双线新代次。** HomePod mini 2 于 2026-10-13 发布（S10 芯片、802.11ax、蓝牙 6、UWB），￥1,099，10-30 发售；HomePod 第二代在售但无线规格仍是 Wi-Fi 4 + 蓝牙 5.0。新项目做整体方案建议优先 mini 2。
2. **2020 款 HomePod mini 在中国大陆已下架**（购买页 301 跳转到 mini 2）。
3. **Apple 在中国大陆没有可用的 HomeKit 中枢路径之外的产品。** Apple TV 4K（第四代）与全新品类 Apple HomeView（首个带屏家庭中枢）在中国大陆均未销售（`apple.com.cn` 对应页返回 404），故未收录 —— 对国内项目而言，Apple 官方可用的家庭中枢只有 HomePod / HomePod mini 2。
4. **Aqara 的 HomeKit 存在官网明示的功能阉割**，做方案必须知道：
   - D1 系列：HomeKit **仅支持单键/双键版**，三键版不支持
   - FP2 在 HomeKit 下只暴露「存在」单传感器，8 分区 / 10 目标定位为 Aqara Home 独占
   - 筒射灯 T3 接入 Apple Home 后色温锁死 3500K/4000K，自适应照明不可用
   - 摄像机 / 门铃在 HomeKit 下只有实时画面与对讲，全部本地 AI 识别、人形追踪留在 Aqara Home
5. **网关路线分叉，不能互换理解**：M2 是传统 HomeKit 桥接（Zigbee/Thread → HomeKit）；G3/G410/G5 Pro 网关版内置 Zigbee 网关，可无独立网关方案；而新一代 Thread 机型（FP310、C100、LED灯泡T2、灯带控制器H1 等）官方口径只讲 Matter，**不提 HomeKit**，落地前须逐台验证。
6. **库中已有 3 条 Aqara 记录命名与官网不一致**（本批未改动，待你决定是否统一）：`AQ-D200I` 官网称「人脸识别智能门锁 D200」、`AQ-DOWNLIGHT-T2` 官网称「筒射灯 T2」、`AQ-DIMMER-T2` 官网称「双色温驱动器 T2」；另 `AQ-H1-CURTAIN`（窗帘电机 H1 双轨套装）官网已无此条目。

## 八、产品净图全部待补

本批 42 条 `image` 均为空。Aqara 官网 SSR 页面不暴露商品图（js 异步加载，参数页只有站点图标），京东/苏宁搜索页反爬，ZOL 未收录这些新型号。
按采集规范，商品图属独立的展示图库工作（`product_visual_assets`），不阻塞目录入库，故本批先保证型号、类型与证据准确。

---

## 附：逐条明细

| # | SKU | 产品名称 | 类型 | 型号 | 售价 | 状态 | ID |
|---:|---|---|---|---|---:|---|---|
| 1 | `AQARA-智能墙壁开关-H1-PRO-零火-单键版` | Aqara 智能墙壁开关 H1 Pro（零火·单键版） | `wall-switch` | QBKG30LM | 待核 | 1 | `c7ea03ea-e68e-4a0f-a8d5-fe5e7a85b55e` |
| 2 | `AQARA-智能墙壁开关-H1-PRO-零火-双键版` | Aqara 智能墙壁开关 H1 Pro（零火·双键版） | `wall-switch` | QBKG31LM | 待核 | 1 | `1cfe15ff-99f8-4e97-bebf-a378b29249d3` |
| 3 | `AQARA-智能墙壁开关-H1-单火线-单键版` | Aqara 智能墙壁开关 H1（单火线·单键版） | `wall-switch` | QBKG27LM | 待核 | 1 | `cb4ca1e6-6a35-4bcb-8d18-a8966ea56782` |
| 4 | `AQARA-智能墙壁开关-H1-单火线-双键版` | Aqara 智能墙壁开关 H1（单火线·双键版） | `wall-switch` | QBKG28LM | 待核 | 1 | `374dd2b8-1577-431d-b621-fc29d468f15a` |
| 5 | `AQARA-智能墙壁开关-H1-单火线-三键版` | Aqara 智能墙壁开关 H1（单火线·三键版） | `wall-switch` | QBKG29LM | 待核 | 1 | `42e1aa8e-068d-4bc8-9d8c-0f2e24b4b8bd` |
| 6 | `AQARA-智能墙壁开关-D1-单火线-单键版` | Aqara 智能墙壁开关 D1（单火线·单键版） | `wall-switch` | QBKG26LM | 待核 | 1 | `6cebc3f3-5dba-4dae-84ef-836c5a48e4d4` |
| 7 | `AQARA-智能墙壁开关-D1-单火线-双键版` | Aqara 智能墙壁开关 D1（单火线·双键版） | `wall-switch` | — | 待核 | 1 | `70eb96f4-0c3c-4c52-9788-7dcc273aad9a` |
| 8 | `AQARA-智能墙壁开关-D1-零火线-单键版` | Aqara 智能墙壁开关 D1（零火线·单键版） | `wall-switch` | — | 待核 | 1 | `8e80bed7-fe71-4340-b532-57af6216b2a9` |
| 9 | `AQARA-智能墙壁开关-D1-零火线-双键版` | Aqara 智能墙壁开关 D1（零火线·双键版） | `wall-switch` | — | 待核 | 1 | `b638d3d9-0c27-450a-b5aa-702b9aaa917e` |
| 10 | `AQARA-智能墙壁开关-L1-零火-单键` | Aqara 智能墙壁开关 L1（零火·单键） | `wall-switch` | ZNQBKG80LM | 待核 | 1 | `e3cfe77e-5df9-45e6-b4b2-ec4698eb175d` |
| 11 | `AQARA-智能墙壁开关-L1-零火-双键` | Aqara 智能墙壁开关 L1（零火·双键） | `wall-switch` | ZNQBKG81LM | 待核 | 1 | `9542b3e6-6958-4974-a678-bac3c0f375b0` |
| 12 | `AQARA-智能墙壁开关-L1-零火-三键` | Aqara 智能墙壁开关 L1（零火·三键） | `wall-switch` | ZNQBKG82LM | 待核 | 1 | `02c6f845-9cf3-4d72-84e5-e09a92306ec2` |
| 13 | `AQARA-智能墙壁开关-L1-单火-单键` | Aqara 智能墙壁开关 L1（单火·单键） | `wall-switch` | ZNQBKG83LM | 待核 | 1 | `9ddddbd6-b3dc-4923-b6e8-5e6cfec1fded` |
| 14 | `AQARA-智能墙壁开关-L1-单火-双键` | Aqara 智能墙壁开关 L1（单火·双键） | `wall-switch` | ZNQBKG84LM | 待核 | 1 | `c1d9b436-35a5-4ee7-a518-fbbdc2748c0e` |
| 15 | `AQARA-智能墙壁插座-ZIGBEE-版` | Aqara 智能墙壁插座（Zigbee 版） | `socket` | QBCZ11LM | 待核 | 1 | `6fbe7f5d-2f75-4065-b5f0-0e3caca24277` |
| 16 | `AQARA-单色温一体式筒射灯-T3` | Aqara 单色温一体式筒射灯 T3 | `downlight` | — | 待核 | 1 | `203c21a4-28c1-476c-b520-705ab1801628` |
| 17 | `AQARA-LED-灯泡-T1-可调色温` | Aqara LED 灯泡 T1（可调色温） | `待确认` | — | 待核 | 1 | `c18aa8b3-1f9b-4352-8bdb-99f51cfffe60` |
| 18 | `AQARA-双色温驱动器-T1-PRO` | Aqara 双色温驱动器 T1 Pro | `dimmer-controller` | — | 待核 | 1 | `e3ec2af1-9b74-4080-8e1a-baf6e85ba0fc` |
| 19 | `AQARA-人体传感器-E1` | Aqara 人体传感器 E1 | `motion-sensor` | RTCGO15LM | 待核 | 1 | `d49e9206-0bc3-4b35-b529-1175ed90e0ca` |
| 20 | `AQARA-智能门锁-A100-PRO` | Aqara 智能门锁 A100 Pro | `door-lock` | ZNMS02ES | 待核 | 1 | `9c038959-55e1-487a-abcf-8f1f5b02a500` |
| 21 | `AQARA-智能门锁-N100` | Aqara 智能门锁 N100 | `door-lock` | ZHWG11LM | 待核 | 1 | `3fe4f2c5-7866-4104-a426-c043b1cea5de` |
| 22 | `AQARA-智能门锁-N200` | Aqara 智能门锁 N200 | `door-lock` | — | 待核 | 1 | `39837e09-07fc-4b09-9288-7db02a398313` |
| 23 | `AQARA-全自动智能推拉锁-D100` | Aqara 全自动智能推拉锁 D100 | `door-lock` | ZNMS20LM | 待核 | 1 | `7c193956-8f9e-4904-876e-87eed28012cd` |
| 24 | `AQARA-智能窗帘电机-C2` | Aqara 智能窗帘电机 C2 | `curtain-motor` | ZNCLDJ14LM | 待核 | 1 | `7855d3d8-5efb-4354-885d-96a773011124` |
| 25 | `AQARA-智能窗帘电机-C3` | Aqara 智能窗帘电机 C3 | `curtain-motor` | ZNCLDJ01LM | 待核 | 1 | `d9b6bb43-6c95-4c9f-b5a5-915bab35f830` |
| 26 | `AQARA-智能窗帘电机-T2` | Aqara 智能窗帘电机 T2 | `curtain-motor` | ZNCLDJ27LM | 待核 | 1 | `e88b58a2-95ad-4efc-9fa7-204be69e94e9` |
| 27 | `AQARA-智能梦幻帘-H1` | Aqara 智能梦幻帘 H1 | `curtain-motor` | ZNMHLDJ01LM | 待核 | 1 | `ac0228bb-7cce-49c8-979d-b33f1f1675e9` |
| 28 | `AQARA-智能窗帘伴侣-E1` | Aqara 智能窗帘伴侣 E1 | `accessory` | ZNCLBL01LM | 待核 | 1 | `c07df664-93f3-4a84-be8d-cce51e24247e` |
| 29 | `AQARA-智能卷帘伴侣-E1` | Aqara 智能卷帘伴侣 E1 | `accessory` | ZNJLBL01LM | 待核 | 1 | `0e378f34-c9b5-4d38-8fad-375850ab0355` |
| 30 | `AQARA-智能摄像机-G3-网关版` | Aqara 智能摄像机 G3（网关版） | `camera` | ZNSXJ13LM | 待核 | 1 | `f1ba1836-5c50-4346-aa1b-37e53ecd923d` |
| 31 | `AQARA-智能摄像机-G100` | Aqara 智能摄像机 G100 | `camera` | ZNSXJ22LM | 待核 | 1 | `c3002a9f-f6a2-49bd-98c1-5341c9587ec5` |
| 32 | `AQARA-智能摄像机-E1` | Aqara 智能摄像机 E1 | `camera` | ZNSXJ16LM | 待核 | 1 | `15a48418-fed6-4640-a4c2-17a176a76f40` |
| 33 | `AQARA-智能可视门铃-G400` | Aqara 智能可视门铃 G400 | `doorbell` | ZNKSML11LM | 待核 | 1 | `a8d64e62-4d09-4cb2-9d90-9350a952a62b` |
| 34 | `AQARA-智能可视门铃-G410-网关版` | Aqara 智能可视门铃 G410（网关版） | `doorbell` | ZNKSML05 | 待核 | 1 | `cb5b5982-823a-411b-9d76-f8b5b8b71444` |
| 35 | `AQARA-网关-M2` | Aqara 网关 M2 | `smart-home-gateway` | ZHWG12LM | 待核 | 1 | `152e926c-a224-4174-a5b7-9353d5ba83f7` |
| 36 | `AQARA-集悦妙控屏-S1-PLUS-桌面版` | Aqara 集悦妙控屏 S1 Plus（桌面版） | `touch-control-panel` | — | 待核 | 1 | `7dca54b2-a5cd-4902-89cf-aad7a7b833ae` |
| 37 | `AQARA-妙控开关-S1E` | Aqara 妙控开关 S1E | `待确认` | CJPKG01LM | 待核 | 1 | `b9519a3f-fcc8-410a-8618-956adc044246` |
| 38 | `AQARA-空调伴侣-P3` | Aqara 空调伴侣 P3 | `hvac-controller` | KTBL12LM | 待核 | 1 | `afc9389c-7818-4dcc-9af8-4cd2389e7821` |
| 39 | `AQARA-无线开关-D1-贴墙式-单键` | Aqara 无线开关 D1（贴墙式·单键） | `待确认` | WXKG06LM | 待核 | 1 | `3bb27b18-7536-44fc-b039-d2ee9dd56115` |
| 40 | `AQARA-无线开关-D1-贴墙式-双键` | Aqara 无线开关 D1（贴墙式·双键） | `待确认` | WXKG07LM | 待核 | 1 | `41b85a37-a4dd-4009-821b-5ae6243a05f3` |
| 41 | `APPLE-HOMEPOD-MINI-2` | Apple HomePod mini 2 | `smart-speaker` | MGHJ4CH/A、MGHK4CH/A、MGHL4CH/A、MGHM4CH/A、MGKR4CH/A | ￥1099 | 1 | `42741b2a-e6b2-41d6-a470-acef7b56c3cb` |
| 42 | `APPLE-HOMEPOD-2ND` | Apple HomePod（第二代） | `smart-speaker` | MDF04CH/A（白色）、MDEX4CH/A（午夜色） | ￥2699 | 1 | `3367679d-b40c-4be8-9a66-b0176c6bbfe9` |
