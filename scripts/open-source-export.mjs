#!/usr/bin/env node
/**
 * 把正式版主干（fmkj-v3）的「可公开子集」导出到自部署版（fmkj-smart-design）。
 *
 * 定位：fmkj-v3 是唯一开发主干；自部署版是**发行产物**，不是第二条开发线（见 docs/adr/0010）。
 * 本脚本只做导出与检查，**不提交、不推送**；推送是人工确认后的独立一步。
 *
 * 用法（在 fmkj-v3 仓库根目录执行）：
 *   # 演练：把目标仓库克隆到 /tmp 后先看差异，不写任何文件
 *   git clone https://github.com/lynnliuyu/fmkj-smart-design /tmp/smd
 *   node scripts/open-source-export.mjs --target /tmp/smd
 *
 *   # 写入目标工作区（仍不提交）
 *   node scripts/open-source-export.mjs --target /tmp/smd --apply
 *
 *   # 导出指定提交而不是工作区 HEAD
 *   node scripts/open-source-export.mjs --target /tmp/smd --ref v1.2.0
 *
 * 退出码：0 演练通过；1 门禁发现禁止内容或读取出错；2 用法/环境错误。
 * 门禁失败时**不会**写入任何文件（即使在 --apply 下也先检查后写）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep, posix } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let MANIFEST = join(ROOT, 'scripts/open-source-manifest.json');

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { target: '', ref: 'HEAD', apply: false, prune: false, report: '', quiet: false, manifest: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = argv[++i];
    else if (a === '--ref') args.ref = argv[++i];
    else if (a === '--apply') args.apply = true;
    else if (a === '--prune') args.prune = true;
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// glob：支持 ** / * / ?，以 / 开头表示锚定仓库根
// ---------------------------------------------------------------------------
function globToRegExp(pattern) {
  const anchored = pattern.startsWith('/');
  const body = anchored ? pattern.slice(1) : pattern;
  let re = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '*') {
      if (body[i + 1] === '*') {
        const slashNext = body[i + 2] === '/';
        re += slashNext ? '(?:.*/)?' : '.*';
        i += slashNext ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

const matchesAny = (path, patterns) => patterns.some(p => globToRegExp(p).test(path));

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join(posix.sep));
  }
  return out;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(0);
}
if (args.manifest) MANIFEST = args.manifest;
if (!existsSync(MANIFEST)) fail(2, `找不到策略文件：${MANIFEST}`);
if (!args.target) fail(2, '需要 --target <自部署版仓库目录>');
if (!existsSync(join(args.target, '.git'))) fail(2, `--target 不是 Git 仓库：${args.target}`);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const exclude = manifest.exclude || [];
const preserve = manifest.preserve || [];
const replaces = (manifest.replace || []).map(r => ({ ...r, re: new RegExp(r.pattern, 'g') }));
const denies = (manifest.deny || []).map(d => ({ ...d, re: new RegExp(d.pattern, 'g') }));
const warns = (manifest.warn || []).map(d => ({ ...d, re: new RegExp(d.pattern, 'g') }));
const denyAllow = new Set((manifest.denyAllow || []).map(x => x.file));

// 1) 导出主干在指定提交下的全部已跟踪文件
const staging = join(tmpdir(), `os-export-${process.pid}-${Date.now()}`);
mkdirSync(staging, { recursive: true });
try {
  const tar = execFileSync('git', ['archive', args.ref], { cwd: ROOT, maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', staging], { input: tar, maxBuffer: 1 << 30 });
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  fail(2, `导出主干 ${args.ref} 失败：${error.message}`);
}

// 二进制策略：公开版不含二进制/图片。非文本文件默认不导出，只在报告里列出，人工决定。
const binaryPolicy = manifest.binaryPolicy || { export: false, binaryAllow: [] };
const binaryAllow = binaryPolicy.binaryAllow || [];
const isBinary = (full) => {
  const buf = readFileSync(full);
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) return true;
  return /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp4|mp3|wav|so|dylib|dll|exe|bin|wasm|dump|pyc)$/i.test(full);
};

