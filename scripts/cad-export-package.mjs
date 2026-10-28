#!/usr/bin/env node
/**
 * 把一个导出目录整理成“单张单张”的交付形式。
 *
 * 输入：export-cad-review 的输出目录（含 manifest.json 与 page-*.png / page-*.pdf）。
 * 输出：按图号命名的单页图片、单页 PDF、每页一个压缩包、整套压缩包，以及清单 CSV。
 *
 * 用法：
 *   node scripts/cad-export-package.mjs --dir <导出目录> --out <输出目录> \
 *     [--modes png,pdf,page-zip,set,csv]
 *
 * 只读取导出目录，不改动原文件；重名自动加页号，绝不覆盖。
 */
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { deflateRawSync } from "node:zlib";

export const PACKAGE_MODES = ["png", "pdf", "page-zip", "set", "csv"];

/**
 * 文件名安全化：去路径分隔符、保留字符与控制字符（防响应头/路径注入），保留中文。
 * 图名来自图纸文字，属于不可信输入，因此这里同时限制长度。
 */
export function safeName(value, limit = 60) {
  return String(value ?? "")
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, "")
    .replace(/[\s.]+/g, "")
    .trim()
    .slice(0, limit);
}

/**
 * 从 labels 里拆出图号（如 P-04）与图名，供文件命名使用。
 * 两种常见形态都要支持：图号独立成标签（`P-09` + `灯具定位图`），
 * 以及图号与图名在同一标签里（`PM-15 富二楼顶面布置图`）。
 */
export function splitLabels(labels) {
  const list = (labels ?? []).map(label => String(label).trim()).filter(Boolean);
  const standalone = /^[A-Za-z]{1,4}-\d{1,3}$/;
  const leading = /^([A-Za-z]{1,4}-\d{1,3})(?:\s+|$)/;
  let number = "";
  const names = [];
  for (const label of list) {
    if (standalone.test(label)) { if (!number) number = label; continue; }
    const match = leading.exec(label);
    if (match && !number) {
      number = match[1];
      const rest = label.slice(match[0].length).trim();
      if (rest) names.push(rest);
      continue;
    }
    names.push(label);
  }
  return { number: safeName(number), name: safeName(names.join("")) };
}

/**
 * 每页一个稳定的交付主名（图号-图名）；重名时追加页号，保证不互相覆盖。
 * 总览页没有图号，用“空间名+总览”。
 */
export function deliveryStems(pages) {
  const used = new Set();
  return (pages ?? []).map(page => {
    const { number, name } = splitLabels(page.labels);
    let stem = [number, name].filter(Boolean).join("-") || safeName(`${page.space ?? "原图"}总览`) || page.id;
    if (used.has(stem)) stem = `${stem}-${page.id}`;
    used.add(stem);
    return { page, stem, number, name };
  });
}

/** 逐页图框的交付主名，供整理脚本使用。 */
export function pageStems(manifest) {
  return deliveryStems(manifest.sheets ?? []);
}

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/**
 * 最小 ZIP 写入器（deflate，UTF-8 文件名）。
 * Node 没有内置 zip，容器里也不装 zip 命令，所以这里自带实现，避免额外依赖。
 */
export function zipBuffer(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const deflated = deflateRawSync(entry.data);
    const store = deflated.length >= entry.data.length;
    const body = store ? entry.data : deflated;
    const method = store ? 0 : 8;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // 文件名按 UTF-8 解释
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(entry.data), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, body);
    central.push({ name, method, crc: crc32(entry.data), comp: body.length, size: entry.data.length, offset });
    offset += header.length + name.length + body.length;
  }
  const centralParts = [];
  let centralSize = 0;
  for (const item of central) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(item.method, 10);
    header.writeUInt32LE(item.crc, 16);
    header.writeUInt32LE(item.comp, 20);
    header.writeUInt32LE(item.size, 24);
    header.writeUInt16LE(item.name.length, 28);
    header.writeUInt32LE(item.offset, 42);
    centralParts.push(header, item.name);
    centralSize += header.length + item.name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...centralParts, end]);
}

/** 每页可交付的文件：清晰 / 原色两种配色，各自 PDF 与 PNG。 */
export function pageFiles(page) {
  return [
    { kind: "pdf", palette: "readable", file: page.pdf, suffix: "" },
    { kind: "pdf", palette: "original", file: page.originalPdf, suffix: "-原色" },
    { kind: "png", palette: "readable", file: page.png, suffix: "" },
    { kind: "png", palette: "original", file: page.originalPng, suffix: "-原色" },
  ].filter(item => item.file);
}

