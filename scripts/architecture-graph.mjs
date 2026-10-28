#!/usr/bin/env node
/**
 * 让 Agent 读懂“流程图”。
 *
 * 背景：11 页流程图由 Agent 生成，用户在 Docker 编辑器（http://127.0.0.1:8767/）里手工改字、拖动、改连线，
 * 保存时服务端刷新同目录的 system-map.editable.registry.json。Agent 读这个注册表（或直接读 .drawio）即可拿到
 * 最新意图：每页每个节点的 moduleId / title / status / code（对应代码文件）/ rules / notes / 连线。
 *
 * 用法：
 *   node scripts/architecture-graph.mjs                         # 默认项目，摘要视图（Markdown）
 *   node scripts/architecture-graph.mjs --json                  # 机器可读完整 JSON，给 Agent 当上下文
 *   node scripts/architecture-graph.mjs --json --page 业务流程图  # 只取一页
 *   node scripts/architecture-graph.mjs --find 报价               # 全图搜索标题/描述/规则/代码路径
 *   node scripts/architecture-graph.mjs --diff backups/繁梦空间设计站/2026....drawio
 *                                                               # 对比某次保存前的备份（看用户改了什么）
 *   node scripts/architecture-graph.mjs --project 其他项目
 *
 * 摘要里 planning 状态会标成【规划，尚未实现】，不要把它当作已有功能。
 * 读取时把页标题、阶段名与图例（id 以 stage-/ov-stage/ov-legend 开头，或为 title/subtitle/note）
 * 标为 decorative，不计入业务节点；JSON 里仍保留这些字段，需要时可自行判断。
 *
 * 默认文件：docs/architecture-data/projects/繁梦空间设计站/system-map.editable.registry.json
 *          也可以直接给注册表路径 --registry <path>，或给 .drawio 路径（会解析 drawio XML）。
 * 退出码：0 正常；2 未找到文件/项目。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'docs/architecture-data');
const DEFAULT_PROJECT = '繁梦空间设计站';

function parseArgs(argv) {
  const args = { json: false, summary: false, page: '', find: '', diff: '', project: DEFAULT_PROJECT, registry: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--summary') args.summary = true;
    else if (a === '--page') args.page = argv[++i];
    else if (a === '--find') args.find = argv[++i];
    else if (a === '--diff') args.diff = argv[++i];
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--registry') args.registry = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const projectDir = (name) => join(DATA, 'projects', name);
const registryPath = (name) => join(projectDir(name), 'system-map.editable.registry.json');
const drawioPath = (name) => join(projectDir(name), 'system-map.drawio');

function fail(message) {
  console.error(message);
  process.exit(2);
}

function loadRegistry(args) {
  if (args.registry) {
    const p = resolve(args.registry);
    if (!existsSync(p)) fail(`找不到文件：${p}`);
    return p.endsWith('.drawio') ? parseDrawio(readFileSync(p, 'utf8'), basename(p)) : readJson(p);
  }
  const p = registryPath(args.project);
  const d = drawioPath(args.project);
  const hasRegistry = existsSync(p);
  const hasDrawio = existsSync(d);
  if (hasRegistry) {
    // 注册表由编辑器保存时刷新；若 .drawio 更新（例如刚跑了 arch:overview），以 .drawio 为准。
    if (hasDrawio && statSync(d).mtimeMs > statSync(p).mtimeMs + 1000) {
      console.error(`注意：${basename(p)} 比 ${basename(d)} 旧，本次改读 .drawio（在编辑器里保存一次即可刷新注册表）。`);
      return parseDrawio(readFileSync(d, 'utf8'), args.project);
    }
    return readJson(p);
  }
  // 注册表还没生成时（例如只放了 .drawio 没保存过），直接解析 .drawio。
  if (hasDrawio) return parseDrawio(readFileSync(d, 'utf8'), args.project);
  fail(`找不到项目「${args.project}」：${p} 和 ${d} 都不存在。可用项目：\n` +
    (existsSync(join(DATA, 'projects')) ? readdirSync(join(DATA, 'projects')).join('、') : '（数据目录为空）'));
}

function readJson(p) {
  const text = readFileSync(p, 'utf8');
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    fail(`${p} 不是合法 JSON：${e.message}（可能保存未完成，稍后重试）`);
  }
  data.source = p;
  return data;
}

// ---------------------------------------------------------------------------
// 直接解析 .drawio（注册表缺失、或对比备份时用）
// ---------------------------------------------------------------------------

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function attrs(text) {
  const out = {};
  for (const m of text.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  return out;
}

export function parseDrawio(xml, label = '') {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('drawio 文件包含 DTD/实体，拒绝解析');
  const pages = [];
  for (const page of xml.matchAll(/<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/g)) {
    const pageAttrs = attrs(page[1]);
    const nodes = [];
    const edges = [];
    const taken = new Set();
    // 外层 <object> / <UserObject> 承载业务属性和 id；内部 mxCell 通常没有 id。
    for (const obj of page[2].matchAll(/<(object|UserObject)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const props = attrs(obj[2]);
      const cell = obj[3].match(/<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/);
      if (!cell) continue;
      const a = attrs(cell[1]);
      if (a.vertex !== '1') {
        edges.push({ id: props.id || a.id || '', source: a.source || '', target: a.target || '', value: props.label || a.value || '' });
        continue;
      }
      const geometry = cell[2]?.match(/<mxGeometry\b([^>]*)/);
      nodes.push({ ...a, ...props, id: props.id || a.id,
        geometry: geometry ? attrs(geometry[1]) : {} });
      if (a.id) taken.add(a.id);
    }
    // 未被包住的原生 mxCell（标题、说明、普通图形）
    for (const cell of page[2].matchAll(/<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g)) {
      const a = attrs(cell[1]);
      if (!a.id || taken.has(a.id)) continue;
      if (a.vertex === '1') {
        const geometry = cell[2]?.match(/<mxGeometry\b([^>]*)/);
        nodes.push({ ...a, geometry: geometry ? attrs(geometry[1]) : {} });
      } else if (a.edge === '1') {
        edges.push({ id: a.id, source: a.source || '', target: a.target || '', value: a.value || '' });
      }
    }
    pages.push({ id: pageAttrs.id, name: pageAttrs.name, nodes, edges });
  }
  return { schemaVersion: 1, document: label, source: label, pages };
}

// ---------------------------------------------------------------------------
// 清洗与派生信息
// ---------------------------------------------------------------------------

const htmlToText = (s = '') => s
  .replace(/<br\s*\/?>/gi, ' / ')
  .replace(/<\/(div|p|li|tr)>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

const splitNotes = (s = '') => String(s).split(/[;；\n]/).map(x => x.trim()).filter(Boolean);
const splitCode = (s = '') => String(s).split(/[;；\s]+/).map(x => x.trim()).filter(Boolean);

// 摘要里默认不标注这些状态（它们就是常规状态）；planned 必须显式标出来，
// 否则读者会把「规划、尚未实现」误当成已有功能。
const QUIET_STATUS = new Set(['current-workflow', 'decided', 'target', 'todo']);
const PLANNED_LABEL = '规划，尚未实现';
// 非业务节点：页标题、阶段名、图例。它们的 id 遵循固定命名，读图时不计入流程节点。
const DECORATION_IDS = new Set(['title', 'subtitle', 'note']);
const DECORATION_PREFIXES = ['stage-', 'ov-stage', 'ov-legend'];

/** 把注册表归一成 Agent 好用的形状：纯文本、稳定排序、补充反向索引。 */
/** 是否为标题/注释类单元格，而不是业务节点。 */
function isDecoration(n) {
  if (DECORATION_IDS.has(n.id)) return true;
  if (DECORATION_PREFIXES.some(prefix => String(n.id || '').startsWith(prefix))) return true;
  // 纯文字、且没有任何业务属性：是图上的说明文字，不是流程节点。
  const style = String(n.style || '');
  const bare = !n.status && !n.code && !n.description && !n.rules && !n.moduleId;
  return bare && (style.startsWith('text') || !n.title);
}

