# 原生 DWG 出图引擎补充研究

核查日期：2026-10-21，Asia/Shanghai。只读访问厂商文档及第一方源码；没有下载安装、创建账号、接受协议、调用付费服务或执行客户图渲染。本文列的是下一阶段可验证入口，不是已证实的性能或保真结论。前次研究见 `2026-10-21-cad-export-options.md`，本文不修改该文件。

后续状态补充：现有路线已发现并修复 ezdxf1.4.4 图块填充变换缺陷，1.4.5 下真实平面布局13张由HTTP接口99.401秒生成。见[修复实测](2026-10-21-cad-hatch-performance-fix.md)。因此，下列原生路线现作为高保真对照与特殊对象的备用候选；本页的厂商获取与许可调查结论不变。

## 建议下一路线

**优先拿到 ODA 的正式试用包，或使用已有 AutoCAD Windows 安装做基准；若已有 APS 开发者凭证，可直接走官方 BatchPublish 示例。** 这些路径减少自行重建 DWG 绘制语义的负担，但仍须核对字体、外部参照、XCLIP、冻结层和填充。

本轮没有发现“无需账号、无需商业授权、现成 Mac/Linux CLI、同时确认完整支持本图 XCLIP 与复杂填充”的直接替代品。QCAD Pro 的 `dwg2pdf` 是可操作的额外候选，但 XCLIP / WIPEOUT 的官方历史答复构成明确验收门槛；CADCraft 0.8.0 仍不能解决这一组合。

| 路线 | 现在公开可访问的入口 | 尚需条件 | 下一步可验收结果 |
| --- | --- | --- | --- |
| ODA Drawings SDK | 免费试用申请、公开 PDF API 说明 | 邮箱验证、ODA Account、下载并激活试用包 | 用包内 `OdPdfExport` / `OdPdfExportEx` 导出一个原布局和一个裁剪图块样本 |
| ODA Drawings Explorer | 公开 Mac / Linux 安装包链接及命令表 | 实际下载、核对使用条款；CLI 出 PDF 参数仍未核实 | 先判断原图显示 / 打印效果，不把它假定成现成无头批打接口 |
| APS AutoCAD Automation | 官方账户教程、GitHub BatchPublish | Autodesk 账号、team / APS tier、Developer Hub、App 凭证；Free tier 也有身份验证要求 | 官方样本先跑通，之后把原 DWG 与参照 / 字体包作为新样本 |
| AutoCAD Core Console | 官方示例中的本地运行脚本 | 已授权 Windows AutoCAD，匹配的 .NET / 引擎版本 | 本地源引擎 PDF 作为效果与耗时对照 |
| QCAD Professional | `dwg2pdf` 全参数文档、公开试用下载页 | Pro / trial 包；Web 服务部署须核对 Server License | 指定布局导出；先测 XCLIP / WIPEOUT，失败则淘汰该图路径 |
| CADCraft 0.8.0 | GitHub release / 源码 | 重新验收新版本 | 无 XCLIP 子样本可比较速度；不能据此替换本图整套导出 |

## ODA：可获取，但 SDK 不是匿名即用下载