export async function packageExport(dir, outRoot, modes = PACKAGE_MODES, log = () => {}) {
  const source = resolve(dir);
  const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
  const pages = pageStems(manifest);
  if (!pages.length) throw new Error("导出清单里没有逐页图框，无法整理单张交付；请先按布局导出。");
  const out = resolve(outRoot);
  await mkdir(out, { recursive: true });
  const dirs = {
    png: join(out, "单页图片"),
    pdf: join(out, "单页PDF"),
    zip: join(out, "单页压缩包"),
    set: join(out, "整套"),
  };
  const wanted = new Set(modes);
  const written = { png: 0, pdf: 0, zip: 0, set: 0 };
  for (const key of ["png", "pdf", "zip", "set"]) {
    if (key === "png" && wanted.has("png")) await mkdir(dirs.png, { recursive: true });
    if (key === "pdf" && wanted.has("pdf")) await mkdir(dirs.pdf, { recursive: true });
    if (key === "zip" && wanted.has("page-zip")) await mkdir(dirs.zip, { recursive: true });
    if (key === "set" && wanted.has("set")) await mkdir(dirs.set, { recursive: true });
  }
  const rows = [];
  for (const { page, stem } of pages) {
    const files = pageFiles(page);
    for (const item of files) {
      const from = join(source, item.file);
      const target = `${stem}${item.suffix}.${item.kind}`;
      if (item.kind === "png" && wanted.has("png")) { await copyFile(from, join(dirs.png, target)); written.png += 1; }
      if (item.kind === "pdf" && wanted.has("pdf")) { await copyFile(from, join(dirs.pdf, target)); written.pdf += 1; }
    }
    if (wanted.has("page-zip")) {
      const entries = [];
      for (const item of files) entries.push({ name: `${stem}${item.suffix}.${item.kind}`, data: await readFile(join(source, item.file)) });
      await writeFile(join(dirs.zip, `${stem}.zip`), zipBuffer(entries));
      written.zip += 1;
    }
    rows.push({ id: page.id, stem, number: splitLabels(page.labels).number, name: splitLabels(page.labels).name, labels: (page.labels ?? []).join(" / ") });
    log(`${page.id} ${stem}`);
  }
  if (wanted.has("set")) {
    if (manifest.combinedPdf) await copyFile(join(source, manifest.combinedPdf), join(dirs.set, "全部图纸-合并.pdf"));
    const pngEntries = [], pdfEntries = [];
    for (const { page, stem } of pages) {
      for (const item of pageFiles(page)) {
        const data = await readFile(join(source, item.file));
        const target = `${stem}${item.suffix}.${item.kind}`;
        if (item.kind === "png") pngEntries.push({ name: target, data });
        else pdfEntries.push({ name: target, data });
      }
    }
    await writeFile(join(dirs.set, "全部图纸-图片.zip"), zipBuffer(pngEntries));
    await writeFile(join(dirs.set, "全部图纸-PDF.zip"), zipBuffer(pdfEntries));
    written.set = 2 + (manifest.combinedPdf ? 1 : 0);
  }
  if (wanted.has("csv")) {
    const csv = ["图号,图名,页号,文件名,图纸来源"]
      .concat(rows.map(row => [row.number, row.name, row.id, row.stem, manifest.sourceName].map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")))
      .join("\r\n");
    // BOM: Excel 直接打开中文不乱码。
    await writeFile(join(out, "清单.csv"), `\uFEFF${csv}\r\n`, "utf8");
  }
  await writeFile(join(out, "README.txt"), [
    `来源图纸：${manifest.sourceName}`,
    `来源 SHA-256：${manifest.sourceSha256 ?? "（清单未记录）"}`,
    `导出时间：${manifest.createdAt ?? "（未记录）"}`,
    `页数：${pages.length}`,
    "",
    "目录说明：",
    "  单页图片/     每张图一个 PNG（清晰黑白，另附 -原色）",
    "  单页PDF/      每张图一个 PDF（清晰黑白，另附 -原色）",
    "  单页压缩包/   每张图一个 ZIP，内含该页的 PNG 与 PDF",
    "  整套/         合并 PDF 与整套 ZIP",
    "  清单.csv      图号、图名、页号对照表",
    "",
    "说明：文件按图号与图名命名；原图重复的图纸会各自成文件并加页号区分，未做去重。",
    "渲染使用本机中文字体替代原 SHX，文字宽度需与原 CAD 打印核对。",
  ].join("\n"), "utf8");
  return { out, pages: pages.length, written, rows };
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || argv[i + 1] === undefined) throw new Error("参数格式：--dir <导出目录> --out <输出目录> [--modes png,pdf,page-zip,set,csv]");
    flags[argv[i].slice(2)] = argv[i + 1];
  }
  if (!flags.dir) throw new Error("缺少 --dir（导出目录，需含 manifest.json）");
  const modes = flags.modes ? flags.modes.split(",").map(mode => mode.trim()).filter(Boolean) : PACKAGE_MODES;
  const unknown = modes.filter(mode => !PACKAGE_MODES.includes(mode));
  if (unknown.length) throw new Error(`不支持的方式：${unknown.join("、")}；可用：${PACKAGE_MODES.join("、")}`);
  return { dir: flags.dir, out: flags.out ?? join(flags.dir, "单张交付"), modes };
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    await rm(options.out, { recursive: true, force: true });
    const result = await packageExport(options.dir, options.out, options.modes, message => console.log(`  已整理 ${message}`));
    console.log(`完成：${result.pages} 页 → ${result.out}`);
    console.log(`  单页图片 ${result.written.png} 个；单页 PDF ${result.written.pdf} 个；单页压缩包 ${result.written.zip} 个；整套文件 ${result.written.set} 个`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
