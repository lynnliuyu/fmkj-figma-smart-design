# next-app

React + Next.js + Payload + Tailwind CSS project running inside Figma Make.

This file is supplied as project instructions at the start of each task. Do not
reread it before opening source. Always load the `payload-framework` skill.
Load `nextjs-docs` when the task involves routing, pages,
components, caching, images, or metadata, not for schema-only, data-only, or style-only changes.
Load `payload-content` before changing data.

For frontend work, keep a **Verify production delivery** todo pending until all
of these are done:

- Preview every requested route and fix every runtime or build error. Server
  Components cannot contain event handlers; use CSS interaction or a Client
  Component boundary.
- When a Client Component calls a Server Action inside `useTransition`, keep
  `revalidatePath` out of the action. Return a serializable result and call
  `router.refresh()` in the client after success.
- Run `figma make verify-deploy`, inspect its production route table, and visit
  every generated public route. `verify-bootstrap` and source inspection are
  not substitutes.
- Keep fixed pages static. Choose one content lifecycle before implementing
  dynamic routes; do not combine these contracts:
  - For an intentional build-time snapshot, use build-time reads without
    on-write revalidation and warn that Admin edits require another **Publish**.
  - For content that must stay fresh after Publish, add cached list/detail reads
    and collection hooks immediately after the schema, before building UI.
    Invalidate the list plus both the previous and current route keys on every
    write (for example, `previousDoc.slug` and `doc.slug` after a slug change),
    and invalidate affected pages when related media changes. Then prove a
    unique published edit appears in a fresh production request. A revalidation
    interval is not a substitute for these hooks.

For page-level static generation or ISR, do not complete the final delivery
todo while `verify-deploy` marks a requested public route as `ƒ (Dynamic)`.
Repair the caching setup and rerun verification; a successful build or HTTP 200
does not override the route table.

For CMS-managed images, pass the Payload upload `url` (`media.url`) to
`next/image`. Keep this template's custom loader (`figma-image-loader.ts`).
Do not add a same-origin `/media/[id]` proxy; those routes 404 after
Publish. The loader adds sizing parameters to relative Payload
`/api/<collection>/file/...` URLs and passes other `src` values through, so
`images.remotePatterns` is not needed. Verify nonzero image dimensions in
every requested view, including after replacing an upload. When publishing
is requested, verify images on the published site as well as in preview.

## Payload Data Integrity

For user-facing mutations, validate and allowlist every submitted field on the
server and return structured errors the UI can display. Grant anonymous create
only through narrow collection access, and protect server-owned workflow fields
with field-level `create` and `update` access. Enforce relationship eligibility
and other durable invariants at the collection boundary, not only in a Server
Action.

Preserve the document ID type generated in `payload-types.ts`; do not assume IDs
are numeric. User-facing Local API calls must set `overrideAccess: false` and
pass the authenticated `user` when one exists.

When an installed official plugin owns a requested capability, configure it and
consume its canonical fields instead of recreating them. For SEO social images,
use the plugin's upload-collection option and read its generated image field.

Model content images as upload relationships to the existing Media collection.
Seed remote starter files through `externalURL` so later uploads use the same
relationship; do not add parallel URL fields or hardcoded frontend image data.

## Development Server

A Next.js development server is **always running** on `$PORT` (default 3000).
You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This project uses Next.js route groups to separate the frontend app from the
Payload admin/API routes:

- `src/app/(frontend)/` - Your application pages
- `src/app/(payload)/` - Payload CMS admin panel and API routes (do not modify)
- `src/collections/` - Payload data collection definitions
- `src/globals/` - Payload CMS globals, if needed
- `src/payload.config.ts` - Payload configuration
- `src/payload-types.ts` - Auto-generated TypeScript types

## Key Files

- `src/app/(frontend)/layout.tsx` - Root layout component
- `src/app/(frontend)/page.tsx` - Home page component
- `src/app/(frontend)/not-found.tsx` - Custom not-found page for missing routes/records
- `src/app/(frontend)/styles.css` - Global styles and Tailwind CSS import
- `src/lib/payload.ts` - Shared Payload utilities (findBySlug, findByField)
- `src/payload.config.ts` - Payload config (collections, plugins, etc.)
- `next.config.ts` - Next.js configuration (includes Payload wrapper)
- `package.json` - Dependencies and scripts
- `.mise.toml` - Toolchain versions (Node.js, pnpm)
- `.figma/make/*` - Lifecycle scripts (install, dev, deploy, deploy-preview, verify)

