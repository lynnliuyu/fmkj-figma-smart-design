# 上线清单（A 级任务）

> 用途：把「替换线上」这件事拆成可勾选的步骤，避免上线当天漏项。
> 标注 🔴 的是**必须 owner 提供信息**才能推进的，其余我都能自己完成。

---

## 0. 前置信息（🔴 只有 owner 知道）

| #   | 信息                                             | 为什么需要                 | 现状    |
| --- | ------------------------------------------------ | -------------------------- | ------- |
| 1   | 线上服务器地址（IP / 云厂商 / 域名）             | 没有它无法部署             | ❓ 未知 |
| 2   | 线上现在跑的是哪一版（Figma Make？某台服务器？） | 决定是「新建」还是「替换」 | ❓ 未知 |
| 3   | SSH 访问方式（密钥 / 密码 / 跳板机）             | 部署执行的前提             | ❓ 未知 |
| 4   | 域名是否已备案                                   | 国内服务器 80/443 强制要求 | ❓ 未知 |
| 5   | 数据要不要迁移（Figma 里的历史客户数据）         | 决定是空库上线还是带数据   | ❓ 未知 |

---

## 1. 代码就绪（我可以自查）

- [x] 全部迁移文件齐全（13 个，`src/migrations/`）
- [x] 七道门禁全绿
      （`oxfmt` / `eslint 0 warning` / `tsc` / `knowledge:check` / `vitest 100` / 生产构建 / e2e 冒烟 21 页）
- [x] `/catalog` 构建期连库导致卡死的问题已修复（改为 `force-dynamic`）
- [ ] **Docker 镜像能构建成功**（本机正在验证）
- [ ] 镜像能启动并通过健康检查
- [ ] 首次启动自动建表 / 迁移执行成功

## 2. 构建产物（我可以验证）

```bash
docker build -t fmkj-app:latest .
docker compose up -d          # 需要先配好 .env
docker compose logs -f app    # 看到 Migrated + Ready
curl -I http://localhost:3000/login   # 期望 200
```

- [ ] 镜像构建成功
- [ ] 容器启动、schema 建好
- [ ] 关键页面可访问（登录 / 首页 / 项目列表 / 报价 / 合同）

## 3. 环境变量（🔴 需要 owner 给域名等）

复制 `deploy/selfhost.env.example` → `.env`，必填三项：

```bash
PUBLIC_URL=https://<你的域名>          # 🔴 构建时写入前端，改后要重新 build
PAYLOAD_SECRET=$(openssl rand -hex 32) # 设定后不要再改（改了所有人要重新登录）
POSTGRES_PASSWORD=$(openssl rand -hex 32)
```

可选（国内建议）：`NPM_REGISTRY` / `NODE_IMAGE` / `POSTGRES_IMAGE` / 对象存储 `S3_*`

- [ ] `.env` 配好
- [ ] `PAYLOAD_SECRET` 已生成并妥善保存

## 4. 数据（🔴 要看是否迁移历史数据）

若需要迁移 Figma 里的历史数据，见 `deploy/DEPLOY.md` 第 4 节：

1. Figma 里导出 → `data.json` + `files/`（约 140 MB，**含客户姓名电话，不要进 Git**）
2. scp 到服务器 `import/`
3. 容器里执行 `data-import.ts`
4. **导入完成后删掉 `import/` 目录**

- [ ] 导出完成
- [ ] 上传并导入
- [ ] 清理 `import/`

## 5. 上线后必做（我可以写脚本）

- [ ] 创建管理员账号（`scripts/set-password.ts admins <邮箱>`）
- [ ] 逐个重设员工密码（Figma 密码格式不兼容，无法迁移）
- [ ] 配置公司信息（名称 / 电话 / 地址 / 二维码 / Logo）
- [ ] 导入产品库（否则首页/产品目录会显示「0 款在售产品」——
      这个空状态已在 PR #47/#50 改成不暴露 0 值，但仍建议尽早导入）
- [ ] 跑一遍冒烟：`SMOKE_PROJECT_ID=<真实项目> pnpm smoke`
- [ ] 备份策略：`media` 卷 + PostgreSQL 数据卷

## 6. 回滚预案

```bash
# 镜像层面
docker compose down
docker tag fmkj-app:previous fmkj-app:latest
docker compose up -d

# 数据层面（迁移前必须做的备份）
docker compose exec db pg_dump -U fmkj fmkj > backup-$(date +%F).sql
```

- [ ] 上线前已备份数据库
- [ ] 旧镜像 tag 保留
- [ ] 知道怎么回滚

---

## 附：我能自动化掉的部分

等你给信息后，这些不需要你操心：

1. **构建验证**：本机跑通 `docker build` + 起容器 + 冒烟
2. **部署脚本**：写一个 `deploy/release.sh`，一键完成
   「构建 → 传镜像 → 服务器上滚动重启 → 健康检查 → 失败自动回滚」
3. **GitHub Actions 部署流水线**：main 合并后自动构建并推送到服务器
   （需要服务器 SSH 凭证配到 GitHub Secrets）
4. **上线后冒烟**：部署完自动跑 e2e/smoke.mjs，失败自动告警

**先给我第 0 节的 5 条信息，我就能把它们全部落地。**
