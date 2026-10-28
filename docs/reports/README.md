# 报告归档

产品库采集、核对、清洗时产生的一次性产物。它们是结论与依据的出处，不是运行时代码，
统一放在这里，别放回仓库根目录。

## 目录

| 位置 | 内容 |
| --- | --- |
| `catalogue/` | 2026-10 产品库采集与核验产物：品牌清单（Apple Home、Aqara、小米、苏米）、点位参数、设备类型、图片来源修正与补采报告 |
| `product-images-unused-<date>.csv` | `pnpm products:prune` 生成的图片清理清单，含 `url / bytes / sha256 / moved_to`，用于随时复原 |
| `.local/reports/`（未入库） | 两个超过 3 MB 的交叉表导出（小米音箱清单、米家基础配置对照表），可由数据库重新导出 |

## 相关命令

```bash
pnpm products:audit     # 只读：磁盘图片 vs 数据库引用（含报价与交付快照）
pnpm products:prune     # 预演：列出未被引用的图片
pnpm products:prune --apply  # 移到 .local/unused-product-images/ 并写清单
pnpm products:optimize  # 预演：超标图片就地压缩
```

清理是可逆的：文件同时保留在 `.local/unused-product-images/`（同一相对路径）和 git 历史里，
按清单的 `url` 与 `moved_to` 一一对应即可还原。
