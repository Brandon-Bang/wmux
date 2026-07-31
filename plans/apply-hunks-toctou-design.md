# Hunk adoption must apply the diff the user actually saw (TOCTOU)

Status: design → implementation (single PR, contract change is backward compatible
at the wire level, breaking at the TypeScript level — see §6).

Scope: `diff:applyHunks` (`src/main/ipc/handlers/diff.handler.ts`), the shared
contract in `src/shared/diffParse.ts`, and the one renderer caller
(`src/renderer/components/Diff/DiffPanel.tsx`).

## 1. The defect

`applyHunks` re-runs `readDiff` at apply time (`diff.handler.ts:325`) and maps the
user's selection onto that *fresh* result by `(path, positional hunk index)`
(`:331-334`). Nothing ties the fresh result to the diff the user was looking at
when they ticked the checkboxes. Three silent failure paths follow:

1. **Wrong hunk applied.** The worktree changed between read and apply, hunks
   split/merged/reordered, and index `1` now means a different hunk. The patch is
   assembled from the new bytes and applied without a word.
2. **Silent partial adoption — missing path.** `:332` (`if (!idxs) continue`, plus
   the `read.files` loop only visiting paths that still exist) skips a selected
   path that has left the diff. As long as one selected file survives,
   `selectedFiles.length > 0` and the apply proceeds with a subset.
3. **Silent partial adoption — missing hunk.** `diffParse.ts:289`
   (`if (!hunk) continue`) drops an out-of-range hunk index inside
   `reassembleFile`, so a selection of 3 hunks can apply as 2.

The target-side gates (drift / dirty / probe) do not cover any of this: they all
describe the *target repo*, never the *source diff*. `git apply` being
all-or-nothing does not help either — the patch itself is already the wrong
patch by the time git sees it.

This is not an edge case. The headline journey is a fan-out where agents keep
writing to their worktrees while the human reviews the diff, which is exactly
"the source changes between read and apply".

Adjacent instance of the same bug, fixed by the same gate: `DiffPanel.load()`
does not clear `selection` state, so a Reload (or the automatic reload after a
successful adopt) leaves positional indices pointing into a newly-parsed file
list.

## 2. Invariant

> An adoption either applies exactly the bytes the user reviewed, or it applies
> nothing and says why.

No partial application, ever — not per file, not per hunk.

## 3. What gets snapshotted

**Per-file adoption fingerprint**, carried on each file of the `diff:read`
result and echoed back with each selection.

The fingerprint covers everything that determines the patch bytes reassembled
from that file entry, plus everything the index resolution depends on:

| Field | Why |
| --- | --- |
| `path` | identity used for selection matching and the dirty gate |
| `kind`, `hunkSelectable` | adoptability class the user saw (a file that crossed the size cap flips `hunkSelectable`, so the flip is caught) |
| `headerBlock` | reattached verbatim into the patch |
| every hunk's `header` + `bodyLines` | the patch body; *all* hunks, not just the selected ones, because a selection is a positional index into this list |

Explicitly **not** covered: `snapshot.targetDirtyFiles`, `numstat`, and the read
result as a whole.

Rejected alternatives:

- **Digest the whole read result.** Strictly safer, but any concurrent write to
  *any* file in the worktree would reject an adoption of an untouched file — in
  the fan-out journey that is most of the time. The per-file digest already
  proves "the bytes about to be applied are the bytes you saw"; whole-read
  equality proves nothing extra about them.
- **Digest only the selected hunks.** Insufficient: hunk indices are positional,
  so index resolution depends on the whole hunk list of the file.
- **Send the source bytes back for comparison.** Correct but wasteful (up to
  512 KB per file over IPC); a hash is the same guarantee.

Digest = `sha256(canonical serialization)`, hex. The canonical serialization is
a pure function in `src/shared/diffParse.ts`
(`fileFingerprintInput`, versioned prefix + length-delimited fields so no two
distinct file entries can serialize alike); the hashing itself lives in main
(`node:crypto`) so the renderer bundle stays free of node built-ins. The
renderer treats the digest as opaque and only echoes it.

## 4. When the comparison happens

Inside `applyHunks`, under the existing per-repo mutex, in this order:

1. target drift gate (existing, unchanged) — target HEAD/branch moved
2. fresh `readDiff` (existing, unchanged)
3. **source integrity gate (new)** — every selection is validated against the
   fresh read
4. adoptability gates: `truncated` / `hunkSelectable` (existing, unchanged)
5. dirty gate (existing, unchanged)
6. patch path check, per-hunk probes, combined `--check`, single `git apply`
   (existing, unchanged)

The new gate sits before any patch assembly, so a rejection cannot have touched
the target. It runs against the same fresh read the patch would be built from,
which is what makes the comparison meaningful.

Per selection entry, all of these are rejection reasons:

- the path is no longer in the fresh read (case 2 above)
- the digest is absent or empty (a request that predates this contract, §6)
- the digest differs from the fresh file's digest (case 1)
- a hunk index is not an integer, is negative, or is `>= hunks.length` (case 3)
- a hunk index is repeated, or the same path appears in two selection entries
- the entry selects zero hunks

Any single violation rejects the **whole** request. Violations are collected
first so the message can name all of them rather than only the first.

## 5. How a rejection is expressed

On the existing failure shape — no new error channel, no new field:

```ts
{ ok: false, error: string, code: 'stale', failedProbes?: readonly HunkProbe[] }
```

- `code` gains one value, `'stale'`, on the union it already has
  (`drift | dirty | probe | apply | path | unsupported`).
