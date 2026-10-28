# 034 Payload + PostgreSQL 重构

## 第 0 阶段结论：可行（方案 B）

在现有 Next.js 项目里直接安装 Payload，数据库使用 `@payloadcms/db-postgres`。

- **正式环境**：连接自有 PostgreSQL（Neon / 服务器 / 设备），只需 `DATABASE_URL`。
- **Figma 开发环境**：沙箱无法访问外部 PostgreSQL（5432 超时，Neon HTTPS 被出站策略拦截）。
  改为在进程内运行 PGlite（WASM 版 PostgreSQL），用 `@electric-sql/pglite-socket` 以标准
  PostgreSQL 协议暴露在本机端口（`maxConnections` 需设为 >1）。应用和 Payload 都按普通
  `DATABASE_URL` 连接，代码不区分环境。

已验证（2026-10-28）：

| 项目 | 结果 |
| --- | --- |
| 现有 35 个 SQL 迁移在 PGlite socket 上执行 | 通过，约 0.4 秒 |
| `pg.Pool` 20 个并发查询 + 事务回滚 | 通过 |
| Payload 3.92 + db-postgres 初始化（push 建表） | 通过，约 0.3 秒 |
| Payload 认证集合创建用户、登录、关系查询 | 通过 |

未采用方案 A（Figma 官方 Payload 工具）：它会把工作区切换成平台模板，再把旧应用移植进去，
对已有完整后端的 Next.js 项目等于重建，风险最高。

## 后续阶段

1. 基础与认证：Payload 配置、`@payloadcms/next` 管理后台、用户/账号/角色、登录与首次初始化、
   Figma 开发环境的 PGlite socket 启动（替换 `lib/demo-db.ts` 的进程内适配器）。需补 `graphql` 依赖。
2. 产品库　3. 项目核心　4. 点位图与报价　5. 组织、订阅与运营
6. 设备版与运维（可选）　7. 数据迁移与收尾
