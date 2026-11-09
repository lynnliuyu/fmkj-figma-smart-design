# 基础设施地图（2026-11-09 核实）

> 五台云服务器，各司其职。**这份表是实测结果**，不是推测。
> 更新方式：改这份文件，或跑 `deploy/survey.sh`（待建）。

## 一、五台机器

| #   | IP               | 用途                                                  | SSH                                | 状态                      |
| --- | ---------------- | ----------------------------------------------------- | ---------------------------------- | ------------------------- |
| 1   | `124.222.225.26` | **主站** `fmkj.top`                                   | `ubuntu@` + `fmkj_deploy_20261109` | ✅ 200，落后 main 93 提交 |
| 2   | `150.158.3.164`  | **网关**：`*.fmkj.top` 泛解析 + frps 内网穿透         | `root@` + `srv_survey_20261109`    | ✅ 在线                   |
| 3   | `106.53.183.96`  | **app 生产环境**：`app/copilot/dl/workbench.fmkj.top` | `ubuntu@` + `srv_survey_20261109`  | ✅ 在线，**别乱动**       |
| 4   | `43.155.223.134` | 首尔代理机（omniroute + mihomo）                      | `root@` + `srv_survey_20261109`    | ✅ 在线，与项目无关       |
| 5   | `106.15.10.225`  | **新个人工作台（待搭）**                              | `admin@` + `wb_salvage_20261109`   | 🔧 已清理，22G 可用       |

> ⚠️ **SSH 用户名各不相同**，连不上时先试 `ubuntu` / `root` / `admin`。
> ⚠️ **`106.53.183.96` 和 `106.15.10.225` 是两台不同的机器**（曾混淆过）。

## 二、域名 → 服务器

| 域名                        | 服务器            | 后端                                | 状态                        |
| --------------------------- | ----------------- | ----------------------------------- | --------------------------- |
| `fmkj.top` / `www.fmkj.top` | 124.222.225.26    | `127.0.0.1:13000`                   | ✅ 200 / 301                |
| `show.fmkj.top`             | 150.158.3.164     | Caddy 直连                          | ✅ 200                      |
| `registry.fmkj.top`         | 150.158.3.164     | Caddy 直连                          | ✅ 200                      |
| `xgj.fmkj.top`              | 150.158.3.164     | Caddy 直连                          | ✅ 200                      |
| `catalog.fmkj.top`          | ~~150.158.3.164~~ | ~~SSH 隧道 → 10.0.0.202:13000~~     | 🔴 **已废弃（2026-11-09）** |
| `app.fmkj.top`              | 106.53.183.96     | `fanmeng-v2-app-1` → 127.0.0.1:3000 | ✅ 307                      |
| `copilot.fmkj.top`          | 106.53.183.96     | 127.0.0.1:3400                      | ✅ 302                      |
| `dl.fmkj.top`               | 106.53.183.96     | 下载站                              | ✅ 301                      |
| `api.fmkj.top`              | 独立服务          | —                                   | ✅ 200                      |

## 三、各机细节

### 1. 主站 `124.222.225.26`（腾讯云 Ubuntu 24.04）

```text
当前版本  c504272（2026-11-09 上线，含 93 个提交）
容器      fmkj-shadow-app（新版，监听 127.0.0.1:13001）← 现在对外服务的
          fmkj-app-1（旧版，已停，镜像保留为 fmkj-app:rollback-20261109）
目录      新版 /opt/fmkj/releases/20261109-1650/src
          旧版 /opt/fmkj/figma-smart-design（保留不动）
数据库    PostgreSQL 16，卷 fmkj_pgdata（容器 fmkj-db-1）
媒体      卷 fmkj_media
反代      fanmeng-gateway-edge-caddy-1
Caddy     /opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile
          注意：这是**独立的一份**，只有 api/fmkj.top/www/http 四个块，
                与 150.158.3.164 那份（泛解析 + show/registry/xgj）不是同一个文件
资源      内存 3.6G + swap 5.9G / 磁盘 40G 用 59%
```

