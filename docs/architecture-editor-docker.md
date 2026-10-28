# 流程图编辑器：Docker 部署

把项目的 `.drawio` 流程图放进一个数据目录，用本地浏览器打开编辑器改字、拖动、连线，保存回原文件。
**一个容器同时服务多个项目**（每个项目一个子目录），其他项目可以直接复用这个镜像。

实现：`scripts/architecture-editor-server.py`（Python 标准库）+ 官方 draw.io 前端资源（固定提交，离线可用）。
2026-10-21 在本机 Docker 29.8（arm64）实测通过，见文末“验收记录”。

## 1. 目录

```text
docker/architecture-editor/
├── Dockerfile                 多阶段镜像：python:3.12-slim + 固定提交的 draw.io 资源
├── Dockerfile.dockerignore    构建上下文白名单（只带脚本、页面和 vendor 包）
├── docker-compose.yml         服务定义：绑定 127.0.0.1、数据卷、内存上限、健康检查
├── .env.example               宿主机端口 / 允许主机 / 数据目录模板
├── entrypoint.sh              启动自检：draw.io 资源、数据目录可写、令牌文件
├── set-token.sh               生成主编辑令牌（数据目录只放 SHA-256）
└── vendor/drawio.tar.gz       离线 draw.io 资源（构建时优先使用，缺失才联网下载）
```

## 2. 数据目录

宿主机目录默认是仓库内 `docs/architecture-data/`（已加入 `.gitignore`）。结构：

```text
<数据目录>/
├── .editor-token.sha256              主编辑令牌的 SHA-256（set-token.sh 生成，内容不是密钥）
├── projects/<项目名>/
│   ├── system-map.drawio             编辑主文件（唯一权威内容，文件名固定）
│   ├── system-map.editable.registry.json   每次保存自动生成：每页的节点、连线与图元属性
│   └── （同目录可放该项目的静态架构阅读版等附随文件，按原样提供下载）
└── backups/<项目名>/<时间戳>.drawio   每次保存前的上一版
```

- 加一个项目 = 在 `projects/` 下建一个文件夹放 `system-map.drawio`，刷新项目列表即可编辑；也可以在列表页直接新建空流程图。
- 项目名限 1–48 个中英文、数字、空格、点、横线或下划线；服务端校验并拒绝路径穿越。
- 本仓库的“繁梦空间设计站”流程图副本已放在 `docs/architecture-data/projects/繁梦空间设计站/`；
  `docs/architecture/` 里的原文件仍是 Git 版本，两者不自动同步（见第 7 节）。

## 3. 启动

```bash
# 1) 生成编辑令牌（只做一次；换目录复用同一镜像时给新目录也跑一遍）
sh docker/architecture-editor/set-token.sh

# 2) 构建并启动
docker compose -f docker/architecture-editor/docker-compose.yml up -d --build

# 3) 打开项目列表
open http://127.0.0.1:8767/
```

从列表进入项目后，页面标题栏出现“保存到项目”。点击它或按 `⌘S` / `Ctrl+S` 写回 `system-map.drawio`，
同时在 `backups/` 留一版旧文件；另一个窗口或 Agent 改过文件时保存会被拒绝（409），提示先下载副本再刷新对照。

“保存到项目”的状态提示只反映内容变化：切换分图、缩放、平移都不算修改（首次加载时 draw.io 会规范化一次模型，
可能短暂显示一次未保存提示，之后自行恢复）。保存按钮始终写入编辑器当前内容。

编辑手势：双击改文字，拖动改位置，拖动箭头改关系，**Alt+滚轮缩放**（以光标为中心），
**Alt+左键拖动平移画布**。Ctrl/⌘+滚轮是 draw.io 原生缩放，仍然可用。

实现方式：draw.io 原生把 Ctrl+滚轮当缩放、Alt+滚轮当滚动，把 Ctrl+左键当平移。
页面在捕捉阶段拦下 Alt+滚轮与 Alt+左键按下，各补发一个“带 ctrlKey 的同类事件”，
由它自己的缩放/平移逻辑处理，因此缩放以光标为中心、拖动也连续。
代价：Alt 原本还兼作“拖动不吸附网格”和“Alt+点击选中下层图形”，被平移接管后这两项不再生效。
底部分图页签切换 13 页：第 1 页是“总关系图”，其余 12 页是分图；总关系图用 `pnpm arch:overview` 由分图重新生成。

令牌只在 `set-token.sh` 运行时明文写入 `~/.config/architecture-editor/master-token`；容器里的页面拿到的是一次性页面令牌，
主令牌不会出现在页面源码或启动命令里。