export function normalize(data, project = '') {
  const pages = data.pages.map((pg, index) => {
    const nodes = pg.nodes
      .map(n => ({
        id: n.id,
        moduleId: n.moduleId || n.id,
        title: n.title || (n.label ? htmlToText(n.label) : '') || htmlToText(n.value),
        description: n.description || '',
        status: n.status || '',
        code: splitCode(n.code),
        rules: splitNotes(n.rules),
        notes: splitNotes(n.notes),
        evidenceAsOf: n.evidenceAsOf || '',
        shape: (n.style || '').startsWith('text') ? 'text' : 'shape',
        idLabel: (n.id || '').trim(),
        decorative: isDecoration(n),
      }))
      .sort((a, b) => Number(a.geometry?.y || 0) - Number(b.geometry?.y || 0) ||
        Number(a.geometry?.x || 0) - Number(b.geometry?.x || 0));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = pg.edges.map(e => ({
      id: e.id,
      from: e.source,
      to: e.target,
      fromTitle: byId.get(e.source)?.title || e.source,
      toTitle: byId.get(e.target)?.title || e.target,
      label: e.value ? htmlToText(e.value) : '',
    }));
    const dangling = edges.filter(e => !byId.has(e.from) || !byId.has(e.to)).map(e => e.id);
    return { index, id: pg.id, name: pg.name, nodes, edges, dangling };
  });

  // 业务数据里的 id 标签常用于图下方标注（如“①”），与连线无关，不参与文义。
  const links = new Map();
  for (const pg of pages) {
    for (const e of pg.edges) {
      for (const [from, to] of [[e.from, e.to], [e.to, e.from]]) {
        if (!links.has(from)) links.set(from, { out: [], in: [] });
        links.get(from).out.push({ to, edge: e.id, label: e.label, page: pg.name });
      }
    }
  }

  const codeIndex = {};
  const statusCount = {};
  for (const pg of pages) {
    for (const n of pg.nodes) {
      for (const file of n.code) {
        if (!codeIndex[file]) codeIndex[file] = [];
        codeIndex[file].push({ page: pg.name, moduleId: n.moduleId, title: n.title, status: n.status });
      }
      if (n.decorative) continue;  // 口径与表格一致：只统计业务节点
      const key = n.status || '(未声明)';
      statusCount[key] = (statusCount[key] || 0) + 1;
    }
  }

  return {
    project: project || (data.source ? basename(join(data.source, '..')) : ''),
    source: data.source || '',
    savedAt: data.savedAt || '',
    interpretation: data.interpretation || '',
    pages,
    codeIndex,
    statusCount,
  };
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function renderSummary(g) {
  const lines = [];
  lines.push(`# 流程图：${g.project}`);
  if (g.savedAt) lines.push(`保存时间：${g.savedAt}（${g.source}）`);
  lines.push('', `共 ${g.pages.length} 页。状态：` +
    Object.entries(g.statusCount).map(([k, v]) => `${k} ${v}`).join('，'));
  lines.push('', '| # | 页 | 节点 | 连线 | 规划节点 | 未声明状态的节点 |', '| --- | --- | --- | --- | --- | --- |');
  for (const pg of g.pages) {
    const business = pg.nodes.filter(n => !n.decorative);
    const unknown = business.filter(n => !n.status).map(n => n.title).join('、');
    const planned = business.filter(n => n.status === 'planned').length;
    lines.push(`| ${pg.index + 1} | ${pg.name} | ${business.length} | ${pg.edges.length} | ${planned || '—'} | ${unknown || '—'} |`);
  }
  for (const pg of g.pages) {
    lines.push('', `## ${pg.index + 1}. ${pg.name}`);
    for (const n of pg.nodes) {
      if (n.decorative) continue;
      const flag = n.status === 'planned' ? ` 【${PLANNED_LABEL}】`
        : (!n.status || QUIET_STATUS.has(n.status)) ? '' : ` [${n.status}]`;
      const next = (g.pages.find(p => p.name === pg.name).edges.filter(e => e.from === n.id)
        .map(e => e.toTitle + (e.label ? `（${e.label}）` : '')).join(' / '));
      const files = n.code.length ? ` · ${n.code.length} 个代码文件` : '';
      lines.push(`- **${n.title}**${flag}${files}${next ? ` → ${next}` : ''}`);
      if (n.rules.length) lines.push(`  - 规则：${n.rules.join('；')}`);
      if (n.notes.length) lines.push(`  - 备注：${n.notes.join('；')}`);
    }
  }
  return lines.join('\n');
}

function renderDiff(before, after) {
  const lines = [];
  const beforePages = new Map(before.pages.map(p => [p.name, p]));
  const afterPages = new Map(after.pages.map(p => [p.name, p]));
  for (const name of new Set([...beforePages.keys(), ...afterPages.keys()])) {
    const a = beforePages.get(name);
    const b = afterPages.get(name);
    if (!a) { lines.push(`+ 新增页：${name}（${b.nodes.length} 个节点）`); continue; }
    if (!b) { lines.push(`- 删除页：${name}`); continue; }
    const aNodes = new Map(a.nodes.map(n => [n.id, n]));
    const bNodes = new Map(b.nodes.map(n => [n.id, n]));
    for (const [id, n] of bNodes) {
      const old = aNodes.get(id);
      if (!old) { lines.push(`+ [${name}] 新增节点「${n.title}」(${id})`); continue; }
      for (const key of ['title', 'description', 'status', 'label']) {
        if (JSON.stringify(old[key]) !== JSON.stringify(n[key])) {
          const show = v => htmlToText(String(v ?? ''));
          lines.push(`~ [${name}] ${id}.${key === 'label' ? '显示文字' : key}：「${show(old[key])}」→「${show(n[key])}」`);
        }
      }
      const oldCode = splitCode(old.code).join(';');
      const newCode = splitCode(n.code).join(';');
      if (oldCode !== newCode) {
        lines.push(`~ [${name}] ${id}.code：${oldCode || '（空）'}`);
        lines.push(`  → ${newCode || '（空）'}`);
      }
    }
    for (const [id, n] of aNodes) if (!bNodes.has(id)) lines.push(`- [${name}] 删除节点「${n.title}」(${id})`);
    const edgeKey = e => `${e.source || e.from}>${e.target || e.to}:${e.value || e.label || ''}`;
    const aEdges = new Set(a.edges.map(edgeKey));
    const bEdges = new Set(b.edges.map(edgeKey));
    for (const e of bEdges) if (!aEdges.has(e)) lines.push(`+ [${name}] 新增连线：${e}`);
    for (const e of aEdges) if (!bEdges.has(e)) lines.push(`- [${name}] 删除连线：${e}`);
  }
  return lines.length ? lines.join('\n') : '没有差异（只保存未修改，或只改了坐标）。';
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(0);
}

function loadAny(path) {
  if (!existsSync(path)) fail(`找不到文件：${path}`);
  const text = readFileSync(path, 'utf8');
  return /^\s*\{/.test(text) ? readJson(path) : parseDrawio(text, basename(path));
}

// “改动后”的来源：--registry 指定则用它，否则用项目里的 .drawio（与备份同一种文件）。
function loadAfter() {
  if (args.registry) return loadAny(resolve(args.registry));
  const d = drawioPath(args.project);
  return existsSync(d) ? parseDrawio(readFileSync(d, 'utf8'), basename(d)) : loadRegistry(args);
}

const raw = args.diff ? loadAfter() : loadRegistry(args);
const graph = normalize(raw, args.project);
const selected = args.page ? graph.pages.filter(p => p.name.includes(args.page)) : graph.pages;
if (args.page && !selected.length) fail(`没有匹配「${args.page}」的页。现有页：${graph.pages.map(p => p.name).join('、')}`);
// 只取一页时，状态与代码索引也一并收窄，避免表头出现全量数字造成误读。
const scoped = scopeTo(graph, selected);

function scopeTo(g, pages) {
  const statusCount = {};
  const codeIndex = {};
  for (const pg of pages) {
    for (const n of pg.nodes) {
      if (n.decorative) continue;
      const key = n.status || '(未声明)';
      statusCount[key] = (statusCount[key] || 0) + 1;
      for (const file of n.code) (codeIndex[file] ||= []).push({ page: pg.name, moduleId: n.moduleId, title: n.title, status: n.status });
    }
  }
  return { ...g, pages, statusCount, codeIndex };
}

if (args.diff) {
  const before = loadAny(resolve(args.diff));
  const after = loadAfter();
  console.log(`对比：${basename(args.diff)} → ${after.source}\n`);
  console.log(renderDiff(before, after));
  process.exit(0);
}

if (args.find) {
  const needle = args.find.toLowerCase();
  let hits = 0;
  for (const pg of graph.pages) {
    for (const n of pg.nodes) {
      const haystack = [n.title, n.description, n.status, ...n.rules, ...n.notes, ...n.code].join(' ').toLowerCase();
      if (!haystack.includes(needle)) continue;
      hits++;
      console.log(`[${pg.name}] ${n.moduleId}｜${n.title}｜状态 ${n.status || '未声明'}`);
      if (n.description) console.log(`  描述：${n.description}`);
      if (n.rules.length) console.log(`  规则：${n.rules.join('；')}`);
      if (n.code.length) console.log(`  代码：${n.code.join('、')}`);
      const outs = pg.edges.filter(e => e.from === n.id);
      if (outs.length) console.log(`  去向：${outs.map(e => e.toTitle + (e.label ? `（${e.label}）` : '')).join('、')}`);
    }
  }
  if (!hits) console.log(`没有包含「${args.find}」的节点。`);
  process.exit(0);
}

if (args.json) {
  console.log(JSON.stringify({
    ...scoped,
    savedAt: graph.savedAt,
    source: graph.source,
    interpretation: graph.interpretation,
  }, null, 2));
} else {
  console.log(renderSummary(scoped));
}
