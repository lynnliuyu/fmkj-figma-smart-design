# 本地设备版部署与更新

适用形态：**本地设备版 + 自建开源**（ADR 0010）。官方产品库 / 接口按订阅收费，属独立流程。

本文是操作说明；领域规则以 `CONTEXT.md` 与 `docs/adr/` 为准，执行状态记在 `plans/033`。

> 状态（2026-10-22）：已在**真实设备**（黑豹 X2 / RK3566 / arm64 / Armbian 26.11，与出货同型号）
> 上跑通：一条命令装机、页面点按钮在线更新（v0.1.4 → v0.3.8 连续多次）、母盘清数据与首次开机
> 初始化、客户自助备份与恢复、报价单品牌（公司名/logo/联系方式/地址/二维码）。
> 具体证据、真机上暴露并修掉的问题见 `plans/033`。

## 我要做什么，看哪一节

| 我要做的事 | 看这里 |
| --- | --- |
| 装一台新设备（零散几台） | [2.1 标准流程](#21-标准流程推荐) |
| 批量出货（一次刷多台） | [2.4 母盘](#24-母盘批量出货) |
| 出一版新镜像（发新版） | [3. 发布新版本镜像](#3-发布新版本镜像运营方侧) |
| 客户要更新设备 | [4.1 在线更新](#41-在线更新客户在页面上点按钮)（客户自己点按钮） |
| 页面打不开，用命令更新 | [4.2 命令更新与定时检查](#42-命令更新与定时检查保底) |
| 备份 / 恢复客户数据 | [5. 备份与恢复](#5-备份与恢复) |
| 发货前自检 | [5.2 发货前自检](#52-发货前自检一条命令) |
| 客户要在外网用（内网穿透） | [6. 让客户在外网访问](#6-让客户在外网访问内网穿透-反向代理-vpn) |
| 设备出问题了 | [9. 排障](#9-排障) |

## 1. 设备上有什么

```
宿主机
├── /opt/fmkj/app                部署目录（compose + 配置 + 宿主机侧脚本；不必是 git 检出）
│   ├── docker-compose.appliance.yml              默认：自带库
│   ├── docker-compose.appliance-external-db.yml  可选：接你自己的 PostgreSQL（见 1.1）
│   ├── .env                     compose 插值：跑哪一版镜像（不进版本库）
│   ├── .env.production          业务配置（不进版本库）
│   ├── scripts/deploy/          更新与备份脚本
│   ├── deploy-state/            更新锁与 update-state.json
│   └── backups/appliance/       备份产出
├── /opt/fmkj/tools/node         宿主机侧脚本用的 Node 运行时（设备通常不自带 Node）
├── Docker
│   ├── fmkj-v3                  业务容器（不含 docker socket，不发布数据库端口）
│   ├── fmkj-v3-db               业务库 PostgreSQL，数据卷 fmkj-v3-db
│   └── fmkj-v3-uploads          上传附件数据卷
└── systemd（可选）
    ├── fmkj-update.timer        定时检查更新（只提醒，不自动跨版本升级）
    └── fmkj-backup.timer        定时备份
```

设备上需要三个镜像，缺一不可：

| 镜像 | 用途 |
| --- | --- |
| 业务镜像（如 `<仓库>/fmkj-v3:v0.1.0`） | 应用本体，同时提供迁移/建管理员脚本 |
| `postgres:17-alpine` | 业务库；`deploy:backup` 与更新校验也用它 |
| `alpine` | 备份时打包上传卷 |

黑豹 X2 实测**拉不通 Docker Hub**（`registry-1.docker.io` 超时），所以这三个镜像要么来自设备
能访问的自建仓库，要么用 `docker save` / `docker load` 离线导入。

附件存储：`FILE_STORAGE=local`（默认）把上传文件写进 `fmkj-v3-uploads` 数据卷，浏览器通过受鉴权的
`/api/files/<kind>/<ownerId>/<文件名>` 读取；设为 `blob` 才走 Vercel Blob 的公网 URL。
**备份必须包含数据库与这个卷**，否则恢复后附件全丢。

三条硬约束（ADR 0010）：

1. **业务容器不持有 docker socket**，更新由宿主机脚本执行。
2. **软件升级 / 产品库同步 / 业务备份是三个独立流程**，不互相触发。
3. **数据库结构变化后，恢复不能只靠切回旧镜像**。

### 1.1 数据来源：默认自带库，也可以接你自己的库

设备默认**自带业务库**（`docker-compose.appliance.yml` 里的 `postgres` 服务），开箱即用、断网可用。
如果客户/公司已经有自己的 PostgreSQL，就换成 `docker-compose.appliance-external-db.yml`：
同一套业务核心，只是把数据放在外部库里。

| | 默认：自带库 | 可选：外部库 |
|---|---|---|
| 编排文件 | `docker-compose.appliance.yml` | `docker-compose.appliance-external-db.yml` |
| 数据库 | 设备上的 `fmkj-v3-db` 容器 + `fmkj-v3-db` 卷 | 你自己的 PostgreSQL（`.env.production` 的 `DATABASE_URL`） |
| `.env.production` | `DATABASE_URL` + `POSTGRES_USER/PASSWORD/DB`（口令一致） | 只要 `DATABASE_URL` 指向外部库，不需要 `POSTGRES_*` |
| 备份 | 进数据库容器 dump（不需要连接串） | 宿主机侧用 `postgres:17-alpine` 里的 `pg_dump` 连外部库（设备要有该镜像且能直连该库） |
| 数据运维 | 由设备维护（备份、恢复、扩容都在设备上） | 由那个库的使用者负责；设备只连过去 |
| 2026-10-21 真机验证 | 首次部署、备份、真实恢复、更新 | 迁移、启动、`/login` 200、备份 |

**两种模式互斥**：两者用同一个项目名与同一个容器名（`fmkj-v3`），切到外部库模式会**重建**应用容器。
自带库的数据卷不会被动到，切回来数据仍在（实测：切回后 users=1、26 条迁移账本不变）。
切换步骤就是把对应的编排文件当作 `/opt/fmkj/app` 下的 `docker-compose.appliance.yml` 使用，
`up -d` 一次，再按第 5 节验证；更新脚本用 `--compose-file` 指向当前在用的那一份。

第三类数据来源是**官方产品资料接口**（订阅制）：设备定期取增量、失败时本地照常可用，
**代码尚未实现**，合同见第 8 节。业务数据（客户项目、点位、报价、交付、附件）按 ADR 0010
**不经过任何上游接口**，只在设备本地或你指定的数据库里。

## 2. 首次部署（每台新设备：一条命令）

### 2.1 标准流程（推荐）

```bash
# 0) 按你现有的刷法刷好系统（Armbian，与本机同型号），接上网线，记下设备 IP。
# 1) 把装机包拷过去（U 盘或 scp 都行；包约 400KB，镜像由设备自己从你的仓库拉）
scp fmkj-install-v0.3.5.tar.gz root@<设备IP>:/tmp/
ssh root@<设备IP>
mkdir -p /tmp/fmkj-bundle && tar xzf /tmp/fmkj-install-v0.3.5.tar.gz -C /tmp/fmkj-bundle

# 2) 一条命令装机（把 <自建仓库> 换成你的镜像仓库地址）
cd /tmp/fmkj-bundle && bash install-appliance.sh \
  --registry <自建仓库>/fmkj-v3 --version v0.3.5

# 3) 交付：浏览器打开 http://<设备IP>:8890
#    第一次打开会让客户自己设置管理员账号（名字、邮箱、密码），设完直接进入工作台。
```

装机包怎么来（运营方侧，每出一版打一个）：

```bash
node scripts/deploy/make-install-bundle.mjs --version v0.3.5
# → dist/fmkj-install-v0.3.5.tar.gz
```

脚本按顺序做九件事，每步都会打印结果：

| 步骤 | 做了什么 |
| --- | --- |
| 1 | 检查环境：root、docker 在不在、磁盘够不够、容器名有没有被别的项目占用 |
| 2 | 建目录，放好编排与宿主机脚本 |
| 3 | 生成 `.env` 与 `.env.production`（数据库密码与会话密钥都是现场随机生成，不经过任何人） |
| 4 | 宿主机侧的 Node（跑更新脚本要用；系统自带 ≥22 就用系统的） |
| 5 | 从你的仓库拉镜像 |
| 6 | 起数据库 |
| 7 | 建表（迁移） |
| 8 | 起应用，装更新管家与每日检查（systemd，开机自启） |
| 9 | 自检：站点、初始化状态、未登录必须被拦；**不过会以非 0 退出并写明「先别交付」** |

**管理员账号不在这里创建**：设备出厂时数据库是空的，客户第一次打开页面自己设，我们不经手客户的密码。

首次设置完成会在数据库里保留永久记录；停用、降级或删除管理员都不会重新开放匿名设置。旧安装升级时也会根据已有账号或客户资料补上记录。管理员无法登录时，按下面的本机管理步骤恢复账号，不要通过首次设置页重建；只有清空数据后重新出厂的设备才重新进入首次设置。

### 2.2 手工步骤（排障/特殊环境用）

装机脚本就是下面这些命令的封装；脚本在某一步失败时，可以照这里手工接着做：

```bash
# 1) 目录与配置
mkdir -p /opt/fmkj/app && cd /opt/fmkj/app
cp <仓库>/docker-compose.appliance.yml .
cp <仓库>/.env.appliance.example .env                     # 镜像地址、绑定地址
cp <仓库>/.env.production.example .env.production         # 必填见下
chmod 600 .env.production

# .env.production 必填：DATABASE_URL、DATABASE_SSL=false、AUTH_SECRET（openssl rand -base64 32）、
# POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB（与 DATABASE_URL 一致）；AUTH_DEV_MODE 必须关闭。

# 2) 镜像就位（二选一）
docker pull <自建仓库>/fmkj-v3:v0.1.0 && docker tag <自建仓库>/fmkj-v3:v0.1.0 fmkj-v3:v0.1.0
# 离线：docker load < fmkj-images.tar.gz
# 若 postgres / alpine 也要从自建仓库取，就把 POSTGRES_IMAGE 指向镜像副本（见 .env.appliance.example）。

# 3) 起库 → 建表 → 第一个管理员 → 起应用
docker compose -f docker-compose.appliance.yml up -d postgres
docker compose -f docker-compose.appliance.yml run --rm app node scripts/run-migration.mjs
docker compose -f docker-compose.appliance.yml run --rm app node scripts/seed-admin.mjs \
  --email=you@example.com --password='你的密码'
docker compose -f docker-compose.appliance.yml up -d
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8890/login   # 期望 200
```

局域网访问：默认 `FMKJ_BIND=0.0.0.0`，浏览器打开 `http://<设备IP>:8890`。
只想本机访问就设 `FMKJ_BIND=127.0.0.1`，再用 SSH 端口转发。**不要**为了省事把
`AUTH_COOKIE_SECURE` 设成 `true`：那会让浏览器在 http 下不保存会话 Cookie，表现为「登录
提示成功但还是未登录」（用 HTTPS 反代时才需要它）。

### 2.3 宿主机侧脚本需要 Node

`scripts/deploy/*.mjs` 由宿主机执行（ADR 0010：业务容器不持有 docker socket），
所以宿主机要有 Node ≥22。设备发行版不一定自带（Armbian 实测没有），可以随设备放一份：

```bash
mkdir -p /opt/fmkj/tools && cd /opt/fmkj/tools
curl -fsSLO https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-arm64.tar.xz
tar xJf node-v22.23.4-linux-arm64.tar.xz && mv node-v22.23.4-linux-arm64 node
/opt/fmkj/tools/node/bin/node -v
```

之后所有宿主机侧命令都用 `/opt/fmkj/tools/node/bin/node`（或把 `bin` 加进 PATH）。

### 2.4 母盘（批量出货）

一台一台跑装机命令还是慢。要批量出货就做一张**母盘**：装好一台母机 → 清数据、清密钥 →
读成镜像 → 之后新设备插卡开机就自己初始化。

```bash
# 在母机上（已按 2.1 装好、建议先升到最新版本）
bash /opt/fmkj/app/scripts/deploy/prepare-golden.sh --yes
#   --dry-run 先看它打算删什么；执行完会自动关机

# 用你现有的刷机工具把这张卡 / eMMC 读成镜像 → 刷到新设备
# 新设备第一次开机会自动：
#   · 生成这台设备自己的会话密钥与数据库密码
#   · 重建 SSH 主机密钥（克隆的设备不能共用身份）
#   · 重建数据库并跑迁移
#   · 起服务，并去掉「待初始化」标记
# 之后客户打开 http://<设备IP>:8890，引导他设置管理员账号。
```

母盘里**不带**上一台的任何东西：客户项目、报价、交付、附件、备份、日志、密钥全部清掉。
`prepare-golden.sh` 删数据卷前会核对「这个卷是不是本项目的」，不是就直接停下——
同一台机器上还跑着别的部署时，不会误删别人的数据。

首次开机初始化由 `fmkj-first-boot.service` 负责（装机脚本已经装上并设为开机自启）。
正常安装的设备没有「待初始化」标记，这个服务每次开机只是空转退出，不会动数据。

**别跳过 prepare-golden 直接克隆系统**：那样镜像里带着上一台的会话密钥和客户数据，
下一个客户登录后会看到上一个客户的资料——这是最严重的一类事故。

## 3. 发布新版本镜像（运营方侧）

```bash
# 先在开发机/构建机上传出镜像（工作区必须干净，版本号必须明确）
node scripts/deploy/build-release.mjs --version v0.2.0 --repository <自建仓库>/fmkj-v3
# 只会打印命令、不真构建：
node scripts/deploy/build-release.mjs --version v0.2.0 --repository <自建仓库>/fmkj-v3 --dry-run
```

脚本末尾会打印设备上要执行的那条更新命令，复制过去即可。

本机直接执行 `pnpm build` 后，分发 `.next/standalone` 前运行：

```bash
node scripts/deploy/check-build-traces.mjs
```

此检查只读取构建清单和成品；如果其中夹带本机预览、装机包、客户备份或环境文件，会以失败状态退出。根目录的这些资料不会进入运行包，`public/assets` 商品图片及依赖包自身的 `dist` 文件仍正常保留。Docker 构建还会由 `.dockerignore` 在复制源码时排除私有资料。

顺手生成一页「设备更新操作卡」（A4，给站在设备前面的人照着做，现成的一页在
`docs/设备更新操作卡.pdf`）：

```bash
python3 scripts/deploy/make-device-card.py --version v0.2.0 \
  --repository <自建仓库>/fmkj-v3 --out "docs/设备更新操作卡.docx"
# 转 PDF：用 LibreOffice Kit 把上面这个 docx 转成 docs/设备更新操作卡.pdf
```

卡片里写的失败提示与 `update-local.mjs` 的真实输出一一对应（成功是 `更新完成：<版本>`，失败看
`处置：abort / restart-previous / stop-for-restore`）。**改了脚本的输出措辞，记得同步改卡片。**

**构建需要 Docker 至少 4GB 内存。** Docker Desktop 默认常只有 1–2GB，构建会 OOM：
表现是构建卡住几十分钟、Docker 守护进程重启、连同正在跑的容器和开发服务一起被杀。
脚本会先量内存，不够就直接拒绝并告诉你去哪调（设置 → Resources → Memory → 6GB），
不会硬着头皮把机器拖崩。

## 4. 更新设备

```bash
cd /opt/fmkj/app
/opt/fmkj/tools/node/bin/node scripts/deploy/update-local.mjs \
  --to v0.1.1 \
  --repository <自建仓库>/fmkj-v3 \
  --compose-file docker-compose.appliance.yml
```

固定顺序：`preflight → fetch → backup → migrate → switch → verify`
（备份放在拉取之后、迁移之前：既不改变「迁移前一定有备份」，又不会因版本号打错留下一堆无谓备份）。

- **必须指定版本**，脚本拒绝 `latest`（无法确认版本、也无法回滚）。
- **迁移用新镜像跑**，跑完才切流量（`docker compose up -d`）。
- **switch 成功后会把 `FMKJ_IMAGE` / `FMKJ_VERSION` 写回 `.env`**；不写回的话，下次有人直接
  `docker compose up -d` 会按 compose 的兜底值静默退回旧镜像。
- **verify** 做三件事：轮询 `/login` 拿到成功响应（应用在服务）、在容器里读 `FMKJ_VERSION`
  （确认跑的是目标版本）、进数据库容器 `select 1`（确认迁移后数据库可达）。不依赖任何新开的公开接口。
- 全程持有 `deploy-state/update.lock`，避免两个人同时点。
- 数据库不在本编排里（外部库 / 1Panel）时，加 `--database-service` 指向实际服务名；脚本会退回
  用 `docker run` 连连接串，这时要保证宿主机到该库的网络可达。

失败处置按 ADR 0010：

| 失败发生在 | 处置 | 原因 |
|---|---|---|
| 迁移之后 | `stop-for-restore` | 结构已推进，切回旧镜像不算恢复，必须用备份恢复数据库 |
| 拉取完成之后、迁移之前（含备份失败） | `restart-previous` | 数据库没动，旧镜像继续服务 |
| 更早 | `abort` | 什么都没改 |

状态写在 `deploy-state/update-state.json`（含失败原因与备份路径）。

## 4.1 在线更新（客户在页面上点按钮）

客户不该敲命令。管理员 →「系统健康」页面上有两个按钮：

| 按钮 | 做了什么 |
| --- | --- |
| 检查有没有新版本 | 写一条 `check` 请求，设备上的更新管家跑一次版本检查，结果 5 秒内回到页面 |
| 立即更新到 vX | 写一条 `update` 请求（**只有版本号**），管家代跑既有的更新脚本：备份 → 拉镜像 → 迁移 → 切换 → 自检；进度与失败原因写在同一个页面上 |

**首次仍然要用一次命令**：老版本应用里没有按钮，所以第一台（次）升级只能用第 4.2 节的命令；
升级到带按钮的版本、并把更新管家装上之后，后续都点按钮。

### 4.2 命令更新与定时检查（保底）

#### 定时检查新版本（只提醒，不安装）

设备不会自己升级。定时任务只做一件事：问一句「外面有没有比现在新的版本」，把答案写进
`deploy-state/update-check.json`，管理员在「系统健康」页面看到提示后再人工决定升不升。

```bash
cd /opt/fmkj/app
cp <仓库>/deploy/systemd/fmkj-update-check.service /etc/systemd/system/
cp <仓库>/deploy/systemd/fmkj-update-check.timer   /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now fmkj-update-check.timer
systemctl list-timers fmkj-update-check.timer       # 看下次什么时候跑
```

版本从哪里问，写在 `/opt/fmkj/app/.env` 里（二选一，见 `.env.appliance.example`）：

| 方式 | 变量 | 说明 |
| --- | --- | --- |
| 版本清单 JSON（推荐） | `FMKJ_UPDATE_INDEX_URL` | 你自己维护一个小文件，例如 `{"versions":["v0.1.0","v0.1.1"]}`；数组或 `{"latest":"…"}` 也认 |
| 镜像仓库 tag 列表 | `FMKJ_REGISTRY` + `FMKJ_REGISTRY_REPOSITORY` | 不填就从 `FMKJ_IMAGE` 反推；仓库要登录时补 `FMKJ_REGISTRY_USER` / `FMKJ_REGISTRY_PASSWORD`，走 http 时加 `FMKJ_REGISTRY_INSECURE=true` |

版本清单也可以签名，避免有人伪造「有新版本」把设备引到恶意镜像上：

```bash
# 运营方侧：给清单签名（私钥只留在自己服务器上）
node scripts/deploy/sign-version-index.mjs --file versions.json --key release-private.pem
# → versions.signed.json（{"versions":[...],"signature":"..."}）

# 设备侧：/.env 里配上发布方公钥，此后只认签过名的清单
# FMKJ_RELEASE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
```

配了公钥但清单没签名、或签名对不上，检查会直接报错并且**不提示升级**——状态文件里
`signature` 字段会如实记录 `verified` 或空，管理员页面显示「已验签 / 未签名」。

不想用定时任务也可以手工查一次，结果同样写进状态文件：

```bash
/opt/fmkj/tools/node/bin/node scripts/deploy/check-update.mjs
/opt/fmkj/tools/node/bin/node scripts/deploy/check-update.mjs --json   # 机器可读
```

连不上、没配版本来源、清单格式不对都只记在状态文件的 `error` 里，退出码仍是 0：
设备离线不该让定时任务报警刷屏。

### 4.3 管理员页面能看到的更新与备份状态

`docker-compose.appliance*.yml` 把宿主机的 `./deploy-state` 挂进容器（`/data/deploy-state`）。
其中只有 `requests/` 子目录属于应用用户（页面写「更新请求」用），其余由宿主机脚本以 root 写、
应用只读。管理后台「管理员 → 系统 → 系统健康」显示三行：

| 显示项 | 来源文件 | 说明 |
| --- | --- | --- |
| 版本检查 | `deploy-state/update-check.json` | 上次检查时间、有没有新版本、检查失败原因 |
| 上次更新 | `deploy-state/update-state.json` | 更新到哪一版、成功还是失败、失败在哪一步 |
| 上次备份 | `deploy-state/backup-state.json` | 备份时间、标签、保留份数、是否成功 |

页面只读：应用不持有 docker socket，不能从网页触发更新或备份（ADR 0010）。它可以展示
失败原因，但会抹掉宿主机上的绝对路径。目录没挂载时页面显示「这不是设备版部署」，不会报错。

#### 首次安装（每台设备一次）

```bash
# 1) 宿主机侧的脚本与编排（从发布仓库拷最新的那一份）
cp <仓库>/scripts/deploy/updater-agent.mjs /opt/fmkj/app/scripts/deploy/
cp <仓库>/docker-compose.appliance.yml /opt/fmkj/app/

# 2) 更新管家（一次性装上，以后开机就常驻）
cp <仓库>/deploy/systemd/fmkj-updater.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now fmkj-updater
systemctl status fmkj-updater --no-pager     # 看到 active (running) 即可

# 3) 版本来源写进 /opt/fmkj/app/.env（管家与检查脚本都读这里）
#    FMKJ_REGISTRY=<自建仓库>          FMKJ_REGISTRY_REPOSITORY=fmkj-v3
#    FMKJ_REPOSITORY=<自建仓库>/fmkj-v3
#    自签证书时：把 CA 放到 /opt/fmkj/app/registry-ca.crt，并取消 unit 里
#    Environment=NODE_EXTRA_CA_CERTS=... 的注释，然后 systemctl restart fmkj-updater
```

**没装管家会怎样**：页面会明确提示「已请求更新，但设备上的更新管家没有响应」——不会一直转圈，
也不会假装成功。这种情况下用第 4.2 节的命令更新，或者把管家装上。

#### 安全边界（为什么按钮不是应用自己去装）

应用被故意关在隔离容器里：没有 docker socket、不能执行宿主机命令（ADR 0010）。所以应用能做的只有
「把版本号写成一个请求文件」；管家只认版本号这一个输入，只调用仓库里固定的两个脚本（参数用数组传，
不拼 shell）。网页即使被攻破，最多也只能触发一次「安装某个正式发布的版本」，无法变成任意命令执行。

**上一次更新被断电打断怎么办**：如果锁还在、进程已经没了，且数据库迁移**已经跑过**，管家会拒绝
自动重试并写明原因（数据库结构已经是新版本，只能人工用备份恢复）；如果中断发生在迁移之前，管家会
清掉锁放行重试。所有过程写在 `deploy-state/updater-log.txt`，排障先看这个文件。

## 5. 备份与恢复

```bash
cd /opt/fmkj/app
export FMKJ_UPLOADS_VOLUME=fmkj-v3-uploads      # 与编排里的卷名一致
/opt/fmkj/tools/node/bin/node scripts/deploy/backup-local.mjs \
  --label nightly --keep 7 --compose-file docker-compose.appliance.yml
```

产出 `backups/appliance/<时间戳>-<标签>/`：

| 文件 | 内容 |
| --- | --- |
| `database.dump` | `pg_dump --format=custom`，在数据库容器里执行 |
| `uploads.tar.gz` | `fmkj-v3-uploads` 数据卷 |
| `metadata.json` | 时间、标签、镜像版本、步骤结果 |

同时在 `deploy-state/backup-state.json` 记一条给管理页面看的摘要（时间、标签、保留份数、成败），
失败也会记一条再去报错。

**恢复**（顺序不能反）：

```bash
cd /opt/fmkj/app
COMPOSE="docker compose -f docker-compose.appliance.yml"
BACKUP=backups/appliance/<目录>

$COMPOSE stop app
# 1) 恢复数据库：进数据库容器用本地 socket，不需要连接串，也不依赖宿主机到容器的网络
$COMPOSE exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
$COMPOSE exec -T postgres pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP/database.dump"
# 2) 恢复文件卷
export FMKJ_UPLOADS_VOLUME=fmkj-v3-uploads
docker run --rm -e FMKJ_UPLOADS_VOLUME -v "$FMKJ_UPLOADS_VOLUME:/data" -v "$PWD/$BACKUP:/backup" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/uploads.tar.gz -C /data'
# 3) 用与被恢复结构匹配的镜像启动
FMKJ_IMAGE=<metadata.json 里的 image> $COMPOSE up -d
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8890/login
```

> 恢复前先确认 `metadata.json` 里的版本，并用同版本镜像启动；跨版本恢复要重新跑迁移。
> 旧文档里的 `docker run ... pg_restore -d "$PGURL"` 在 Linux 上连不上容器里的库
> （默认 bridge 解析不到宿主机与 compose 服务名），已改为上面的容器内执行。

### 5.1 客户自己在网页上备份与恢复（应用内）

设备交付给客户后，客户不该为了备份来找你。管理后台「管理员 → 系统 → 系统健康 → 备份与恢复」提供两件事：

| 动作 | 行为 |
| --- | --- |
| 导出备份 | 点一下就下载 `fmkj-backup-<时间>.tar.gz`：**整库所有业务表 + 上传统附件**，流式下载不进内存 |
| 从备份恢复 | 选择备份包 → 手工输入「恢复」两个字 → 上传。恢复前先整体校验，再在一个事务里替换 |

包的结构（客户自己也能打开看，是个普通 tar.gz）：

```
manifest.json           格式版本、导出时间、软件版本、结构指纹、每张表的行数与内容摘要、附件数量
database/<表名>.csv      PostgreSQL COPY 出来的 CSV，带表头
uploads/<原路径>         上传统附件原样打包
```

恢复的守卫，任一条不过就**整体回滚、本机数据一点不动**：

- 文件不是本系统导出的、manifest 读不出来、格式版本不一致；
- **结构指纹对不上**（备份来自另一版软件）→ 提示先升级到同一版本；
- 导出时有表失败、表清单缺失或重复、缺少任何一张本机业务表 → 在清空本机资料之前拒绝恢复，必须换用完整备份；
- 任一张表的内容摘要与清单不符（传输损坏或被改过）；
- 恢复过程中任何一步失败 → 事务回滚，并留下可读的失败原因。

其它要知道的：

- 恢复会**整体替换**本机所有业务数据；备份里没有的、本机新产生的修改会丢。这是「灾难恢复」按钮，不是「合并」按钮。
- 附件按「只增不删」写回：宁可留下没人引用的文件，也不删可能还被引用的文件。
- 上限 512MB；更大的备份请走上面的宿主机脚本（`backup-local.mjs` / `pg_restore`），那条路不吃应用内存。
- **应用起不来的时候，网页也打不开**，所以恢复不能只靠这一条路：宿主机上的 `pg_restore` 步骤（第 5 节）才是兜底。
- 恢复上传的路径特意**不进中间件**：中间件会按 `proxyClientMaxBodySize`（32MB）复制请求体，超过就变成坏包。
  该路由自己用 `requireSuperAdmin()` 校验权限，且先校验再读请求体，未登录请求不会被读进内存。

### 5.2 发货前自检（一条命令）

```bash
cd /opt/fmkj/app
/opt/fmkj/tools/node/bin/node scripts/deploy/smoke-appliance.mjs \
  --base http://127.0.0.1:8890 --email <管理员邮箱> --password '<口令>'
```

只做**只读**检查，不会改数据、不会触发同步、不会恢复备份：登录页、管理员登录、系统健康页、
产品库可读、同步状态、备份能导出（只统计大小并核对是不是有效 gzip，包不落地）、未登录必须被拦。
全过退出码为 0；有失败会逐条打印原因并退出 1——**先别发货**。

也可以传 `--cookie "session=..."` 跳过密码登录（例如你不想在命令行里出现口令时）。
如果登录那一步显示 429，说明刚有人试错密码、限流还没过，等 15 分钟或换一个管理员账号。

### 5.3 把产品库搬到设备上（可选）

设备默认不带产品资料。日常有两条更省事的路（都在后台里，不用碰命令行）：

- **产品管理 → 批量导入**：下载 CSV 模板填好上传，先预演差异、确认后入库；空单元格表示「这一项不改」。
- **产品管理 → 从服务器同步**：配好 `UPSTREAM_*` 后从你的服务器拉目录，默认只补新品、不覆盖本地改过的价格。

下面这条命令行做法仍然有效，适合**一次性搬大量历史数据**或需要在网页之外完成时使用。要把你现有产品库放上去，只搬**产品库相关的四张表**就够了：

```bash
# 1) 在源库侧导出（示例为开发机上的 fmkj-v3-db 容器）
docker exec fmkj-v3-db pg_dump -U postgres -d fmkj --data-only --no-owner --no-privileges \
  --format=custom \
  --table=products --table=product_visual_assets \
  --table=category_default_products --table=device_types \
  -f /tmp/product-library.dump
docker cp fmkj-v3-db:/tmp/product-library.dump .

# 2) 传到设备后导入（products 的自引用外键是环状，必须 --disable-triggers）
scp product-library.dump <设备>:/opt/fmkj/product-library.dump
cd /opt/fmkj/app
docker compose -f docker-compose.appliance.yml exec -T postgres \
  pg_restore --data-only --disable-triggers --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < /opt/fmkj/product-library.dump

# 3) 核对（数量应与源库一致）
docker compose -f docker-compose.appliance.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from products"
```

要点：

- **商品图不用搬**：`products.image` 与 `product_visual_assets.image` 存的是 `/assets/products/...` 路径，
  这些文件在应用镜像里（`public/assets/products/`），随镜像版本走。
- **不搬项目/报价相关的东西**：`project_product_prices`（项目级价格）、`quote_items`（报价行）、
  `project_category_default_products`（项目类别默认）属于具体项目与报价，跟项目一起搬，不跟产品库搬。
- 导入前后各做一次备份（第 5 节），出问题可以直接回到导入前。
- `--data-only` 是**追加**：目标表必须是空的；重复导入会产生重复 SKU，先查 `select count(*)`。
- 产品原有的审核状态、选型/价格核验依据与 `mapping_revision` 原样保留，不会被"搬家"改成已核验。
- `created_by` / `submitted_by` / `reviewed_by` 存的是源库的用户 id；设备上没有这些账号时它们只是
  悬空引用（没有外键约束，不影响导入），界面上"谁提交的"会显示不出来。要完整保留就把 `users`
  一起搬，或接受设备上用本机账号重新记录。
- 产品库**不走上游接口**（ADR 0010）。两边各自演进后"以哪边为准"必须由使用者明确：设备是运行实例，
  源库是维护库；建议只在源库维护、需要时用本节重新导出导入，不要在两边同时改同一批型号。

### 5.4 把某个项目搬到设备上（可选）

业务数据（项目、点位、报价、交付）**只能靠这条路**搬——ADR 0010 不允许它们走上游接口。
整库恢复会把所有项目一起带过去，所以按项目定向导出：

```bash
# 1) 在源库所在机器上导出（脚本会先列出项目，再按名称/ id 导出相关表）
node scripts/deploy/export-project-slice.mjs --list
node scripts/deploy/export-project-slice.mjs --project "邦泰璟和 · 智能家居设计草稿" --out /tmp/bangtai.sql

# 2) 传到设备后装载（脚本已带事务与 session_replication_role=replica）
scp /tmp/bangtai.sql <设备>:/opt/fmkj/bangtai.sql
ssh <设备> 'cd /opt/fmkj/app \
  && docker cp /opt/fmkj/bangtai.sql fmkj-v3-db:/tmp/ \
  && docker compose -f docker-compose.appliance.yml exec -T postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /tmp/bangtai.sql'
```

要点：

- 导出的表：`projects`、`project_point_map_designs`、`project_point_map_versions`、`project_deliveries`、
  `project_members`、`project_attachments`、`project_site_photos`、`project_product_prices`、
  `project_category_default_products`、`quotes` + `quote_items`、`work_orders` 及其三张子表、
  `activity_logs`，以及项目 owner 的那条 `users` 记录。
- **不含全局资料**：`products`、`device_types`、`category_default_products` 属于产品库，用 4.1 单独搬。
  所以先搬产品库、再搬项目，否则项目的商品引用会指空。
- 目标库必须**没有同一个项目**：装载是插入而不是覆盖，同 id 会主键冲突。
- 项目里的点位底图、交付快照可能是几十 MB 的文本字段（实测一个项目 83 MB，其中交付快照 78 MB），
  导出/装载会走网络，别在窄带宽下同时跑别的大传输。
- 装载用 `session_replication_role = replica` 临时关掉外键触发器（`projects`、`products` 有自引用/
  环状约束）；约束只是延迟检查，装载完仍然是完整的。
- 装载前后各做一次备份（第 5 节）。核对方式：项目数、草稿 `revision` 与点位数、交付版本数、报价行数、
  项目级价格数，在源库与设备各查一遍。

## 6. 让客户在外网访问（内网穿透 / 反向代理 / VPN）

设备默认只在局域网里：`http://<设备IP>:8890`。客户想在外面用，有三条路，按安全性从高到低：

| 方式 | 客户拿到什么 | 门槛 | 适合 |
| --- | --- | --- | --- |
| **VPN / Tailscale** | 不对外开网址，手机和电脑装上客户端就能进内网 | 每个使用者装一次客户端 | **最安全**，也最省心（不暴露公网、不用管证书） |
| **反向代理 + 内网穿透**（frp 自建、Cloudflare Tunnel、商用穿透） | 一个 https 网址 | 自建要一台小服务器与域名；Cloudflare 要域名 + 账号 | 客户要「发个网址就能看」 |
| **公网 IP + 端口转发** | 一个 https 网址 | 要有公网 IP，且证书、防护都得自己管 | 不推荐：家宽大多没有公网 IP，暴露面也大 |

### 6.1 暴露到公网之前，必须做到的几件事

1. **必须是 HTTPS**。密码走 http 等于明文广播。设备本身不终止 TLS，交给隧道/反代那一层。
2. **关掉自助注册**。设备版编排默认已经关（`FMKJ_ALLOW_SELF_SIGNUP=false`）；
   托管版不要跟着关，那是拉新客用的。
3. **先把管理员设好**。设备还没初始化就暴露出去，等于把「设置管理员」让给第一个打开的人。
4. **反代的 Cookie 标志交给应用判断**：反代带上 `x-forwarded-proto: https`（应用据此给会话
   Cookie 加 `Secure`），或者显式 `AUTH_COOKIE_SECURE=true`。搞反了会出现「登录提示成功，
   但一直是未登录状态」。
5. **管理员密码要强**，别用 12345678。设备已有登录失败限流（同一账号 15 分钟 8 次）。

### 6.2 帮客户开通前后，各跑一次自检

```bash
node scripts/deploy/check-public-access.mjs --url https://客户的网址
# 能拿到管理员账号时，顺带检查会话 Cookie 是否带 Secure/HttpOnly：
node scripts/deploy/check-public-access.mjs --url https://客户的网址 \
  --email you@example.com --password '管理员密码'
```

它会只读地检查七件事：是否 HTTPS、登录页通不通、**自助注册页是否已关**、**注册接口是否拒绝**、
管理接口是否要求登录、官方资料接口是否裸奔、**设备是否已经设了管理员**。有必须处理的项没过会
以非 0 退出——那种情况下先别把网址交给客户。

### 6.3 用你的服务器 + frp：每加一个客户只需一条命令

**服务器端只配一次，之后加客户不用再碰服务器。** 模板都在 `deploy/public-access/server/`：

| 文件 | 作用 |
| --- | --- |
| `frps.toml` | 穿透服务端（一条 `auth.token`，所有客户共用，当密码保管） |
| `Caddyfile` | HTTPS + 压缩 + 转发给 frps；泛域名证书一张覆盖所有客户 |
| `README-服务器一次性配置.md` | 从零到能用的步骤（DNS 泛解析、证书、防火墙） |

**每加一个客户**：在客户设备上跑一条命令（装机包里带这个脚本）：

```bash
bash enable-public-access.sh --host dealer01.你的域名.com \
  --server 你的服务器IP:17000 --token 'frps 里那串 token' --check
```

它会装好 frpc、写配置（客户专属子域名 + 每客户限速 2MB/s）、开机自启、等连上、跑一遍自检，
最后打印给客户的网址。关掉：`--disable`。

**真机实测过整条链路**（设备 → 你的服务器 → HTTPS 网址）：

| 检查 | 结果 |
| --- | --- |
| 通过 HTTPS 网址打开设备 | HTTP/2 200，HSTS 生效 |
| 产品库一次加载 | 1.2MB → **122KB**（Caddy gzip 压缩） |
| 通过公网网址跑自检 | **7/7 通过**（HTTPS、注册已关、管理接口 401、资料接口 404…） |

> 注意：frp 开源版的 token 是全局的，不是每个客户一个。设备退役或怀疑泄露时换掉即可。
> 要真正做到一人一密，只能按客户分 frps 实例。

### 6.4 手工配置参考（不用脚本时）

设备侧（客户机器上，`frpc.toml`）：

```toml
serverAddr = "你的服务器IP"
serverPort = 7000
auth.token = "一串随机长字符串"

[[proxies]]
name = "fmkj-app"
type = "http"
localIP = "127.0.0.1"
localPort = 3000
customDomains = ["kanban.你的域名.com"]
```

服务器侧（`frps.toml`）：开 7000 给 frpc、80/443 走域名；TLS 证书用 Caddy/Nginx 或 frp 的 `https` 段。
**把网址绑到域名、证书挂在反代上**，不要让客户直接记 IP 和端口。

> 走这条路的客户，设备上的 `FMKJ_BIND` 保持默认（`0.0.0.0`）即可：穿透客户端在设备本机连
> `127.0.0.1:3000`，局域网访问和外部访问互不影响。

## 7. 登录与上传的守卫（2026-10-22 加固）

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| 登录（密码 / 验证码） | 没有次数限制，可以无限试 | 同一账号 15 分钟最多失败 8 次、同一来源最多 40 次；超了返回 429 并告诉要等多久；登录成功即清零 |
| 发验证码 | 没有次数限制（接了真实短信后就是烧钱） | 同一目标 1 小时最多 5 条，超了 429 |
| 文件上传 | 只问「你登录了吗」，目录名由表单决定 | 按类型判归属：头像只能给自己、公司标志只能给自己的组织、商品图要超管且商品存在、合同/户型图/报价单必须是能编辑的项目；认不出的类型直接拒绝 |

没有反向代理、拿不到真实来源时，只做「按账号」的限制，不做全局来源封禁——避免一个人把全公司锁在门外。

## 8. 对接运营方服务（接口收费部分）

本地设备版在**离线时核心工作流必须完整可用**（ADR 0010）。所以对接只覆盖「获取新东西」，不参与日常编辑。

| 用途 | 方向 | 失败时的行为 |
|---|---|---|
| 版本清单 / 镜像信息 | 设备 → 运营方 | 保持当前版本，仅提示 |
| 实例注册 | 设备 → 运营方 | 本地功能不受影响 |
| 授权与订阅校验 | 设备 → 运营方 | 用缓存授权 + 离线宽限期 |
| 官方产品资料增量 | 设备 ← 运营方 | 保留本地资料，游标不前进 |
| 资料包与素材下载 | 设备 ← 运营方 | 本次同步失败，可重试续传 |
| 诊断上报（默认关闭） | 设备 → 运营方 | 忽略 |

**只发送**：实例标识、订阅范围、同步游标、软件版本、资料版本与摘要。
**绝不发送**（ADR 0010）：客户名称、项目、点位、图纸、报价、交付、上传附件、用户自建产品与成本。

### 8.1 建议的最小接口形状（提案，尚未实现）

让设备只需要认一套很小的约定；具体字段名可在实现时调整，语义不要改。

```http
Authorization: Bearer <LICENSE_KEY>      # 订阅凭据
X-Instance-Id: <INSTANCE_ID>             # 设备/实例标识，不含客户信息

POST /v1/instances                       注册与心跳
  → { softwareVersion, deploymentKind: "local-appliance" }
  ← { authorized, catalog: { enabled, expiresAt }, serverTime }

GET  /v1/releases?channel=stable         版本清单（更新脚本用它确定目标版本）
  ← { releases: [ { version, image, digest, minSchema, requiresMigration, notes } ] }

POST /v1/catalog/changes                 官方资料增量
  → { cursor, catalogRevision }
  ← { catalogRevision, changes: [ { upstreamId, upstreamRevision, payload, assets[] } ],
      nextCursor, done }

GET  /v1/catalog/assets/{assetId}        素材下载；响应头带 sha256 与 size 供校验
POST /v1/diagnostics                     可选诊断上报（默认关闭，须显式开启）
```

游标语义：`done=false` 时用 `nextCursor` 继续；**全部批次应用成功后才提交游标**，
中途失败重试同一游标，不会重复建产品。

合同要求（不可放宽）：

- 资料包必须**验签 + 校验摘要与大小**后才能应用（`UPSTREAM_PUBLIC_KEY`）。
- **幂等**：按批次 + 游标应用，重复执行不重复建产品，失败从已提交位置恢复。
- 上游修订**不能冒充**本地 `mappingRevision`；既有并发控制与产品核验规则继续生效。
- 授权到期**只影响获取新增资料**，不锁本地业务写入、不删除已同步资料。
- 任何上游调用失败都必须降级为「本地继续可用」，不能阻塞登录、编辑、保存与导出。

配置项：

```ini
UPSTREAM_ENABLED=false
UPSTREAM_BASE_URL=https://api.example.com
INSTANCE_ID=
LICENSE_KEY=
UPSTREAM_PUBLIC_KEY=
```

### 8.2 当前实现到哪一步（2026-10-22）

已实现「官方产品资料同步」的第一版，走的是**快照**而不是增量游标：

| 项 | 现状 |
| --- | --- |
| 传输 | `GET {UPSTREAM_BASE_URL}/api/catalog/snapshot`，`Authorization: Bearer <LICENSE_KEY>` + `X-Instance-Id`；响应是一份 CSV（列与批量导入模板完全相同），带 `X-Catalog-Revision` 与 `X-Catalog-Sha256` |
| 完整性 | 有摘要头时按内容校验，对不上就整批拒绝（能发现传输截断或改动） |
| **验签** | 发布端配 `CATALOG_SIGNING_KEY`（Ed25519 私钥）后，响应带 `X-Catalog-Signature`；设备配 `UPSTREAM_PUBLIC_KEY` 后**只接受签过名的目录**，签名不对或没有签名一律拒收。摘要只证明「没被改坏」，签名才证明「是谁发的」 |
| **图片** | 同步时把资料里的 `/assets/...` 产品图一起取回，存进设备自己的上传卷，产品记录改成本地 `/api/files/product-images/...`。每次最多 200 张，其余下次同步继续；单张失败只记一行，不拖垮整批 |
| 幂等 | 按系统货号认人：没有的建新的，已有的按策略处理；原样重复同步不会重复建产品 |
| 默认安全 | **默认只补新品，不覆盖本地已有的货号**；管理员在「从服务器同步」里显式勾选才允许覆盖已有产品（否则本地调过的价格会被官方资料悄悄改掉） |
| 失败降级 | 连不上、凭据失效、摘要不符：本地资料一字不动，只记一条失败记录，页面能看到原因 |
| 记录 | 每次应用写一条 `catalog_sync_runs`（资料版本、新增/更新/跳过/失败计数、失败原因），管理员页面显示上次结果 |
| 定时同步 | 配好上面三项后，应用启动时自动排期：默认启动 5 分钟后跑一次、之后每 24 小时一次。只补新品，不覆盖本地。用 `UPSTREAM_SYNC_ENABLED=false` 关掉（只留页面上手动点），`UPSTREAM_SYNC_INTERVAL_HOURS` 改频率 |
| 发布端 | `GET /api/catalog/snapshot`，用 `CATALOG_PUBLISH_TOKEN` 当 Bearer 校验；只发布目录里已通过审核的产品；没配 token 时该接口按 404 关闭 |

定时同步跑在应用进程里（Next 的 instrumentation 钩子），所以**设备上不需要额外装定时任务、也不需要给接口开第二个凭据**。
没有具体操作人时审计如实记成空（不编造一个假用户去顶）。进程重启会重新计时；多实例部署时会各自跑一遍，
设备版是单实例所以没这个问题——托管版要接这个功能得先想清楚去重。

**已经补上的**（2026-10-22）：

- ~~验签~~：已实现 Ed25519 验签（发布端私钥、设备端公钥）；没签名或签名不对整批拒收。
- ~~素材下载~~：已实现——同步时把产品图取回本地（每次上限 200 张，其余下次继续）。
- ~~定时自动同步~~：已实现（应用进程内排期，见上表）。

**尚未实现**（对照上面的合同，别把它当成已经满足）：

- **增量游标与批次**：一次拉全量快照，没有 `cursor / nextCursor / done` 的分批。当前目录约 800 条、快照约 200KB，
  没有分批的必要；目录涨到几千条或素材变多时再补，补之前先定「批次失败如何续」。
- **本地覆盖与逐项冲突**：没有「用户改过的字段 vs 上游更新」的三方比对与逐项接受；目前只有「整条不覆盖」这个粗粒度开关。
- **授权与订阅校验**：没有实例注册、订阅到期与宽限期；凭据错了就是整批 401。

## 9. 排障

| 现象 | 先看这里 |
|---|---|
| 更新后页面 502 / 打不开 | `deploy:status`；`docker compose -f docker-compose.appliance.yml logs app`；`/login` 不是 200 说明应用没起来 |
| 登录提示成功，但还是未登录 | `AUTH_COOKIE_SECURE`：http 访问时必须为 `auto` 或 `false`（浏览器不保存带 Secure 的 Cookie） |
| `node: command not found` | 宿主机没装 Node；用 `/opt/fmkj/tools/node/bin/node`（见第 2 节） |
| `docker pull` 超时 / `000` | 设备不通 Docker Hub；改用自建仓库或 `docker load` 离线导入 |
| `x509: certificate signed by unknown authority` | 自建仓库用了自签证书：把 CA 放到 `/etc/docker/certs.d/<host>:<port>/ca.crt`（不需要重启 docker） |
| 更新失败提示 `stop-for-restore` | 不要切回旧镜像，按第 5 节恢复备份 |
| `已有更新在执行中` | 确认没有脚本在跑，再删 `deploy-state/update.lock` |
| verify 报「容器报告版本 X，期望 Y」 | 说明 `up -d` 用的还是旧镜像，检查 `.env` 的 `FMKJ_IMAGE` 是否被写回 |
| 备份报 `could not translate host name` | 数据库不在本编排里却用了 `docker run` 探针；指定 `--database-service`，或让脚本走 `docker compose exec` |
| 上传报 `EACCES: permission denied, mkdir '/data/uploads/...'` | 数据卷归属不对：编排里的 `uploads-init` 会自动修正（2026-10-21 真机补），确认它跑过（`docker compose ps -a` 里状态为 Exited (0)）；手工修正：`docker run --rm -v fmkj-v3-uploads:/data/uploads alpine chown -R 1001:1001 /data/uploads` |
| 上传功能报 `BLOB_STORE_NOT_CONFIGURED` | 只在 `FILE_STORAGE=blob` 且没配 token 时出现；本地设备版应为 `local` |
| 附件打不开 / 404 | 附件由 `/api/files/...` 按项目可见性鉴权；确认登录账号对该项目可见，且 `fmkj-v3-uploads` 卷已挂载 |
| 磁盘涨得快 | `deploy:backup --keep N` 调整保留份数；上传附件在 `fmkj-v3-uploads` 卷里 |
