# CAD 平面图快速导出方案研究

研究日期：2026-10-21（Asia/Shanghai）。范围：DWG / DXF → 所有布局或模型中的逐张平面图 → PDF / PNG。本文是源码与官方资料研究，未运行各候选引擎的横向性能测试；所有提速判断均为待验证的工程推断。

## 2026-10-21 后续进展

首轮瓶颈已进一步定位到锁定的ezdxf1.4.4变换缺陷；正式版1.4.5修复后，同一图的“平面图”13张已由网页接口完整生成，**总用时99.401秒，渲染峰值物理内存约406.8MiB**。当前不应再将首轮失败直接解释为整个CADCraft+Python路线不可用。另有独立SVG后端完成71页约137.65秒的渲染实验（不含DWG识别/合并，未接入网页，图例实心块与标准后端不一致，未通过图面一致性筛查）。完整证据、准确性边界与旧基线见[性能修复报告](2026-10-21-cad-hatch-performance-fix.md)，原生引擎获取条件见[补充研究](2026-10-21-cad-native-export-followup.md)。

## 首轮结论与实施顺序（修复前）

本轮随后用真实施工 DWG 验证，当前 CADCraft + Python 路径**未通过性能验收**：4.0 MB 输入、68 图框、3 总览，整份在 10 分 7 秒后停止，进程采样峰值约 25.5 GiB；限定 13 张平面布局仍在 6 分 10 秒后停于密集填充的地面铺贴图，只完成 5 张。没有完成整套输出。已修复 PDF 字符串重复复制、重复页内容扫描等开销，并补充超时保护，但不能据此称为“又快又准”。后续应优先比较原生 CAD 出版 / ODA 路径，或单独评估保留原生 HATCH 模式的渲染引擎。客户文件和完整证据留在忽略目录，不写入本报告。

1. 先用现有 CADCraft 接口与本机网页收集真实耗时及错页样本。最有把握的输入是已经分好布局、页面设置有效的图纸。模型中排列的许多图框需要另做识别；渲染器的“所有布局”功能不会自动找到其中每个平面图。
2. 优先做“一次解析、按原始窗口裁剪、PDF 与缩略图复用”，减少每页重新开图、转换和栅格化。对 DXF，可试 ezdxf + PyMuPDF；对 DWG，仍要单独验证转换时的实体与布局信息损失。
3. CADCraft 新版多布局 PDF 可做第二条实验路径，先与已装 0.5.0 并排验收。不能因为版本新就直接替换，XCLIP、字体与打印样式限制仍在。
4. 遇到天正代理对象、强依赖 SHX / CTB、外部参照或复杂视口的交付图，准备 AutoCAD Core Console / APS 或 ODA 的高保真对照路径。浏览器看图组件适合预览及人工纠正图框，不宜仅凭“能显示”认定整套输出完整。

以上为本项目建议，不是第三方承诺。准确性的验收对象应是图页、尺寸、字体与可见内容，而不是进程返回成功。

## 方案对照

表中的支持均指项目文档或源码具有相应入口；“需验收”表示本轮未在客户图纸证明。

