"""读本地「产品库总表」Excel → 缺价清单 + 覆盖率（issue #195，仅本机运行）。

用法：
    python3 scripts/price-audit-excel.py "/path/产品库总表-728个产品-20261029.xlsx" [输出目录]

输出：
    missing-price-67.csv   缺价产品（序号/品牌/分类/产品名称/SKU/型号/平台/单位 +
                           空白的京东日常价/来源链接/口径 + JD/天猫搜索链接）
    coverage.json          总数 / 有价 / 缺价 / 覆盖率 / 按分类与品牌分布

约束（与工单一致）：
- **只在本地运行**，Excel 与输出都含产品数据，不要提交仓库或公开导出。
- 只导出公开字段：**不导出成本、库存、账号等非公开信息**。
- 京东日常价留空待人工核对；找不到就留空（不猜、不用内部售价回填）。
"""
import openpyxl, json, csv, os
from collections import Counter

import sys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/Users/noonebook/Desktop/产品库总表-728个产品-20261029.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.getcwd(), '.export-artifacts/issue195/excel')
os.makedirs(OUT, exist_ok=True)

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb['全部产品']
rows = list(ws.iter_rows(values_only=True))
hdr = [str(c).strip() if c is not None else '' for c in rows[0]]
idx = {h: i for i, h in enumerate(hdr)}
print('列:', hdr)

def cell(r, key):
    i = idx.get(key)
    return r[i] if i is not None and i < len(r) else None

def num(v):
    try:
        if v is None or str(v).strip() == '': return None
        return float(str(v).replace(',', '').replace('¥', '').strip())
    except Exception:
        return None

items = []
for r in rows[1:]:
    if not any(r): continue
    items.append({
        '序号': cell(r, '序号'),
        '品牌': cell(r, '品牌'),
        '分类': cell(r, '分类'),
        '产品名称': cell(r, '产品名称'),
        'SKU': cell(r, 'SKU'),
        '型号': cell(r, '型号'),
        '平台': cell(r, '平台'),
        '单位': cell(r, '单位'),
        '售价': num(cell(r, '售价')),
        '状态': cell(r, '状态'),
        '产品类型': cell(r, '产品类型'),
    })

missing = [x for x in items if not (x['售价'] and x['售价'] > 0)]
total = len(items)
cov = round((total - len(missing)) / total * 100, 1) if total else 0

by_cat = Counter(str(x['分类'] or '未分类') for x in missing)
by_brand = Counter(str(x['品牌'] or '未分类') for x in missing)

# 京东/天猫搜索链接（用 SKU + 产品名）
import urllib.parse
def links(x):
    q = urllib.parse.quote(f"{x['产品名称'] or ''} {x['型号'] or ''}".strip())
    return (f"https://search.jd.com/Search?keyword={q}&enc=utf-8",
            f"https://list.tmall.com/search_product.htm?q={q}")

with open(os.path.join(OUT, 'missing-price.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['序号','品牌','分类','产品名称','SKU','型号','平台','单位','京东日常价','来源链接','口径','JD搜索','天猫搜索'])
    for x in missing:
        jd, tm = links(x)
        w.writerow([x['序号'],x['品牌'],x['分类'],x['产品名称'],x['SKU'],x['型号'],x['平台'],x['单位'],'','','日常价',jd,tm])

summary = {
    'total': total,
    'withPrice': total - len(missing),
    'missing': len(missing),
    'coveragePct': cov,
    'missingByCategory': dict(by_cat.most_common()),
    'missingByBrand': dict(by_brand.most_common()),
    'note': '仅本机使用；已省略成本、库存等非公开字段；京东日常价待人工核对，找不到留空。',
}
with open(os.path.join(OUT, 'coverage.json'), 'w', encoding='utf-8') as f:
    json.dump(summary, f, ensure_ascii=False, indent=2)

print(json.dumps(summary, ensure_ascii=False, indent=1))
