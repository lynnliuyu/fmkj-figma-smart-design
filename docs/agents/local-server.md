# 本机服务器台账（Agent 记忆库）

> **用途**：家里这台常开服务器上跑着什么、地址是多少、怎么进去、东西放在哪。
> 任何会话要碰服务器，**先读这一页**；改完服务**回来更新这一页**。
> 最后实测核对：2026-10-27（下表每个地址都实际访问过，返回码正常）。

## 一句话

家里那台老 x86 电脑跑的是 Proxmox VE（虚拟化平台），是**常开的服务器**。
下面这些服务都跑在它上面，**你的 Mac 关不关机都不影响**。

## 地址总表

| 地址 | 是什么 | 在哪台 |
| --- | --- | --- |
| `https://10.0.0.123:8006` | **PVE 后台**：虚拟机/容器的总控台 | PVE 主机 |
| `http://10.0.0.202:3000` | **设计站（托管版）**：客户系统那套，当前是空库 | CT 101 |
| `http://10.0.0.202:8767` | **架构图编辑器**：浏览器里画流程图/架构图 | CT 101 |
| `https://10.0.0.202:5443` | **私有镜像仓库**：客户设备升级从这儿拉 | CT 101 |
| `http://10.0.0.202:8091` | **文件管理器**（FileBrowser）：网页管服务器文件 | CT 101 |
| `https://10.0.0.202:9443` | **Portainer**：点着管理 Docker 容器 | CT 101 |
| `http://10.0.0.202:3005` | **Homepage 面板**：上面这些服务的网页导航（本台账的网页版） | CT 101 |
| `http://10.0.0.202:3001` | **Gitea**：自建资料/代码库，Markdown 网页直接看、带历史与搜索 | CT 101 |
| `http://10.0.0.202:9621` | **LightRAG 知识库**：资料丢进去直接提问，带知识图谱与出处 | CT 101 |
| `10.0.0.202:15444` | **工作台数据库**（PostgreSQL） | CT 101 |
| `http://10.0.0.50:8890` | **官方主站（fmkj-master）**：给设备发官方产品资料 | CT 200 |
| `https://catalog.fmkj.top` | 官方主站的公网入口（腾讯云 Caddy → 隧道 → 本机 8890） | 公网 |
| `http://10.0.0.100:8080` | **sub2api**：AI API 网关 | CT 103 |
| `http://10.0.0.110:8123` | **Home Assistant**：智能家居 | VM 100 |
| `http://10.0.0.176:8000` | **飞牛 NAS**：文件存储总入口 | VM 102 |

官方主站的部署细节（数据现状、踩过的坑）另见 `docs/官方主站-PVE部署记录.md`。

## 怎么进服务器

**方式一：免密 SSH（推荐，Agent 用这个）**

```bash
# PVE 主机
ssh -i .local/ssh/pve_ed25519 root@10.0.0.123

# 服务都在这台（CT 101，Debian 12）
ssh -i .local/ssh/pve_ed25519 root@10.0.0.202

# PVE 主机上管理容器：pct exec 101 -- docker ps  /  qm list  /  pct list
```

密钥在 `.local/ssh/pve_ed25519`（该目录已被 git 忽略，不会提交）。

**方式二：密码**

PVE 后台和小盒子的 root 密码在运营方手里（**不写进仓库**）。官方主站的凭据在
`~/Downloads/官方主站-凭据.txt`；Gitea 管理员账号等**能直接登录的东西**统一记在
`.local/credentials/本机服务凭据.md`（同样不进仓库）。

## 机器布局

| 编号 | 名字 | 是什么 | 地址 |
| --- | --- | --- | --- |
| PVE 主机 | `pve` | i5-4590 四核 / 16G 内存 / PVE 8.3 | 10.0.0.123 |
| VM 100 | `haos` | Home Assistant 智能家居（4G） | 10.0.0.110 |
| VM 102 | `fnos` | 飞牛 NAS（4G，300G 盘） | 10.0.0.176 |
| CT 101 | `docker2` | **所有 Docker 服务都在这**（8G 内存 / 150G 盘） | 10.0.0.202 |
| CT 103 | `sub2api` | AI API 网关（4G） | 10.0.0.100 |
| CT 200 | `fmkj-master` | 官方主站（2 核 / 3G / 24G 盘） | 10.0.0.50 |

以上容器/虚拟机都设了**开机自启**；容器里的服务重启策略是 `unless-stopped`，断电恢复后会自己回来。

## 服务器上东西放在哪（CT 101）