- `failedProbes` is reused to point the UI at the exact offending hunks:
  one `HunkProbe { path, hunkIndex, applicable: false, alreadyApplied: false }`
  per selected index of every file that failed the gate. `DiffPanel` already
  renders `failedProbes` as per-hunk markers keyed `` `${path}#${hunkIndex}` ``.
- `error` names each reason and each path in English, e.g.
  `Adoption rejected — the selection no longer matches the diff you reviewed: b.txt: no longer in this diff; a.txt: hunk 5 no longer exists. Reload the diff and reselect.`

Renderer: the branch that already highlights `failedProbes` for `'probe'` also
accepts `'stale'`, and shows `res.error` (which carries the specific reason)
instead of the generic `diff.someHunksFailed` string. No new i18n key.

`'stale'` is deliberately distinct from `'drift'`: `'drift'` means *the target*
moved, `'stale'` means *the source diff you selected from* moved. They have
different remedies (re-read vs. reselect) and conflating them would make the
existing `diff.targetMoved` copy lie.

## 6. Migration / old requests

`DiffApplyRequest.selections[].digest` is **required** in the type. Runtime
handling of a request without it: **reject** with `code: 'stale'` (fail closed).

This is safe to do without a compatibility window:

- The channel is in-process Electron IPC. The renderer, preload, and main
  process ship in one bundle — a request from an older renderer against a newer
  main cannot exist.
- Hunk selections are **not persisted anywhere** (verified: `DiffPanel` holds
  them in `useState` only), so there is no stored old-format request to
  re-submit after an upgrade.
- No other caller exists: `grep` finds `DIFF_APPLY_HUNKS` only in
  `constants.ts`, `preload.ts`, `diff.handler.ts`, `DiffPanel.tsx`, and the
  handler test. It is not on the MCP/daemon surface.

Fail-closed is the right default anyway: a request that cannot prove what the
user saw is precisely the request this gate exists to stop.

`DiffReadResult.files` changes element type from `DiffFile` to
`DiffReadFile extends DiffFile { digest: string }`, which is a widening for every
consumer (all existing reads keep type-checking).

## 7. Test plan

New regression tests in `src/main/ipc/handlers/__tests__/diff.handler.test.ts`,
all against a real git worktree, all asserting the target working tree is
**byte-unchanged** after the rejection (an assertion on the return value alone
would not catch a partial apply):

1. worktree file edited between read and apply → `code: 'stale'`, target
   untouched, and the *new* content is specifically not what got applied
2. a selected path leaves the diff before apply (reverted in the worktree) →
   `code: 'stale'`, and the *other*, still-valid selected file is **not**
   applied (this is the silent-partial case)
3. out-of-range hunk index → `code: 'stale'`, target untouched
4. request without a digest → `code: 'stale'`
5. `failedProbes` names the offending `(path, hunkIndex)` pairs

Plus two tests closing the pre-existing hole the brief flags — the current tests
pin all-or-nothing only at the *combined `--check`* step, so a mutant that
replaces the single `git apply` with a per-file sequential apply still passes:

6. select one applicable file and one inapplicable file (the target has since
   committed a conflicting change to the second file, so it is clean but its
   context no longer matches) → rejected, and the applicable file is **not**
   written to the target. This is the black-box half, and on its own it does
   *not* kill the sequential-apply mutant: the combined `--check` gate rejects
   before any apply runs, so the mutated code is never reached. Only a race
   between check and apply reaches it, which is not reproducible on demand.
7. therefore also assert the invariant directly: the `git` module is wrapped by
   a pass-through spy, and a two-file adoption must reach git as **exactly one**
   write invocation (`apply` with neither `--check` nor `--reverse`). All-or-
   nothing across files is delegated to git, so "one patch, one apply" is the
   property worth pinning.

Every guard is mutation-verified: the guard is reverted one at a time and the
corresponding test must go red.

## 8. Out of scope (deliberate)

- `reassembleFile`'s `if (!hunk) continue` stays. The handler now rejects
  out-of-range indices before assembly, so the line is unreachable defensive
  code; making it throw would turn a contract violation into a rejected IPC
  promise, which `DiffPanel.handleAdopt` does not catch (it would leave the
  panel stuck in `applying`). The guard against the silent drop belongs at the
  layer that owns rejections.
- Clearing `selection` in `DiffPanel.load()`. The digest gate makes a stale
  selection a loud rejection rather than a wrong apply, which is the correctness
  fix; auto-clearing selections on reload is a UX decision, not this fix.
- Localizing main-process error strings. Every existing message from this
  handler is a raw string surfaced as-is; new ones follow suit, in English.

## 9. Second commit on this branch — the same split, one call earlier

The gate above pins the selection to the read. It cannot help if the *read
itself* is not git's diff. `readDiff` called `git diff <base>` with no engine
pin, so `diff.external` (difftastic) replaced the output — parsed as zero files
— while the `--numstat` call in the same read reported real counts, showing a
file with +/- and no hunks; and textconv, on by default for `git diff`,
rewrote content into a patch that applies to nothing. Same file, same threat
model, so it rides the same branch as a separate commit.

Fix: `--no-ext-diff --no-textconv` on the patch call only. `--numstat` gets
neither, measured: with a line-doubling textconv driver bound to the file the
patch went 3 lines → 6 while `--numstat` kept reporting `1 1`, and with
`diff.external` set its output was identical with and without `--no-ext-diff`.
Inert flags would be noise.
