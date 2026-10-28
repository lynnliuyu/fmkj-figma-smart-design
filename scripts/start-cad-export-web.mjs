#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { cadExportApiConfig, createCadExportApi } from "./cad-export-api.mjs";

const run = promisify(execFile);
const runtime = join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies");
async function available(candidates, args, env = process.env) {
  for (const executable of candidates.filter(Boolean)) {
    try { await run(executable, args, { env, timeout: 10_000, maxBuffer: 32_768 }); return executable; }
    catch { /* Use another installed executable. */ }
  }
  throw new Error(`找不到可用依赖：${candidates.filter(Boolean).join(" / ")}`);
}
try {
  const downloads = join(homedir(), "Downloads");
  const cliDownloads = [];
  for (const item of await readdir(downloads).catch(() => [])) {
    if (!/^cadcraft-cli-/.test(item)) continue;
    const path = join(downloads, item, "cadcraft-cli");
    try { cliDownloads.push({ path, modified: (await stat(path)).mtimeMs }); } catch { /* May be an archive. */ }
  }
  cliDownloads.sort((a, b) => b.modified - a.modified);
  const cli = await available(process.env.CADCRAFT_CLI ? [process.env.CADCRAFT_CLI] : ["cadcraft-cli", ...cliDownloads.map(item => item.path)], ["--version"]);
  const pdftoppm = await available(process.env.PDFTOPPM ? [process.env.PDFTOPPM] : ["pdftoppm", join(runtime, "bin/override/pdftoppm")], ["-v"]);
  const pythonEnv = { ...process.env, PYTHONPATH: [resolve(".local/cad-review/python-tools"), process.env.PYTHONPATH].filter(Boolean).join(delimiter) };
  const python = await available(process.env.CAD_REVIEW_PYTHON ? [process.env.CAD_REVIEW_PYTHON] : ["python3", join(runtime, "python/bin/python3")], ["-c", "import pypdf,ezdxf,fitz; assert ezdxf.version >= (1,4,5,'release')"], pythonEnv);
  const config = cadExportApiConfig({ ...process.env,
    CAD_EXPORT_API_TOKEN: process.env.CAD_EXPORT_API_TOKEN ?? randomBytes(32).toString("hex"),
    CAD_EXPORT_DATA_DIR: process.env.CAD_EXPORT_DATA_DIR ?? ".local/cad-export-web",
    CAD_EXPORT_WEB: "1", CADCRAFT_CLI: cli, PDFTOPPM: pdftoppm, CAD_REVIEW_PYTHON: python,
  });
  const api = await createCadExportApi(config);
  api.server.on("error", error => { console.error(error.message); process.exitCode = 1; });
  api.server.listen(config.port, config.host, () => console.log(`CAD 网页已启动：http://${config.host}:${config.port}（仅本机）`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void api.close().catch(error => { console.error(error.message); process.exitCode = 1; }); });
} catch (error) { console.error(error.message); process.exitCode = 1; }