const all = walk(staging).sort();
const preserved = all.filter(p => matchesAny(p, preserve));
const notPreserved = all.filter(p => !matchesAny(p, preserve) && !matchesAny(p, exclude));
const skippedBinary = notPreserved.filter(p => isBinary(join(staging, p)) && !matchesAny(p, binaryAllow));
const candidates = notPreserved.filter(p => !skippedBinary.includes(p));

// 2) 替换 + 汇总
const stats = { total: all.length, preserved: preserved.length, candidates: candidates.length };
const actions = { add: [], modify: [], same: [], unchangedByReplacement: [] };
const replaceHits = new Map();
const staged = new Map();

for (const path of candidates) {
  const raw = readFileSync(join(staging, path), 'utf8');
  let text = raw;
  for (const rule of replaces) {
    const before = text;
    text = text.replace(rule.re, rule.with);
    if (before !== text) replaceHits.set(rule.name + '：' + rule.pattern, (replaceHits.get(rule.name + '：' + rule.pattern) || 0) + 1);
  }
  staged.set(path, text);
  const targetPath = join(args.target, path);
  if (!existsSync(targetPath)) actions.add.push(path);
  else if (readFileSync(targetPath, 'utf8') === text) actions.same.push(path);
  else actions.modify.push(path);
}

// 3) 门禁：导出的内容里不得残留禁止项
const violations = [];
for (const [path, text] of staged) {
  if (denyAllow.has(path)) continue;
  const lines = text.split('\n');
  for (const d of denies) {
    d.re.lastIndex = 0;
    lines.forEach((line, i) => {
      d.re.lastIndex = 0;
      if (d.re.test(line)) violations.push({ file: path, line: i + 1, why: d.why, pattern: d.pattern, sample: line.trim().slice(0, 120) });
    });
  }
}
// 保留文件（公开版自有）也要过一遍：避免它们自己带出敏感内容
for (const path of preserved) {
  const targetPath = join(args.target, path);
  if (!existsSync(targetPath)) continue;
  const text = readFileSync(targetPath, 'utf8');
  if (denyAllow.has(path)) continue;
  for (const d of denies) {
    d.re.lastIndex = 0;
    text.split('\n').forEach((line, i) => {
      d.re.lastIndex = 0;
      if (d.re.test(line)) violations.push({ file: path + '（公开版保留文件）', line: i + 1, why: d.why, pattern: d.pattern, sample: line.trim().slice(0, 120) });
    });
  }
}

// 3b) 提醒项：只报告不阻断
const notices = [];
for (const [path, text] of staged) {
  for (const w of warns) {
    w.re.lastIndex = 0;
    text.split('\n').forEach((line, i) => {
      w.re.lastIndex = 0;
      if (w.re.test(line)) notices.push({ file: path, line: i + 1, why: w.why });
    });
  }
}

// 4) 目标仓库里按策略应移除但仍存在的文件
const targetFiles = execFileSync('git', ['ls-files'], { cwd: args.target, encoding: 'utf8' }).split('\n').filter(Boolean);
const shouldPrune = targetFiles.filter(p => matchesAny(p, exclude) && !matchesAny(p, preserve));
const publicOnly = targetFiles.filter(p => !existsSync(join(staging, p)) && !matchesAny(p, exclude));

