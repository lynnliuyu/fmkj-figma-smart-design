/**
 * 生成「人工核价核对表」HTML（issue #195）。
 *
 * 用途：京东/天猫搜索页对非登录抓取返回 302 风控（已实测），所以核价必须人工完成。
 * 这个页面把缺价清单排成可点击表格：点「京东」直接打开搜索页，看到日常价后
 * 就地填写「参考价/来源链接」，最后导出 CSV 交给 `scripts/price-audit.ts --apply` 入库。
 *
 * 用法：
 *   node scripts/price-audit-sheet.mjs <missing-price.csv> [输出.html]
 *
 * 流程：核对表填完 → 导出 confirmed-prices.csv →
 *   pnpm exec payload run --input '{"scriptPath":"scripts/price-audit.ts","scriptArgs":["--apply","<csv>","--batch-size","20"]}'
 * 注意：输入输出都含产品数据，只在本机使用，不要提交仓库。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const src = process.argv[2]
const out = process.argv[3] || src.replace(/\.csv$/, '') + '-sheet.html'
if (!src) {
  console.error('用法：node scripts/price-audit-sheet.mjs <missing-price.csv> [out.html]')
  process.exit(1)
}

/** 极简 CSV 解析（与 price-audit.ts 同规则：无嵌套换行） */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const split = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === ',') {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out
  }
  const header = split(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((l) => {
    const cells = split(l)
    const row = {}
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()))
    return row
  })
}

const raw = parseCsv(readFileSync(src, 'utf8'))
/**
 * 表头兼容：`price-audit.ts --list` 输出英文表头（sku/name/deviceType/brand/
 * 当前售价/参考价/来源链接/jd搜索/tmall搜索），Excel 脚本输出中文表头。
 * 之前只按中文取列，真实 missing-price.csv 直喂时品牌/产品名/SKU/链接全为空
 * （独立验收 B 附带观察）。
 */
const rows = raw.map((r) => ({
  ...r,
  sku: r.sku ?? r['SKU'] ?? '',
  name: r.name ?? r['产品名称'] ?? '',
  brand: r.brand ?? r['品牌'] ?? '',
  category: r.deviceType ?? r['分类'] ?? '',
  platform: r['平台'] ?? '',
  unit: r['单位'] ?? '',
  jd: r.jd搜索 ?? r['JD搜索'] ?? '',
  tmall: r.tmall搜索 ?? r['天猫搜索'] ?? '',
  seq: r['序号'] ?? '',
  price: r['参考价'] ?? '',
  source: r['来源链接'] ?? '',
  rule: r['口径'] ?? '',
}))
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

