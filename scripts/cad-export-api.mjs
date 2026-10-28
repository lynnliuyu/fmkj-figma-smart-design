#!/usr/bin/env node
import { fork } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, open, readFile, readdir, rename, rm, lstat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { safeName } from "./cad-export-package.mjs";
import { cadReviewPageCategory } from "./export-cad-review.mjs";

const workerPath = fileURLToPath(new URL("./cadcraft/export-worker.mjs", import.meta.url));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const filePattern = /^(?:manifest\.json|index\.html|all-pages\.pdf|(?:overview-\d+|page-\d+)(?:\.original)?\.(?:pdf|png))$/;
const activeStates = new Set(["uploading", "queued", "running"]);
const digest = value => createHash("sha256").update(value).digest();
/**
 * Content-Disposition：中文图纸名走 RFC 5987，ASCII 回退用磁盘文件名，
 * 避免旧客户端拿到空文件名。名字来自图纸文字，必须清掉引号、反斜杠与换行。
 */
function contentDisposition(served, displayName, forceDownload) {
  const disposition = forceDownload || !served.endsWith(".png") ? "attachment" : "inline";
  if (!displayName) return `${disposition}; filename="${served}"`;
  const ascii = served.replace(/[^\w.\-]/g, "_");
  const encoded = encodeURIComponent(displayName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
const httpError = (status, message) => Object.assign(new Error(message), { status });

function integer(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error("CAD API 数值配置无效。");
  return number;
}

/** @param {Record<string, string | undefined>} env */
export function cadExportApiConfig(env = process.env) {
  if (!env.CAD_EXPORT_API_TOKEN || env.CAD_EXPORT_API_TOKEN.length < 32) throw new Error("请设置至少 32 字符的 CAD_EXPORT_API_TOKEN。");
  const host = env.CAD_EXPORT_HOST ?? "127.0.0.1";
  const webEnabled = env.CAD_EXPORT_WEB === "1";
  // Server deployments set CAD_EXPORT_BEARER_ONLY=1: no web page, no cookie session.
  const bearerOnly = env.CAD_EXPORT_BEARER_ONLY === "1";
  if (webEnabled && !["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("网页试用模式只能监听本机回环地址。");
  return {
    token: env.CAD_EXPORT_API_TOKEN,
    host, webEnabled, bearerOnly,
    port: integer(env.CAD_EXPORT_PORT, 4318, 1, 65535),
    root: resolve(env.CAD_EXPORT_DATA_DIR ?? ".local/cad-export-api"),
    maxBytes: integer(env.CAD_EXPORT_MAX_BYTES, 100 * 1024 * 1024, 1, 1024 * 1024 * 1024),
    maxPending: integer(env.CAD_EXPORT_MAX_PENDING, 4, 1, 32),
    timeoutMs: integer(env.CAD_EXPORT_TIMEOUT_MS, 50 * 60_000, 1000, 2 * 60 * 60_000),
    pageTimeoutMs: integer(env.CAD_EXPORT_PAGE_TIMEOUT_MS, 120_000, 1000, 20 * 60_000),
    cli: env.CADCRAFT_CLI ?? "cadcraft-cli",
    pdftoppm: env.PDFTOPPM ?? "pdftoppm",
    python: env.CAD_REVIEW_PYTHON,
  };
}

export function startCadExportWorker(options, { progress, timeoutMs }) {
  const child = fork(workerPath, [JSON.stringify(options)], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "", publicMessage, stopped = false, killTimer;
  const signal = name => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) {
      if (error.code === "ESRCH") return;
      // macOS may reject a second group signal after all owned children exited.
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill(name);
    }
  };
  const cancel = () => {
    if (stopped) return;
    stopped = true;
    signal("SIGTERM");
    killTimer = setTimeout(() => signal("SIGKILL"), 1500);
  };
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16_384); });
  child.on("message", message => {
    if (typeof message?.progress === "string") progress(message.progress);
    if (["CAD_RENDER_BUDGET", "CAD_SPACE_NOT_FOUND"].includes(message?.errorCode) && typeof message?.publicMessage === "string") publicMessage = message.publicMessage.slice(0, 500);
  });
  const timer = setTimeout(cancel, timeoutMs);
  const done = new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", code => {
      // Kill any remaining renderer descendants even if the worker exited first.
      signal("SIGKILL");
      if (stopped) reject(new Error("CAD 导出超时或服务停止。"));
      else if (code !== 0) reject(Object.assign(new Error(stderr.trim() || `CAD 导出失败 (${code})。`), { publicMessage }));
      else accept();
    });
  }).finally(() => { clearTimeout(timer); clearTimeout(killTimer); });
  return { done, cancel };
}

