# FMKJ 自托管部署（国内云服务器）

Figma Make 继续作为开发环境；正式环境跑在你自己的服务器上，使用 PostgreSQL。两边代码相同，区别只在配置：

|          | Figma Make              | 自己的服务器                          |
| -------- | ----------------------- | ------------------------------------- |
| 配置文件 | `src/payload.config.ts` | `src/payload.selfhost.config.ts`      |
| 数据库   | Figma 托管              | PostgreSQL（Docker）                  |
| 图片     | Figma 托管              | 服务器磁盘，或阿里云 OSS / 腾讯云 COS |
| 登录     | 不变                    | 邮箱 + 密码                           |

Docker 构建时会自动把配置切到自托管版本，不需要改代码。

## 1. 准备服务器

- 推荐 2 核 4G 以上（构建时内存占用较高），Ubuntu 22.04/24.04。
- 安装 Docker 和 Docker Compose 插件。
- 域名需完成 ICP 备案才能在国内服务器上用 80/443 端口。

## 2. 拉代码并配置

```bash
git clone <你的 GitHub 仓库地址> fmkj && cd fmkj
cp deploy/selfhost.env.example .env
openssl rand -hex 32   # 生成两次，分别填 PAYLOAD_SECRET 和 POSTGRES_PASSWORD
nano .env              # 填写 PUBLIC_URL、密钥、可选的国内镜像和对象存储
```

`.env` 不会被提交到 Git。`PAYLOAD_SECRET` 设定后不要再改，否则所有人都要重新登录。

## 3. 构建并启动

```bash
docker compose build
docker compose up -d
docker compose logs -f app   # 看到 Migrated 和 Ready 即可
```

首次启动会自动建表。之后每次更新代码，数据库变更也会在启动时自动执行。

## 4. 迁移 Figma 里的数据

**第一步：在 Figma Make 里导出。** 让 Figma Make 里的 AI 执行（只读，不会改动 Figma 里的数据）：

```bash
pnpm exec payload run --input '{"scriptPath":"scripts/data-export.ts","scriptArgs":["/tmp/fmkj-export"]}'
```

导出内容为 `data.json` 和 `files/`（全部产品图片，约 140 MB）。**里面有客户姓名和电话，不要上传到 GitHub**，用 scp 等方式直接传到服务器项目目录下的 `import/`：

```
fmkj/import/data.json
fmkj/import/files/...
```

**第二步：在服务器上导入。**

```bash
docker compose --profile tools run --rm tools run --input '{"scriptPath":"scripts/data-import.ts","scriptArgs":["/import"]}'
```

- 保留原有 ID 和所有关联关系（产品-品牌-图片、项目-报价）。
- 可以重复执行：已存在的记录会跳过。
- 报价中已被删除的产品，链接会被清空；报价明细的名称、型号、价格保留。
- 导入完成后删除服务器上的 `import/` 目录。

## 5. 创建管理员、重设员工密码

Figma 的密码加密格式和服务器版不兼容，**员工原密码无法迁移**，需要逐个重新设置。密码通过环境变量传入，不会留在命令参数里：

```bash
# 后台管理员（/admin），不存在时自动创建
docker compose --profile tools run --rm -e NEW_PASSWORD='至少10位的密码' tools \
  run --input '{"scriptPath":"scripts/set-password.ts","scriptArgs":["admins","you@example.com"]}'

# 员工账号（系统登录）
docker compose --profile tools run --rm -e NEW_PASSWORD='至少10位的密码' tools \
  run --input '{"scriptPath":"scripts/set-password.ts","scriptArgs":["users","staff@example.com"]}'
```

邮件：用户侧的注册验证码 / 忘记密码走 `RESEND_API_KEY` + `SMTP_FROM`（或 `SMTP_HOST/USER/PASS`），
配好即可用。**Payload 后台 `/admin` 的「忘记密码」仍然不会发信** —— 自托管配置里没有给 Payload
装 email adapter，邮件只会打到容器日志。管理员忘记密码用上面的 `set-password.ts` 重设。

## 6. HTTPS（Nginx）

应用只监听本机 `127.0.0.1:3000`，前面需要一层反向代理。**主站 fmkj.top 实际用的是 Caddy**
（和同机的另一个业务共用，见第 7 节的影子部署）。下面是 Nginx 的等价写法，供新装机器参考：

```nginx
server {
  listen 443 ssl http2;
  server_name erp.example.com;
  ssl_certificate     /etc/nginx/ssl/erp.example.com.pem;
  ssl_certificate_key /etc/nginx/ssl/erp.example.com.key;
  client_max_body_size 50m;   # 图纸、图片上传

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
server { listen 80; server_name erp.example.com; return 301 https://$host$request_uri; }
```

证书可在阿里云/腾讯云控制台免费申请。

