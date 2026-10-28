#!/usr/bin/env node
import { resolve } from "node:path";
import { cadExportApiConfig, createCadExportApi } from "./cad-export-api.mjs";

// Server entry point. Unlike start-cad-export-web.mjs it never invents a token:
// a missing CAD_EXPORT_API_TOKEN fails closed so an unauthenticated API cannot
// come up by accident. Defaults here are the container defaults.
const required = ["CAD_EXPORT_API_TOKEN", "CADCRAFT_CLI", "PDFTOPPM", "CAD_REVIEW_PYTHON"];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`缺少必需的环境变量：${missing.join(", ")}。请设置后再启动，服务不会以无鉴权状态运行。`);
  process.exit(1);
}
if (process.env.CAD_REVIEW_FALLBACK_FONT && !process.env.CAD_REVIEW_FALLBACK_FONT.includes("/")) {
  console.error("CAD_REVIEW_FALLBACK_FONT 必须是字体文件绝对路径。");
  process.exit(1);
}
try {
  const config = cadExportApiConfig({
    ...process.env,
    CAD_EXPORT_BEARER_ONLY: "1",
    CAD_EXPORT_DATA_DIR: resolve(process.env.CAD_EXPORT_DATA_DIR ?? "/data"),
  });
  const api = await createCadExportApi(config);
  api.server.on("error", error => { console.error(error.message); process.exitCode = 1; });
  api.server.listen(config.port, config.host, () => {
    console.log(`CAD 导出接口已启动：http://${config.host}:${config.port}（仅 Bearer Token，无网页）`);
    console.log(`数据目录：${config.root}；队列上限：${config.maxPending}；单页上限：${Math.round(config.pageTimeoutMs / 1000)} 秒`);
    console.log(`中文字体：${process.env.CAD_REVIEW_FALLBACK_FONT ?? "（未设置）"}`);
  });
  // Containers receive SIGTERM on stop: stop accepting, abort the running worker,
  // mark queued jobs failed, then exit. No partial output is published.
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      console.log(`收到 ${signal}，正在停止并清理任务…`);
      const timer = setTimeout(() => { console.error("停止超时，强制退出。"); process.exit(1); }, 30_000);
      api.close().then(() => { clearTimeout(timer); process.exit(0); }, error => { console.error(error.message); process.exit(1); });
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}