## Styling

This project uses **Tailwind CSS v4** for frontend styling. Tailwind and its
PostCSS plugin are already installed and configured, and Tailwind is loaded by
the `@import "tailwindcss"` directive in `src/app/(frontend)/styles.css`.

Use Tailwind utility classes directly in JSX for application UI. Keep
`styles.css` for the Tailwind import, shared theme tokens, and truly global base
styles; do not default to inline style objects, CSS-in-JS, or hand-written
component classes when Tailwind utilities express the same design. If a Make Kit
or design-system package is installed, its components, tokens, and Tailwind
setup take precedence over generic utilities.

## Data/Backend Decision

Use the lightest stack that satisfies the request:

- Static UI, local browser state, games, or offline tools: no backend.
- Server-side compute, secrets, OAuth, email, webhooks, or third-party API calls
  without durable local data: Next.js server components, server actions, or route
  handlers.
- Durable records, admin-managed content/data, uploads, users, bookings,
  inventory, saved preferences, or data that persists across devices/sessions:
  Payload.
- Explicit Supabase request: use the Supabase flow instead of Payload.
- Durable data plus integrations: Payload for records; Next.js server runtime and
  environment variables for the integration.

Payload is this template's durable data, admin, auth, and content layer. Use it
for structured app data, not only editorial CMS content.

## Figma-Managed Payload Rules

> **现状（2026-11，先读这一段）**：本仓库已实质迁到**自托管 Postgres**。
> `src/payload.config.ts:1` 现在只有 `export { default } from './payload.selfhost.config'`；
> `src/payload.selfhost.config.ts:152-158` 直接调用 `buildConfig()`，并用
> `postgresAdapter()` 连接 `DATABASE_URI`。因此，下面「Figma 托管时代」的规则
> （不要加 `db`、不要加 Postgres/SQLite adapter、不要写 migration、必须用
> `buildFigmaConfig()`）**只适用于旧配置 / Figma Make 模板**，不是当前自托管配置的约束。
>
> 真正仍然有效的红线：不硬编码密钥或占位 secret，不提交 `.env`、客户数据或数据库导出，
> 不直接推 main，不跳过 CI。下方「Secrets And Environment Variables」与文末
> 「团队协作与自动化」章节继续有效。

This is not a vanilla self-hosted Payload project. Figma Cloud provides the
database, auth integration, file storage, deployment runtime, and platform
secrets through `@payloadcms/figma`.

Package-level `@payloadcms/figma` internals are platform-owned and may not be
present in this generated app workspace. Do not inspect, duplicate, or
reinterpret bootstrap/env/OAuth behavior in app code. Keep those internals intact
and follow the Make-specific rules below.

Use `buildFigmaConfig()` in `src/payload.config.ts`. Do not replace it with
Payload's raw `buildConfig()`.

Do not add or configure:

- `db`
- `secret`
- default `editor`
- Mongo/Postgres/SQLite/database adapter packages
- OAuth/auth plugins for Payload Admin Panel auth
- cloud-storage plugins for normal uploads
- migration files, DDL, local database setup, or connection-string instructions

If a shell command complains about missing Payload/Figma backend env vars, first
check whether you are running outside the Make lifecycle/dev-server environment.
Do not hard-code dummy secrets, run `@payloadcms/figma init`, or ask the user to
provide platform-owned values.

## Secrets And Environment Variables

Payload/Figma backend env vars and secrets are platform-owned. In generated Make
apps, do not ask the user to provide these values, hard-code placeholders, add
dummy values, or expose them in client code.

For third-party integrations, collect API keys, client secrets, and tokens with
the Make environment-variable card flow, then reference them from server-only
code as `process.env.*`. Secret-backed integrations should live in server
components, server actions, or route handlers.

Do not ask users to paste secret values into ordinary chat, code, comments, or
docs. Do not print, log, summarize, or expose secret values. Treat saved
environment variable values as write-only: you can reference variable names in
code, but you should not try to reveal existing values. Add, replace, or delete
user-provided environment variables only when the user explicitly asks for
secret or integration setup.

