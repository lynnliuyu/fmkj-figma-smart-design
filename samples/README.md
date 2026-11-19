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

## 覆盖的设备类型（对应用户需求小助手的清单）

开关 `switch-1/2/3/4`、面板 `touch-panel`（含带屏）、传感器 `motion-sensor`/`contact-sensor`/`gas-sensor`、
网关 `gateway`、窗帘 `curtain-track`、暖通 `ac-router`/`touch-panel`、灯具 `downlight`/`light-strip`/`spotlight`、
安防 `camera`/`doorbell`/`smart-lock`、网络 `ap-node`。

> 21 行、10 类、4 个缺价位。价格小助手估算时按 `deviceType` 取 `marketPrice` 中位数；
> 这些样本填完后，P1 的估算链路即可用真实口径跑通。
