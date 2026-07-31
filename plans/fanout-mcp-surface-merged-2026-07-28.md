# Fan-out on the MCP / pipe surface — merged design (2026-07-28)

> **Not committed.** `plans/` is in `.gitignore:130`; this file is deliberately
> left untracked rather than force-added. It is the reconciliation record for
> two independent implementations of the same spec.

## 0. What this merges

The same work was implemented twice, independently, against the same seven
security requirements:

| | branch | size |
|---|---|---|
| **A** | `origin/feat/fanout-mcp-surface` (PR #668) | +1623 / −55, 18 files |
| **B** | `wtask/task-5-fanout-mcp-sur-5-1pqkvksc` (`19e2d5b3`) | +663 / −26, 16 files |

Both derived identity and repository server-side, both capped N and prompt
sizes, both fixed `agentCmd`, both gated origin to `local`. They diverged on two
things that mattered — **asynchrony** (A had it, B did not) and **the approval
gate** (B had it, A argued against it) — and on several smaller judgments where
one was simply right.

This branch is the union, minus the parts that were wrong in both.

## 1. Ported from A

### 1.1 Accept-then-poll (the one that was not optional)

B's `task.fanout.start` was synchronous: it waited up to `APPROVAL_TIMEOUT_MS`
(45s) for approval and then awaited the whole spawn. The MCP client's RPC
deadline is **10s** (`src/mcp/wmux-client.ts:8`) and a single task's renderer
spawn alone is allowed 30s. B's handler would therefore have timed the caller
out *by construction* on any real fan-out — with N worktrees and N agents
actually created, the caller believing it failed, and the client's retry
re-firing it.

A's framing ("asynchrony is forced, not chosen") is correct and is adopted
wholesale: the call returns as soon as it has accepted the work, and the caller
polls by re-sending the same idempotency key. The poll answer comes from the
`FanOutService` G1 bookkeeping that already existed, exposed through a new
read-only `statusOf(key)` plus a small gate map for the pre-start phase.

### 1.2 A thrown run terminates the key, it does not release it

`FanOutService.start` released the key in `finally` on a throw. Harmless when
only the GUI called it (a fresh key per submit); fatal on a polled wire surface,
where the next poll would see `unknown` and **restart a fan-out that had already
spawned tasks**. A's fix — record the throw as a failed `FanOutResult` — is
ported verbatim.

### 1.3 Repo derivation by git toplevel

B derived the repo from the *pane's* live cwd via `surface.list` and passed that
string straight through. A resolved the *workspace's* `metadata.cwd` (the same
field the GUI modal pre-fills from, `FanOutDialog.tsx:56`), then normalised it
with `git rev-parse --show-toplevel` + `realpath`. A's is better on both counts:
it matches the GUI's own semantics, and the toplevel normalisation means two
fan-outs from different subdirectories of one repo land in the same worktree
root instead of two.

### 1.4 R5/R6 caps, and the `parseTasks` pairing

B capped only the task count. A also capped each title at `CHANNEL_TOPIC_MAX`
and each *effective* prompt (shared + per-task, empty side dropped — the exact
rule the service applies) at `FANOUT_PROMPT_MAX_BYTES`, measured in UTF-8 bytes,
and bounded the raw array length before any per-element work. Ported.

### 1.5 Code placement

- `createFanOutService` moves to `src/main/worktask/createFanOutService.ts`.
  B exported it from `fanout.handler.ts`, which made the *renderer IPC* handler
  the owner of the pipe handler's service — a layering inversion. Both kept the
  single shared instance, which is the part that actually matters (two instances
  = two idempotency LRUs and two `TaskWorktreeManager` serial queues = concurrent
  `git worktree add` on one repo).
- `fanout_start` moves to `src/mcp/fanout.ts`. B hung it off `channels.ts`;
  fan-out is not a channel tool. `channel_mission_list` stays in `channels.ts`,
  where it belongs.

### 1.6 `memberId` is refused