| 方案 | 输入与运行环境 | 批量机制与适合用途 | 主要准确性边界 | 许可 |
| --- | --- | --- | --- | --- |
| CADCraft CLI | DWG / DXF；Mac、Windows、Linux 无头 | MCP 常驻会话；新版 `exportpdf` 接收多个布局；模型支持窗口 | 不解析 SHX；XCLIP 缺失；传统 CTB / STB / PC3 不能直接复用 | MIT OR Apache-2.0 |
| ezdxf + PyMuPDF | 原生 DXF；Python 无头；DWG 须先转换 | 枚举 layout、矢量 PDF、`render_box` 裁窗、录制后重放 | 仅顶视图；MTEXT 非像素一致；转换丢失的信息无法补回 | ezdxf MIT；PyMuPDF 为 AGPL / 商业双许可 |
| LibreDWG / libredwg-web | DWG 解析 / 转换；原生 CLI、Node、浏览器 WASM | DWG → DXF / 结构化数据，交给另一个渲染器 | 不是完整的出版渲染引擎；实体覆盖有限，转换成功不等于内容完整 | GPL-3.0 |
| MLightCAD | DXF；DWG 通过可选转换器；浏览器；另有 HTML CLI | 已有 PDF 插件，可把模型及布局变成多页矢量 PDF | 大型 DWG 内存、实体覆盖与转换器限制；需逐项核对视口和字体 | 核心 / PDF 插件 MIT；LibreDWG 路径另有 GPL |
| vagran/dxf-viewer | DXF；浏览器 WebGL | 适合大图预览、框选；worker / batching / instancing | 字体样式、线型及线宽仍有明确限制；并非成套 PDF 出版器 | MPL-2.0 |
| AutoCAD Core Console / APS | DWG / DXF；本地示例 Windows，或 APS 云端 | Publish / DSD、.NET 批打，适合作为源应用效果对照 | 仍须带齐字体、参照、页面设置；模型自动分图是额外逻辑 | 样例许可与 AutoCAD / APS 商业使用权分开 |
| ODA Drawings SDK | DWG / DXF；原生 SDK，有 Linux 命令行样例 | `OdPdfExport`、多布局及窗口 / 实体选择导出 | 可作商业替代引擎；实际字体、对象与裁剪仍须样本验收 | 商业 SDK，须确认适合的分发 / 服务授权 |

对应的一手证据见下列各节，不能从表格推导未经实测的速度排名。

## CADCraft：继续复用，版本要区分