Do not put private values in Payload documents, static data, rendered props,
browser components, or public client environment variables. In Next.js,
`NEXT_PUBLIC_*` values can be bundled into browser code; in Vite, `VITE_*`
values can be bundled into browser code. Use public prefixes only for
configuration that is intentionally public, and warn the user if a sensitive key
appears to use a public prefix.

## Payload Data Intent

This template already includes Payload, but do not create placeholder
collections just because Payload is present. Add collections or globals only when
the user needs durable application data, admin-managed records, auth-backed
accounts, uploads, or editable content.

Server routes are for stateless compute/proxying. If a route creates, updates,
lists, or stores user/domain records, model those records in Payload.

## Auth Modeling

Keep three authorization concerns distinct:

- Figma/Make access controls who can view or edit the Make file.
- Payload Admin auth controls who can manage CMS/admin content.
- Generated app auth controls who can log into the published app.

This template starts with only the `admins` auth collection. It is configured as
`admin.user` and is exclusively for CMS editors using Figma SSO. Public visitors
remain unauthenticated unless the user asks for app login.

When the user requests public signup, login, profiles, or user-owned data, create
an auth-enabled `Users` collection with slug `users`, register it in
`src/payload.config.ts`, and use it for app accounts and ownership relationships.
Never use `Admins` for public signup or grant app users Payload Admin access.

Do not use generated app auth to grant Payload Admin access, and do not use
Payload Admin users for public app signup. Payload Admin auth is
platform/control-plane behavior and may use Figma SSO and/or Payload-native auth.
Do not build or modify Payload Admin login unless the user explicitly asks for
CMS/admin access behavior.
If the request is about `/admin`, CMS editors, or who can manage content, work
with the existing Payload Admin / `@payloadcms/figma` / platform-owned admin
auth setup instead of adding generated app login.

When implementing app login, signup, account management, roles, protected pages,
email/password auth, OAuth, Google sign-in, magic links, or custom app auth, use
the `payload-auth` skill before editing auth code.

Do not create custom password/session handling from scratch. Do not use Payload
Enterprise auth plugin code, and do not copy or recreate it. For generated app
OAuth or custom providers, prefer the public `payload-auth` framework when it is
compatible with the project. Do not hand-roll Google/OAuth as the default
implementation. Do not use `@payloadcms/figma` CLI OAuth, Figma/Payload
control-plane OAuth, or Payload Admin OAuth as public app login. If
`payload-auth` is unavailable and the user explicitly requires OAuth, use a
vetted server-side auth/OIDC framework and bridge the result to Payload app-user
records. Keep provider secrets server-side.

For Payload-backed apps, create collections/globals, connect frontend pages to
Payload queries, and seed real Payload documents when starter data is needed. Use
the Payload CLI. Static arrays are acceptable only for pure UI mock data with no
persistence/admin requirement.

Add explicit `access` rules for collections that contain private, user-submitted,
staff-only, or operational records. Public forms may create records when the app
requires submissions, but public users should not be able to list, read, update,
or delete private submissions by default. Do not rely on implicit Payload access
defaults for contact details, internal notes, user-owned records, orders,
bookings, messages, or similar app data.

## Payload Implementation Workflow

When adding Payload-backed functionality:

1. Inspect the existing `src/payload.config.ts`, `src/collections/`, and
   frontend routes before changing code.
2. Use the `payload-data-modeling` skill before adding or changing collections,
   globals, fields, relationships, constraints, ownership, access rules, seeds,
   or starter data.
3. Add or update collection/global definitions under `src/collections/` or
   `src/globals/`.
4. Register them in the existing `collections` or `globals` arrays in
   `src/payload.config.ts`. Keep the config shape intact. Keep the built-in
   Admins and Media collections. Add Users only when the app needs public
   accounts, as described under Auth Modeling.
5. Payload regenerates `src/payload-types.ts` automatically from the configured
   `typescript.outputFile`; do not manually regenerate types during Make work.
6. Do not run `generate:importmap` after routine changes. In Payload 4.0,
   development HMR regenerates the import map automatically, and `payload build`
   regenerates it before running `next build`. Run the command manually only to
   recover from a missing or stale import map, an import map generation error,
   or an environment where HMR and `payload build` are unavailable.
7. Query Payload from server components/routes with `getPayload({ config })`.
8. Keep user-facing pages in `src/app/(frontend)/`.
9. Do not directly edit `src/app/(payload)/`; it is managed by Payload.

