# 本地开发环境

> 目标：在一台干净的 Mac 上，从零把站点跑起来并能登录看到真实页面。
> 本文记录的是**实测跑通**的路径，不是理论步骤。

---

## 为什么不能直接 `pnpm dev`

`src/payload.config.ts` 走的是 Figma Make 托管配置（`buildFigmaConfig`），
没有 `FIGMA_EID` 时会直接抛错：

```
Error: Environment ID could not be resolved. Set FIGMA_EID or initialize the project.
```

所以本地开发**必须用自托管配置**：`src/payload.selfhost.config.ts`，
并用 `PAYLOAD_CONFIG_PATH` 指向它。CI 也是这么做的（见 `.github/workflows/ci.yml`）。

---

## 一、准备 PostgreSQL

本地需要一个能连的 Postgres。Docker 不在时，可以直接用任意现成的 postgres 二进制
（例如 `.paperclip` 自带的 embedded postgres，实测 PostgreSQL 18.1 可用）。

```bash
PGDIR="<path-to-postgres-bin>"     # 含 initdb / pg_ctl / postgres 的目录
DATA="$HOME/.fmkj-dev-db"

# 首次：初始化数据目录
"$PGDIR/initdb" -D "$DATA" -U fmkj --auth=trust -E UTF8

# 启动（端口 55432，避开系统默认 5432 和别的项目）
"$PGDIR/pg_ctl" -D "$DATA" -o "-p 55432 -k /tmp" -l /tmp/pg-fmkj.log start
```

建库：

```bash
node -e "
const {Client}=require('./node_modules/.pnpm/pg@8.20.0/node_modules/pg');
(async()=>{
  const c=new Client({host:'127.0.0.1',port:55432,user:'fmkj',database:'postgres'});
  await c.connect();
  await c.query('create database fmkj').catch(()=>{});
  await c.end();
})();"
```

> 说明：`node_modules/.pnpm/pg@...` 是 pnpm 的路径形态，版本号可能变；
> 也可以 `pnpm add -D pg` 后用 `require('pg')`。

---

## 二、跑迁移建表

```bash
export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts
export PAYLOAD_SECRET=dev-local-secret-key-please-change
export DATABASE_URI="postgres://fmkj@127.0.0.1:55432/fmkj"
export PUBLIC_URL=http://localhost:3000
export NEXT_TELEMETRY_DISABLED=1

pnpm exec payload migrate
```

应看到全部迁移按顺序 `Migrated:`，最后 `Done.`。

---

## 三、建一个能登录的账号

仓库自带脚本：

```bash
NEW_PASSWORD='demo12345' pnpm exec payload run \
  --input '{"scriptPath":"scripts/set-password.ts","scriptArgs":["users","demo@fmkj.local"]}'
```

输出 `已创建并启用员工账号：demo@fmkj.local` 即成功。

> `admins` 对应 Payload 后台 `/admin` 的超级管理员；`users` 是应用账号。

---

## 四、起服务

**推荐用一键脚本**（自动改配置 + 起服务 + 退出时还原）：

```bash
bash scripts/dev-local.sh        # 默认 3000 端口
bash scripts/dev-local.sh 3001   # 指定端口
```

手动起也可以，但要记住两个坑：

```bash
# 关键：把 payload.config.ts 临时指向自托管配置（等价于 Dockerfile 的做法）
printf "export { default } from './payload.selfhost.config'\n" > src/payload.config.ts

export PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts
export DATABASE_URI="postgres://fmkj@127.0.0.1:55432/fmkj"
export PUBLIC_URL=http://localhost:3000

pnpm exec next dev --port 3000
```

⚠️ **坑**：如果你 `git checkout -- src/payload.config.ts` 还原了配置但
**没有重启 dev server**，服务下次加载就会报
`Environment ID could not be resolved`，整个 React 树水合失败、页面停在骨架屏。
改动配置后必须重启。

打开 http://localhost:3000/login ，用上面的邮箱密码登录。

⚠️ **提交代码前必须还原**：

```bash
git checkout -- src/payload.config.ts
```

---

## 登录方式说明

登录页默认可能落在**扫码** tab（取决于 `.env` 里是否配了 `PUBLIC_URL`：

```js
// src/lib/mp/auth.ts
export const qrLoginAvailable = () => process.env.FIGMA !== '1' && Boolean(process.env.PUBLIC_URL)
```

配了 `PUBLIC_URL` 就显示扫码；切到「邮箱密码登录」tab 才有邮箱输入框。
本地想看邮箱登录时，点该 tab 即可，不需要改代码。

---

## 常见坑

| 现象                                                  | 原因                       | 处理                                                    |
| ----------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| `Environment ID could not be resolved`                | 用了 Figma 配置            | 设 `PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts` |
| `cannot connect to Postgres (ECONNREFUSED)`           | 没起库 / 端口不对          | 按第一节起库，确认 `DATABASE_URI` 端口一致              |
| 建账号报 `You are not allowed to perform this action` | 脚本写入了已删除字段       | 已修（PR #33）；旧代码需先更新到 main                   |
| 打开页面 307 跳登录                                   | 未登录，工作台页面都要登录 | 先登录                                                  |
| 改了 `PLAN.md` 之类也 CI 红                           | CI 有格式检查              | 提交前跑 `pnpm format`                                  |

---

## 一键起环境（推荐）

```bash
bash scripts/dev-up.sh          # 起库 + 起 dev（:3000）
bash scripts/dev-up.sh 3001     # 换端口
bash scripts/dev-up.sh --db-only # 只起库
```

它解决了两个实际卡点：

1. **自动找 postgres 二进制** —— 本机没有 brew 版 postgres，实际可用的是
   paperclip 自带的 embedded-postgres。路径里的版本号会随 paperclip 升级变化，
   脚本用 glob 找，不写死。
2. **不自动跑迁移** —— 本地库是 dev 模式 push 出来的，直接 `payload migrate`
   会弹 `Would you like to proceed? (y/N)` 交互确认，非交互执行就卡死。
   而本地**本来就不需要迁移**。

自带账号：`demo@fmkj.local` / `demo12345`。

---

## 分级验证：别每次都跑生产构建

**这是最省时间的一条。** 2026-11-10 实测一轮「改一行 → 上线」的耗时分布：

| 环节                  | 耗时                                      |
| --------------------- | ----------------------------------------- |
| 改代码                | ~2 分钟                                   |
| 本地 `tsc` + `vitest` | ~15 秒                                    |
| 本地**生产构建**      | ~4 分钟                                   |
| CI                    | **8~15 分钟**（已改为 verify/smoke 并行） |
| 服务器 docker build   | ~2 分钟                                   |
| 切流量 + 验证         | ~2 分钟                                   |

按改动性质选验证方式：

| 改了什么                 | 怎么验                               | 耗时     |
| ------------------------ | ------------------------------------ | -------- |
| CSS / 文案 / 布局 / 交互 | `dev-up.sh` + Playwright 打 `:3000`  | **秒级** |
| 组件逻辑、状态、数据流   | 同上 + 逐项交互验证                  | 秒级     |
| **构建/压缩/SSR 相关**   | **必须** `pnpm build` + `next start` | ~4 分钟  |
| 发布前                   | 完整 CI + 影子部署                   | 十几分钟 |

⚠️ **例外情况必须用生产构建**：涉及**生产压缩**（函数名被压掉）、
**服务端渲染**、**standalone 产物**的改动。2026-11-10 就踩过一个
`dev 正常、线上菜单全没` 的坑 —— 根因是生产构建把组件函数名压成了匿名函数。
**dev 里永远测不出来。**
