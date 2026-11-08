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

```bash
# 关键：把 payload.config.ts 临时指向自托管配置（等价于 Dockerfile 的做法）
printf "export { default } from './payload.selfhost.config'\n" > src/payload.config.ts

pnpm exec next dev --port 3000
```

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