Once the backend is connected, use the Payload data tooling this environment
provides for data/content CRUD and seeding instead of writing raw database
access, REST helpers, or one-off seed scripts. The `payload-content` skill is
authoritative for which mechanism to use; invoke it and follow it rather than
assuming a mechanism. Confirm that tooling can reach the current schema before
planning or promising seeding work. If it cannot yet, keep frontend queries
wired to Payload, explain the limitation, and do not replace durable data with
static arrays.

When the user asks to inspect, create, seed, migrate, normalize, bulk-update,
update, or delete Payload documents/globals in a follow-up request, use the
`payload-content` skill before taking action. Do not try Payload REST endpoints,
app API routes, temporary migration endpoints, temporary scripts, or Local API
code first. If the data tooling that skill documents is unavailable after
listing/refreshing tools, report that limitation instead of inventing a second
mutation path.
For data-only follow-up requests, do not modify app source code unless the user
also asks for schema, UI, or behavior changes.

Before finishing Payload work, verify:

- schema is registered in `src/payload.config.ts`;
- `src/payload-types.ts` is left to Payload's automatic regeneration, and import
  maps were regenerated when needed;
- frontend routes query Payload instead of durable static arrays;
- starter documents were seeded through the Payload data tooling when it was
  available, or unavailable tooling was reported without adding static fallback
  data;
- user-facing pages stayed under `src/app/(frontend)/`;
- `src/app/(payload)/` was not directly edited; and
- the fastest relevant typecheck/build was attempted.

If checks fail because platform backend env vars are unavailable in an ordinary
shell, do not remove Payload, add dummy env vars, or rewrite config. Report the
command/context limitation and keep the app wired to Payload.

## Data Modeling Quality

- Model the user's actual domain, not generic `items`.
- When changing an existing model, especially converting primitive fields or
  static data into relationships, use `payload-data-modeling` to plan what
  happens to existing records before editing schema or mutating documents.
- Public detail records usually need a unique indexed `slug` and slug routes
  such as `/blog/[slug]`, `/products/[slug]`, or `/menu/[slug]`. Use
  `findBySlug()` from `src/lib/payload.ts` for all slug lookups and call
  `notFound()` when no document exists. Do not duplicate lookup queries inline
  in each route file.
- Prefer relationships for domain concepts that users manage independently, such
  as events to speakers, products to categories, or bookings to services.
- For appointment or booking products, model services, staff/resources,
  availability/slots, bookings, users, and waitlists separately when the request
  calls for that detail.
- CMS-managed images usually use upload fields related to `media`, such as hero
  images and author portraits.
- For versions, drafts, `_status`, and domain status fields, follow
  `payload-framework`'s lifecycle decision and use `payload-data-modeling`; do
  not apply editorial CMS defaults to all durable application data.
- Render useful empty states when Payload returns no documents, avoid crashing on
  missing optional media/relationships, and handle missing slug records with
  `notFound()`.
- Organize the admin sidebar cleanly and avoid noisy or arbitrary sidebar fields.
- Add page/block structure management only when the user asks for CMS-managed
  pages or blocks.

## Schema Safety

Before changing existing Payload schema, classify the change:

- Greenfield: additive schema creation and starter seeds may proceed.
- Existing/follow-up: optional fields, new collections, and new relationships
  can usually proceed with a concise preview.
- Pause for confirmation: deletes, renames, type changes, `required` or `unique`
  constraints, relationship cardinality changes, bulk document updates, and
  content deletes.

Treat follow-up requests after an app/schema has been created as existing-app
edits, even when they arrive in the same chat session. Do not edit files or run
Payload document mutations for destructive or ambiguous changes until the user
confirms.

Route that confirmation through `ask_user_question` before any potentially
destructive schema edit or document mutation. Use an operation-specific question,
put the affected fields/documents, data-loss or invalidation risk, and
preservation or migration plan in the explanation, and pass exactly
`options: ["Yes", "No"]` with `multiSelect: false`. The UI automatically adds
"Add a custom response" as the third option. End the turn after the tool call and
wait for the user's answer before proceeding.

- Schema evolution should preserve existing data meaning or explicitly handle
  ambiguity. Use `payload-data-modeling` for the transition plan before changing
  fields, relationships, constraints, ownership, or starter data.
- Adding `required`, `unique`, validation ranges, changing relationship
  cardinality, or changing field types should check existing documents when
  possible and require confirmation if existing data may fail validation or be
  orphaned.
