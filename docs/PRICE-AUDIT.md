# 产品价格补齐与校准（issue #195）

> 目标：728 个产品全部有「京东/天猫到手价」参考值（`marketPrice`），
> 对外售价 `price` **永远由人工定价**，工具不自动改。

## 1. 为什么是半自动（实测结论）

自动抓取电商到手价在当前约束下**不可行**，已实测：

| 探测                                    | 结果                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `search.jd.com/Search?keyword=…`        | **HTTP 302** → `cfe.m.jd.com/privatedomain/risk_handler/...`（风控页） |
| `list.tmall.com/search_product.htm?q=…` | **HTTP 302**（无内容）                                                 |

两条都是平台反爬重定向，且工单明确「不引入需要账号登录的抓取方式」。
所以流程定为：**工具出清单 → 人工在浏览器里看到手价 → 工具校验分批入库**。

## 2. 「到手价」口径（需用户确认）

参考价取**单件实付到手价**，优先级从高到低：

1. **券后价**：商品页/下单页显示的可叠加优惠券用尽后的实付金额
2. **PLUS / 会员价**：仅当页面直接显示会员价时采用，另记口径标记
3. **秒杀/百亿补贴**：价格标注「限时」类活动价**不采用**（波动大，非稳定基准）
4. 运费、安装费**不计入**
5. 同一商品多规格时取**与库内 SKU 对应的规格**；无法对应则留空

口径标记写进 CSV 的「口径」列，便于日后复核；入库存 `priceSource`（链接）+ `priceCheckedAt`。

## 3. 数据模型（只增不改售价）

`products` 新增三个字段（已含 migration）：

| 字段             | 类型   | 说明                                    |
| ---------------- | ------ | --------------------------------------- |
| `marketPrice`    | number | 电商到手价参考值；`null`/0 = 未核对     |
| `priceSource`    | text   | 商品页 URL（京东自营 / 天猫官方旗舰店） |
| `priceCheckedAt` | date   | 写入时间                                |

`price`（对外售价）**不在工具的写入路径里**——`scripts/price-audit.ts` 没有任何写 `price` 的分支。

## 4. 工具用法

```bash
# 1) 出清单 + 覆盖率 + 偏差榜（不写库）
PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts \
DATABASE_URI=… pnpm exec payload run \
  --input '{"scriptPath":"scripts/price-audit.ts","scriptArgs":["--list","--out","/tmp/price-audit"]}'
# 产出：missing-price.csv / missing-price.json / deviation-top.csv / coverage.json

# 2) 人工填「参考价」「来源链接」「口径」后，分批入库（默认每批 50 条）
… scriptArgs:["--apply","/tmp/price-audit/missing-price.csv","--batch-size","50"]

# 3) 中断后续跑（读 progress.json，跳过已完成 SKU）
… scriptArgs:["--apply","/tmp/price-audit/missing-price.csv","--resume"]

# 4) 样本阶段小批量
… scriptArgs:["--apply","samples/price-samples.csv","--limit","15"]
```

**可恢复性（728 条必须能断点续跑）**

- 每写一条 → `sleep 120ms`（限速）
- 每 `--batch-size` 条 → 落 `*.progress.json`（已完成 SKU + 批次记录）
- 任一条写入失败 → **立即停止**、保存进度、非零退出（不硬刷、不循环重试）
- 重复跑安全：已完成的 SKU 自动跳过（幂等）
- 收尾写 `*.result.json`：写入数、跳过明细、批次表

## 5. 覆盖率与批次产出

`coverage.json`：

```json
{ "total": 728, "withMarketPrice": N, "missingMarketPrice": M,
  "coveragePct": X, "deviationOver20pct": K,
  "missingByDeviceType": {...}, "missingByBrand": {...} }
```

每批结束的 `result.json` 就是该批差异清单；`deviation-top.csv` 是「参考价 vs 售价偏差 >20%」的 Top 榜（交用户判断）。

## 6. 执行顺序（工单口径）

1. **先补 67 个缺价**（开关 34、暖通 17、网关 5、窗帘 4、传感器 4、灯具 3）——最影响选型
2. **再全量校准 661 个**，输出偏差 >20% 清单
3. 先跑 **10–20 个样本**确认口径 → 再批量

## 7. 样本（`samples/price-samples.csv`）

15 行，覆盖开关/传感器/网关/窗帘/暖通/灯具 6 类，其中 4 行标 `缺价位`。
**样本型号为常见市场型号，用于确认口径与流程，不是库内真实 SKU**；
真实 728 条清单需从生产库导出（`--list`）或由运营提供 Excel。

## 8. 当前阻塞

| 项                   | 状态                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| 真实 728 条 SKU 清单 | **BLOCKED**：本地演示库 `products` 为 0 行；Excel 不在仓库；未连生产（只读导出需授权） |
| 自动抓取到手价       | **不可行**：京东/天猫均 302 风控（见 §1），按工单改半自动                              |
| 端到端入库验证       | 已用合成数据验证（见下）                                                               |
