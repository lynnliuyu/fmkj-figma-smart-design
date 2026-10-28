#!/usr/bin/env node
/**
 * CAD → 点位草稿 的托管接口（面向自部署设计站，服务端调用）。
 *
 *   POST /v1/cad-imports?filename=x.dwg[&space=布局名][&floorName=一层]  → 202 { id, statusUrl }
 *   GET  /v1/cad-imports/:id                                            → 状态 / 结果摘要 / 文件地址
 *   GET  /v1/cad-imports/:id/files/:name                                → 取草稿、底图、参考图
 *   GET  /health                                                        → 存活与队列
 *
 * 只有 Bearer Token，没有网页和 Cookie 会话；令牌只应在服务端之间传递。
 * 与导出接口一样串行执行一个任务，避免同一台机器上并发渲染互相拖慢。
 */
import { fork } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const workerPath = fileURLToPath(new URL("./cadcraft/cad-import-worker.mjs", import.meta.url));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// 只允许交付这几类文件：草稿、清单、底图、参考图、核验图。
const filePattern = /^(?:draft\.json|floor\.json|points\.json|result\.json|base\.png|overlay\.png|ref-(?:lighting|switch|socket)\.png)$/;
const activeStates = new Set(["uploading", "queued", "running"]);
const digest = value => createHash("sha256").update(value).digest();
const httpError = (status, message) => Object.assign(new Error(message), { status });

function integer(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error("CAD 导入接口数值配置无效。");
  return number;
}

/** @param {Record<string, string | undefined>} env */
export function cadImportApiConfig(env = process.env) {
  if (!env.CAD_IMPORT_API_TOKEN || env.CAD_IMPORT_API_TOKEN.length < 32) throw new Error("请设置至少 32 字符的 CAD_IMPORT_API_TOKEN。");
  return {
    token: env.CAD_IMPORT_API_TOKEN,
    host: env.CAD_IMPORT_HOST ?? "127.0.0.1",
    port: integer(env.CAD_IMPORT_PORT, 4328, 1, 65535),
    root: resolve(env.CAD_IMPORT_DATA_DIR ?? ".local/cad-import-api"),
    maxBytes: integer(env.CAD_IMPORT_MAX_BYTES, 100 * 1024 * 1024, 1, 1024 * 1024 * 1024),
    maxPending: integer(env.CAD_IMPORT_MAX_PENDING, 4, 1, 32),
    timeoutMs: integer(env.CAD_IMPORT_TIMEOUT_MS, 30 * 60_000, 1000, 2 * 60 * 60_000),
    pageTimeoutMs: integer(env.CAD_IMPORT_PAGE_TIMEOUT_MS, 180_000, 1000, 20 * 60_000),
    cli: env.CADCRAFT_CLI ?? "cadcraft-cli",
    pdftoppm: env.PDFTOPPM ?? "pdftoppm",
    python: env.CAD_REVIEW_PYTHON,
  };
}

/** 独立进程跑导入，避免 CAD 解析阻塞 HTTP 事件循环。 */
export function startCadImportWorker(task, { timeoutMs }) {
  const child = fork(workerPath, [JSON.stringify(task)], { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let stderr = "", stopped = false, killTimer;
  const signal = name => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, name);
      else child.kill(name);
    } catch (error) {
      if (error.code === "ESRCH" || child.exitCode !== null || child.signalCode !== null) return;
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
  const timer = setTimeout(cancel, timeoutMs);
  const done = new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("close", code => {
      signal("SIGKILL");
      if (stopped) reject(new Error("CAD 导入超时或服务停止。"));
      else if (code !== 0) reject(new Error(stderr.trim() || `CAD 导入失败 (${code})。`));
      else accept();
    });
  }).finally(() => { clearTimeout(timer); clearTimeout(killTimer); });
  return { done, cancel };
}

async function receiveDrawing(request, path, maxBytes) {
  const file = await open(path, "wx", 0o600);
  let size = 0;
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxBytes) { request.resume(); throw httpError(413, "CAD 文件超过大小限制。"); }
      await file.writeFile(chunk);
    }
    const header = Buffer.alloc(4096);
    const input = await open(path, "r");
    try { await input.read(header, 0, Math.min(size, header.length), 0); } finally { await input.close(); }
    const text = header.toString("utf8");
    const extension = path.split(".").pop()?.toLowerCase();
    const valid = extension === "dwg" ? /^AC10\d\d/.test(text)
      : text.startsWith("AutoCAD Binary DXF\r\n\x1a\0") || /(?:^|\n)\s*0\s*\r?\n\s*SECTION(?:\s|$)/.test(text);
    if (!valid) throw httpError(422, "文件内容不是可识别的 DWG / DXF。");
  } finally { await file.close(); }
}