- Direct wording like "delete this field" or "make this required" does not
  override schema safety. For example, deleting a `slug` field must warn about
  affected `[slug]` routes, links, queries, and existing document values before
  proceeding.
- Do not make a destructive request appear safe by silently changing routes,
  queries, or seed data to avoid the risk. Pause first, explain the impact, and
  wait for confirmation.

Make code/version history and Payload document data are separate. Rolling back
code does not roll back Payload data.

## Routing

Frontend pages live in `src/app/(frontend)/`. Pages are defined by creating
`page.tsx` files:

- `src/app/(frontend)/page.tsx` - `/`
- `src/app/(frontend)/about/page.tsx` - `/about`
- `src/app/(frontend)/blog/[slug]/page.tsx` - `/blog/:slug`

The Payload admin panel is available at `/admin`.

### Slug Routes and Not-Found Handling

When creating dynamic routes for Payload content (articles, products, etc.),
use the shared `findBySlug()` utility from `src/lib/payload.ts` instead of
writing the Payload query inline:

```tsx
import { findBySlug } from '@/lib/payload'
import { notFound } from 'next/navigation'

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await findBySlug('articles', slug)
  if (!article) notFound()
  return <Article data={article} />
}
```

This pattern:

- Defines slug lookup logic once in `src/lib/payload.ts`, reusable by all routes
- Handles published vs draft visibility through the `draft` option
- Calls `notFound()` to render `src/app/(frontend)/not-found.tsx` when missing
- Avoids duplicating query logic across route files

When adding a new collection with a slug field, reuse `findBySlug()` in the new
route instead of copying the query. When the routing field changes (e.g. from
`slug` to `title` or `handle`), use `findByField()` and update all affected
routes to use the new field name—do not leave stale queries referencing the old
field.

## Preview/Proxy Configuration

Keep the Make preview origin configuration in `next.config.ts` intact. The
template uses the exact platform-provisioned preview host from
`FIGMA_PUBLIC_URL` for both `allowedDevOrigins` and
`experimental.serverActions.allowedOrigins`.

If Payload Admin logs `Invalid Server Actions request` with an
`x-forwarded-host`/`origin` mismatch, treat it as preview proxy configuration
first. Do not rewrite Payload Admin routes, disable Server Actions, or replace
Payload internals to work around it.

## Figma Make Scripts

These scripts are called by sboxd to manage the project lifecycle:

- `.figma/make/install` - Install project dependencies (`pnpm install`)
- `.figma/make/dev` - Start the dev server (`next dev --port $PORT --hostname 0.0.0.0`)
- `.figma/make/deploy` - Build, upload, finalize, and report completion through `figma make deploy`
- `.figma/make/deploy-preview` - Build the platform-provided cached preview;
  keep its `.next`/`nextjs` contract intact and delegate packaging/upload
  through `figma make deploy-preview`

Do **not** remove or rename these scripts. They must remain executable.

## Environment Variables

These are injected by sboxd at runtime:

- `FIGMA` - Set to `"1"` when running inside sboxd
- `PORT` - The port to listen on (passed to `next dev` via the dev script)
- `FIGMA_PUBLIC_URL` - The public URL of the site
- `FIGMA_SITE_NAME` - The human-readable site name
- `FIGMA_SITE_DESCRIPTION` - Short site description
- `FIGMA_ASSETS_PATH` - Directory where exported Figma assets are written
- `FIGMA_FAVICON_PATH` - Path to the exported favicon
- `FIGMA_PREVIEW_IMAGE_PATH` - Path to the OG/social preview image
- `FIGMA_PREVIEW_OAUTH_REDIRECT_URI` - Register verbatim with the provider; see `payload-auth`
- `FIGMA_PREVIEW_OAUTH_STATE_PREFIX` - Prefix the app's OAuth `state`; see `payload-auth`

Payload/Figma Cloud backend env vars are injected into the Make lifecycle
environment for connected Payload projects. They are platform-owned; do not ask
the user to provide them manually. If they are absent in an interactive shell,
treat that as an execution-context limitation before changing app code.

## File Writing

When writing multiple files, parallelize independent Write calls in a single
response. Files are independent when none depends on another's output at write
time. Batch by dependency layer — don't write files one at a time.

## Important