| 路径 | 是什么 |
| --- | --- |
| `/opt/fmkj/app` | 设计站（托管版）：编排 + `.env.production` |
| `/opt/fmkj/build` | v0.3.15 源码副本（构建镜像用，已 `git init`） |
| `/opt/fmkj/architecture-editor/data` | 架构图编辑器的项目数据和备份 |
| `/opt/registry/{data,certs}` | 镜像仓库的数据和 TLS 证书（CA 有效至 2036） |
| `/opt/workbench/` | 工作台数据库的编排和导入文件 |
| `/opt/gitea/{docker-compose.yml,data}` | Gitea 的编排和数据（SQLite，无额外数据库） |
| `/opt/lightrag/{docker-compose.yml,.env,data,ollama}` | LightRAG 知识库：配置、图谱与文档、本地嵌入模型 |
| `/opt/homepage/config/services.yaml` | Homepage 面板里登记的服务清单 |

## 黑豹 X2 设备（客户端）

| 项目 | 值 |
| --- | --- |
| 地址 | 10.0.0.134（Armbian，arm64） |
| 登录 | `ssh -i ~/.ssh/xgj-134_ed25519 root@10.0.0.134` |
| 应用目录 | `/opt/fmkj/app` |
| 升级源 | `10.0.0.202:5443`（2026-10-23 从 Mac 的 `10.0.0.235:5443` 切过来，实测可拉取） |
| 公网入口 | 走主站 `catalog.fmkj.top` 同步官方资料 |

## Gitea 使用要点（2026-10-27 部署）

- 网页 `http://10.0.0.202:3001`；git over SSH 走 **2222** 端口（`ssh://git@10.0.0.202:2222/...`）。
- **自助注册已关闭**（`DISABLE_REGISTRATION=true`），新账号由管理员在后台加。
- 用自带 SQLite，**没有额外数据库**；全部数据在 `/opt/gitea/data`，备份就是打包这个目录。
- 镜像是官方 `gitea/gitea:28.2.0`（版本锁定，不用 `latest`）。
- 踩过的坑：镜像里**自带一个 SSH 服务占着容器内的 22 端口**，所以 `START_SSH_SERVER` 必须是
  `false`，否则 Gitea 自己再起一个会撞车、容器无限重启（首次部署时踩到过）。
- 自动化流水线（Actions）默认关着，要用再开。

## LightRAG 知识库使用要点（2026-10-27 部署）

- 网页 `http://10.0.0.202:9621`（管理界面 `/webui/`、问答界面 `/workspace/`）。
  **登录要填的是 LightRAG 自己的访问密钥**（在 `.local/credentials/本机服务凭据.md`），
  不是 Command Code 那个长密钥——两个容易搞混，2026-10-27 用户就填错过一次。
- 两个模型分工：**问答**走 Command Code 的 `gpt-5.6-luna`；**抽实体关系**走
  `deepseek/deepseek-v4-flash-fast`（实测"不思考"、直接出结构化 JSON，官方要求这类模型）。
- **嵌入模型跑在本地**（ollama + bge-m3，1.2GB），资料不出家门。官方提醒：嵌入模型
  **选定后不能换**，换了要全部重新嵌入，且它没有重新嵌入工具。
- **烧钱点**：抽实体关系要对每一段文字反复调用大模型，几百页文档会跑很多次，
  注意 Command Code 的额度。查询本身消耗很小。
- 存储用的是默认那套（文件 + 内存），官方明说**只适合小规模**；资料变多了要换成
  PostgreSQL（它一个库能扛四种存储）。
- 踩过的坑：① 镜像在 ghcr.io，国内拉不动 → 用南京大学镜像站 `ghcr.nju.edu.cn`；
  ② 大镜像从 Docker Hub 慢到 40 秒 8MB → 从 Mac 走代理拉再局域网传；
  ③ 容器启动后会**降权到 uid 1000 跑**，`.env` 必须归这个用户，否则启动即报
  `PermissionError: '.env'`；④ 插入文本接口必须带 `file_source` 字段；
  ⑤ 扫描导入**只认输入目录根下的文件，不进子目录**——要按目录放就先拍平。

### 当前库内容与调优（2026-10-27 实测完成）

- 已入库 **56 篇**：操作手册/指南、ADR 决策记录、Agent 约定、最近两周的实现方案。
  **没有放入**：产品报表（含定价）、营销文案、带日期的旧报告、已下线的决策、
  账号体系那 3 份大文档（它们贡献了图谱里最大一坨"企业版/M1-M6"概念，已删）。
