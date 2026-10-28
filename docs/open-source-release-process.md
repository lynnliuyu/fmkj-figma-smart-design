# 自部署版与正式版：两版并行流程

Date: 2026-10-21
Status: 首次正式同步已完成（公开仓库提交 `43fe548`，对应主干 `0750551`）；后续按本文步骤继续。

## 结论先行

- **fmkj-v3（本仓库，私有）= 唯一开发主干**，也是"正式版"（你为客户部署、含客户业务资料与商业配置）。
- **fmkj-smart-design（公开，MIT）= 自部署版**，是主干的**发行产物**，不是第二条开发线。
- 依据 [ADR 0010](adr/0010-hosted-local-deployment-and-optional-catalog.md)：两种部署共用一套业务核心与版本体系；官方产品主库、订阅凭据、商业服务配置独立私有维护。原业务工作区不能直接对外，必须从脱敏发行源构建公共产物。

## 为什么不能两个仓库各自提交

两边独立提交后，业务核心会各自演进，修复无法回流，很快就无法判断"线上到底跑的哪一份"。所有业务代码改动都在 fmkj-v3 提交，然后用本节机制导出。

## 操作步骤

```bash
# 1) 准备好目标仓库（首次或每次同步前更新）
git clone https://github.com/lynnliuyu/fmkj-smart-design /tmp/smd
cd /tmp/smd && git pull --ff-only

# 2) 演练：只报告差异，不写任何文件
cd <fmkj-v3>
node scripts/open-source-export.mjs --target /tmp/smd

# 3) 看报告：新增/修改文件、替换命中、被跳过的二进制、门禁结果
#    - 新增文件必须逐个确认「这个该公开吗」
#    - 门禁失败时先改 manifest（补 replace 或加 exclude），不要绕过

# 4) 写入目标工作区（仍不提交）
node scripts/open-source-export.mjs --target /tmp/smd --apply

# 5) 在目标仓库验证后再提交推送
cd /tmp/smd
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
git status --short          # 人工核对每一处改动
git add -A && git commit -m "sync: 业务核心更新（主干 <短哈希>）"
git push origin main
```

## 策略文件

`scripts/open-source-manifest.json` 是唯一策略来源：

| 字段 | 作用 |
| --- | --- |
| `exclude` | 不进公开版：客户素材、渠道资料、内部工具、商业规划文档 |
| `preserve` | 公开版自有、不被主干覆盖：README、LICENSE、AGENTS.md、环境模板、getting-started 等 |
| `replace` | 导出时替换：客户项目名、真实报价号、个人路径、内部邮箱域、真实产品图引用、私有仓库标识 |
| `deny` | 门禁：导出内容里出现即**失败且不写入**（客户名、真实报价号、密钥、个人路径、私有账号） |
| `warn` | 只提醒不阻断（如文档提到 `.local/`，公开版没有该目录属正常） |
| `binaryPolicy` | 公开版不含二进制/图片；非文本文件默认跳过并在报告里列出 |
| `denyAllow` | 允许例外：环境变量模板、本机开发数据库默认口令 |

## 已知取舍

- **客户名替换是"规则驱动"的**：新客户名出现时必须补进 `replace`，否则门禁会拦住（拦不住的情况只有：客户名恰好不在任何 deny/replace 规则里，且没人看新增文件报告）。因此**每次同步都要看新增文件清单**。
- **二进制靠策略跳过，不靠扫描**：客户图纸是二进制，门禁扫不出内容，所以公开版直接不接收任何非文本文件。
- **排除脚本的引用会被改写**：文档里指向未发布脚本的路径会替换为一句说明（当前影响 8 个文件），需要人工读过这些段落。
- **两版功能差异**：自部署版不含 CAD 导出服务与本地设备更新；这是当前策略，若要改变需调整 `exclude`。

## 演练结果（2026-10-21，主干 `0750551`；同日已实际推送）

| 项 | 数量 |
| --- | --- |
| 主干已跟踪文件 | 2141 |
| 导出（可公开子集） | 557 |
| 公开版自有（保留不覆盖） | 12 |
| 按二进制策略跳过 | 7 |
| 实际写入 | 新增 35、修改 89 |
| 从公开版本移除（--prune） | 15 |
| 替换命中 | 客户名 9 个文件、被排除脚本引用 8、报价号 4、产品图 4、个人路径 1、邮箱域 1 |
| 门禁 | 通过（0 处禁止内容） |
| 目标仓库验证 | `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test` 通过（85 个测试文件、877 项） |

首次推送前发现并修正的两处策略错误（都会让公开版不可用或检查失败）：

1. **建库与建管理员脚本被误排除**：`run-migration.mjs`、`seed-admin.mjs`、`check-neon.mjs`、`db-smoke-test.mjs`、`doctor.mjs`、`scripts/lib/**`、`docs/local-database.md` 已从不导出名单移回。公开版安装说明（`docs/getting-started.md`）里的 `pnpm run db:migrate` 与 `pnpm run db:seed-admin` 依赖它们；把它们排除会让新用户无法建表和创建管理员账号，`package.json` 里的命令路径也会被替换规则改坏。
2. **只导出能跑通的测试**：引用未公开脚本的测试必须一起排除（本次新增 `tests/cad-viewport-source.test.ts`、`tests/prepare-cad-floorplan.test.ts`、`tests/prepare-cad-reference-drawings.test.ts`、`tests/export-project-slice.test.ts`）。否则目标仓库的 `typecheck` 与测试会因找不到模块失败——替换规则会把 `.test.ts` 里的 import 路径也改写成说明文字。

演练中拦下的真实风险：主干新增的 `public/assets/project-presentations/<项目ID>/*.png`（客户交付底图，二进制）——已加入 `exclude` 并由二进制策略兜底。