const body = rows
  .map(
    (r, i) => `<tr>
  <td class="n">${esc(r.seq || i + 1)}</td>
  <td>${esc(r.brand)}</td>
  <td>${esc(r.category)}</td>
  <td class="name">${esc(r.name)}<div class="sku">${esc(r.sku)}${r['型号'] ? ' · ' + esc(r['型号']) : ''}</div></td>
  <td><a href="${esc(r.jd)}" target="_blank" rel="noreferrer">京东</a> · <a href="${esc(r.tmall)}" target="_blank" rel="noreferrer">天猫</a></td>
  <td><input class="price" data-i="${i}" inputmode="decimal" placeholder="日常价" /></td>
  <td><input class="src" data-i="${i}" placeholder="商品页 URL" /></td>
  <td><select class="rule" data-i="${i}"><option>日常价</option><option>仅促销价（留空待人工）</option><option>找不到</option></select></td>
</tr>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>价格核对表 · ${rows.length} 款</title>
<style>
:root{--bg:#0b0b0c;--panel:#161618;--bd:#2a2a2e;--fg:#f4f4f5;--mut:#9b9ba3;--acc:#9d8cff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 -apple-system,"PingFang SC",sans-serif}
header{padding:18px 24px;border-bottom:1px solid var(--bd);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
h1{font-size:16px;margin:0}.mut{color:var(--mut);font-size:12px}
.bar{padding:12px 24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
button{background:var(--acc);color:#0b0b0c;border:0;border-radius:8px;padding:7px 14px;font-weight:600;cursor:pointer}
button.ghost{background:#2a2a30;color:var(--fg);font-weight:400}
table{width:100%;border-collapse:collapse}
th,td{padding:7px 10px;border-bottom:1px solid var(--bd);text-align:left;vertical-align:top}
th{position:sticky;top:0;background:#1b1b1f;font-size:12px;color:var(--mut);z-index:1}
td.n{color:var(--mut);width:36px}.name{max-width:340px}.sku{color:var(--mut);font-size:11px}
a{color:var(--acc)}
input,select{background:var(--panel);border:1px solid var(--bd);color:var(--fg);border-radius:6px;padding:5px 7px;width:100%;font:inherit}
td:nth-child(6){width:110px}td:nth-child(7){width:220px}td:nth-child(8){width:150px}
tr.done{background:#12200f}
footer{padding:16px 24px;color:var(--mut);font-size:11px}
</style></head>
<body>
<header>
  <h1>价格核对表 · ${rows.length} 款缺价</h1>
  <span class="mut">来源：${esc(basename(src))} · 只在本机使用，含产品数据，勿提交仓库</span>
</header>
<div class="bar">
  <button id="export">导出确认 CSV</button>
  <button class="ghost" id="clear">清空填写</button>
  <span class="mut" id="progress">已填 0 / ${rows.length}</span>
  <span class="mut">口径：京东<b>日常价</b>；只有促销价 → 选「仅促销价（留空待人工）」，参考价留空</span>
</div>
<table>
<thead><tr><th>#</th><th>品牌</th><th>分类</th><th>产品</th><th>搜索</th><th>京东日常价</th><th>来源链接</th><th>口径</th></tr></thead>
<tbody>
${body}
</tbody></table>
<footer>导出后运行：<code>pnpm exec payload run --input '{"scriptPath":"scripts/price-audit.ts","scriptArgs":["--apply","&lt;导出的 csv&gt;","--batch-size","20"]}'</code>（只写 marketPrice/priceSource/priceCheckedAt，不改 price）</footer>
<script>
const ROWS = ${JSON.stringify(rows)};
const KEY = 'price-audit-sheet:' + ROWS.length;
const state = JSON.parse(localStorage.getItem(KEY) || '{}');
document.querySelectorAll('input.price,input.src,select.rule').forEach((el) => {
  const i = el.dataset.i;
  const k = el.className;
  if (state[i] && state[i][k] != null) el.value = state[i][k];
  el.addEventListener('input', () => {
    state[i] = state[i] || {};
    state[i][k] = el.value;
    localStorage.setItem(KEY, JSON.stringify(state));
    updateProgress();
    el.closest('tr').classList.toggle('done', !!(state[i].price));
  });
});
function updateProgress() {
  const n = Object.values(state).filter((v) => v && v.price).length;
  document.getElementById('progress').textContent = '已填 ' + n + ' / ' + ROWS.length;
  document.querySelectorAll('tbody tr').forEach((tr, idx) => {
    tr.classList.toggle('done', !!(state[idx] && state[idx].price));
  });
}
updateProgress();
document.getElementById('clear').onclick = () => {
  if (!confirm('清空所有已填内容？')) return;
  localStorage.removeItem(KEY);
  location.reload();
};
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
document.getElementById('export').onclick = () => {
  // ⚠️ 必须含 sku 与 参考价/来源链接：price-audit.ts --apply 按这三列取值
  const cols = ['sku','产品名称','参考价','来源链接','口径','品牌','分类','平台','单位'];
  const lines = [cols.join(',')];
  ROWS.forEach((r, i) => {
    const s = state[i] || {};
    lines.push([r.sku, r.name, s.price || '', s.src || '', s.rule || '日常价', r.brand, r.category, r.platform, r.unit].map(csvCell).join(','));
  });
  const blob = new Blob([lines.join('\\n') + '\\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'confirmed-prices.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
</script>
</body></html>`

writeFileSync(out, html)
console.log(`核对表已生成 → ${out}（${rows.length} 款）`)
