# 内部宣传素材库（issue #179）

> 面向宣传视频 / Apple Motion 工程的**独立产物**：`.export-artifacts/asset-library/`（已 gitignore，
> **不进公开站**）。截图与录屏全部来自本机演示环境 + 演示数据。

## 1. 产物与目录

```
.export-artifacts/asset-library/
  index.html            # 可浏览 / 搜索 / 按类别与画幅筛选 / 下载；manifest 已内联（file:// 可用）
  manifest.json         # 逐项元数据：尺寸、时长、格式、来源、许可、署名、标签
  README.md             # 本清单的机器生成版（含逐项表格）
  assets/product/       # 真实产品页面截图（16:9 ×6、9:16 ×2）
  assets/optimized/     # 展示页 1920×1080、展示版点位图 ×3、品牌 ×3、单色图标总览/ SVG 集 ×2
  assets/button/        # 按钮/控件 default/hover/focus/pressed（2x）
  assets/motion/        # H.264 MP4（3.5s，1920×1080 或 1280×720）
  verify/               # 浏览/筛选/搜索/下载截图、下载文件、verification.json
```

本批 26 项：**product 8 · optimized 11 · button 4 · motion 3**。

## 2. 复用既有成果

| 来源                                          | 用法                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PR #176 `/showcase`（1920×1080 固定版式）     | 优化版 `showcase-1920x1080.png`。`SHOWCASE_BASE`（默认 `:3000`）不可用时回退到 `.export-artifacts/pr176-showcase/` 的验证截图 |
| #173 展示版点位图 `*-showcase.png`            | `optimized/plan-{1,2,3}f-showcase.png`（2400×1600，3:2）                                                                      |
| #173 单色设备图标 `public/board/symbols/mono` | 16 类必需图标的白/金 SVG（透明底）+ 8×2 总览图                                                                                |
| 品牌资产 `public/brand`                       | 横版 Logo（SVG / @2x PNG）与 1024 App 图标                                                                                    |

## 3. 各类素材与适用场景

- **product**：首页、项目工作台、点位图编辑、报价单编辑、能力中心、设置。16:9 用于横版视频；
  首页/项目另有 9:16 竖版。全部为演示账号 + 内置示例项目（无客户真实数据）。
- **optimized**：展示页可直接当 16:9 底图；点位图适合做局部放大/推镜；单色图标适合叠在深色画面。
- **button**：真实控件四态，按元素 2x 截取；**带页面背景色**（非透明），Motion 里可直接当贴片或抠底。
- **motion**：账户菜单开合、深浅色切换、AI 侧栏抽屉；H.264 MP4，Motion File → Import 即可。

## 4. Motion 导入须知

1. PNG/MP4 直接 Import；MP4 会自动按 `width×height` 建层（manifest 里有尺寸/时长）。
2. SVG 图标 Motion 不直接吃：先用 Illustrator/Figma 转 256/512 PNG（透明底）。
3. 录屏带页面背景，没有 alpha 通道；需要透明叠加时请抠底或改用按钮/图标 PNG。

## 5. 来源 / 许可 / 署名（本批）

- **自产截图/录屏**：`source.type = self`，许可「内部宣传使用（繁梦空间自有素材）」，署名「繁梦空间」。
- **项目自有素材**（展示页、点位图、图标、Logo）：`source.type = project`，同一许可。
- **外部素材：0**。后续收录必须同时具备「宣传使用」与「再分发」授权，并在 manifest 写清来源、许可与署名；
  无明确授权的素材一律不入库。

## 6. 复跑

前置：本机 dev（演示库）在 `:3001`；如需最新 `/showcase`，`:3000` 跑 PR #176 分支。

```bash
# 截图/录屏/生成 manifest/浏览页
node scripts/asset-library/build.mjs
# 浏览 + 筛选 + 搜索 + 下载 + 清单自检（PNG 尺寸 / MP4 h264）
node scripts/asset-library/verify.mjs
```

可覆盖环境变量：`BASE`、`SHOWCASE_BASE`、`DEMO_EMAIL`、`DEMO_PASS`、
`DEMO_PROJECT_ID`、`DEMO_QUOTE_ID`、`ASSET_OUT`。

## 7. 验证结果（本批）

- 26/26 项文件存在，PNG 尺寸与 manifest 一致，MP4 均为 `h264` 且带时长。
- 浏览页：26 张卡；`category=motion` 筛选 3 项；搜索 `button` 4 项。
- 下载可用：产品图与按钮态均通过浏览器下载得到实际文件。
- 控制台错误 0；外部请求 0（纯本地静态服务 + 本机 dev）。
- 证据：`verify/library-all.png`、`verify/filter-motion.png`、`verify/search-button.png`、
  `verify/download.png`、`verify/downloads/*`、`verify/verification.json`。

## 8. 已知边界

- 按钮态是**元素截图**（含页面背景），不是透明底组件渲染；若需要纯透明四态，需另做组件渲染管线。
- 动效片段固定为最后 3.5s（动作在结尾），没有逐帧裁剪工具；更精细的剪辑请在 Motion 内完成。
- 截图依赖本机演示数据与两个 dev server；数据/断点变化会导致画面不同。
- 本产物不进公开站；不要复制到 `public/`，也不要提交到仓库。
