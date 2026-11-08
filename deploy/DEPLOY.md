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

目前没有配置邮件服务，"忘记密码"邮件不会发出，需要用上面的命令重设。

## 6. HTTPS（Nginx）

应用只监听本机 `127.0.0.1:3000`。Nginx 示例：

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

## 7. 日常更新

在 Figma Make 里改完、推到 GitHub 后，在服务器上：

```bash
git pull
docker compose build app && docker compose up -d app
```

如果在 Figma 里改了数据结构（集合、字段），推送前需要生成迁移文件：

```bash
PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts DATABASE_URI=<一个测试用 PostgreSQL> \
  pnpm exec payload migrate:create
```

并把 `src/migrations/` 下的新文件一起提交。服务器重启时会自动执行。

## 8. 备份

```bash
# 数据库
docker compose exec db pg_dump -U fmkj fmkj | gzip > backup-$(date +%F).sql.gz
# 图片（使用磁盘存储时）
docker run --rm -v fmkj_media:/m -v $PWD:/b alpine tar czf /b/media-$(date +%F).tgz -C /m .
```

建议每天定时执行，并把备份复制到服务器以外的地方。卷名前缀取决于项目目录名，可用 `docker volume ls` 确认。

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

## 已验证 / 未验证

已在兼容 PostgreSQL 的测试库上验证：生产构建（不依赖数据库）、启动自动建表、全量数据导入（728 产品、745 图片、项目、报价）、管理员和员工设置密码后登录、图片上传和读取。

尚未验证：在真实 Docker 环境中执行 `docker compose build`、阿里云 OSS / 腾讯云 COS 实际上传。首次部署时请留意这两步的日志。
