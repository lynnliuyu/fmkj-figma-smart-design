# fmkj_v3

繁梦空间（FMKJ V3）智能家居项目管理与方案报价系统：项目、点位图、产品库、方案报价、账号与权限。

技术栈：Next.js 16 · React 19 · TypeScript · PostgreSQL · Vitest。

> 业务背景与领域词汇见 `CONTEXT.md`，核心流程见 `docs/core-business-flow.md`，文档索引见 `docs/README.md`。

## 快速开始

本项目需要 PostgreSQL。开发环境用本机 Docker 起一套：

```bash
pnpm install
pnpm db:up                                   # 启动 Postgres 17 容器（127.0.0.1:15432）
cp .env.local.example .env.local             # 按注释改成连接串与 AUTH_SECRET
pnpm db:migrate                              # 建表
pnpm db:seed-admin --email=you@example.com --password='你的密码'
pnpm dev
```

然后打开 [http://localhost:3000](http://localhost:3000)，用刚创建的账号登录。数据库细节见 `docs/local-database.md`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发服务器（Turbopack） |
| `pnpm doctor` | 检查 Node/pnpm 与依赖环境 |
| `pnpm run doctor` | 执行仓库诊断：工作目录、Git、配置存在性与开发端口 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 运行 Vitest 测试 |
| `pnpm lint` | ESLint 检查 |
| `pnpm build` | 生产构建 |
| `pnpm db:up` / `db:down` / `db:reset` | 启动 / 停止 / 销毁本地数据库 |
| `pnpm db:migrate` | 执行数据库迁移（幂等） |
| `pnpm db:smoke` | 数据库连通性冒烟测试 |

代码修改后至少运行 `pnpm typecheck`；涉及产品、报价、认证或管理后台时，再运行相关的 `pnpm test`。

## 目录结构

- `app/`：Next.js 路由与 API
- `components/`：UI 组件（项目工作台、点位图、产品库等）
- `lib/`：业务逻辑与服务（点位图、产品选型、报价、账号体系）
- `scripts/`：数据库迁移、数据导入与维护脚本
- `docs/`：架构、ADR 与业务文档
- `plans/`：分阶段实施计划

## 参考资料

日常设计按“点位设计 → 报价单 → 客户交付”操作。默认型号可作明确标识的未核验客户报价，项目换型只影响本项目；保存来源报价的删除会联动删除安装点与场景引用。客户文件从固定 V 版本导出，当前编辑检查图在高级工具中。规则与验收见 [Plan 021](plans/021-workbench-workflow-consolidation.md) 和 [文档索引](docs/README.md)。

- [Next.js 文档](https://nextjs.org/docs)
- 本项目 v0 关联页面：[v0 项目](https://v0.app/chat/projects/prj_7BjUr3t8P6jQfTyuFxeIjY4bRSlB)
