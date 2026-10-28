# 归档脚本

这些脚本都已经在真实数据上跑完，外部没有任何引用（`app/`、`components/`、`lib/`、`tests/`、`package.json` 均为零引用），
从 `scripts/` 移到这里只是为了保留采集与清洗过程的可追溯性。**不要在新流程里再调用它们。**

`scripts/` 下留着的才是活脚本：`run-migration.mjs` 与它读取的 `*.sql`、`doctor.mjs`、`db-smoke-test.mjs`、
`check-neon.mjs`、`seed-admin.mjs`、`generate-point-icons.mjs`、`export-cad-review.*`、`cadcraft*`、
`prepare-cad-*`、`import-product-safety.mjs`（被 `tests/product-migration-safety.test.ts` 直接引用）。

## 分组

| 用途 | 文件 |
|---|---|
| 采集与图片下载 | `collect-product-images.mjs`、`download-aqara-images.py`、`download-fixed-images.py`、`aqara-eu-images.py`、`recrawl-aqara.py`、`build-apple-home-collection.py`、`build-apple-home-report.py`、`review-apple-home-batch.mjs`、`review-product-mapping.mjs` |
| 产品入库 | `import-catalog-collection.mjs`、`import-old-products.mjs`、`import-products-clean.mjs`、`import-products-from-postgres.mjs`、`import-scraped-products.mjs`、`import-sumi-products.mjs`、`rebuild-ruijie-products.mjs` |
| 字段清洗与补齐 | `apply-aqara-images.py`、`apply-aqara-price.py`、`apply-evidence.py`、`apply-fill-images.py`、`apply-fixed-images.py`、`apply-required-specs.py`、`derive-required-specs.py`、`fill-images.py`、`clean-product-names.mjs`、`normalize-old-products.mjs`、`normalize-product-tags.mjs`、`cleanup-import-issues.mjs`、`fix-xiaomi-camera-image.mjs`、`update-sumi-cost.mjs`、`update-xiaomi-speaker.mjs` |
| 分类与价格分析 | `classify-type-gap.py`、`classify-type-gap2.py`、`reclass-panel-products.py`、`align-device-types.mjs`、`tag-non-single.py`、`build-aqara-price-changes.py`、`rebuild-from-images.py` |
| 一次性数据/产物 | `seed-demo-products.mjs`、`create-point-map-presentation-bundle.mjs` |

`classify-type-gap.py` 与 `classify-type-gap2.py`、`apply-fill-images.py` 与 `apply-fixed-images.py` 是同一件事的两版迭代，
`-2`／`fixed` 是后一版；保留下来的意义只是查当时的判定规则。

## 已知不可运行

下面 5 个脚本把 Windows 绝对路径写死在代码里（`C:/Users/lynnl/...`），在 macOS 上直接跑会失败：

`collect-product-images.mjs`、`import-products-clean.mjs`、`import-scraped-products.mjs`、
`normalize-product-tags.mjs`、`rebuild-ruijie-products.mjs`

其中 5 个 `import-*.mjs` / `normalize-product-tags.mjs` 依赖 `../import-product-safety.mjs`，
移入归档后相对导入已同步改成 `../`，路径本身仍然有效。

历史执行记录见 `docs/`、`plans/` 与 `.workbuddy/memory/`。
