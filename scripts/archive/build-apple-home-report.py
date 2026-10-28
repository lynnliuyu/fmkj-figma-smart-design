import json, collections
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BASE = "/Users/noonebook/Documents/ChatGPT/繁梦空间设计站"
col = json.load(open(f"{BASE}/.local/product-catalog-collection/20261016-apple-home/collection.json", encoding="utf-8"))
wr = json.load(open(f"{BASE}/.local/product-catalog-collection/20261016-apple-home/write-result.json", encoding="utf-8"))
bySku = {r["sku"]: r for r in wr["results"]}
records = col["records"]

# ---------- Markdown 报告 ----------
L = []
A = L.append
A("# Apple Home 生态产品采集入库 · 批次报告")
A("")
A("批次 ID：`20261016-apple-home`　|　执行日期：2026-10-16")
A("")
A("## 一、实际环境")
A("")
A("| 项 | 值 |")
A("|---|---|")
A("| 工作站 | http://localhost:3000 |")
A("| 数据库 | 127.0.0.1:15432 / fmkj（容器 fmkj-v3-db） |")
A("| 写入入口 | 管理员 API `POST /api/admin/products` 逐条 + `POST /api/admin/products/bulk-review` 目录审核 |")
A("| 备份 | `backups/fmkj-before-applehome-20261016-133603.dump`（54.8MB） |")
A("| 采集底稿 | `.local/product-catalog-collection/20261016-apple-home/collection.json` |")
A("")
A("## 二、结果汇总")
A("")
A("| 指标 | 数值 |")
A("|---|---:|")
A(f"| 采集到候选 | {len(records)} 条 |")
A(f"| 新建成功 | {wr['created'] if 'created' in wr else sum(1 for r in wr['results'] if r['action']=='created')} 条 |")
A("| 跳过 / 重复 | 0 条 |")
A("| 失败 | 0 条 |")
A("| 目录审核批准 | 42 条（approved） |")
A("| 产品库总量 | 747 → **789** 条 |")
A("| Apple Home 平台 | 12 → **54** 条 |")
A("")
A("## 三、来源与口径")
A("")
A("| 品牌 | 来源 | 说明 |")
A("|---|---|---|")
A("| Apple/苹果 | Apple 中国大陆官网（apple.com.cn）商店页与规格页 | 实际抓取确认，非搜索摘要 |")
A("| Aqara | Aqara 官网产品参数页（`www.aqara.com/{slug}_spec`） | 参数与 Apple 家庭支持均取自官网明文 |")
A("")
A("**HomeKit 支持只认官网明文。** Aqara 官网 162 条在售产品中，仅 **49 条**页面明确列出支持 Apple 家庭；其余 113 条官网未提及，一律未收录。")
A("")
A("## 四、按设备类型")
A("")
cnt = collections.Counter(r["product"]["deviceTypeId"] or "（类型字典缺项，待确认）" for r in records)
A("| 设备类型 | 条数 |")
A("|---|---:|")
for k, n in cnt.most_common():
    A(f"| `{k}` | {n} |")