async function receiveDrawing(request, path, extension, maxBytes) {
  const file = await open(path, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxBytes) { request.resume(); throw httpError(413, "CAD 文件超过大小限制。"); }
      await file.writeFile(chunk);
    }
    const header = Buffer.alloc(4096);
    // Read through a separate descriptor: the upload descriptor is write-only.
    const input = await open(path, "r");
    try { await input.read(header, 0, Math.min(size, header.length), 0); }
    finally { await input.close(); }
    const text = header.toString("utf8");
    const valid = extension === "dwg" ? /^AC10\d\d/.test(text)
      : text.startsWith("AutoCAD Binary DXF\r\n\x1a\0") || /(?:^|\n)\s*0\s*\r?\n\s*SECTION(?:\s|$)/.test(text);
    if (!valid) throw httpError(422, "文件内容不是可识别的 DWG / DXF。");
  } finally { await file.close(); }
}

/** One private service / one shared credential. Not a public multi-tenant API. */
export async function createCadExportApi(config, { startWorker = startCadExportWorker, logError = console.error } = {}) {
  const root = resolve(config.root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const jobs = new Map(), queue = [];
  const webSession = randomBytes(32).toString("hex");
  const webAssets = new Map([
    ["/", ["./cadcraft/export-web.html", "text/html; charset=utf-8"]],
    ["/export-web.js", ["./cadcraft/export-web.js", "text/javascript; charset=utf-8"]],
    ["/export-web.css", ["./cadcraft/export-web.css", "text/css; charset=utf-8"]],
    ["/demo.dxf", ["./cadcraft/export-demo.dxf", "application/octet-stream"]],
  ]);
  let current = null, closing = false;
  const jobDir = id => join(root, id);
  const save = async job => {
    const path = join(jobDir(job.id), "job.json");
    await writeFile(`${path}.tmp`, JSON.stringify(job, null, 2), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  };
  for (const name of await readdir(root)) {
    if (!uuidPattern.test(name)) continue;
    try {
      const job = JSON.parse(await readFile(join(jobDir(name), "job.json"), "utf8"));
      if (job.id !== name) continue;
      if (activeStates.has(job.status)) {
        job.status = "failed"; job.error = "服务重启中断了导出，请重新上传。";
        job.finishedAt = new Date().toISOString();
        await save(job);
      }
      jobs.set(name, job);
    } catch (error) { logError(`无法恢复 CAD 任务 ${name}: ${error.message}`); }
  }
  const link = (job, name) => `/v1/exports/${job.id}/files/${name}`;
  const publicJob = job => ({
    id: job.id, filename: job.filename, status: job.status, colorMode: job.colorMode,
    space: job.space, includeOverviews: job.includeOverviews,
    createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
    progress: job.progress, error: job.error,
    timings: {
      uploadMs: job.uploadedAt ? Date.parse(job.uploadedAt) - Date.parse(job.createdAt) : null,
      queueMs: job.startedAt && job.uploadedAt ? Date.parse(job.startedAt) - Date.parse(job.uploadedAt) : null,
      exportMs: job.finishedAt && job.startedAt ? Date.parse(job.finishedAt) - Date.parse(job.startedAt) : null,
      totalMs: job.finishedAt ? Date.parse(job.finishedAt) - Date.parse(job.createdAt) : null,
    },
    statusUrl: `/v1/exports/${job.id}`,
    ...(job.result ? { result: job.result } : {}),
  });
  const pump = () => {
    if (closing || current || !queue.length) return;
    const job = jobs.get(queue.shift());
    const work = (async () => {
      try {
        job.status = "running"; job.startedAt = new Date().toISOString();
        job.progress = "正在读取 CAD…";
        await save(job);
        if (closing) throw new Error("服务正在停止。");
        const task = startWorker({
          source: join(jobDir(job.id), job.filename), outDir: join(jobDir(job.id), "output"),
          colorMode: job.colorMode, cli: config.cli, pdftoppm: config.pdftoppm, python: config.python, space: job.space, includeOverviews: job.includeOverviews, pageTimeoutMs: config.pageTimeoutMs,
        }, { timeoutMs: config.timeoutMs, progress: message => { job.progress = String(message).slice(0, 500); } });
        current.cancel = task.cancel;
        await task.done;
        const manifest = JSON.parse(await readFile(join(jobDir(job.id), "output", "manifest.json"), "utf8"));
        const pages = [...manifest.overviews, ...manifest.sheets];
        const filenames = new Set(["manifest.json", "index.html"]);
        if (manifest.combinedPdf) filenames.add(manifest.combinedPdf);
        for (const page of pages) for (const key of ["pdf", "png", "originalPdf", "originalPng"]) if (page[key]) filenames.add(page[key]);
        for (const name of filenames) {
          if (!filePattern.test(name)) throw new Error("导出清单包含无效文件。");
          const info = await lstat(join(jobDir(job.id), "output", name));
          if (!info.isFile() || !info.size) throw new Error("导出清单中的文件缺失或为空。");
        }
        // 下载时使用的文件名（图号-图名）；磁盘上的 page-* 文件名保持不变，
        // 索引与渲染不受影响，只影响“另存为”的名字。
        const deliveryNames = {};
        const named = page => {
          const stem = safeName(page.deliveryStem) || page.id;
          const names = { pdf: `${stem}.pdf`, png: `${stem}.png` };
          if (page.originalPdf) names.originalPdf = `${stem}-原色.pdf`;
          if (page.originalPng) names.originalPng = `${stem}-原色.png`;
          for (const [key, served] of Object.entries({ pdf: page.pdf, png: page.png, originalPdf: page.originalPdf, originalPng: page.originalPng })) {
            if (served && names[key]) deliveryNames[served] = names[key];
          }
          return names;
        };
        job.result = {
          completeness: "requires-human-review", sourceSha256: manifest.sourceSha256,
          warnings: manifest.warnings,
          selection: manifest.selection, inventory: manifest.inventory,
          overviewCount: manifest.overviews.length, sheetCount: manifest.sheets.length,
          pages: pages.map(page => ({
            id: page.id, kind: page.kind, space: page.space, labels: page.labels ?? [],
            displayName: page.kind === "overview" ? `${page.space} 原图总览` : (page.labels ?? []).join(" / ") || page.id,
            fileNames: named(page),
            category: cadReviewPageCategory(page), warning: page.warning,
            pdfUrl: link(job, page.pdf), pngUrl: link(job, page.png),
            ...(page.originalPdf ? { originalPdfUrl: link(job, page.originalPdf) } : {}),
            ...(page.originalPng ? { originalPngUrl: link(job, page.originalPng) } : {}),
          })),
          files: [...filenames].map(name => ({ name, url: link(job, name), ...(deliveryNames[name] ? { displayName: deliveryNames[name] } : {}) })),
        };
        job.deliveryNames = deliveryNames;
        job.status = "succeeded"; job.progress = "导出完成，图纸完整性需人工核对。";
      } catch (error) {
        logError(`CAD 任务 ${job.id}: ${error.message}`);
        job.status = "failed"; job.error = error.publicMessage ?? "导出未完成，请检查 CAD 文件、运行依赖或服务日志后重试。";
      }
      job.finishedAt = new Date().toISOString();
      await save(job);
    })();
    current = { id: job.id, work, cancel: () => {} };
    void work.catch(error => logError(`无法保存 CAD 任务 ${job.id}: ${error.message}`)).finally(() => { current = null; pump(); });
  };
  const send = (response, status, body) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = new URL(request.url, "http://localhost");
      const address = request.socket.remoteAddress ?? "";
      const host = request.headers.host ?? "";
      const port = server.address()?.port;
      const localWeb = config.webEnabled && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)
        && [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host);
      // Token-only deployment: no web pages and no cookie session at all.
      if (config.bearerOnly && webAssets.has(url.pathname)) throw httpError(404, "服务未开放网页，请使用 Bearer Token 调用接口。");
      if (localWeb && request.method === "GET" && webAssets.has(url.pathname)) {
        const [path, type] = webAssets.get(url.pathname);
        if (url.pathname === "/") {
          response.setHeader("Set-Cookie", `cad_export_ui=${webSession}; Path=/; HttpOnly; SameSite=Strict`);
        }
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        response.writeHead(200, { "Content-Type": type });
        response.end(await readFile(fileURLToPath(new URL(path, import.meta.url))));
        return;
      }
      const supplied = request.headers.authorization ?? "";
      const cookie = request.headers.cookie?.split(";").map(item => item.trim()).find(item => item.startsWith("cad_export_ui="))?.slice("cad_export_ui=".length) ?? "";
      const browserSession = localWeb && timingSafeEqual(digest(cookie), digest(webSession));
      const bearer = timingSafeEqual(digest(supplied), digest(`Bearer ${config.token}`));
      if (!bearer && !browserSession) {
        response.setHeader("WWW-Authenticate", "Bearer");
        throw httpError(401, "需要有效的 Bearer Token。");
      }
      if (!bearer && browserSession && !["GET", "HEAD"].includes(request.method) && request.headers.origin !== `http://${host}`) {
        throw httpError(403, "请从本机导出网页发起请求。");
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { status: closing ? "stopping" : "ok", active: current ? 1 : 0, queued: queue.length });
      }
      if (request.method === "POST" && url.pathname === "/v1/exports") {
        if (closing) throw httpError(503, "服务正在停止。");
        if ([...jobs.values()].filter(job => activeStates.has(job.status)).length >= config.maxPending) {
          response.setHeader("Retry-After", "10");
          throw httpError(429, "导出队列已满，请稍后重试。");
        }
        const filename = url.searchParams.get("filename") ?? "";
        if (filename.length > 180 || /[/\\\x00-\x1f\x7f]/.test(filename) || !/^.+\.(dwg|dxf)$/i.test(filename)) throw httpError(400, "请提供不含路径的 DWG / DXF 文件名。");
        const colorMode = url.searchParams.get("colorMode") ?? "readable";
        const space = url.searchParams.get("space") ?? undefined;
        const overviews = url.searchParams.get("overviews") ?? "include";
        if (!["readable", "original"].includes(colorMode) || !["include", "skip"].includes(overviews) || (space !== undefined && (!space.trim() || space.length > 100 || /[\x00-\x1f]/.test(space))) || [...url.searchParams.keys()].some(key => !["filename", "colorMode", "space", "overviews"].includes(key))) throw httpError(400, "请求参数无效。");
        if (request.headers["content-type"]?.split(";")[0].trim() !== "application/octet-stream") throw httpError(415, "请用 application/octet-stream 上传原始 CAD 文件字节。");
        if (Number(request.headers["content-length"]) > config.maxBytes) throw httpError(413, "CAD 文件超过大小限制。");
        const job = { id: randomUUID(), filename, colorMode, space, includeOverviews: overviews !== "skip", status: "uploading", createdAt: new Date().toISOString() };
        jobs.set(job.id, job);
        try {
          await mkdir(jobDir(job.id), { mode: 0o700 });
          await receiveDrawing(request, join(jobDir(job.id), filename), filename.split(".").pop().toLowerCase(), config.maxBytes);
          if (closing) throw httpError(503, "服务正在停止。");
          job.status = "queued"; job.uploadedAt = new Date().toISOString();
          await save(job);
        } catch (error) { jobs.delete(job.id); await rm(jobDir(job.id), { recursive: true, force: true }); throw error; }
        queue.push(job.id);
        response.setHeader("Location", `/v1/exports/${job.id}`);
        send(response, 202, publicJob(job));
        pump();
        return;
      }
      const match = /^\/v1\/exports\/([^/]+)(?:\/files\/([^/]+))?$/.exec(url.pathname);
      const job = match && uuidPattern.test(match[1]) ? jobs.get(match[1]) : null;
      if (!job) throw httpError(404, "任务或文件不存在。");
      if (request.method === "GET" && !match[2]) return send(response, 200, publicJob(job));
      if (request.method === "DELETE" && !match[2]) {
        if (activeStates.has(job.status)) throw httpError(409, "任务尚未结束，请结束后删除。");
        await rm(jobDir(job.id), { recursive: true, force: true });
        jobs.delete(job.id);
        return send(response, 200, { deleted: true });
      }
      if (request.method === "GET" && match[2]) {
        const name = match[2];
        if (job.status !== "succeeded") throw httpError(409, "任务尚未成功完成。");
        if (!filePattern.test(name) || !job.result.files.some(file => file.name === name)) throw httpError(404, "文件不存在。");
        const file = await open(join(jobDir(job.id), "output", name), "r");
        try {
          const info = await file.stat();
          if (!info.isFile()) throw httpError(404, "文件不存在。");
          const download = url.searchParams.get("download") === "1";
          response.writeHead(200, {
            "Content-Type": name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : name.endsWith(".json") ? "application/json" : "text/html; charset=utf-8",
            "Content-Disposition": contentDisposition(name, job.deliveryNames?.[name], download),
            "Content-Length": info.size,
          });
          await pipeline(file.createReadStream({ autoClose: false }), response);
        } finally { await file.close(); }
        return;
      }
      throw httpError(405, "不支持的请求方法。");
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      if (!error.status) logError(`CAD API: ${error.message}`);
      send(response, error.status ?? 500, { error: error.status ? error.message : "服务处理失败，请查看服务日志。" });
      request.resume();
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  return {
    server,
    async close() {
      closing = true;
      const closed = new Promise(accept => server.close(accept));
      current?.cancel();
      await current?.work;
      for (const id of queue.splice(0)) {
        const job = jobs.get(id);
        job.status = "failed"; job.error = "服务停止，请重新上传。"; job.finishedAt = new Date().toISOString();
        await save(job);
      }
      server.closeAllConnections();
      await closed;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = cadExportApiConfig();
    const api = await createCadExportApi(config);
    api.server.on("error", error => { console.error(error.message); process.exitCode = 1; });
    api.server.listen(config.port, config.host, () => console.log(`CAD 导出接口：http://${config.host}:${config.port}`));
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
      void api.close().catch(error => { console.error(error.message); process.exitCode = 1; });
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