// 5) 报告
const lines = [];
lines.push(`# 自部署版导出${args.apply ? '（写入）' : '（演练）'}`);
lines.push('');
lines.push(`主干 ${args.ref}：已跟踪 ${stats.total} 个文件 → 导出 ${stats.candidates} 个，保留公开版自有 ${stats.preserved} 个`);
if (skippedBinary.length) lines.push(`按二进制策略跳过 ${skippedBinary.length} 个非文本文件（公开版不含图片/二进制）`);
lines.push(`结果：新增 ${actions.add.length}，修改 ${actions.modify.length}，未变 ${actions.same.length}`);
if (replaceHits.size) {
  lines.push('', '替换命中：');
  for (const [k, v] of [...replaceHits].sort()) lines.push(`- ${k} → ${v} 个文件`);
}
if (actions.add.length) {
  lines.push('', `新增文件（前 25 个，需要人工确认是否该公开）：`);
  actions.add.slice(0, 25).forEach(p => lines.push(`- ${p}`));
  if (actions.add.length > 25) lines.push(`- …其余 ${actions.add.length - 25} 个`);
}
if (actions.modify.length) {
  lines.push('', `修改文件（前 25 个）：`);
  actions.modify.slice(0, 25).forEach(p => lines.push(`- ${p}`));
  if (actions.modify.length > 25) lines.push(`- …其余 ${actions.modify.length - 25} 个`);
}
if (skippedBinary.length) {
  lines.push('', `已跳过的非文本文件（需要时加进 binaryPolicy.binaryAllow）：`);
  skippedBinary.slice(0, 15).forEach(p => lines.push(`- ${p}`));
  if (skippedBinary.length > 15) lines.push(`- …其余 ${skippedBinary.length - 15} 个`);
}
if (shouldPrune.length) {
  lines.push('', `按策略应从公开版移除、但目前仍存在（${shouldPrune.length} 个；加 --prune 才删除）：`);
  shouldPrune.slice(0, 20).forEach(p => lines.push(`- ${p}`));
  if (shouldPrune.length > 20) lines.push(`- …其余 ${shouldPrune.length - 20} 个`);
}
if (publicOnly.length) {
  lines.push('', `公开版自有、主干没有的文件（${publicOnly.length} 个，保持不动）：`);
  publicOnly.slice(0, 10).forEach(p => lines.push(`- ${p}`));
  if (publicOnly.length > 10) lines.push(`- …其余 ${publicOnly.length - 10} 个`);
}
if (notices.length) {
  lines.push('', `提醒（不阻断）：${notices.length} 处`);
  const byFile = new Map();
  for (const n of notices) byFile.set(n.file, (byFile.get(n.file) || 0) + 1);
  for (const [file, count] of [...byFile].slice(0, 10)) lines.push(`- ${file}（${count} 处）`);
  if (byFile.size > 10) lines.push(`- …其余 ${byFile.size - 10} 个文件`);
}
if (violations.length) {
  lines.push('', `❌ 门禁失败：${violations.length} 处禁止内容`);
  const byFile = new Map();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  for (const [file, list] of byFile) {
    lines.push(`- ${file}（${list.length} 处）`);
    list.slice(0, 3).forEach(v => lines.push(`    L${v.line} [${v.why}] ${v.sample}`));
  }
  lines.push('', '处理：在 manifest 的 replace 里补规则，或把该文件加入 exclude。门禁未通过前不会写入。');
} else {
  lines.push('', '✅ 门禁通过：导出内容中未发现客户名、密钥、个人路径等禁止项。');
}

const report = lines.join('\n');
console.log(report);
if (args.report) writeFileSync(args.report, report + '\n', 'utf8');

if (violations.length) {
  rmSync(staging, { recursive: true, force: true });
  process.exit(1);
}

// 6) 写入
if (args.apply) {
  for (const [path, text] of staged) {
    const full = join(args.target, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, 'utf8');
  }
  if (args.prune) for (const p of shouldPrune) rmSync(join(args.target, p), { force: true });
  console.log(`\n已写入 ${staged.size} 个文件到 ${args.target}${args.prune ? `，并移除 ${shouldPrune.length} 个` : ''}。`);
  console.log('下一步（人工确认后）：在目标仓库 git add/commit 并推送；推送前建议先跑 typecheck 与测试。');
} else {
  console.log('\n演练结束，未写入任何文件。确认差异后加 --apply 写入。');
}
rmSync(staging, { recursive: true, force: true });