> **代理必须原样透传 `Host`**。成员 AI 渠道路由的 CSRF 判定只认 `Host`，**不认
> `X-Forwarded-Host`**（XFH 可以被客户端伪造，代理原样转发时会被绕过）。上面 nginx 的
> `proxy_set_header Host $host` 和主站 Caddy 的默认行为都满足；如果代理把 Host 改成
> 内网地址（如 `127.0.0.1:3000`）而只把域名放进 XFH，写渠道会被判成跨站并返回 403。

## 7. 日常更新

在 Figma Make 里改完、推到 GitHub 后，在服务器上：

```bash
git pull
docker compose build app && docker compose up -d app
```

### 主站 fmkj.top 用影子部署（不停机、可回滚）

`fmkj.top` 那台机器**同时跑着别的业务**（`fanmeng-gateway-*`），直接
`docker compose up -d` 会重建容器、短暂中断两个业务。主站更新走影子部署：

```bash
bash deploy/shadow-release.sh              # 备份库 → 新目录 → 新镜像 → 新端口 → 验证 → 切 Caddy
bash deploy/shadow-release.sh --rollback 13028   # 回滚到指定端口（先确认该端口有服务）
```

脚本第 4.5 步是切流量前的最后一道闸：**用真浏览器在影子上跑一遍冒烟**。

⚠️ 那台宿主机没装 node / pnpm / playwright，**脚本自己跑不了冒烟**。它会直接停下并提示，
不会静默跳过（2026-11-13 就因此在第 4.5 步中止过，表现为「镜像构建完了但流量没切」）。
正确做法是**在本机**通过 SSH 隧道跑：

```bash
# 1. 把影子容器的端口（脚本会打印，如 13029）隧道到本机
ssh -f -N -L 19128:127.0.0.1:13029 ubuntu@124.222.225.26

# 2. 本机跑冒烟（本机有 playwright）
SMOKE_BASE=http://127.0.0.1:19128 SMOKE_OUT=/tmp/fmkj-smoke node e2e/smoke.mjs

# 3. 通过后带 SKIP_SMOKE=1 重跑脚本完成切流量（镜像已构建，会复用）
SKIP_SMOKE=1 bash deploy/shadow-release.sh
```

想让自动冒烟真正跑起来，可以在服务器上装 node + playwright，或用带 playwright 的
sidecar 镜像执行 —— 目前都没有做，所以每次发布都是「本机跑冒烟 → 服务器切流量」。

如果在 Figma 里改了数据结构（集合、字段），推送前需要生成迁移文件：

```bash
PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts DATABASE_URI=<一个测试用 PostgreSQL> \
  pnpm exec payload migrate:create
```

并把 `src/migrations/` 下的新文件一起提交。服务器重启时会自动执行。

## 8. 备份

用 `deploy/backup.sh`，不要手敲 pg_dump —— 它多做两件事：写盘后立刻
`pg_restore --list` 校验（半截的 dump 恰恰能解压，看不出来），以及自动清理过期备份。

```bash
sudo install -m 755 deploy/backup.sh /opt/fmkj/bin/fmkj-backup.sh
sudo /opt/fmkj/bin/fmkj-backup.sh --db-only   # 先手动跑一次确认
```

挂到 cron（`/etc/cron.d/fmkj-backup`）：

```cron
30 3 * * * root /opt/fmkj/bin/fmkj-backup.sh >> /var/log/fmkj-backup.log 2>&1
```

策略：数据库每天一份 custom 格式、保留 14 天；素材卷满 7 天才打包、保留最近 2 份；
磁盘剩余不足 3G 时跳过素材。参数都能用环境变量覆盖（`KEEP_DB_DAYS` / `KEEP_MEDIA` /
`BACKUPS` / `DB_CONTAINER`）。

还原演练（**定期做一次，别等出事才第一次试**）：

```bash
docker exec fmkj-db-1 createdb -U fmkj restore_drill
docker exec -i fmkj-db-1 pg_restore -U fmkj -d restore_drill --no-owner < /opt/fmkj/backups/db-<时间>.dump
docker exec fmkj-db-1 psql -U fmkj -d restore_drill -tAc 'SELECT count(*) FROM projects;'
docker exec fmkj-db-1 dropdb -U fmkj restore_drill
```

备份目前落在**同一台服务器**上：能防误删、防写坏，防不了整机故障。异地副本
（对象存储 / 另一台机器）还需要单独配。

## 8.5 磁盘维护（2026-11-22 起）

发布脚本自带三道与磁盘相关的措施，**不需要手动记**：

1. **水位闸（不可绕过）**：构建前要求 `/opt/fmkj` 所在分区可用 **≥ 8 GB**，不足直接中止并列出该清什么。
   `MIN_FREE_GB` 只能往上调；设成 0/2 会被钳到 8（防止「先跳过一次」变成习惯）。