**只读与写入的边界**（按绑定地址自动决定，无需手工配置）：

| 部署形态 | 看图 / 下载 | 保存 / 新建 |
| --- | --- | --- |
| 只绑 `127.0.0.1`（默认） | 免令牌；页面令牌过期或只拿到链接也能只读查看 | 必须带令牌 |
| 绑到 `0.0.0.0` / 局域网 | 需要令牌（从项目列表进入才会带上页面令牌） | 必须带令牌 |

只读免令牌的用意：容器重启后旧链接里的一次性令牌会失效，此时页面仍应能看图与下载副本，而不是报错。
对外绑定时改为读也校验令牌，避免局域网或公网直接读到流程图内容。写入任何情况下都要求令牌、同源 Origin 与白名单 Host。

## 4. 复用给其他项目

同一个镜像可以服务任意数据目录。在另一个项目的 `docker-compose.yml` 里：

```yaml
services:
  architecture-editor:
    image: fmkj-architecture-editor:1          # 已 build 过的镜像，或推到你们的内网 registry
    ports:
      - "127.0.0.1:8767:8767"
    volumes:
      - /path/to/that/project/diagrams:/data
```

```bash
sh <本仓库>/docker/architecture-editor/set-token.sh /path/to/that/project/diagrams
```

端口被占用时，把宿主机映射改成别的端口，并把 `ARCH_EDITOR_PUBLISH_PORT` 设成同一个值（服务用它做 Origin 校验）：

```yaml
    ports:
      - "127.0.0.1:18767:8767"
    environment:
      ARCH_EDITOR_PUBLISH_PORT: "18767"
```

## 5. 局域网 / 反向代理访问

默认只绑定 `127.0.0.1`，需要局域网访问时：

1. 设置编辑令牌（第 3 节第 1 步）。
2. `.env` 里改 `ARCH_EDITOR_PUBLISH_HOST=0.0.0.0`。
3. 把实际访问地址加进 `ARCH_EDITOR_ALLOW_HOSTS`（空格分隔）：
   - `192.168.1.20:8767`：只放行这个主机 + 端口；
   - `diagram.example.com`：放行该域名任意端口（配合 Nginx 的 `proxy_set_header Host $host;`）。
4. `docker compose ... up -d --force-recreate`。

- **只读也要令牌**：`ARCH_EDITOR_PUBLISH_HOST` 不是 `127.0.0.1` 时，服务自动要求只读也带令牌；进入编辑页请从项目列表点进去。
- **编辑凭证的有效期与续用**：从项目列表点进去时，页面会拿到一张编辑凭证（令牌），有效期 7 天，并写在数据目录的 `.editor-handoff.json`（权限 600）。**容器重启或重建后仍然有效**，所以已经打开的页面不会因为重建镜像而失去保存能力。用旧书签直接打开 `?project=`（不带 `t=`）或凭证过期后保存会被拒，这时回到 `http://<地址>:8767/` 从项目列表重新点「编辑」即可。
- **保存被拒时的表现**：服务会先读完请求体再回 JSON 错误，页面会直接显示“编辑凭证已过期……请回到项目列表重新点「编辑」；当前修改先点「下载副本」保留”。画布里的内容不会丢，先点「下载副本」把当前编辑存成本地 `.drawio` 文件。
- 没有令牌文件时，服务（含局域网）保持只读，不会出现无鉴权可写的情况。
- 保存校验要求 `Origin` 精确命中白名单；反向代理必须透传原始 `Host` 头，否则保存会 403（日志里会写明原因）。

