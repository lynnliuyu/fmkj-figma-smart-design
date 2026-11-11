---
name: verify-point-map-save
description: "Formally verify the point-map editor's save/draft concurrency: an edit made while a save is in flight must not be lost. Use when changing src/board/core/history.ts, point-map-editor.tsx save()/draft logic, or anything touching savedVersion / version / dirty / draftKey."
---

# Verify point-map save/draft concurrency

## What this guards

The point-map editor lets a user keep editing **while a save is in flight**
(`saving` does not set `readOnly`). The promise is:

> **An edit made during a save is never silently lost.**

That promise is easy to break and hard to test: it depends on the _order_ of a
user edit against a network round-trip, which no unit test naturally covers.

## The rule the model checks

| Rule              | In the reader's words                                             |
| ----------------- | ----------------------------------------------------------------- |
| `DirtyKeepsDraft` | While there is an unsaved edit, the local draft must still exist. |

Why it matters: the draft is what restores work after a crash, a closed tab,
or a lost connection (`point-map-editor.tsx` reads it back on mount and offers
to restore). If the draft disappears while an edit is still unsaved, there is
nothing left to restore.

## Coverage record

| Check covers                  | File                                                                          | Symbol                                 |
| ----------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| version / undo / redo         | `src/board/core/history.ts`                                                   | `useBoardHistory`                      |
| save captures version + scene | `src/app/(frontend)/(workspace)/projects/[id]/point-map/point-map-editor.tsx` | `save` (~line 645)                     |
| draft write (1s debounce)     | same                                                                          | effect at ~line 580                    |
| draft unconditional delete    | same                                                                          | inside `save` success path (~line 667) |
| dirty computation             | same                                                                          | `dirty` (~line 330)                    |
| draft restore on mount        | same                                                                          | effect at ~line 602                    |

**Sync commit:** `53c2863` (2026-11-10)
Move this commit forward **only** after confirming the model still describes the
code at the new commit — walk the table above and re-read each symbol.

## Run it

```sh
SKILL=~/.config/alma/skills/statechart/scripts/statechart
TLA2TOOLS=/tmp/fv-scratch/tlc.jar \
JAVA=/tmp/fv-scratch/jre/jdk-21.0.13+9-jre/Contents/Home/bin/java \
  "$SKILL" verification/point-map-save/Save2.tla --out /tmp/verify-pm-$(date +%s)
```

Tooling notes for this machine:

- There is **no `mise`**, so the skill's auto-install path cannot run. Set
  `TLA2TOOLS` and `JAVA` explicitly (that branch is supported by the skill).
- `tla2tools.jar` came from the GitHub release of `tlaplus/tlaplus`.
- A Temurin JRE 21 unpacks under `/tmp/fv-scratch/jre`. Both are outside the repo
  on purpose — **do not commit tool binaries**.
- `master.tla` module name must match the file name, or SANY aborts.

A run takes a few seconds. Read every result with the pstack `/statechart` skill:
it turns each violation into its shortest path in plain words.

## Reading a result

- The chart draws the shortest path to each broken rule.
- `## Rules not checked` lists rules TLC did not reach (the run stops at the
  100,000-state bound after the first break). A rule that is not checked can
  hold or break — do not report it as passing.
- `TypeOK` breaking means the **model's own bound** is too small, not a product
  bug. Raise the bound in `Save2.tla` and rerun.

## Known result at the sync commit

**The rule breaks. This was confirmed by a controlled experiment, not assumed.**

| Version                    | Draft delete                          | Result                              |
| -------------------------- | ------------------------------------- | ----------------------------------- |
| `Buggy.tla` (today's code) | unconditional                         | `DuringSaveEditSurvives` **breaks** |
| `FixedCase.tla` (proposed) | only when `capturedVersion = version` | **Rules that hold**                 |

Same rule, same model, one changed line — the check flips from broken to holding.
That is the proof this check can fail, which is the only thing that makes it worth
running.

### The counterexample, in the code's words

```
1. 你按下保存            内容 A 发出去，捕获 version=0
2. 保存中你又改了一处     画面变 B，version=1（保存期间画布仍可编辑）
3. 1 秒防抖落盘          草稿 = B              ← 此刻是安全的
4. 服务器返回成功        写盘 A；savedAt=0；**无条件删掉草稿**  ← 保护被移走
```

After step 4: the server holds **A**, the screen shows **B**, and the draft that
held **B** is gone. `dirty` is still true (`savedAt 0 ≠ version 1`), so the UI
still says "未保存" — but the recovery copy is already deleted.

### How bad is it — measured, not guessed

- **Window ≈ 1 second.** The draft effect depends on `currentScene`, and
  `useBoardHistory` returns a fresh object on every render, so the effect re-runs
  each render and rewrites the draft after its 1s debounce. The hole exists only
  between the delete and that rewrite.
- **Closing the tab is still guarded.** `beforeunload` fires while `dirty`, so a
  deliberate close shows the browser's confirm dialog.
- **What is exposed:** a crash, a killed tab, or a dropped connection inside that
  ~1s window — the edit is then in neither the server nor the draft.

Genuine, but low severity. **Do not describe it as data loss on close.**

### The fix

```js
// currently: unconditional
localStorage.removeItem(draftKey(projectId))

// should be: only when the save caught up with the edits
if (board.current.current.version === version) {
  localStorage.removeItem(draftKey(projectId))
}
```

`version` is already captured at the top of `save()` for `setSavedVersion(version)` —
the same value serves both purposes.

## How to rerun

```sh
TLA2TOOLS=/path/to/tla2tools.jar JAVA=/path/to/bin/java \
  bash verification/point-map-save/verify.sh
```

Runs both versions and prints the verdict for each. Takes a few seconds.

## Toolchain notes for this machine

- **No `mise`** — the skill's auto-install path cannot run. Set `TLA2TOOLS` and
  `JAVA` explicitly; the skill supports that branch.
- `tla2tools.jar` came from the `tlaplus/tlaplus` GitHub release.
- A Temurin JRE 21 sits under `/tmp/fv-scratch/jre`. Both live **outside the repo**
  on purpose — never commit tool binaries.
- A TLA+ module name must match its file name or SANY aborts.

## What this does NOT cover

- The real 1-second debounce timing. The model approximates it with a
  `pendingDraft` flag; it has no clock.
- `beforeunload`'s confirm dialog (browser behaviour).
- Multiple tabs on the same project.
- Server-side merge when two saves overlap.
- Geometry, AI generation, quoting — outside the save/draft path.