2. **构建缓存上限**：预检执行 `docker builder prune -f --keep-storage 2GB`，缓存不再无限增长。
3. **发布后轮转**：切流成功后执行 `deploy/disk-rotate.sh`，只保留最近 2 个 `releases/` 与最近 2 个
   `src-*` 暂存目录；被容器引用的、当前在服务的、`src-current`、`backups/` 一律不动。

另有每周一次的 `/tmp` 与系统日志维护。**一次性安装**：以下命令在**服务器上的仓库根目录**执行
（即包含 `deploy/` 的那一层，如 `/opt/fmkj/releases/<时间戳>/src`），整段可直接复制粘贴：

```bash
(
  set -euo pipefail
  sudo install -d -m 755 /opt/fmkj/bin /etc/systemd/journald.conf.d
  sudo install -m 755 deploy/disk-maintenance.sh /opt/fmkj/bin/fmkj-disk-maintenance.sh
  sudo install -m 755 deploy/disk-rotate.sh /opt/fmkj/bin/disk-rotate.sh
  sudo install -m 644 deploy/journald-disk.conf /etc/systemd/journald.conf.d/fmkj-disk.conf
  sudo systemctl restart systemd-journald

  printf '%s\n' '30 4 * * 0 root /opt/fmkj/bin/fmkj-disk-maintenance.sh >> /var/log/fmkj-disk.log 2>&1' \
    | sudo tee /etc/cron.d/fmkj-disk
  sudo chmod 644 /etc/cron.d/fmkj-disk
  sudo systemctl is-active cron systemd-journald
  sudo systemd-analyze cat-config systemd/journald.conf | grep -Fx 'SystemMaxUse=200M'
  sudo journalctl --disk-usage
  sudo env DRY_RUN=1 bash /opt/fmkj/bin/fmkj-disk-maintenance.sh
)
```

确认 cron 和 journald 都显示 `active`，配置中有 `SystemMaxUse=200M`，并检查 dry-run 列出的保留和待删目录。每周日 04:30 执行清理。

`disk-maintenance.sh` 清的是 `/tmp` 里 3 天前的构建/测试残留（跳过 `eevee-release-*`、`systemd-private-*`、
socket 等），并把 journal 收到 200 MB。它**不碰**备份、发布目录、数据库卷。

为什么要这几条：2026-11-22 实测服务器只剩 1.4 GB 可用，根因是 19 个从没人清的手工发布 `src-*`
暂存目录（2.5 GB）、攒了一个月的 `/tmp` 残留（4.28 GB）与 3.8 GB 构建缓存。清理后回到 12 GB。

## 9. 桌面客户端（Windows / macOS）

客户端源码在 `desktop/`，打包方法见 `desktop/README.md`。客户端加载的是服务器上的网页工作台，服务器只需要托管安装包和自动更新清单：

1. 安装包放在项目目录下的 `desktop-releases/`（docker-compose 已只读挂载到容器的 `/data/desktop`）：

   ```bash
   mkdir -p desktop-releases
   # 在打包的电脑上（desktop/ 目录）执行：先传安装包，最后传更新清单
   sh scripts/upload.sh 用户@服务器:/项目目录/desktop-releases
   ```

   需要的文件：Windows 为 `FanmengSpace-Setup-<版本>.exe`、`.exe.blockmap`、`latest.yml`；macOS 为 `FanmengSpace-<版本>-mac-*.dmg`/`.zip`、`latest-mac.yml`。

2. 上传后不用重启：`/download` 页面一分钟内显示新版本；Windows 客户端会自动下载更新，macOS 客户端会提示前往下载页。
3. 首次启用需要重建一次镜像（新增了下载页和 `/downloads/desktop/*` 路由）：`docker compose build app && docker compose up -d app`。
4. 安装包也可以放在对象存储 / CDN：在 `.env` 设置 `DESKTOP_RELEASES_URL=https://cdn.example.com/desktop`，本地目录没有的文件会跳转过去。

固定下载地址可以印在宣传物料上：`/downloads/desktop/latest/windows`、`/downloads/desktop/latest/mac-arm64`、`/downloads/desktop/latest/mac-x64`。

客户端默认连接 `https://fmkj.top`（`desktop/app-config.json` 的 `defaultServerUrl`）。正式域名不同时，改这里后重新打包；私有部署的用户也可以在客户端「帮助 → 服务器设置」里填写自己的地址。

## 10. 轮换 PAYLOAD_SECRET（成员 AI 渠道密钥）