ODA [试用页](https://www.opendesign.com/free-trial)明确流程为 Apply → Confirm → Download → Activate；邮箱确认后使用 ODA Account，激活试用归档后样例在 `Exe`（C++）或 `Swig`（.NET）目录。页面说明 60 天、Windows 64-bit / Linux / macOS、1 desktop，试用只提供二进制而不提供调试能力。**不能把这里的免费试用理解成无需账号、无需激活的 SDK 下载。**

申请页链接的[评估许可](https://www.opendesign.com/agreements/ODA%20Evaluation%20License%20Click%20Agreement%20-%20NonMembers.pdf)限定组织内部评估、60 天，不授予转授权 / 分发权。因此本轮没有代为申请或接受协议。正式 Web / SaaS 用途与评估不同：[价格页](https://www.opendesign.com/pricing)将 Web / SaaS 列在 Sustaining 层级，不能仅选最低桌面商业层级就假定可上线 Web 服务。以实际申请时协议与报价为准。

[SDK 平台表](https://www.opendesign.com/supported-platforms/drawings)提供 Linux GCC、Mac x64 / arm64 等不同构建；获取时需要匹配操作系统、CPU、编译器 / 运行库，不能拿免费 Explorer 的 arm64 安装包支持反推所有试用 SDK 都包含同样归档。

### OdPdfExport 的已确认用法与信息缺口

ODA [官方 CLI FAQ](https://www.opendesign.com/cn/faq/question/are-there-command-line-examples-support-windows-and-linux-operating-systems-deb)确认 Drawings SDK 归档中有 `OdPdfExport`，读取 DWG / DXF 后生成 PDF。另一个[官方 FAQ](https://www.opendesign.com/faq/question/how-can-i-export-dwg-file-pdf-file)指向 `Drawing/Examples/OdPdfExportEx`，公开流程是加载 PDF 模块、读取数据库、设置 `PDFExportParams` 的数据库和输出流、调用 `exportPdf` 并检查错误码。

**本轮未找到公开的一手完整 CLI 参数表，也未拿到实际版本试用包。** 因而不编造 `OdPdfExport input.dwg output.pdf --layouts all` 一类命令。其[完整导出文档](https://docs.opendesign.com/td/export_to_pdf_01overview.html)实际跳转 ODA 登录页。下一步应先从激活包中的程序帮助 / 配套 readme 获取真实参数和默认行为，再固化 wrapper；如果不同版本仅有 Ex 示例，以归档内实际程序名为准。

公开[参数说明](https://www.opendesign.com/blog/2023/february/set-parameters-and-flags-pdf-export)已经足以确定需要设置的业务条件：布局列表为空只导当前布局；布局与 pageParams 数量须匹配；默认白底；可配置颜色策略、PDF blocks、几何优化和缓存 / 并行。特别注意 `kZoomToExtentsMode` 会改变原布局的页面行为，默认 flags 中的 `kASCIIHexEncoding` 会增加文件体积。试验时必须记录 flags，不把默认 extents 输出当成原页面精确比例。

ODA [填充导出说明](https://www.opendesign.com/blog/2017/july/hatch-types-and-exporting-pdf)提供 bitmap、drawing、PDF paths 三类策略；PDF paths 只适合实心填充，给 pattern / gradient 会退到位图。它不是“任何 HATCH 都能原样存为 PDF Pattern”的保证。推荐对比时分别标明全矢量与允许填充位图的模式，不用栅格化带来的速度假称全矢量提速。

### 两个公开免费应用不是 SDK 的替身

- [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter)页面公开列出 Linux RPM / DEB / AppImage、Mac arm64 / Intel DMG / PKG 链接，并有目录批转换 CLI；其用途是 DWG / DXF 版本互转，**没有公开 PDF 输出入口**。它可作为 DWG→DXF 转换对照，不能直接解决后段慢的 PDF 绘制。
- [ODA Drawings Explorer](https://www.opendesign.com/guestfiles/oda_drawings_explorer)公开列出相同系统的安装入口及打印、布局切换、启动脚本功能；[命令表](https://www.opendesign.com/guestfiles/oda_drawings_explorer/reference)不足以确认一个无头批量 PDF 参数组合。页面有公开安装包链接，未经过登录页；本轮未请求二进制下载，因此只确认“公开链接存在”，不承诺下载成功、无人值守行为或可嵌入商用接口的权利。

## APS / 本地 AutoCAD：有实际官方批量出图样例

现行[入门教程](https://get-started.aps.autodesk.com/)要求 Autodesk 账号、team 的 APS 订阅、Developer Hub，再创建 App 获取 client ID / secret 并选择 API。现行[官方产品页](https://www.autodesk.com/products/autodesk-platform-services/overview)提供按月额度的 Free tier，说明支付方式用于身份验证；这是当前入口，不沿用旧文章的“90 天 / 100 Cloud Credits”描述。

官方 2026-04-09 [引擎更新文章](https://aps.autodesk.com/blog/end-autocad-2021-engine-new-autocad-2027-engine-released)指向 [ADN-DevTech/autocad-automation-apps](https://github.com/ADN-DevTech/autocad-automation-apps)。它的 `BatchPublishApp` 是多个 DWG → 多页 `result.pdf` 的实际代码，目标 AutoCAD 2027 / `Autodesk.AutoCAD+26_0`。仓库 README 给出 .NET 10、PowerShell 7、构建与部署步骤；当前根目录未见 LICENSE，公开可读不等于已经授予产品内复制分发权。

下一步应先在独立工作目录用官方自带图纸执行它所写的流程：构建对应 BatchPublish 项目、配置凭证、注册 Bundle / Activity、提交 WorkItem、下载 PDF 和 report.log。这里的 [Setup-DA.ps1](https://github.com/ADN-DevTech/autocad-automation-apps/blob/main/aps-da/Setup-DA.ps1)和 [Test-DA.ps1](https://github.com/ADN-DevTech/autocad-automation-apps/blob/main/aps-da/Test-DA.ps1)默认覆盖四类示例，不能不检查就用全部脚本运行客户项目；后者 BatchPublish 段默认只打包 `.dwg`，有 XREF / 图片 / 字体的真实图应另行完整打包。

若有已授权 Windows AutoCAD，[Run-BatchPublish.ps1](https://github.com/ADN-DevTech/autocad-automation-apps/blob/main/BatchPublishApp/src/Run-BatchPublish.ps1)是具体本地验证入口，需要按实际安装路径调整 `accoreconsole.exe` 与构建路径。它不是 Mac / Linux 原生 AutoCAD 程序；Mac / Linux 后端可通过 APS REST 调云端引擎。云端须计上传、排队、执行、下载全过程，字体与参照必须齐全，不能因为使用原厂引擎就不做图面检查。

## QCAD Pro：可运行的 CLI 候选，但裁剪支持不能预设

QCAD [CLI 文档](https://www.qcad.org/en/command-line-tools/)确认 Pro 安装包含 `dwg2pdf`；Mac 在 `QCAD-Pro.app/Contents/Resources`，Linux 在安装目录。其[单工具手册](https://qcad.org/en/manual/scripts/pro/tools/dwg2pdf/doc/dwg2pdf/)给出 `-block` 指定布局 / 块名，支持逗号列表及正则、顺序控制、PDF 版本、颜色、纸张、比例等；Linux 无显示可用 `-platform offscreen`。

在实际安装 Pro / trial 后，可以先读取帮助，再用已经确认的布局名做一个局部验证，例如下面只导名为“平面图”的布局，不自动识别其中每个图框：

```sh
# Linux：在实际 QCAD Pro 安装目录内；这些是后续验证命令，本轮没有执行
./dwg2pdf -h
./dwg2pdf -platform offscreen -block="平面图" -o /absolute/new-output/plan-layout.pdf /absolute/input.dwg

# macOS：把路径改为实际安装位置，然后使用同样参数
/Applications/QCAD-Pro.app/Contents/Resources/dwg2pdf -h
```

不要默认加 `-auto-fit`、`-flat`、强制纸张或 `-recompute-dim`，这些可能改变基准图面 / 尺寸。需要逐图框时，另按既定窗口 / 分页逻辑实现；不能以“一个布局 PDF 成功”声称 68 张图框全出。

[试用下载页](https://www.qcad.org/en/download/)是公开入口，但本轮文本结果只显示动态加载下载列表，未验证当前确切二进制 URL、无账号下载流程或最新 trial 的全部限制。维护者在[官方历史答复](https://forum.qcad.org/t/ubuntu-command-line-to-run/4765)确认过 trial CLI 的 15 秒延迟；2026 年[官方论坛记录](https://forum.qcad.org/t/trial-version-not-working-in-linux-vm/11622/8)又涉及特定试用命令的弹窗 / offscreen 问题，故应检查实际版本日志，不能把试用总耗时直接当正式版性能。

关键准确性门槛：维护者在 [2023-12 官方答复](https://forum.qcad.org/t/import-failed/8479/6)明确当时不支持 XCLIP、WIPEOUT、SUPERHATCH。本轮没有找到新版已经支持这些的第一方文档；这不足以断言今天仍全部不支持，但足以阻止我们承诺它适用于当前带 35 个 SPATIAL_FILTER 的图。必须先用一个能明显识别裁剪内外的样本淘汰 / 通过该路径，再谈大批速度。

[许可页](https://www.qcad.org/en/license/)区分 CE GPL 与 Pro 的商业 DWG 插件；[Server License 产品页](https://qcad.org/prestashop/en/qcad/30-qcad-professional-server-license.html)明确适用于 Web 服务及 `dwg2pdf`，单用户桌面授权不能直接等同 Web 服务部署授权。商业上线前按使用方式选择许可。

## CADCraft 0.8.0：不存在已确认的 HATCH + XCLIP 快捷组合

需区分两件事：保存 CAD 时保留 HATCH 实体，与 PDF 内采用紧凑的填充描述。v0.8.0 [hatch.rs](https://github.com/storytold/cadcraft/blob/v0.8.0/crates/render/src/hatch.rs)在绘制时展开 pattern line runs；[pdf.rs](https://github.com/storytold/cadcraft/blob/v0.8.0/crates/io/src/pdf.rs)消费 DisplayList 的线 / 三角形 / 文字，并未发现将 pattern HATCH 直接写为 PDF tiling Pattern 的出口。因此升级 CLI 不会自动消除密集填充展开成本。

该版本 [gaps F2](https://github.com/storytold/cadcraft/blob/v0.8.0/docs/gaps.md)仍明确 XCLIP missing；已有 `VPCLIP` 是布局视口裁剪，不等于 INSERT / XREF 的 SPATIAL_FILTER。`--window` 只能约束导出视图范围，不能恢复文件内每个图块的独立裁剪语义；先 ODA / LibreDWG 转成含 XCLIP 的 DXF，再交给仍未实现 XCLIP 的渲染器，也不会自动保真。

可工作的现有组合仍是：保留源文件的裁剪信息 → ezdxf Frontend 完成裁剪与视口语义 → 后端 PDF。这会把填充展开为绘制记录。若要避免该成本并保留裁剪，需要换用已通过样本的完整 DWG 出图引擎，或另行实现更紧凑的填充 / 裁剪表示；本轮没有找到可直接开启的 CADCraft 0.8.0 参数组合。

## 下一次测试应如何停止猜测

1. 先确认选中的引擎已具备下载 / 激活 / 凭证 / 许可条件，再开始接口接入，避免把网站上的功能名称当作已拿到的 CLI。
2. 用有使用权的最小测试图验证：图块 XCLIP 内外、两种冻层视口、中文原字体、一个密集填充和一张图片。对照 CAD 原始打印；裁剪错误即淘汰该路径。
3. 质量通过后再测当前真实图：同一布局、纸张、配色、矢量 / 位图策略和字体；记录完整耗时、峰值内存、PDF 大小及页数。
4. 对 ODA / APS 分别输出参数清单；所有 fallback 或 raster hatch 必须可见标记。任何未经这些步骤的引擎都不标记“更快且更准”。