A("")
A("## 五、还不能用于点位选型（4 条）")
A("")
A("类型字典缺项，按规范**不借用不相干类型**，保留待确认：")
A("")
A("| 产品 | 缺什么 |")
A("|---|---|")
A("| Aqara 妙控开关 S1E | 类型字典无「场景面板」，其角色是场景触发而非负载控制 |")
A("| Aqara 无线开关 D1（贴墙式·单键/双键） | 同上，且为免布线无线场景开关 |")
A("| Aqara LED 灯泡 T1（可调色温） | 类型字典无「灯泡」 |")
A("")
A("> 这类缺口需要扩展 `lib/device-types.ts` 并配套规则才能解决，不能只插字典表。")
A("")
A("## 六、可入库但价格待核（40 条）")
A("")
A("**Aqara 官网产品页不公示售价**（只给跳转京东自营的按钮），本机环境无法访问京东价格接口；苏宁搜索页为 JS 渲染取不到可靠价格。")
A("因此这 40 条 `price=0`、`pricingStatus=pending`，证据字段已明确写明「售价与成本未知，0 仅为系统占位，不表示免费或零成本」。")
A("")
A("**价格已确认的只有 Apple 官方 2 款：**")
A("")
A("| 产品 | 中国大陆官方价 |")
A("|---|---:|")
A("| Apple HomePod mini 2 | ￥1,099 |")
A("| Apple HomePod（第二代） | ￥2,699 |")
A("")
A("## 七、采集过程中的重要发现")
A("")
A("1. **HomePod 已出双线新代次。** HomePod mini 2 于 2026-10-13 发布（S10 芯片、802.11ax、蓝牙 6、UWB），￥1,099，10-30 发售；HomePod 第二代在售但无线规格仍是 Wi-Fi 4 + 蓝牙 5.0。新项目做整体方案建议优先 mini 2。")
A("2. **2020 款 HomePod mini 在中国大陆已下架**（购买页 301 跳转到 mini 2）。")
A("3. **Apple 在中国大陆没有可用的 HomeKit 中枢路径之外的产品。** Apple TV 4K（第四代）与全新品类 Apple HomeView（首个带屏家庭中枢）在中国大陆均未销售（`apple.com.cn` 对应页返回 404），故未收录 —— 对国内项目而言，Apple 官方可用的家庭中枢只有 HomePod / HomePod mini 2。")
A("4. **Aqara 的 HomeKit 存在官网明示的功能阉割**，做方案必须知道：")
A("   - D1 系列：HomeKit **仅支持单键/双键版**，三键版不支持")
A("   - FP2 在 HomeKit 下只暴露「存在」单传感器，8 分区 / 10 目标定位为 Aqara Home 独占")
A("   - 筒射灯 T3 接入 Apple Home 后色温锁死 3500K/4000K，自适应照明不可用")
A("   - 摄像机 / 门铃在 HomeKit 下只有实时画面与对讲，全部本地 AI 识别、人形追踪留在 Aqara Home")
A("5. **网关路线分叉，不能互换理解**：M2 是传统 HomeKit 桥接（Zigbee/Thread → HomeKit）；G3/G410/G5 Pro 网关版内置 Zigbee 网关，可无独立网关方案；而新一代 Thread 机型（FP310、C100、LED灯泡T2、灯带控制器H1 等）官方口径只讲 Matter，**不提 HomeKit**，落地前须逐台验证。")
A("6. **库中已有 3 条 Aqara 记录命名与官网不一致**（本批未改动，待你决定是否统一）：`AQ-D200I` 官网称「人脸识别智能门锁 D200」、`AQ-DOWNLIGHT-T2` 官网称「筒射灯 T2」、`AQ-DIMMER-T2` 官网称「双色温驱动器 T2」；另 `AQ-H1-CURTAIN`（窗帘电机 H1 双轨套装）官网已无此条目。")
A("")
A("## 八、产品净图全部待补")
A("")
A("本批 42 条 `image` 均为空。Aqara 官网 SSR 页面不暴露商品图（js 异步加载，参数页只有站点图标），京东/苏宁搜索页反爬，ZOL 未收录这些新型号。")
A("按采集规范，商品图属独立的展示图库工作（`product_visual_assets`），不阻塞目录入库，故本批先保证型号、类型与证据准确。")
A("")
A("---")
A("")
A("## 附：逐条明细")
A("")
A("| # | SKU | 产品名称 | 类型 | 型号 | 售价 | 状态 | ID |")
A("|---:|---|---|---|---|---:|---|---|")
for i, r in enumerate(records, 1):
    p = r["product"]
    res = bySku.get(p["sku"], {})
    A(f"| {i} | `{p['sku']}` | {p['name']} | `{p['deviceTypeId'] or '待确认'}` | "
      f"{p['manufacturerModel'] or '—'} | {'￥'+str(int(p['price'])) if p['price'] else '待核'} | "
      f"{res.get('mappingRevision','—')} | `{res.get('id','')}` |")
A("")

out = f"{BASE}/Apple-Home产品采集报告-20261016.md"
open(out, "w", encoding="utf-8").write("\n".join(L))
print("报告:", out)

# ---------- Excel 清单 ----------
wb = Workbook(); ws = wb.active; ws.title = "Apple Home 入库清单"
HEAD = ["#", "SKU", "产品名称", "品牌", "设备类型", "分类", "厂家型号", "单位", "售价", "参数", "协议", "能力", "目录状态", "ID", "版本"]
ws.append(HEAD)
hf = PatternFill("solid", fgColor="37474F")
for c in range(1, len(HEAD)+1):
    x = ws.cell(row=1, column=c); x.font = Font(bold=True, color="FFFFFF", size=11); x.fill = hf
    x.alignment = Alignment(horizontal="center", vertical="center")
thin = Side(style="thin", color="CFD8DC"); bd = Border(left=thin, right=thin, top=thin, bottom=thin)
for i, r in enumerate(records, 1):
    p = r["product"]; res = bySku.get(p["sku"], {})
    ws.append([i, p["sku"], p["name"], p["brand"], p["deviceTypeId"] or "待确认", p["category"],
               p["manufacturerModel"] or "—", p["unit"], p["price"],
               json.dumps(p["specs"], ensure_ascii=False) if p["specs"] else "—",
               "＋".join(p["protocols"]) or "—", "＋".join(p["capabilities"]) or "—",
               "approved", res.get("id",""), res.get("mappingRevision","")])
    rr = ws.max_row
    for c in range(1, len(HEAD)+1):
        x = ws.cell(row=rr, column=c); x.border = bd
        x.alignment = Alignment(vertical="center", wrap_text=(c in (3,10)), horizontal="center" if c in (1,9,12,13,15) else "left")
    ws.cell(row=rr, column=9).number_format = '¥#,##0'
    if p["price"] == 0:
        for c in range(1, len(HEAD)+1): ws.cell(row=rr, column=c).fill = PatternFill("solid", fgColor="FFF3E0")
    if not p["deviceTypeId"]:
        for c in range(1, len(HEAD)+1): ws.cell(row=rr, column=c).fill = PatternFill("solid", fgColor="ECEFF1")
for i, w in enumerate([4, 30, 32, 12, 20, 10, 14, 6, 10, 40, 22, 18, 10, 36, 6], 1):
    ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "A2"; ws.auto_filter.ref = f"A1:{get_column_letter(len(HEAD))}{ws.max_row}"
out2 = f"{BASE}/Apple-Home产品清单-20261016.xlsx"
wb.save(out2)
print("清单:", out2)