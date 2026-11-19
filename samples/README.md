# 价格样本（issue #195）

`samples/price-samples.csv`：15 行、6 类（开关/传感器/网关/窗帘/暖通/灯具），其中 **4 行标「缺价位」**。

## 用途

确认「京东日常价」口径与采集流程，**不是库内真实 SKU**。

## 填写规则

| 列       | 规则                                                                    |
| -------- | ----------------------------------------------------------------------- |
| 参考价   | 京东**日常价**；只有促销价 → **留空**，口径写「仅促销价（留空待人工）」 |
| 来源链接 | 京东自营商品页 URL                                                      |
| 口径     | `日常价` / `仅促销价（留空待人工）`                                     |
| 备注     | 规格差异（如灯带 2m/5m）、是否含安装                                    |

## 用完入库

```bash
pnpm exec payload run --input '{"scriptPath":"scripts/price-audit.ts","scriptArgs":["--apply","samples/price-samples.csv","--limit","15"]}'
```

写入 `marketPrice/priceSource/priceCheckedAt`，**不改 `price`**。
