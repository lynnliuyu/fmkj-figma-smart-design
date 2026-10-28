# CAD 图纸导出接口：服务器 Docker 部署

面向服务器（Linux，amd64 / arm64）的独立导出服务：上传 DWG/DXF → 轮询任务 → 下载逐页 PDF / PNG 与合并 PDF。
只跑导出接口，不含网站和数据库；**只提供共享令牌鉴权，没有租户隔离**（见文末“交付边界”）。

2026-10-21 在本机 Docker 29.8（arm64）实测通过，详见文末验收记录。

## 1. 目录

```text
docker/cad-export/
├── Dockerfile              多阶段镜像：Node 24 + CADCraft CLI + Poppler + Python 依赖 + 中文字体
├── docker-compose.yml      服务定义：只绑 127.0.0.1、数据卷、内存上限、健康检查
├── .env.example            环境变量模板（复制为 .env 后填令牌）
├── entrypoint.sh           启动前依赖自检（缺任何一项直接退出，不会无鉴权/缺字体起服务）
├── install-cadcraft.sh     安装并校验 CADCraft CLI（按镜像架构选包）
├── install-deps-bundle.sh  重新导出离线依赖包（libredwg-web WASM），升级该依赖时用
└── vendor/                 离线构建所需的固定版本文件（见第 3 节）
```

## 2. 服务器要求

| 项 | 要求 |
| --- | --- |
| 架构 | amd64（常见云服务器）或 arm64；构建时会自动选对应 CADCraft 包 |
| Docker | 20.10+，建议用 compose v2（1Panel 自带的 Docker 即可） |
| 内存 | ≥ 2 GiB 可用（单任务渲染峰值约 0.4–1.4 GiB） |
| 磁盘 | 每个 13 页任务约 30 MB；按“日任务量 × 保留天数”预留 |
| 网络 | 构建时需要能访问 npm/Debian 源与 GitHub；**已内置离线包，内网服务器也能构建**（除 apt/pip） |
| 端口 | 只监听 `127.0.0.1:4318`，由 1Panel / Nginx 反代成 HTTPS |

## 3. 离线依赖（vendor/）

| 文件 | 用途 | 来源 / 版本 |
| --- | --- | --- |
| `cadcraft-0.5.0-linux-x86_64.tar.gz` | CADCraft CLI（amd64） | GitHub `storytold/cadcraft` v0.5.0 release，SHA-256 `036c3b40…3e208e` |
| `cadcraft-0.5.0-linux-aarch64.tar.gz` | CADCraft CLI（arm64） | 同上，SHA-256 `15f5047c…26cefa8` |
| `libredwg-web/` | DWG 解码 WASM（`@mlightcad/libredwg-web@0.8.0`） | 与仓库 `package.json` 锁定版本一致，从 `node_modules` 原样导出 |

- 构建时会**校验 SHA-256**，对不上直接失败；缺失时自动从官方 release 下载再校验。
- **不要**把 vendor 里的包换成其他来源。换 CADCraft 版本必须先拿客户真实 DWG 重新做图面验收，再更新 `install-cadcraft.sh` 里的两个校验值。
- `libredwg-web` 升级后重新导出：`docker/cad-export/install-deps-bundle.sh`（在仓库根目录执行）。

## 4. 配置

1. 复制模板并生成令牌：

```bash
cd docker/cad-export
cp .env.example .env
sed -i "s/^CAD_EXPORT_API_TOKEN=.*/CAD_EXPORT_API_TOKEN=$(openssl rand -hex 32)/" .env
chmod 600 .env
```

`.env` 已在 `.gitignore` 中，不要提交，也不要写进前端或日志。模板里的令牌**故意留空**：
直接用 `.env.example` 启动会以“缺少 CAD_EXPORT_API_TOKEN”退出，不会带着空令牌或占位令牌跑起来。
compose 只读 `.env` 一个 env_file，缺文件时 compose 直接报错。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `CAD_EXPORT_API_TOKEN` | 无（必填，≥32 字符） | 调用方唯一凭证；缺失启动即失败 |
| `CAD_EXPORT_MAX_PENDING` | `4` | 上传+排队+运行任务总数上限，超出返回 429 |
| `CAD_EXPORT_MAX_BYTES` | `104857600` | 上传大小上限（100 MiB） |
| `CAD_EXPORT_PAGE_TIMEOUT_MS` | `120000` | 单页裁剪渲染上限，超时整个任务失败、不给半成品 |
| `CAD_EXPORT_TIMEOUT_MS` | `3000000` | 整任务上限（50 分钟） |
| `CAD_EXPORT_PUBLISH_PORT` | `4318` | 宿主机映射端口（本机验收时可换成 14318 避免冲突；从环境变量或 `.env` 读取） |