- The dev server must listen on `$PORT` - do not hardcode a port
- Use `pnpm install` to add new dependencies
- Do not modify files under `src/app/(payload)/` - they are managed by Payload
- Toolchain versions are managed by `.mise.toml`, not installed manually
- This template is Next.js App Router + React 19 + Payload + Tailwind CSS v4;
  check `package.json` before adding or using other dependencies.
- This template already sets `images.loader: 'custom'` via
  `figma-image-loader.ts`. Pass Payload `media.url` to `next/image`. Do not
  add `images.remotePatterns` or a same-origin `/media/[id]` proxy, and do
  not replace the Figma loader.

---

## 团队协作与自动化（Alma / 多 Agent 交接）

本仓库允许人类开发者 + 多个 AI Agent 共同开发。所有接手方**先把下面几份文档读完**再动代码：

- `PROJECT-ARCHITECTURE.md` — 架构与产品规划基线。**架构变更必须先写提案、经 noone 批准，才能改代码。**
- `AUTOMATION-TEAM.md` — 自动化维护团队规划（角色、分级、红线）。
- `AGENTS.md`（本文件）— 构建、测试、约定。

### 仓库优先，不绑定工具

所有上下文放仓库，不依赖任何聊天记录：

```text
AGENTS.md                  构建、测试、约定、红线
PROJECT-ARCHITECTURE.md    架构与审批规则
AUTOMATION-TEAM.md         自动化团队规则
HEARTBEAT.md               巡检清单（心跳任务读它）
GitHub Issues              任务队列
Pull Requests              代码交接
memory/learnings.jsonl     经验记忆（append-only）
```

换任何 Agent（GrokBot、codex、Claude Code……）都能接手。

### 红线

```text
不直接推 main —— 一律走分支 + PR
不跳过 CI
不改架构而不写提案
不碰生产密钥 / .env / 客户数据 / 数据库导出
不同时多人改同一文件
```

### 本地校验（提交前必须全过，与 CI 一致）

```bash
pnpm exec tsc --noEmit        # 类型检查
pnpm run knowledge:check      # 领域知识库回归
# 生产构建（复刻 Dockerfile，用占位环境变量，不连库）：
PAYLOAD_CONFIG_PATH=src/payload.selfhost.config.ts \
PAYLOAD_SECRET=ci-build-placeholder-not-for-runtime \
DATABASE_URI=postgres://fmkj:build-only@127.0.0.1:5432/fmkj \
PUBLIC_URL=http://localhost:3000 \
  sh -c 'printf "export { default } from '"'"'./payload.selfhost.config'"'"'\n" > src/payload.config.ts && pnpm exec payload generate:importmap && pnpm build'
```

> 注意：`generate:importmap` / `payload build` 默认读 `src/payload.config.ts`（Figma Make 版，需 `FIGMA_EID`）。
> 本地或 CI 构建要走自托管配置。Dockerfile 的做法是**构建期把 `src/payload.config.ts` 覆盖成**
> `export { default } from './payload.selfhost.config'`，跑完记得 `git checkout -- src/payload.config.ts` 还原。

### 交接协议（Agent 之间）

在 Issue 里写清楚，别依赖聊天记录：

```text
已完成
当前分支
下一步
卡在哪里
标记 needs-local   （单积分用完 / 要让本地 Agent 接手时）
```

接手方：读 Issue → 切到同一分支 → 继续做 → 开 PR。**不重做一遍。**

### 团队与协作（Alma 编排）

本项目由一支 managed agent 团队推进，Alma 是编排者：

```text
Alma(主控) ──> fmkj-builder     改代码，跑本地验证(tsc/knowledge:check/build)，交回
           ──> fmkj-reviewer    独立复跑证据，核对交付是否真成立、有无越界（只读）
           ──> developer        通用编码活（无项目特化时用）
           ──> researcher       查证现状 / 方案对比
           ──> designer         交互与视觉方向
           ──> product-manager  需求拆解 / 验收标准
           ──> operator         Alma 运行时配置 / provider
```

铁律：

- **开发与验收分离**：谁写的代码，就不能由谁来宣布「通过」。改动完成后交 `fmkj-reviewer` 独立跑证据。
- **agent 的汇报是「声明」，不是「结论」**：tsc / build / grep 必须有人真跑过才算数（主控或 reviewer）。
- **架构变更不派给 agent 直接做**：碰模块边界 / 数据模型 / 权限 / 插件归属 / 模板体系的，
  先按 §0.1 写提案等 owner 批准；agent 遇到这类改动应停下来报告，不许擅自改。