成员自填的 AI 渠道 key 用 AES-256-GCM 加密存库，钥匙材料是 `PAYLOAD_SECRET`，
密文里带钥匙代次（`v1:<keyId>:...`）。**只换 `PAYLOAD_SECRET` 不按本节做，所有成员的
渠道会同时解不开**，每次测试连通性都报「这个渠道的密钥无法解密（PAYLOAD_SECRET 可能已更换）」。
注意换 `PAYLOAD_SECRET` 还会让所有人重新登录（它同时签 JWT），这是预期现象。

### 10.1 先处理首版的旧格式密文（有就做，没有可跳过）

最早一批密文是 `v1:<base64url>`（没有 keyId），它们的钥匙**固定是当前的
`PAYLOAD_SECRET`**，`AI_CHANNELS_OLD_KEYS` 救不了。所以必须在换 secret **之前**
先把它们升级成带代次的格式：

```bash
# 保持 .env 里的 PAYLOAD_SECRET / AI_CHANNELS_KEY_ID 不动，先空跑再真跑
docker compose --profile tools run --rm tools run \
  --input '{"scriptPath":"scripts/rotate-ai-channels-key.ts","scriptArgs":["--dry-run"]}'
docker compose --profile tools run --rm tools run \
  --input '{"scriptPath":"scripts/rotate-ai-channels-key.ts"}'
```

再空跑一次，看到 `升级=0 失败=0` 才继续。**先换 secret 再跑就晚了**：旧格式会被当成
新 secret 派生，直接解密失败，只能让用户重新填 key。

### 10.2 换钥匙（按顺序做）

1. **先备份**（第 8 节）：`sudo /opt/fmkj/bin/fmkj-backup.sh --db-only`。
2. 改 `.env`：`PAYLOAD_SECRET` 写新值，`AI_CHANNELS_KEY_ID` 改成新代次（如 `k2`），
   旧代次和旧 secret 放进旧钥匙环：

   ```dotenv
   PAYLOAD_SECRET=<新 secret>
   AI_CHANNELS_KEY_ID=k2
   AI_CHANNELS_OLD_KEYS='{"k1":"<旧的 PAYLOAD_SECRET>"}'
   ```

3. 让应用用上新配置：`docker compose up -d app`。此时旧密文能靠 `k1` 解，新写入用 `k2`。
4. 先空跑看条数：

   ```bash
   docker compose --profile tools run --rm tools run \
     --input '{"scriptPath":"scripts/rotate-ai-channels-key.ts","scriptArgs":["--dry-run"]}'
   ```

   预期 `失败=0`，`升级` = 需要重加密的渠道数（`用户待更新` 是涉及的用户数）。

5. 真跑：

   ```bash
   docker compose --profile tools run --rm tools run \
     --input '{"scriptPath":"scripts/rotate-ai-channels-key.ts"}'
   ```

   看到 `升级=N 失败=0` 即完成；脚本幂等，中途断了补上 `AI_CHANNELS_OLD_KEYS` 重跑即可。

6. **确认**：再空跑一次，必须 `升级=0 失败=0`。
7. **确认之后**才从 `.env` 删掉 `AI_CHANNELS_OLD_KEYS`，再 `docker compose up -d app`。
   顺手在桌面客户端点一次「测试连通性」，确认已有渠道仍可用。

### 10.3 不按这个顺序做会怎样

- 只换 `PAYLOAD_SECRET`、不设 `AI_CHANNELS_OLD_KEYS`、也不跑脚本 → 库里的 `v1:k1:...`
  找不到 k1 的钥匙材料，**所有成员渠道同时解密失败**；用户只能重新填 key。
- 没看到 `升级=0 失败=0` 就删 `AI_CHANNELS_OLD_KEYS` → 还没升级的条目立刻解不开；
  把旧钥匙环补回去重跑脚本即可恢复（脚本只重加密密文，不删除 `models` 等其它字段）。
- 轮换窗口内让成员照常改渠道 → 脚本是「读整份 `companyProfile` → 重加密 → 写回」，
  与成员同时保存会互相覆盖（最后写入者赢）。请在跑脚本前让成员暂停修改 AI 渠道，
  或选择低峰期执行；脚本不会自动合并并发修改。
- 改了 `AI_CHANNELS_KEY_ID` 却没给旧代次配 `AI_CHANNELS_OLD_KEYS` → 和第一条一样。
- 旧格式密文没在换 secret 前升级 → 换完就永久解不开（见 10.1），所以顺序不能反。

## 已验证 / 未验证

已在兼容 PostgreSQL 的测试库上验证：生产构建（不依赖数据库）、启动自动建表、全量数据导入（728 产品、745 图片、项目、报价）、管理员和员工设置密码后登录、图片上传和读取。

尚未验证：在真实 Docker 环境中执行 `docker compose build`、阿里云 OSS / 腾讯云 COS 实际上传。首次部署时请留意这两步的日志。