B accepted `memberId` from the wire (defaulting to the workspace id) and exposed
`member_id` on the tool schema. It is the caller's coordinate in the
mission-channel roster and goes straight into `task.mission.start`. Accepting it
without the reserved-identity guards `a2a.channel.rpc.ts` applies lets a caller
sign its missions as someone else. A refused it; so do we — loudly, for the same
reason B refused `repoPath` loudly.

### 1.7 `HUMAN_WORKSPACE_ID` guard

Defence in depth (`ws-human` owns no panes, so no `senderPtyId` can resolve into
it), symmetric with the channel handler. A had it; B did not.

## 2. Kept from B

### 2.1 The approval gate exists

A shipped without one and wrote its reasoning (design §3 R7). Two of A's three
arguments do not survive the merge, and the third is fixed rather than accepted:

1. *"Fan-out spawns an ordinary `claude`, which has its own permission prompts,
   unlike the a2a execute path's `bypassPermissions`."* True, and it is why
   fan-out is not *identical* to execute. It is not why it needs no consent:
   the marginal primitive is `git worktree add` × N plus N new branches in the
   user's repository. That is not covered by `input.send`.
2. *"An approval prompt would fire after the tool returned accepted, and the
   30s auto-deny would silently lose every fan-out overnight."* The first half
   is true and is now by design; the second half is fixed in §2.3.
3. *"Reusing `requestExecuteApproval` folds fan-out under the user's existing
   `a2aAutoApproveExecute` toggle."* Correct, and a real objection to B's
   implementation. Fixed in §2.2.

### 2.2 …but it is separated from `a2aAutoApproveExecute`

B reused `requestExecuteApproval` verbatim, so a user who had turned on
auto-approve for A2A background execution would have silently auto-approved
worktree creation too — consent given for one action widening to another.

`executeApprovalGate.ts` is refactored into a shared `enqueueApproval(input,
autoApprovable)` with two exported entry points:

- `requestExecuteApproval` — A2A execute, honours the toggle (unchanged
  contract, still returns `Promise<boolean>`);
- `requestFanOutApproval` — fan-out, **never** auto-approved, returns
  `{ approved, outcome }`.

No new persisted setting was introduced. A per-action auto-approve toggle is a
settings surface nobody has asked for, and the honest default for "create N
branches in my repo" is to ask. The dialog's auto-approve checkbox is hidden on
the fan-out branch and replaced with a line stating that fan-out always asks —
offering a control that does not apply to the thing on screen is its own lie.

### 2.3 Auto-deny becomes an explicit, reported policy

Because the call is now async, the 30s auto-deny no longer blocks anyone — but
it must not cost the fan-out *silently*. The renderer's verdict carries an
`outcome` (`approved` / `declined` / `timeout`), the handler records it, and a
poll on a denied key answers:

```json
{ "ok": false, "status": "denied", "reason": "timeout",
  "error": { "code": "NOT_AUTHORIZED", "message": "fan-out was not approved: …" } }
```

An unattended fleet therefore learns *that* and *why* its fan-out did not
happen, on its next poll, instead of watching a key go quiet. `unavailable` is
the third reason (the window could not show a prompt at all) — still fail-closed,
still explained.

The 30s window itself is unchanged, so there is one timer policy across the
shared queue. Lengthening it for fan-out specifically is defensible now that
nobody is blocked; it is left alone as a separate decision.

### 2.4 Loud rejection of fields the wire may not set

B rejected `repoPath` and `agentCmd` rather than ignoring them, on the grounds
that a caller which believes it chose the repository and was silently overruled
is acting on a false picture. A ignored them for forward compatibility. B's
reasoning is stronger for a security-relevant field, and the tool schema does
not expose them anyway, so a well-behaved caller never trips it. `memberId`
joins them.

Consequence: A's "a `repoPath` that re-states your own repo is allowed" path is
gone, along with its two extra `git` invocations per call.

### 2.5 Capability grade `a2a.execute`

