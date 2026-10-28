# 繁梦空间 fmkj-v3 — 项目长期记忆

## 仓库与流水线（2026-10-18 起）

- 代码仓：`git@github.com:lynnliuyu/fmkj-v3.git`（私有，SSH，`main` 跟踪 `origin/main`）
- GitHub 账号是 **lynnliuyu**；`lynnliuyu1995-hub` 与 `Nooonnneee/fmkj_v3_architecture` 都不存在
- CI：`.github/workflows/ci.yml`，install → typecheck → lint → test → **build** → 图标产物 drift 检查
- 验证基线（`fd35a65` 全绿）：typecheck 通过、lint 0 error / 8 warning、84 个测试文件全通过、`pnpm build` 在无数据库环境通过
- 部署现状 Vercel，计划迁腾讯云 CloudBase（迁移时 sharp 需为真实依赖）

## 领域铁律

- `middleware.ts` 会 `jwtVerify`（验签 + 过期），但**不校验角色**；写操作必须在服务端 `requireSuperAdmin()`
- `tests/api-auth-surface.test.ts` 逐路由扫描，要求 handler 能在自身或其引用的 `lib/*-api` 工厂里追溯到 guard；新增无鉴权路由会直接失败
- `app/api/attachments` 已改为「会话 + `project.edit` + `projectVisibilityWhere()`」，`created_by` 用真实会话账号（此前完全无鉴权且写死系统用户）
- `pnpm build` 已进 CI，**构建阶段不连库**，不需要 `DATABASE_URL`；本地构建若撞沙箱删除拦截，用 `CODEBUDDY_SAFE_DELETE_ENABLED=0`
- `project_deliveries.snapshot` / `quote_items.product_snapshot` 含图片路径，历史快照引用的图不能当无引用清理
- 图标只能改生成器后 `pnpm icons:build`；测试里图标总数硬编码 44
- `scripts/run-migration.mjs` 按固定清单读 `*.sql`，这些文件不能改名或挪目录

## 数据现状（2026-10-18 本机库实测）

- 37 张表；789 产品 / 3 项目 / 2 报价（均草稿）/ 6 个交付版本 / 2336 条日志
- **789 条产品 `selection_status` 与 `pricing_status` 全部 `pending`**；587 条无 `specs`、91 条无 `device_type_id`、36 条无图、686 条 `catalog_kind=legacy`
- `organizations` 四张表、`orders`、`work_orders` 三表、`project_point_map_versions` 均为 0 行
- 套餐 6 个：FREE（1 项目 / 200MB / 无点位图）、PERSONAL_PRO ¥39·¥399、ENTERPRISE ¥199·¥1999（20 成员）、ENTERPRISE_CUSTOM

## 资源约定

- `public/assets/products` 只放被引用的图（当前 678 张）
- 未引用图移到 `.local/unused-product-images/`，清单在 `docs/reports/product-images-unused-*.csv`
- 采集/核验产物放 `docs/reports/catalogue/`；>3MB 的表格导出放 `.local/reports/`，不入库

## 协作偏好

- 删东西前先建快照/备份分支，并说明回滚路径；能用「移出 + 清单」就不直接 `rm`
- 本地绿不等于 CI 绿，推完必须看 Actions