## 6. 配置

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ARCH_EDITOR_PUBLISH_HOST` | `127.0.0.1` | 宿主机绑定地址；局域网访问改 `0.0.0.0`（同时决定只读是否免令牌） |
| `ARCH_EDITOR_PUBLISH_PORT` | `8767` | 宿主机端口；不是 8767 时必须同步设给服务 |
| `ARCH_EDITOR_ALLOW_HOSTS` | 空 | 额外允许的 Host，空格分隔；只写主机名表示不限端口 |
| `ARCH_EDITOR_DATA_DIR` | `../../docs/architecture-data` | 宿主机数据目录，挂到容器 `/data` |
| `ARCH_EDITOR_TOKEN_FILE` | `/data/.editor-token.sha256` | 容器内令牌哈希文件路径，一般不用改 |
| `ARCH_EDITOR_TOKEN_SHA256` | 空 | 直接给服务传主令牌哈希（不经文件），脚本/测试用 |

镜像内固定：监听 `0.0.0.0:8767`，draw.io 资源在 `/opt/drawio`，数据目录 `/data`，以 UID 10001 运行。

## 6.1 更新页面后要重建镜像

`docs/architecture/editor.html` 是**打进镜像**的：改了这个页面（例如加快捷键提示）必须
`docker compose -f docker/architecture-editor/docker-compose.yml up -d --build` 才生效，
只重启容器仍然是旧页面。

## 7. 与仓库文件的关系

- `docs/architecture/system-map.drawio` 是 Git 里的架构文档；Docker 数据目录里的 `projects/繁梦空间设计站/system-map.drawio` 是编辑器的主文件。
  在 Docker 里改图不会自动改前者；需要入库时把文件复制回去再提交，或在数据目录里直接 `git add` 对应项目目录（确认不要提交 `.editor-token.sha256` 以外的私密内容）。
- `system-map.editable.registry.json` 在两边分别是：仓库里的由原脚本（`scripts/architecture-editor.py`）生成，
  容器里的由本服务保存时生成，结构一致（`schemaVersion: 1`，含每页 `nodes` / `edges`）。
- Agent 读取流程图应以最新 `.drawio` 为准；`registry.json` 是派生清单，图中状态与代码引用是人工声明，不等于实现审计。

## 8. 本机直跑（不用 Docker）

```bash
python3 scripts/architecture-editor-server.py \
  --data-dir docs/architecture-data \
  --drawio-assets .local/architecture-tools/drawio-source/src/main/webapp \
  --token-file docs/architecture-data/.editor-token.sha256
```

打开 `http://127.0.0.1:8767/`。只监听本机（`--bind` 默认 `127.0.0.1`）；原来的 `scripts/architecture-editor.py` 仍可用，但它固定读写本仓库的单个文件。

## 9. 验收记录（2026-10-21）

在本机 Docker 29.8（arm64）实测：

| 项目 | 结果 |
| --- | --- |
| 镜像构建（本地 vendor 离线包） | 约 47 秒，含 python 基础镜像与 draw.io 32.5.5（提交 `17b367b`） |
| 项目列表 / 编辑页 | 200；编辑页注入项目名与一次性令牌 |
| draw.io 编辑器加载 | 真实 Chrome 中 iframe 载入 draw.io app，渲染出 11 页流程图第 1 页（133 个图元组） |
| 浏览器“保存到项目” | 返回“已保存到项目 · 已保留上一版备份”，宿主机出现一版备份文件 |
| 版本冲突 | 旧 revision 保存返回 409，不覆盖文件 |
| 鉴权 | 无令牌可读不可写；错误令牌、非白名单 Origin、未映射端口均 403 |
| 端口映射（8767→18767） | Origin 校验按映射端口放行，与实际浏览器一致 |
| 健康检查 | 容器状态 healthy |
| Alt+滚轮缩放 | 真实输入事件：92% → 100% → 120%，反向 120% → 100%；缩放以光标为中心（光标附近图形仅偏移约 11 px） |
| Ctrl/⌘+滚轮缩放 | draw.io 原生手势，仍可用：100% → 120% |
| Alt+左键拖动平移 | 真实输入事件：拖动 170×90 px，画布位移正好 +170/+90，反向精确回位；编辑状态保持“未修改” |
| Alt+从图形上拖动 | 同样平移画布，不移动图形（捕捉阶段截获，与落点无关） |
| 普通拖动未被破坏 | 无修饰键拖动节点仍移动图形并把状态置为“有未保存的修改” |
| 只读免令牌（本机） | 无令牌 `GET /api/diagram` 200、下载文件 200；无令牌 `POST` 仍 403 |
| 只读要令牌（对外） | `ARCH_EDITOR_PUBLISH_HOST=0.0.0.0` 时无令牌读取 403、带令牌 200 |
| 令牌过期仍可只读 | 用过期的页面令牌打开：状态显示“只读…不能保存到项目”，13 页正常渲染，保存按钮为“只读模式” |
| 总关系图 | 13 页中的第 1 页；Agent 读得 13 个业务节点、12 条连线、无悬空连线 |
| 上传图纸页 | 第 5 页；Agent 读得 14 个业务节点、16 条连线，其中 3 个标为【规划，尚未实现】 |
| 连线穿框检测 | 渲染后 SVG 路径与节点矩形做几何相交检测：上传图纸页、业务流程图、总关系图均为 0 处穿框 |
| 仓库副本同步 | 保存成功返回 `mirrored=/repo/docs/architecture/system-map.drawio`，两侧 SHA-256 一致 |

未覆盖：Windows / amd64 真机、Nginx 反向代理真机、超大（>8 MiB）流程图与多人同时编辑。