**回滚（30 秒）**：

```bash
# 1. 改 Caddy 回 13000（宿主机文件）
sudo sh -c "sed 's|127.0.0.1:13001|127.0.0.1:13000|'   /opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile > /tmp/c &&   cat /tmp/c > /opt/fanmeng-gateway/releases/aad2e52/deploy/remote/caddy/gateway.Caddyfile"
# 2. 启旧容器
sudo docker start fmkj-app-1
# 3. 重启 Caddy（bind mount 需要重建才生效，reload 不够）
sudo docker restart fanmeng-gateway-edge-caddy-1
```

⚠️ **同机还有别人的服务**：`fanmeng-gateway-new-api-1`、`-db-1`、`-redis-1`。
动 Docker / Caddy 会影响另一个业务 → **必须影子部署 + 端口切换**。

⚠️ **42 个未提交改动**（`public/style-templates/*.jpg` 等），部署前必须备份。

### 2. 网关 `150.158.3.164`（腾讯云 Debian 13）

```text
frps       bindAddr 0.0.0.0:17000 / vhostHTTP 18080（客户设备内网穿透）
Caddy      /etc/caddy/Caddyfile，含 *.fmkj.top 泛解析
服务       fmkj-tls-ask.service（按需签发 *.fmkj.top 证书）、frps.service
资源       内存 1.9G（可用 1.5G）/ 磁盘 49G 用 11%
```

2026-11-09 删除了 `catalog.fmkj.top` 的 K11 block（第 47–68 行），
备份在 `Caddyfile.bak-remove-catalog-*`。其余站点零影响。

### 3. app 环境 `106.53.183.96`（腾讯云 Ubuntu 26.04）

```text
容器   fanmeng-v2-app-1（Up）/ fanmeng-v2-db-1（healthy）
       fanmeng-workbench-edge-caddy-1 / fanmeng-workbench-workbench-db-1
目录   /opt/fanmeng-v2（419M）/ /opt/fanmeng-workbench（4.7G）
Caddy  copilot / dl / workbench / app 四个站点
资源   内存 3.6G（可用 2.7G）/ 磁盘 39G 用 51%
```

### 4. 首尔代理 `43.155.223.134`

```text
容器   omniroute-seoul（20128）/ mihomo-seoul
用途   出网代理 / API 中转，与 fmkj 项目无关
磁盘   几乎为 0（96K）
```

### 5. 新个人工作台 `106.15.10.225`（待搭）

```text
系统   Debian 12
旧状态 个人工作台 web 容器 6 周前 Exited，数据仅 1 账号 / 0 文章
2026-11-09 已清理：磁盘 84% → 42%，可用 22G
备份   salvage-106/workbench-src-*.tar.gz（1.2G，2083 文件）
       salvage-106/workbench-db-*.sql.gz（7.1M，16 万行 SQL）
```

## 四、SSH 密钥清单（本机 `~/.ssh/`）

| 密钥                   | 用于                                       |
| ---------------------- | ------------------------------------------ |
| `fmkj_deploy_20261109` | 主站 124.222.225.26（`ubuntu`）            |
| `srv_survey_20261109`  | 网关 / app 机 / 首尔（`root` 或 `ubuntu`） |
| `wb_salvage_20261109`  | 106.15.10.225（`admin`）                   |
| `workbench_deploy`     | 旧工作台（已失效）                         |

## 五、踩过的坑

1. **SSH 用户名各不相同** —— 别默认 `root`。124 是 `ubuntu`，106.15 是 `admin`。
2. **腾讯云主机安全会拉黑 IP** —— 连续认证失败后 `YJ-FIREWALL-INPUT` 会
   `drop connection ... penalty: failed authentication`，等 15–30 分钟自动解封。
3. **密钥要加对用户** —— 加在 `ubuntu` 的 `authorized_keys`，用 `root` 连是白搭。
4. **`106.53.183.96` ≠ `106.15.10.225`** —— 前者是 app 生产机，后者才是可复用的工作台机。
