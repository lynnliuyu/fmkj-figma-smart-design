# AI Development Runbook

This repository is the active FMKJ v3 workspace.

## Canonical Workspace

- Active local path (macOS): `/Users/noonebook/Documents/ChatGPT/繁梦空间设计站`
- Default branch: `main`
- Local development URL: `http://localhost:3000`
- Source of truth: this local checkout. `origin` is `git@github.com:lynnliuyu/fmkj-v3.git` over SSH (the old `Nooonnneee/fmkj_v3_architecture` remote never existed). `main` tracks `origin/main`; CI runs on push and is green as of `dcd2f5e`. Do not push anywhere else.

Do not start new work in another clone unless the user explicitly asks for a migration.

## Before Every AI Task

Run:

```bash
pnpm run doctor
```

Use `pnpm run doctor` explicitly to execute this repository's `scripts/doctor.mjs`. It checks workspace, Git state, configuration presence and port `3000`; it does not verify database connectivity or ownership of the listening process. `pnpm doctor` invokes pnpm's built-in dependency/environment diagnostic instead and is not a substitute. Confirm the following:

- The current directory is the canonical workspace.
- `.env.local` exists (copy from `.env.local.example` if not).
- `DATABASE_URL` or the split variables are set and non-empty.
- Port `3000` is not owned by another project (`lsof -i :3000`).
- TypeScript passes when the task requires code changes.

The configured Git remote is reported for inspection, not proof that it is the intended issue tracker or push destination. Do not change or push a remote based only on this diagnostic.

If a database check fails, fix `.env.local` first and do not debug product-library code until the connection works. Local database setup is in `docs/local-database.md`.

## Environment Rules

Local secrets live in `.env.local`. They are intentionally ignored by Git.

The product library and admin pages expect a Postgres database. Local development uses the Docker database in `docs/local-database.md` (`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15432/fmkj`, `DATABASE_SSL=false`). Production uses Neon. The app supports either:

- `DATABASE_URL`
- Or the split variables: `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

Empty quoted values such as `DATABASE_URL=""` do not count as configured.

Vercel env pull commands may create files such as `.env.preview.local` or `.env.production.local`. Those files are useful for inspection, but local development still uses `.env.local`.

## Task Hygiene

- One thread should handle one clear task or issue.
- Prefer creating or referencing a GitHub issue for multi-step work.
- Preserve unrelated user changes in the working tree.
- After code edits, run at least `pnpm typecheck`.
- For product, quote, contract, auth, or admin changes, run the focused Vitest tests when available.

## Fixed Design And Delivery Workflow

- DWG / DXF 输入先执行 `pnpm run cad:review`（见 `docs/cadcraft-point-map-bridge.md`），交付完整空间总览、可识别图框逐页 PDF / PNG、可并排查看的 HTML 和来源清单。保留重名旧方案，明确未识别图框与空视口；原始视口的目标坐标和冻结图层必须在每次重开私有副本后恢复，不能把 CADCraft 漏字段导致的空白判断为原图失效；用户选定本次采用的图纸后才清理净底、布点，不先替用户挑一个方案。浏览器图片上传仍只接收 PNG / JPG / WebP，本机 CAD 导出不伪装成网页已支持直接处理 DWG。

Read `plans/021-workbench-workflow-consolidation.md` for scope and acceptance evidence, and ADR 0006/0007 for the accepted quotation and delivery decisions. Domain rules remain in `CONTEXT.md` and `docs/adr/`; operating instructions remain in the corresponding workflow document. The plan records execution status rather than introducing another source of domain rules.

- Distinguish planned, implemented, verified and applied-to-customer-data results. A generated file or passing test does not prove the customer project is ready.
- Show the actual saved draft before moving a customer from floorplan review to device selection or final output. Do not inherit another customer's brands, quantities or prices without an explicit basis.
- Separate a draft preview from an immutable delivery version. State which page was saved, whether quote images were refreshed and which version was exported.
- The user has already decided: default models may be quoted with an explicit unverified label; project model replacement affects only that project; removing sourced quote lines removes their installation points and scene references on save. Do not silently reverse these rules or re-ask them as unresolved choices. Any new semantic change must be called out against ADR 0006.
- Save acknowledgements advance point-map revisions, including surviving quote rows. Keep edits made during an in-flight save. Customer PNG, PDF, CSV and JSON use a fixed delivery version; only the advanced draft-check PNG may use unsaved positions.
- Preserve the existing worktree, IDs, coordinates, saved quote adjustments and historical versions. Do not include unrelated changes in cleanup.

## Current Product Library Notes

The public product library uses `/api/products`.

Expected source order:

1. Postgres/Neon products table when database env is configured.
2. External product HTTP API only if configured.
3. Local fallback products when no real product source is available.

If the page says it is showing local fallback products, the UI is working but the local environment is not connected to the real product database.

## Directory Cleanup

The earlier Windows directory rename plan (`C:\Users\lynnl\...`) no longer applies to this macOS checkout and has been removed. Do not rename or move the workspace unless the user asks for that specific cleanup.
