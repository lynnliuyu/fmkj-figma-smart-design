import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const makePublicPreviewOrigin = (() => {
  const publicURL = process.env.FIGMA_PUBLIC_URL
  if (!publicURL) return undefined

  try {
    // Next.js expects host[:port] entries rather than full URL origins.
    return new URL(publicURL).host
  } catch {
    return undefined
  }
})()

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    // 2026-11-09：能力中心的 URL 从 /plugins 改名为 /capabilities
    // （侧边栏早就叫「能力中心」了，地址还停在 plugins 名不副实）。
    // 老链接——书签、客户群里的分享、搜索引擎收录——一律 301 到新地址，
    // 用 permanent 让搜索引擎更新索引。
    return [
      { source: '/plugins', destination: '/capabilities', permanent: true },
      { source: '/plugins/:path*', destination: '/capabilities/:path*', permanent: true },
    ]
  },
  async headers() {
    const isFigmaMake = process.env.FIGMA === '1'
    const frameAncestors = isFigmaMake
      ? "frame-ancestors 'self' https://*.figma.com https://figma.com;"
      : "frame-ancestors 'self';"
    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: `default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src 'self' https: wss: ws: data: blob:; worker-src 'self' blob:; ${frameAncestors}`,
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      ...(isFigmaMake
        ? []
        : [
            {
              key: 'X-Frame-Options',
              value: 'SAMEORIGIN',
            },
          ]),
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]
    return [
      {
        // 带版本号（?v=）或文件名固定不变的静态图标：长期缓存
        source:
          '/(brands|brand|ecosystem|point-markers|point-symbols|point-icons|board|fonts|demo-plans)/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Payload 媒体库图片（/api/media/file/...）：1 年强缓存，避免热刷新重复下载十几 MB 原图。
        //
        // ⚠️ 但 `immutable` 有个致命前提：**只有 200 才能这么设**。
        // Next 的 headers() 无法按状态码区分，所以这里**不能再用 immutable**：
        //   2026-11-09 事故 —— Payload 的 /api/media/file 只注册了 GET、没有 HEAD，
        //   任何 HEAD 请求都返回 404；而这个 404 被这条规则套上 `max-age=31536000, immutable`
        //   → 浏览器把 404 缓存一整年且永不重验 → 图片在最前面就断了，`⌘⇧R` 都冲不掉。
        // 改用 `s-maxage`（只约束中间缓存）+ `stale-while-revalidate`：
        // 命中时仍走强缓存，未命中/出错时浏览器会回源确认，404 不会被钉死。
        source: '/api/media/file/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=31536000, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // 方案氛围图与校准场景底图：长效缓存 7 天 + 后台静默更新 30 天
        source: '/proposal/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
  output: 'standalone',
  // standalone 追踪会漏掉 strtok3 的入口（file-type 动态加载），导致本地存储的图片读取报 500。
  outputFileTracingIncludes: {
    '/**/*': [
      './node_modules/.pnpm/strtok3@*/node_modules/strtok3/**',
      './node_modules/.pnpm/file-type@*/node_modules/file-type/**',
    ],
  },
  images: {
    loader: 'custom',
    loaderFile: './figma-image-loader.ts',
  },
  // Don't block publishing or preview deploys on errors if the emitted JS is valid
  typescript: {
    ignoreBuildErrors: true,
  },
  // `next dev` serves the Make preview at a per-sandbox cross-origin host. Next
  // blocks its dev resources (`/_next/*`, HMR WebSocket, internal endpoints)
  // unless the origin is listed here, and a blocked HMR socket stalls Turbopack
  // so the Payload `/admin` panel renders blank in the preview iframe.
  // Dev-only - ignored by `next build`.
  //
  // 回环地址必须显式列出：用 `127.0.0.1:3000` 打开页面时 host 与 dev server 绑定的
  // `localhost` 不同源，客户端脚本会被拦——症状是页面**看起来正常但完全没交互**
  // （按钮点不动、Tab 切不了、客户端路由退化成整页刷新），控制台只有一条 WebSocket
  // 握手失败。生产构建不受此设置影响。
  // 只写 host，不带端口——带端口的条目 Next 不认，仍会拦。
  allowedDevOrigins: [
    ...(makePublicPreviewOrigin ? [makePublicPreviewOrigin] : []),
    'localhost',
    '127.0.0.1',
    '[::1]',
  ],
  // Prerender source maps add ~100 MB per static build worker
  enablePrerenderSourceMaps: false,
  experimental: {
    // 前台与 Payload 后台是两套根布局：未匹配的网址用 app/global-not-found.tsx 返回中文 404
    globalNotFound: true,
    optimizePackageImports: ['lucide-react', 'radix-ui'],
    // Caps static build workers (~250-380 MB each) to lower `next build` peak memory
    cpus: 2,
    // Payload Admin uses Next Server Actions. In the Make preview proxy, the
    // browser origin is the public sandbox host while `x-forwarded-host` points
    // at the local dev server. Allow only that exact platform-provisioned host.
    serverActions: {
      allowedOrigins: makePublicPreviewOrigin ? [makePublicPreviewOrigin] : [],
    },
  },
  env: {
    NEXT_PUBLIC_SITE_URL:
      process.env.FIGMA_PUBLIC_URL || process.env.PUBLIC_URL || 'http://localhost:3000',
    // NOTE: Do not add FIGMA_OAUTH_CLIENT_SECRET, FIGMA_CONTENT_API_ACCESS_KEY,
    // or any other credential here. Values placed in `env` are inlined into
    // the JavaScript bundle by Next.js at build time and become readable by
    // anyone who can load the app's client assets. Server-side code
    // (payload.config.ts, route handlers, server components) can still read
    // these values from `process.env.*` without declaring them here. Only
    // public, non-secret values that explicitly need to be available in
    // browser code should be added - and those should use the `NEXT_PUBLIC_*`
    // naming convention.
    FIGMA_CONTENT_API_CONTENT_SYSTEM_ID: process.env.FIGMA_CONTENT_API_CONTENT_SYSTEM_ID,
    FIGMA_CONTENT_API_URL: process.env.FIGMA_CONTENT_API_URL,
    FIGMA_OAUTH_CLIENT_ID: process.env.FIGMA_OAUTH_CLIENT_ID,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