export async function createCadImportApi(config, { startWorker = startCadImportWorker, logError = console.error } = {}) {
  const root = resolve(config.root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const jobs = new Map(), queue = [];
  let current = null, closing = false;
  const jobDir = id => join(root, id);
  const save = async job => {
    const path = join(jobDir(job.id), "job.json");
    await writeFile(`${path}.tmp`, JSON.stringify(job, null, 2), { mode: 0o600 });
    const { rename } = await import("node:fs/promises");
    await rename(`${path}.tmp`, path);
  };
  for (const name of await readdir(root)) {
    if (!uuidPattern.test(name)) continue;
    try {
      const job = JSON.parse(await readFile(join(jobDir(name), "job.json"), "utf8"));
      if (job.id !== name) continue;
      if (activeStates.has(job.status)) {
        job.status = "failed"; job.error = "服务重启中断了导入，请重新提交。"; job.finishedAt = new Date().toISOString();
        await save(job);
      }
      jobs.set(name, job);
    } catch (error) { logError(`无法恢复 CAD 导入任务 ${name}: ${error.message}`); }
  }
  const link = (job, name) => `/v1/cad-imports/${job.id}/files/${name}`;
  const publicJob = job => ({
    id: job.id, filename: job.filename, status: job.status, space: job.space, floorName: job.floorName,
    createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
    progress: job.progress, error: job.error, statusUrl: `/v1/cad-imports/${job.id}`,
    ...(job.result ? { result: job.result } : {}),
  });
  const pump = () => {
    if (closing || current || !queue.length) return;
    const job = jobs.get(queue.shift());
    const work = (async () => {
      try {
        job.status = "running"; job.startedAt = new Date().toISOString(); job.progress = "正在读取 CAD…";
        await save(job);
        const task = startWorker({
          source: join(jobDir(job.id), job.filename), outDir: join(jobDir(job.id), "output"),
          space: job.space, floorName: job.floorName, cli: config.cli, pdftoppm: config.pdftoppm,
          python: config.python, pageTimeoutMs: config.pageTimeoutMs, fileName: job.filename,
        }, { timeoutMs: config.timeoutMs });
        current.cancel = task.cancel;
        await task.done;
        const output = join(jobDir(job.id), "output");
        const summary = JSON.parse(await readFile(join(output, "result.json"), "utf8"));
        // 草稿、底图、参考图在 floor/ 下；result.json 在根目录。只交付白名单内的产物。
        const floorDir = join(output, "floor");
        const files = [];
        for (const dir of [floorDir, output]) {
          for (const name of await readdir(dir)) {
            if (!filePattern.test(name) || files.includes(name)) continue;
            const handle = await open(join(dir, name), "r");
            try {
              const info = await handle.stat();
              if (!info.size) throw new Error(`导入产物为空：${name}`);
              files.push(name);
            } finally { await handle.close(); }
          }
        }
        const draft = JSON.parse(await readFile(join(output, "floor", "draft.json"), "utf8"));
        job.result = {
          sourceSha256: summary.sourceSha256, fileName: summary.fileName,
          floor: draft.floors?.[0]?.name ?? null,
          imageWidth: draft.floors?.[0]?.imageWidth ?? null, imageHeight: draft.floors?.[0]?.imageHeight ?? null,
          pointCount: draft.points?.length ?? 0,
          byIcon: summary.summary?.byIcon ?? {},
          warnings: summary.summary?.warnings ?? [],
          draftUrl: link(job, "draft.json"),
          files: files.map(name => ({ name, url: link(job, name) })),
        };
        job.status = "succeeded"; job.progress = "点位草稿已生成，需在编辑器中人工复核。";
      } catch (error) {
        logError(`CAD 导入任务 ${job.id}: ${error.message}`);
        job.status = "failed"; job.error = "导入未完成，请核对图纸、运行依赖或服务日志后重试。";
      }
      job.finishedAt = new Date().toISOString();
      await save(job);
    })();
    current = { id: job.id, work, cancel: () => {} };
    void work.catch(error => logError(`无法保存导入任务 ${job.id}: ${error.message}`)).finally(() => { current = null; pump(); });
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
      const supplied = request.headers.authorization ?? "";
      if (!timingSafeEqual(digest(supplied), digest(`Bearer ${config.token}`))) {
        response.setHeader("WWW-Authenticate", "Bearer");
        throw httpError(401, "需要有效的 Bearer Token。");
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { status: closing ? "stopping" : "ok", active: current ? 1 : 0, queued: queue.length });
      }
      if (request.method === "POST" && url.pathname === "/v1/cad-imports") {
        if (closing) throw httpError(503, "服务正在停止。");
        if ([...jobs.values()].filter(job => activeStates.has(job.status)).length >= config.maxPending) {
          response.setHeader("Retry-After", "10");
          throw httpError(429, "导入队列已满，请稍后重试。");
        }
        const filename = url.searchParams.get("filename") ?? "";
        if (filename.length > 180 || /[/\\\x00-\x1f\x7f]/.test(filename) || !/^.+\.(dwg|dxf)$/i.test(filename)) throw httpError(400, "请提供不含路径的 DWG / DXF 文件名。");
        const space = url.searchParams.get("space") ?? undefined;
        const floorName = url.searchParams.get("floorName") ?? undefined;
        if ((space !== undefined && (!space.trim() || space.length > 100 || /[\x00-\x1f]/.test(space)))
          || (floorName !== undefined && (!floorName.trim() || floorName.length > 60 || /[\x00-\x1f]/.test(floorName)))
          || [...url.searchParams.keys()].some(key => !["filename", "space", "floorName"].includes(key))) throw httpError(400, "请求参数无效。");
        if (request.headers["content-type"]?.split(";")[0].trim() !== "application/octet-stream") throw httpError(415, "请用 application/octet-stream 上传原始 CAD 文件字节。");
        if (Number(request.headers["content-length"]) > config.maxBytes) throw httpError(413, "CAD 文件超过大小限制。");
        const job = { id: randomUUID(), filename, space, floorName: floorName ?? "一层", status: "uploading", createdAt: new Date().toISOString() };
        jobs.set(job.id, job);
        try {
          await mkdir(jobDir(job.id), { mode: 0o700 });
          await receiveDrawing(request, join(jobDir(job.id), filename), config.maxBytes);
          if (closing) throw httpError(503, "服务正在停止。");
          job.status = "queued";
          await save(job);
        } catch (error) { jobs.delete(job.id); await rm(jobDir(job.id), { recursive: true, force: true }); throw error; }
        queue.push(job.id);
        response.setHeader("Location", `/v1/cad-imports/${job.id}`);
        send(response, 202, publicJob(job));
        pump();
        return;
      }
      const match = /^\/v1\/cad-imports\/([^/]+)(?:\/files\/([^/]+))?$/.exec(url.pathname);
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
        const floorPath = join(jobDir(job.id), "output", "floor", name);
        const rootPath = join(jobDir(job.id), "output", name);
        const path = name === "result.json" ? rootPath : floorPath;
        const file = await open(path, "r");
        try {
          const info = await file.stat();
          if (!info.isFile()) throw httpError(404, "文件不存在。");
          response.writeHead(200, {
            "Content-Type": name.endsWith(".png") ? "image/png" : "application/json",
            "Content-Disposition": `${name.endsWith(".png") ? "inline" : "attachment"}; filename="${name}"`,
            "Content-Length": info.size,
          });
          await pipeline(file.createReadStream({ autoClose: false }), response);
        } finally { await file.close(); }
        return;
      }
      throw httpError(405, "不支持的请求方法。");
    } catch (error) {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      if (!error.status) logError(`CAD 导入接口: ${error.message}`);
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
        job.status = "failed"; job.error = "服务停止，请重新提交。"; job.finishedAt = new Date().toISOString();
        await save(job);
      }
      server.closeAllConnections();
      await closed;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = cadImportApiConfig();
    const api = await createCadImportApi(config);
    api.server.on("error", error => { console.error(error.message); process.exitCode = 1; });
    api.server.listen(config.port, config.host, () => console.log(`CAD 导入接口：http://${config.host}:${config.port}（仅 Bearer Token）`));
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
      void api.close().catch(error => { console.error(error.message); process.exitCode = 1; });
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