用户链接对应的是 ArtCraft 的 `storytold/cadcraft`。2026-10-21 复核时，[官网](https://getartcraft.com/apps/cadcraft)已提供 0.8.0 下载，[GitHub v0.8.0 release](https://github.com/storytold/cadcraft/releases/tag/v0.8.0)于 2026-10-17 发布；本机实际使用的 CLI 是 0.5.0。不要把同名 `getcadcraft/cadcraft` 的说明当作用户安装软件的证据。

v0.8.0 的 [CLI README](https://github.com/storytold/cadcraft/blob/v0.8.0/README.md#drive-it-from-agents-mcp-and-the-cli)列出 headless `mcp`、`convert`、`run` 和 `--window`。其 [布局命令源码](https://github.com/storytold/cadcraft/blob/v0.8.0/crates/engine/src/cmd/layout.rs#L768)与[多页测试](https://github.com/storytold/cadcraft/blob/v0.8.0/crates/engine/tests/plot_sheets.rs)确认：`exportpdf {layouts:[...]} / {layouts:"all"}` 可输出多页；`all` 会在 Model 有内容时纳入 Model。核查的命令表没有独立 `PUBLISH`，接入应以 `commands` 自检和 `EXPORTPDF` 参数为准。源码测试不是实际客户图纸渲染验收。

准确性限制见 [v0.8.0 文件兼容说明](https://github.com/storytold/cadcraft/blob/v0.8.0/docs/file-format-parity.md)：SHX / 大字体未解析，替代字体会改变文字度量；二进制 CTB / STB / PC3 / PMP 不读；IMAGE 可解析但未实现显示；部分视口覆盖信息有损。当前 main 的 [gaps F2](https://github.com/storytold/cadcraft/blob/7fef8cbe2fb8dbafdcf6ebda8aa3ba0623bcbec1/docs/gaps.md)仍写明 XCLIP 缺失。布局视口裁剪 `VPCLIP` 与图块 / 外部参照裁剪 `XCLIP` 是不同能力。

[Plotters 文档](https://github.com/storytold/cadcraft/blob/v0.8.0/docs/plotters.md)提供自有设备、纸张和边距配置，并明确模型 PDF 边距存在限制。字体可用 `CADCRAFT_FONTALT` / `CADCRAFT_FONTFALLBACK` 配置，但替代字体不证明原 SHX 的排版相同。[许可文件](https://github.com/storytold/cadcraft/blob/v0.8.0/LICENSE-MIT)可核对 MIT 条款。

## ezdxf：最值得验证的本机 DXF 路径

官方[导出教程](https://ezdxf.readthedocs.io/en/stable/tutorials/image_export.html)展示 `Frontend.draw_layout` → `PyMuPdfBackend.get_pdf_bytes` 的原生矢量 PDF 路径；[后端源码 v1.4.4](https://github.com/mozman/ezdxf/blob/v1.4.4/src/ezdxf/addons/drawing/pymupdf.py#L57)接收 `render_box`，并可输出位图。本仓库锁定 ezdxf 1.4.4，应优先用该版本验证，而不是直接按 master 的新行为实现。

其 [frontend](https://github.com/mozman/ezdxf/blob/v1.4.4/src/ezdxf/addons/drawing/frontend.py#L811)实际对 INSERT 使用 XClip，并将普通 / 反向裁剪形状压入绘制管线；[视口属性处理](https://github.com/mozman/ezdxf/blob/v1.4.4/src/ezdxf/addons/drawing/properties.py#L414)处理 frozen layers 及覆盖；[VIEWPORT 变换](https://github.com/mozman/ezdxf/blob/v1.4.4/src/ezdxf/entities/viewport.py)考虑 target / view center。这里有实际绘制逻辑，不只是读取裁剪字段。但[官方限制](https://ezdxf.readthedocs.io/en/stable/addons/drawing.html#common-limitations-to-all-backends)仍包括只绘制顶视图、无 ACIS 渲染、MTEXT 非像素一致，不能承诺任意 CAD 等效。

官方[字体文档](https://ezdxf.readthedocs.io/en/stable/tools/fonts.html)支持 TTF / TTC / OTF 及基本 SHX / SHP / LFF，需要实际字体文件；不能据此保证所有中文大字体编码都正确。ezdxf 的 [MIT 许可](https://github.com/mozman/ezdxf/blob/v1.4.4/LICENSE)不涵盖 PyMuPDF，后者[官方许可](https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright)为 AGPL / 商业双许可；上线闭源服务前须根据具体用法选择可用授权。

可行的性能实验：一次读取 DXF，按空间录制几何后，用 player 副本按图框裁剪与换色，生成 PDF 后复用为 PNG。多窗口是否比逐页遍历快，取决于图纸大小、视口与记录内存，必须计时。每次变换应使用副本，避免上一次裁剪 / 坐标变换污染下一页。

## LibreDWG 与浏览器路线

[LibreDWG 官方 README](https://github.com/LibreDWG/libredwg)列出 `dwg2dxf` 等工具，同时把 SVG / PostScript 输出标为有限实现；不宜单独当作高保真 PDF 引擎。`libredwg-web` 的[第一方接口说明](https://github.com/mlightcad/libredwg-web/blob/53137eeb1fe54e400bfd77a7ad8e21bc373cc998/bindings/javascript/README.md)支持浏览器 / Node，默认 WASM 构建为缩小体积还会禁用部分写出功能。因此不能看到一个 DWG→DXF 示例就假设所安装 npm 包具有相同构建能力。其 [GPL 许可](https://github.com/mlightcad/libredwg-web/blob/53137eeb1fe54e400bfd77a7ad8e21bc373cc998/COPYING)须单独核对。

MLightCAD 当前确有[矢量 PDF 插件](https://github.com/mlightcad/cad-viewer/blob/dd822d0dcb2547aacb55b2e6f7c25921cbc6f51b/packages/cad-pdf-plugin/README.md)：模型和各布局可成为 PDF 页面，布局包含裁剪到视口框的模型内容，接口为 `-cpdf` / `AcApPdfConvertor`。其 [README](https://github.com/mlightcad/cad-viewer/blob/dd822d0dcb2547aacb55b2e6f7c25921cbc6f51b/README.md#known-issues)同时承认 LibreDWG 路径实体覆盖、WASM 启动和大图内存问题。GPU batching / instancing 主要解释交互流畅，不能直接换算批量 PDF 的导出速度。

[vagran/dxf-viewer README](https://github.com/vagran/dxf-viewer)的 worker、几何合批和实例化适合前端总览；它明确列出 DXF 文字样式被忽略、线型 / 宽线等不完整能力。建议用它做候选框检查，不把截图作为可测量的原版出版 PDF。

## GitHub 上真正相关的批量出图实现

- [hwdemtv/batchplot-plugin](https://github.com/hwdemtv/batchplot-plugin/blob/109680d5beb313f1f4937146a1ac039602e3e357/README.md)：MIT，C#，AutoCAD 2021–2024；模型图框识别、逐布局出 PDF、合并书签、accoreconsole 无头入口。其 [BPPlot.cs](https://github.com/hwdemtv/batchplot-plugin/blob/109680d5beb313f1f4937146a1ac039602e3e357/src/BPPlot.cs)是可研究的实际实现。项目记录过旋转页裁切错位、跨布局误判等修复，因此适合借鉴识别 / 复核思路，但其“精确”不能替代本机验证，也不能直接在 Mac/Linux CADCraft 中载入 AutoCAD DLL。
- [ADN-DevTech/autocad-automation-apps](https://github.com/ADN-DevTech/autocad-automation-apps)：Autodesk [2026-04-09 官方文章](https://aps.autodesk.com/blog/end-autocad-2021-engine-new-autocad-2027-engine-released)指向的新版示例；`BatchPublishApp` 将多个 DWG 发布为一个多页 PDF，目标 AutoCAD 2027 / .NET 10，附本地和 APS 脚本。本文未看到根目录明确 LICENSE，复用源码前应核对授权，不能仅凭公开仓库推定 MIT。
- [MadhukarMoogala/FDA_PublishDSD](https://github.com/MadhukarMoogala/FDA_PublishDSD)：MIT、APS V3 的旧 .NET Core 3.1 示例，Autodesk [官方文章](https://aps.autodesk.com/blog/publish-multiple-drawings-single-pdf)解释通过 DSD + `PublishExecute` 批量出版。README 明确未初始化页面设置会出现 `no plottable sheets found`；可借鉴流程，采用现行引擎时应迁移依赖。

AutoCAD 官方[导出说明](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-Core/files/GUID-EC9C6D47-814E-476D-840F-04104CF72B78.htm)区分了单空间、多布局和多 DWG 的 PLOT / EXPORTPDF / PUBLISH 用途。APS 是云端运行 AutoCAD 的[商业服务](https://aps.autodesk.com/automation-apis)，Linux 后端可通过 HTTP 调用，不表示 AutoCAD Core Console 本身可作为 Linux 原生程序运行。云端时间需算上上传、排队、运行和下载；并且[自带字体路径](https://aps.autodesk.com/blog/use-custom-fonts-design-automation)仍要配置，不能默认云端拥有客户字体。

## ODA 商业对照

ODA [官方 Linux / Windows CLI FAQ](https://www.opendesign.com/cn/faq/question/are-there-command-line-examples-support-windows-and-linux-operating-systems-deb)列出 `OdPdfExport`，其[多布局 / 实体选择文章](https://staging.opendesign.com/blog/2023/july/drawings-sdk-export-selected-entities-pdf)提供布局列表与选择集入口，并提醒窗口内可能同时包含其他实体。产品页提供 [Drawings SDK](https://www.opendesign.com/products/drawings)试用入口。建议把 ODA 作为 Linux 商业路径做同一组图的对照，而不是先购买后假定能解决所有天正对象或字体问题；本轮未测试 SDK，也未报价。

## 本项目已知状态与改进实验

以下来自本仓库代码阅读，不是第三方资料结论：

- `scripts/export-cad-review.mjs` 现有非 XCLIP 路径会每页重新开图、模型 WBLOCK、输出 PDF、原色 / 可读色分别栅格化；存在减少重复工作的空间。模型框选使用 `crossing:false`，跨图框边缘的实体需要专门样本检查，不能假定总览与逐页内容一样完整。
- `scripts/cadcraft/render-clipped-review.py` 已保留源 DXF 视口 / SPATIAL_FILTER，并使用 Recorder 做双配色重放；目前仍每页 `draw_layout`，且统一替换字体。因此“中文可见”与“原字体版式准确”是不同验收项。
- 本仓库文档记录 CLI 0.5.0 合成 DXF 的真实导出验证；不是客户 DWG 的覆盖证明。现有 A3 横向 fit 审阅图适合检查内容，不能声称保持原布局比例与纸张。
- 先增加分阶段耗时；再分别尝试按布局单次批量出版、原图窗口裁剪、按空间录制和惰性生成 PNG。每次只替换一个变量，质量通过后再比较速度。

## “快且准”的验收基准

这是一组建议验收条件，尚未达成性能指标：

| 维度 | 固定测试方式 |
| --- | --- |
| 样本 | 同一批有使用权的 DWG / DXF：纯模型图框、多布局、多视口、中文 SHX/TTF、冻结层、偏移 target、XCLIP、旋转 / 加长图框、图片 / XREF、天正代理对象；各留一份源 CAD 正式打印 PDF 作基准 |
| 找全 | 对人工确认的图纸清单测召回率和误识别；重复方案保留，不靠重复图名去重；漏框可人工补选窗口 |
| 图面 | 逐张核对图号、标题、边界、中文、标注、填充、隐藏层、视口、裁剪；缺外部文件 / 字体应明确标记，不能静默当成功 |
| 尺寸 | 明确“审阅 fit 图”和“原纸张 / 比例出图”；后者核对 PDF MediaBox 与已知标尺，允许误差由业务先确定 |
| 时间 | 记录上传、排队、解析 / 转换、识别、首张预览、全部 PDF、PNG、合并 / ZIP、下载；同机同文件冷启动一次、热启动至少三次，报告中位数与最长值 |
| 成本 | 记录页数、实体数、输入字节、CPU、峰值 RSS、输出大小和引擎版本；按文件及页数分桶，不用“平均每页”掩盖冷启动和大图开销 |
| 成功定义 | 全部期望页输出且质量检查通过才计成功；不支持图元 / 无法解析布局 / 丢字体需进入复核或备用引擎 |

用户测试网页应直接显示真实已用时间和当前阶段，并区分“可先看第一张”与“整套已完成”。在积累这组真实数据前，不给出“几秒全部导出”或“100% 完整”的保证。

## 后续备选：Recorder → SVG → Cairo PDF（待实测）

2026-10-21 补充，只读检查本机 ezdxf 1.4.4 和下列官方源码；未安装包、未运行第二份真实图渲染。建议下一阶段仅做对照实验，优先比较原生 `rsvg-convert`，保留现有 PyMuPDF 路径。

技术上可行：[SVGBackend 1.4.4](https://github.com/mozman/ezdxf/blob/v1.4.4/src/ezdxf/addons/drawing/svg.py)同样支持 `render_box`、页面尺寸和 `crop_at_margins`；输出显式背景矩形、`fill-rule="evenodd"`、笔画 / 填充透明度、二次 / 三次 Bézier 路径。XCLIP 已在 Frontend 裁进 Recorder 几何，转 SVG 不必重新解读 CAD 裁剪。字体在前端已轮廓化，转换器无需再次排中文，但也不能修复前端替代字体造成的宽度偏差。该 SVGBackend 的 `draw_image()` 是空实现，存在 ImageRecord 时必须拒绝此分支或回退，不能静默漏图片；SVG 本身也不保留当前 PDF 的 OCG 图层开关。

精度与副作用需保留：SVG 坐标按整数写出，使用 [layout.Settings](https://github.com/mozman/ezdxf/blob/v1.4.4/src/ezdxf/addons/drawing/layout.py)推荐的 `output_coordinate_space=1_000_000`，不能为了压缩体积任意减小。SVG 的输出过程也会原地 transform / crop 录制，仍须保护原始 player。需要核验小字、长折线舍入、填充孔洞、透明叠放、白色 WIPEOUT、线宽、页框及镜像；SVG 到 PDF 有物理单位换算，不应通过 `--width/--height` 随意改写纸张。

两种后段的区别：

- **CairoSVG** 的[官方文档](https://cairosvg.org/documentation/)提供 Python `svg2pdf(bytestring=..., write_to=...)` 与 CLI，依赖 Cairo / libffi；Linux 可能还需开发头文件，Mac 文档建议 Cairo / libffi。其[支持表](https://cairosvg.org/svg_support/)覆盖路径、填充规则、透明度与矢量 PDF；[surface.py](https://github.com/Kozea/CairoSVG/blob/3b7a250c9e955db9c3cdf525d5b5027a9a396201/cairosvg/surface.py)实际将 evenodd 填充映射到 Cairo，但奇偶 clip-rule 仍有 TODO。现有 SVGBackend 已把 XCLIP 几何化而不是生成 clipPath，可减少对此 TODO 的依赖。其 [path.py](https://github.com/Kozea/CairoSVG/blob/3b7a250c9e955db9c3cdf525d5b5027a9a396201/cairosvg/path.py)仍在 Python 解析每段路径、调用 Cairo，所以不能仅凭“Cairo 是 C”推定更快。
- **librsvg** 提供原生 `rsvg-convert --format=pdf --output=page.pdf page.svg`，PDF 输出取决于构建包含 Cairo PDF 支持，见[官方命令手册源码](https://github.com/GNOME/librsvg/blob/cb472ff46449e305f482f704063a8ef3cd230bd4/rsvg-convert.rst)。其[支持表](https://gnome.pages.gitlab.gnome.org/librsvg/devel-docs/features.html)包括 path、fill-rule、clip-rule、透明度和 viewBox。应使用系统发行版 / 已固定的 release 构建；若从源码构建，还需 Rust、Cairo、GLib、Pango、FreeType 等，[构建文档](https://gnome.pages.gitlab.gnome.org/librsvg/devel-docs/compiling.html)有完整清单，无需图形桌面。

许可分别是 ezdxf MIT、[CairoSVG LGPLv3](https://github.com/Kozea/CairoSVG/blob/3b7a250c9e955db9c3cdf525d5b5027a9a396201/LICENSE)、[librsvg LGPL-2.1-or-later](https://github.com/GNOME/librsvg/blob/cb472ff46449e305f482f704063a8ef3cd230bd4/Cargo.toml)、[Cairo LGPL-2.1 / MPL-1.1 双选](https://www.cairographics.org/)。分发时须核对库及其修改、链接方式、通知等条件；替换 PDF 生成器但继续用 `fitz` 生成 PNG，仍保留 PyMuPDF 的授权边界，不能声称整个链路已移除 AGPL。

性能假设：这条路可能减少当前 PyMuPDF 逐图元写入成本，但仍需 Python 生成完整 SVG ElementTree / 字符串，再解析一遍 XML，原始路径数量和填充线数量没有减少，Cairo 也仍需写入和压缩矢量 PDF。复杂大图不一定更快，也可能增加峰值内存。对照应复用同一个已完成裁剪的 Recorder，固定原色 / 可读色、纸张和图框，分别计“SVG 生成”“SVG→PDF”“PNG”“全过程”及峰值内存；先取一张密集总览、一张 XCLIP 平面、一张带孔填充 / 透明度的小样，并验证 PDF 未变成整页位图。只有质量通过且总耗时 / 内存确有改善，才考虑接入；这不是本轮已交付的提速结果。
