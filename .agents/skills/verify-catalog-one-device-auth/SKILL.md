---
name: verify-catalog-one-device-auth
description: >-
  Use when changing 一机一密 / official catalog auth or sync — catalog-auth,
  catalog-licenses, /api/catalog/snapshot, /api/catalog/asset, catalog-sync-service
  applyCatalogSync, or CATALOG_PUBLISH_TOKEN / LICENSE_KEY handling. Runs the
  project TLA+ check so unauthorized devices cannot get the official catalog and
  a failed sync cannot rewrite local products.
---

# Verify 一机一密 catalog gate

## Property (plain)

Official catalog bytes leave the publisher only when the env master token matches or an **enabled** device license hash matches. A failed auth or a failed fetch must not rewrite the appliance's local product rows.

**Harm if broken:** an unauthorized or disabled appliance receives the commercial product catalog; or a rejected sync still mutates local products.

## When this applies

Touch any of:

- `lib/catalog-auth.ts` (`authorizeCatalogRequest`)
- `lib/catalog-licenses.ts` (`verifyCatalogLicense`, `recordCatalogLicenseUse`, create/disable)
- `app/api/catalog/snapshot/route.ts`, `app/api/catalog/asset/route.ts`
- `lib/catalog-sync.ts` / `lib/catalog-sync-service.ts` (`fetchCatalogSnapshot`, `applyCatalogSync`)
- Env: `CATALOG_PUBLISH_TOKEN`, `LICENSE_KEY`, `UPSTREAM_*`

If the change is unrelated, stop.

## How to re-run (one command)

From the repo root:

```bash
formal/catalog-one-device-auth/check.sh
```

Exit `0` = every invariant holds. Read the printed `report.md` with pstack `/statechart` (do not invent TLC flags). On pass, `/statechart` also writes `chart.mmd`.

Needs: pstack `statechart` script on `PATH`/`STATECHART`, Java 11+, `tla2tools.jar` 1.7.4 (script installs via `mise` when possible). Tool versions last confirmed with TLC 1.7.4 + Temurin 25.

## What the model is

`formal/catalog-one-device-auth/CatalogOneDeviceAuth.tla` — one step = one indivisible code step:

| Action | Code |
| --- | --- |
| `TurnMasterOn` / `Off` | set/clear `CATALOG_PUBLISH_TOKEN` |
| `CreateLicense` / `DisableLicense` / `EnableLicense` | `createCatalogLicense` / `updateCatalogLicense({enabled})` |
| `PublisherGet` | `authorizeCatalogRequest` + snapshot/asset body only if `ok` |
| `ApplianceSync` | `applyCatalogSync` → `fetchCatalogSnapshot` then apply only on success |

Invariants: `NoUnauthorizedRelease`, `AuthMeansValidCred`, `SyncApplyImpliesRelease`, `DisabledNeverAuth`, `FeatureOffNoRelease`.

**Bounds:** `Devices = {d1}`, `localRev <= 2`. Two-device interference and concurrent HTTP races are out of scope.

**Code quirk modeled (not a leak):** when the env master is unset and the request sends any non-empty Bearer, `authorizeCatalogRequest` skips `hasAnyLicense` and answers `404 CATALOG_PUBLISH_DISABLED` even if enabled licenses exist. Status differs from `401`; body still withheld.

## Tell a real bug from a modeling error

1. Re-read the four covered files at HEAD. Every TLA action/guard must still point at real code.
2. If TLC fails: replay the counterexample as a request sequence (open/close master, create/disable license, GET `/api/catalog/snapshot` with Bearer, run `applyCatalogSync`). If the live code does **not** release bytes / mutate local on that path, the model drifted — fix the model, not the invariant.
3. If live code **does** follow the bad path, report the finding in code terms. Do **not** weaken the invariant or change product code unless the user asks.
4. Ability-to-fail reference: `CatalogOneDeviceAuthBroken.tla` drops the `enabled` check (like removing `and enabled` from `verifyCatalogLicense`). `/statechart` on it must fail `DisabledNeverAuth` (path: create → disable → still fetch). See `report-broken.md`.

## After an intentional change

Update the TLA to match the new promise, re-run `./check.sh`, refresh `chart.mmd`/`report.md` via `/statechart`, then move the **sync commit** below forward only after you confirm the model describes that commit.

## Coverage record

- **Sync commit:** `97d84fdc591a1270549628b9a8233266ad009cd3`
- **Files:** `lib/catalog-auth.ts`, `lib/catalog-licenses.ts`, `app/api/catalog/snapshot/route.ts`, `app/api/catalog/asset/route.ts`, `lib/catalog-sync-service.ts` (`applyCatalogSync`), `lib/catalog-sync.ts` (`fetchCatalogSnapshot`)
- **Not covered:** Ed25519 signature verification, asset path traversal allowlist, import CSV validation, account/session auth, delivery immutability, quote 未核验 labels, concurrent double-fetch races, more than one device constant

Use `/maintain-formal-verification-skill` when covered code changed without rechecking.