镜像内已固定的路径（无需在 .env 里写）：`CADCRAFT_CLI=/usr/local/bin/cadcraft-cli`、`PDFTOPPM=/usr/bin/pdftoppm`、
`CAD_REVIEW_PYTHON=/opt/cad-venv/bin/python`、`CAD_REVIEW_FALLBACK_FONT=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc`。

## 5. 启动

```bash
cd docker/cad-export
docker compose up -d --build
docker compose ps            # STATUS 应为 healthy
docker compose logs -f       # 可见“依赖自检通过”和“接口已启动”
```

启动自检会真实执行：`cadcraft-cli --version`、`pdftoppm -v`、`python -c "import ezdxf,fitz,pypdf,PIL; 导入 ezdxf 绘图后端"` 与数据目录可写检查。任何一项失败都会直接退出。

### Nginx / 1Panel 反代

```nginx
location /cad-export/ {
    proxy_pass http://127.0.0.1:4318/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
    client_max_body_size 100m;      # 与 CAD_EXPORT_MAX_BYTES 保持一致
    proxy_read_timeout 600s;         # 轮询请求本身很快，下载大 PDF 时留足时间
}
```

只在反代层加 HTTPS 与访问日志脱敏；**不要在反代层放行不带令牌的 `/v1/` 请求**。

## 6. 调用

与 [CADCraft 快速导出接口](../cad-export-api.md) 完全一致（上传 202 → 轮询 → 下载）。服务器版额外强制：

- 不提供网页（`/` 返回 404），没有 Cookie 会话；
- 所有端点（含 `/health` 和下载）都必须带 `Authorization: Bearer <令牌>`，缺令牌返回 401。

```bash
TOKEN=$(grep '^CAD_EXPORT_API_TOKEN=' .env | cut -d= -f2)
curl --fail-with-body -X POST \
  'http://127.0.0.1:4318/v1/exports?filename=input.dwg&colorMode=readable&space=%E5%B9%B3%E9%9D%A2%E5%9B%BE&overviews=skip' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' \
  --data-binary @input.dwg
```

`space` 用原始布局名（中文需 URL 编码）；`overviews=skip` 只导布局、不导 Model 总览——**这是目前唯一稳定可行的范围**。

## 7. 运维

| 场景 | 做法 |
| --- | --- |
| 查看详情 | `docker compose logs -f`；任务状态在接口里，日志只有错误摘要 |
| 重启 / 更新镜像 | `docker compose up -d --build`；进行中的任务会标记失败并要求重新上传，**不提供半成品** |
| 优雅停止 | `docker compose stop`（等 30 秒清理任务进程）；`docker compose down` **保留**数据卷 |
| 数据清理 | 由调用方 `DELETE /v1/exports/:id`；接口不会自动过期。需定时清理时用 cron 调 DELETE |
| 备份 | 备份卷 `fmkj-cad-export-data`；其中含客户原始图纸与导出结果，按敏感数据管理 |
| 扩容 | **一个数据目录只能跑一个实例**，不要 `--scale`。并发能力靠“排队 + 多台前置”，需要先做租户与队列（见交付边界） |

### 已知行为与限制

- **串行执行**：同一时刻只渲染一个任务，第 3 个以后的请求排队；健康检查因此打了 `start_period`。
- **整份 DWG 导出目前不可用**：68 图框 + 3 总览在 Model 总览处触发单页 120 秒上限。请只导出指定布局。
- **中文替代字体**：Linux 用 Noto Sans CJK 替代原 SHX，文字宽度与原 CAD 可能有差异，需人工核对。
- **缺失外部图片**：源图引用的外部图片未随文件提供时，会在 `warnings` 里列出，不会静默丢图。
- **健康检查口径**：容器内不配置令牌，所以 `/health` 返回 401 也算存活；这是有意的。
- 日志里会打印 CADCraft 解码警告（`BAD_CONTINUATION_BYTE` 等），属源图纸编码问题，不影响导出。