- 重活拆成**文件组互不重叠**的并行 agent，各自只对自己文件负责。

### 派单模板（每单默认写死，不用现写）

派实现或验收子代理时，任务提示末尾固定附这四条。2026-11-21 两轮越界之后定的：
某实现代理把证据写进了别的 PR 目录、覆盖了别人 `REPORT.md`、擅自改写 PR 正文塞进未复核的百分比、
还删了已登记到 #199 的死代码；同轮验收员又对平台共享 Postgres 做了 `alter system` 探针（虽即时 reset）；
随后又有验收把共享 55432 实例停掉未恢复，导致后续任务连不上库。

```text
1) 证据目录只写 <日期>/<本 PR 号>/…，写任何别人的 PR 号目录即越界。
   报告首行必须声明：验收 SHA=…、证据目录=…、目录与我的 PR 号一致：是/否。
2) 不许改 PR 正文里没被要求改的部分，尤其不许塞未经独立复核的数字或百分比。
   PR 正文只由该 PR 的实现者或调度台改。
3) 不许顺手删登记在别的工单里的代码（死代码、清理项）。发现就报告，不改。
4) 验收/测试环境必须用**自己的**数据库实例或独立集群（独立 datadir、独立端口）。
   共享实例（如本机 55432 开发库）**只读，且不得启动 / 停止 / 重启** —— 只有它的 owner 能启停；
   发现它没有运行也只报告，不要替它拉起。
   维护备注：共享库由 owner（项目会话）负责保持可用。依赖该库的 CI 在冒烟前自行探测，必要时由 CI 启动已有实例。
   禁止对共享实例执行任何写操作，包括 ALTER SYSTEM 以及随后的 reset ——「改了就是改了」，即便立即还原也算越界。
   报告里声明「未读改启停共享实例：是/否」。
```

对应的验收口径也一并固定：

- 验收员**自己重测**被引用的数字（查询次数、耗时、尺寸），不采信 PR 正文；
- 性能类结论在本机高负载下只写「有无可测收益」，不写百分比提速；
- 证据截图用整页或带足够界面上下文，元素级裁剪只能作补充；
- 原始计数容易抖（客户端轮询、后台刷新），**优先给去重后的集合/摘要**，并说明抖动来源。

### 共享结构改动：先自量全部实例

改表格、列宽、公共组件这类**一处改、多处显**的结构时，第一版提交前必须自己量**全部受影响的实例**
（有几张表就量几张、有几个页面就量几个），每处都记录末列/整行宽度与整体宽度，再推 PR。

窄范围验收只能确认「已发现的问题修好了」，它不负责替你找「还有哪张没量」。
2026-11-21 #207 的教训：只量了客户表末列就推修复，漏掉 AI 会话表被长文本撑到 1782px（原生 965px），多返工一轮。

### 阶段与自主范围（Alma）

Alma 在两种阶段里有不同的自主度，**判定由 Alma 自己完成**：

```text
有「新功能 / 新插件」提出，且未达 noone 完全认可  →  开发阶段（自主度高）
否则                                            →  维护阶段（常规自主）
```

- **开发阶段**：自己从 PLAN.md / 代码缺口挑任务并排序；可做相关改进（顺手修 bug、补测试、加 CI）；
  连续推 PR 不必每步回报。**但「做成什么样算好」必须问 noone，不能自己定标准验收自己。**
- **维护阶段**：以明确请求为主，不主动扩张范围；实现细节仍自决，不必事事请示。
- 两个阶段都不变：**架构变更先写提案等批**（见 §红线）。

完整规则见 [`PHASES.md`](./PHASES.md)。

<!-- ASTRYX:START -->

Astryx v0.7.11 · 174 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:

1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
   Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
   Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:

- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then Tailwind utilities backed by tokens. No raw hex/px.
- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded/arbitrary value (bg-[#fff], p-[13px]) with the component or a token-backed utility.

`astryx help` lists every command. Key ones beyond the workflow:
search "<query>" find any component / hook / doc / template
discover <words> integrations you could add
docs <topic> getting-started, principles, tokens, theme … (`astryx docs` lists all)
docs cli commands and API reference
docs authoring build an integration package, and every field it holds
upgrade --from <old version> --apply run after a dependency bump
<!-- ASTRYX:END -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