A mapped `task.fanout.start` to `a2a.channel.send` (the grade of the
`task.mission.start` it calls N times). B mapped it to `a2a.execute`. Given that
the merged surface keeps an execute-class approval gate and spawns N agent CLIs,
`a2a.execute` is the honest grade. B's is kept.

## 3. New in the merge (in neither A nor B)

**The poll is scoped to the calling workspace.** Idempotency keys are
caller-chosen strings, and A's poll branch ran *before* identity resolution, so
any local caller could read another workspace's full `FanOutResult` — task ids,
branches, worktree paths, workspace ids — by guessing `fanout-1`. It could also
squat a key another workspace was about to use.

The merged handler resolves identity first and namespaces the key as
`${callerWorkspaceId}::${callerKey}` before it ever reaches `FanOutService` or
the gate map. Cost: one renderer round-trip per poll, the same hop every channel
mutation already pays. The caller still sees its own bare key in every response.

This also keeps a wire caller from colliding with an in-flight GUI fan-out.

## 4. The state machine

`FanOutService` owns everything from `start()` onward; the handler's gate map
owns everything before it. LRU-bounded at `WORKTASK_IDEMPOTENCY_CAP`, same as
the service's own result LRU.

| poll on key K | source | response |
|---|---|---|
| unseen | — | validate, prompt, `{ status: 'accepted', taskCount, repoPath, workspaceId }` |
| prompt still up | gate `awaiting` | `{ status: 'awaiting_approval' }` |
| refused | gate `denied` | `{ ok: false, status: 'denied', reason }` |
| in flight | `statusOf` → `running` | `{ status: 'running' }` |
| finished | `statusOf` → `done` | `{ status: 'completed', result }` |
| finished, LRU-evicted | gate `started` | `{ ok: false, status: 'expired' }` — never restarts |

`gate: 'started'` is set synchronously immediately before `service.start(req)`,
which registers the key in-flight before its first `await`, so there is no
window where the gate says started and the service says unknown.

## 5. Gates

- `npx tsc --noEmit` — clean
- `npm run test:parallel` — 8794 passed, 23 skipped (617 files)
- `npm run test:runtime` — 88 passed, 11 skipped
- eslint on every changed file — clean (two pre-existing errors in
  `FanOutService.test.ts:338` and `src/mcp/index.ts` left untouched)
- `node scripts/gen-api-reference.mjs` re-run; 145 methods

### Mutation verification

Every contract below was reverted, the suite re-run, and the implementation
restored:

| mutation | result |
|---|---|
| `void (async () => …)` → `await (async () => …)` (synchronous handler) | 6 failed (all six poll tests time out) |
| drop the `catch` that records a thrown run | 1 failed (`records a THROWN run as a failed result…`) |
| fan-out honours `a2aAutoApproveExecute` | 1 failed (`still asks even when the A2A auto-approve toggle is on`) |
| drop the `denied` poll branch (silent auto-deny) | 4 failed |
| drop the `${workspaceId}::` key scoping | 1 failed |
| stop rejecting `memberId` | 1 failed |

## 6. Open questions for the owner

1. **Approval window.** Kept at the shared 30s. Now that the prompt blocks
   nobody, a longer fan-out-specific window (or a persistent inbox entry that
   never expires) would be kinder to a human who stepped away. Deliberately not
   changed here — it is a policy call, not a merge call.
2. **A per-action auto-approve.** Fan-out currently always asks. If unattended
   fan-out is wanted, the right shape is a separate opt-in, not widening the
   A2A toggle. Not built.
3. **`senderPtyId` vs `callerPid`.** Unchanged from A's §7: a Codex-hosted
   caller with no PID-walk hit cannot fan out. Threading
   `a2a.resolve.identity`'s process-tree walk into this handler should land for
   all D5 mutations at once, not for fan-out alone.
4. **`plans/` convention.** A committed its design doc with `git add -f`,
   bypassing `.gitignore`. This one is not committed. Whether design docs should
   be tracked is the owner's call.