## 8. 交付边界（对客户上线前必须补）

本镜像解决的是“能在服务器上安全地跑出导出结果”，**不等于已可对多客户开放**：

1. **无租户隔离**：一个共享令牌可读写该服务上的全部任务（含别家图纸）。对外前必须接租户鉴权，或每客户一套实例与卷。
2. **无配额与限流**：只有 429（队列满），没有按客户的任务数/流量配额。
3. **无自动过期**：任务默认永久保留，需要安排清理与磁盘告警。
4. **无 SLA**：单次只导布局约 20–50 秒（同一机器实测波动较大），并发时会排队；对客户只能承诺“生成后可用”，不要承诺固定秒数。

## 9. 验收记录（2026-10-21，本机 Docker 29.8 / arm64）

- 构建：`docker compose up -d --build` 成功，镜像约 1.1 GB；CADCraft CLI 0.5.0、Poppler 22.12.0、Python 3.11 + ezdxf 1.4.5 / PyMuPDF 1.26.7 / pypdf 6.10.0 / Pillow 通过自检。
- 接口：`/health` 无令牌 401、有令牌 200；`/` 404（网页关闭）；错误令牌 401。
- 失败关闭：只有 `.env.example`（空令牌）时容器反复重启并打印“缺少 CAD_EXPORT_API_TOKEN”，不会对外服务。
- 真实 DWG（4.0 MB，SHA-256 `3c7931b0…`）经 compose 启动的容器完整导出 `平面图` **13 页 / 47.9–50.4 秒**，55 个文件；合并 PDF 13 页 13 个书签；PNG 均 3000×2121；源文件 SHA-256 前后一致。
- 持久化：任务完成后 `restart` 容器，任务仍为 `succeeded`，13 页与 55 个文件可继续下载。
- 故障处理：任务运行中 `restart`，任务标记 `failed`，容器内无残留渲染/CAD 子进程；`stop` 收到 SIGTERM 后正常清理退出。
- 资源：空闲内存约 236 MiB；单任务渲染峰值按本机历史记录约 0.4–1.4 GiB。
- 真实 DWG 二号（`保利天瑞23栋103平面+吊顶10.3.dwg`，1.5 MB）：图框块在图层 `0`、出图比例 1:80 的图纸，修正识别规则后容器内导出 **8 张逐页图框 / 18.5 秒**，图名逐页正确（`PM-15 富二楼顶面布置图` 等），合并 PDF 8 页 8 书签。修正前后对比、图名来源与像素差异见[接口文档](cad-export-api.md)。
- **未覆盖**：amd64 服务器实机、对外 HTTPS 反代后的真实客户端、多客户并发压测。容器导出的图与本机导出平均通道差 0.95/255（Noto CJK 替代字体），仍需人工核对图面。这三项需在正式服务器上补做，尤其是 amd64 架构——构建会用 x86_64 的 CADCraft 包，本次未实机验证。

## CAD → 点位草稿 导入服务（同一镜像，可选）

客户自部署的设计站需要“导入 CAD 生成点位”时，用同一镜像起第二个服务：

```sh
cd docker/cad-export
# .env 里追加：CAD_IMPORT_API_TOKEN=<openssl rand -hex 32>
docker compose --profile import up -d cad-import
```

- 入口由 `CAD_SERVICE=import` 切换；compose 里把该服务放在 `import` profile，只做导出时不会被拉起。
- 端口只绑 `127.0.0.1:4328`，对外仍需反代 HTTPS；数据卷 `fmkj-cad-import-data` 单独存放客户原图与点位草稿，便于按保留期清理。
- 健康检查同样接受 401（容器内不带令牌）。
- 设计站侧只需配置两个环境变量：`CAD_IMPORT_SERVICE_URL`（反代后的地址）与 `CAD_IMPORT_SERVICE_TOKEN`（= `CAD_IMPORT_API_TOKEN`）。详见 [CAD 导入接口](cad-import-api.md)。

容器实测（2026-10-21，arm64）：真实 4 MB DWG、`space=平面图`，端到端返回 **76 个待复核点位**（46 灯具 + 16 开关 + 14 空调点位），底图 3000×2358，9 个产物齐全；下载的 `draft.json` 通过设计站 `parsePointMapDraft` 解析。首次失败过一次（`ENOENT ... output/pages`：worker 未先建父目录），已修正并复测通过。
