# 官方主站部署记录（PVE 容器，2026-10-23）

原先计划装在「黑豹」上（见 `docs/官方主站-用黑豹搭建.md`），黑豹一直没上线，
2026-10-23 改为装在运营方的 Proxmox VE 上。**凭据不写进仓库**，见运营方本机的
`~/Downloads/官方主站-凭据.txt`。

## 部署形态

| 项目 | 值 |
| --- | --- |
| PVE 主机 | 10.0.0.123（PVE 8.3.0，x86_64，4 核 / 15G 内存） |
| 容器 | CT 200 `fmkj-master`，Debian 12，2 核 / 3G 内存 / 24G 盘（local-lvm），开机自启 |
| 容器 IP | **10.0.0.50 静态**（由 PVE 侧 `pct set --net0 ip=...` 写死；特意落在路由器 DHCP 池 100-249 之外，不会被别的设备抢） |
| 应用目录 | `/opt/fmkj/app`（源码整体拷贝，非镜像部署；构建不再依赖 Google 字体） |
| 运行方式 | systemd `fmkj-master.service` → `next start -p 8890`，开机自启（2026-10-23 由 3000 改来，避开开发与设备常用端口） |
| 数据库 | 容器内 PostgreSQL 15，库/角色均为 `fmkj` |
| 日志 | `/var/log/fmkj-master.log` |
| 备份 | 每天 3:00 `pg_dump` → `/opt/fmkj/data/backups/`，保留 14 天 |

## 主站对外提供什么

- `GET /api/catalog/snapshot`：客户设备取官方资料。需要 `Authorization: Bearer $CATALOG_PUBLISH_TOKEN`；
  响应带 `X-Catalog-Revision`、`X-Catalog-Sha256`，配了 `CATALOG_SIGNING_KEY` 时另带
  `X-Catalog-Signature`（ed25519），设备用公钥验签确认「是官方发的」。
- `GET /api/catalog/asset?path=...`：同一令牌守卫，下发产品图。
- **成本价不下发**（已实测：资料包成本列 0 条有值）。

## 数据现状（2026-10-23 导入）

产品 728 条（其中 664 条已核验、可用于点位选型）、品牌 26、系列 144、型号 114。

## 重装时要注意（这次踩到的坑）

1. **Debian 源**：容器直连 `deb.debian.org` 会超时，换 `mirrors.aliyun.com` 与 `Acquire::ForceIPv4`。
2. **Node 版本**：应用要求 Node ≥22；走 npmmirror 下 `node-v22.11.0-linux-x64.tar.xz`。
3. **standalone 打包**：仓库默认 `output: "standalone"`，在 pnpm 结构下运行时会缺 `pg-protocol`
   （`Failed to load external module pg-...`）。主站部署改为注释掉该行、普通构建 + `next start`。
4. **数据库版本差**：从 PG17 导出、导入 PG15 时，dump 里的 `SET transaction_timeout` 会报错，需删掉该行；
   `products` 有自引用外键，导入需 `set local session_replication_role = replica`。
5. **首次进入**：空库时 `/login` 会 307 到 `/setup`，由运营方自己创建管理员账号。
6. **登录页必须 force-dynamic**：登录页要按请求判断「初始化了没有」，否则构建时若连得上空库，
   会把「跳去初始化」烤进静态页面，初始化完成后仍跳不过去（已在 `app/login/page.tsx` 修）。
7. **公网暴露前必须关自助注册**：`FMKJ_ALLOW_SELF_SIGNUP=false`，否则陌生人在公网上能注册账号。

## 后续

- 客户设备接入：设备侧填主站地址 + 取资料令牌 + 签名公钥，点「同步官方资料」。
  **公网已接通**：`https://catalog.fmkj.top` → 腾讯云 Caddy（自动 HTTPS）→ frps → 本容器 frpc → 8890。
  实测：设备从公网同步成功（删 5 条后同步全部补回），验签通过，成本价未下发。
- 外网访问：需要时再配 `catalog.fmkj.top`（走腾讯云那台做 HTTPS 终结）。