- 图谱规模约 1000 实体 / 1750 关系。**再大就该换 PostgreSQL 存储**，默认存储会卡。
- 4 核 CPU 上跑嵌入是瓶颈，实测参数（写在 `/opt/lightrag/.env`）：
  `MAX_PARALLEL_INSERT=3`、`EXTRACT_MAX_ASYNC_LLM=6`、`EMBEDDING_BATCH_NUM=8`、
  `EMBEDDING_FUNC_MAX_ASYNC=4`、`EMBEDDING_TIMEOUT=600`。**默认值会让 105 篇一起导入时
  全部超时失败**（`Embedding func: Worker execution timeout`），且速度从 1 篇/分钟掉到 0.2 篇/分钟。
- 抽取上限 `MAX_EXTRACTION_ENTITIES=20`（默认 40）——实体密度减半，图谱不至于被撑爆。
- 导入完记得核对：`/documents/status_counts` 看有没有 failed；
  删文档用 `DELETE /documents/delete_document`（带 `delete_file: true` 连源文件一起删），
  删完相关实体关系会自动从图谱清掉，**不用重建**。
- 导入前**先想清楚放什么**：目录索引类文件（README）纯属噪音——两份索引就占了 107 个实体。

## 常见操作

```bash
# 看所有容器状态
ssh -i .local/ssh/pve_ed25519 root@10.0.0.202 'docker ps'

# 重启某个服务（例：编辑器）
ssh -i .local/ssh/pve_ed25519 root@10.0.0.202 \
  'cd /opt/fmkj/build/docker/architecture-editor && docker compose up -d --force-recreate'

# 把编辑器改好的架构图拉回 Mac 仓库（然后自己 git 提交）
ssh -i .local/ssh/pve_ed25519 root@10.0.0.123 \
  'pct pull 101 /opt/fmkj/build/docs/architecture/system-map.drawio -' \
  > docs/architecture/system-map.drawio
```

## 常见故障：局域网服务突然全打不开

**症状**：浏览器打开上面这些 `10.0.0.x` 地址全部转圈或报错，但外网（比如 GitHub）正常。

**原因**：Mac 的系统代理开着（用户的 Misty 客户端处于**全局模式**，HTTP/HTTPS → `127.0.0.1:1075`），
而系统没有「局域网直连」例外，于是家里的地址也被发去代理服务器，代理服务器当然连不到你家内网。
2026-10-27 发生过一次。

**两步判断**（在 Mac 上跑）：

```bash
curl --noproxy '*' -m 6 http://10.0.0.202:3005/            # 通 → 服务本身没问题
curl -x http://127.0.0.1:1075 -m 6 http://10.0.0.202:3005/ # 不通 → 就是代理挡的
networksetup -getproxybypassdomains "Wi-Fi"                # 看例外名单是不是空的
```

**修复**（把局域网和本机地址加进例外，2026-10-27 已设好）：

```bash
networksetup -setproxybypassdomains "Wi-Fi" \
  "10.0.0.0/24" "127.0.0.1" "localhost" "*.local" "*.lan" "169.254/16"
```

换网卡就换掉 `"Wi-Fi"`（用 `networksetup -listallnetworkservices` 看有哪些）。
**更彻底的办法**：让用户在代理客户端里把「全局模式」改成「规则模式」，局域网流量本来就不该进代理。

## 这台服务器已具备的能力

- **构建 x86（amd64）镜像**：已在 CT 101 里原生构建过设计站镜像（`fmkj-v3:hosted-amd64`）。
  Docker Hub 加速源、npm 源（npmmirror）都通；**Debian 官方源和 GitHub 从服务器连不上**，构建要换国内源。
- **构建 arm64（客户端设备版）镜像**：PVE 主机装了 QEMU 翻译层（`tonistiigi/binfmt`，可卸），
  CT 101 里实测能跑 `aarch64` 程序。实测模拟开销约 1.7 倍，一次构建估 30–45 分钟。

## 已知的不一致（发现就修）

1. 仓库里 `scripts/deploy/sync-image-from-ghcr.sh` 的目标仓库默认值还是旧的
   `10.0.0.235:5443`（Mac），镜像仓库已迁到 `10.0.0.202:5443`。发版前记得改或用 `--target` 指定。
2. 架构图编辑器的 `docker/architecture-editor/Dockerfile`：注释说把 drawio 资源包放
   `vendor/` 就能离线构建，但缺少把资源拷进镜像的那一步，**离线分支实际永远命中不了**，
   每次构建都会去 GitHub 下载 110MB。CT 101 上用的是打过补丁的 `Dockerfile.pve-amd64`。

## 更新规则

改了服务、端口、地址、登录方式，**回来改这一页**（表格里那行 + 「最后实测核对」日期）。
不要只写在这里而不改：Homepage 面板（`/opt/homepage/config/services.yaml`）是给人看的，
这一页是给 Agent 看的，两边都要对得上。
