import { PRIVATE_BUILD_TRACE_EXCLUDES } from "./lib/build-artifact-policy.mjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Figma 开发版演示库（lib/demo-db.ts）在运行时加载 WASM，不能被打包。
  serverExternalPackages: ["@electric-sql/pglite"],
  // Dynamic filesystem reads must never carry local customer drawings, backups,
  // credentials or generated installers into the standalone application.
  outputFileTracingExcludes: { "**/*": PRIVATE_BUILD_TRACE_EXCLUDES },
  // Keep middleware's request clone aligned with the point-map API's 32 MiB limit.
  // Multi-floor designs include both engineering and calibrated style backgrounds.
  experimental: {
    proxyClientMaxBodySize: "32mb",
  },
}

export default nextConfig
