# Fan-out on the MCP surface (task 5, 2026-07-28)

- **Gap**: `plans/as-is-to-be-2026-07-28.md` §1 #3 keeps "expose wmux itself as MCP" as
  one of only two surviving moats — but fan-out, the flagship journey, is
  renderer-only IPC (`src/main/ipc/handlers/fanout.handler.ts`) and unreachable
  from the pipe `RpcRouter`. An MCP client (the 84-tool surface we sell) cannot
  start a fan-out.
- **Scope**: two surfaces — start a fan-out, list mission tasks/status. Diff
  adoption and PR creation stay out (J2/J3 territory).
- **Non-negotiable**: caller-workspace scoping. An external MCP caller must not
  be able to create worktrees in an arbitrary `repoPath`.

---

## 0. Why it is renderer-only today (read from source, not guessed)

| Anchor | What it says |
|---|---|
| `fanout.handler.ts:1-8` | "렌더러 신뢰 신원(`verifiedWorkspaceId`)은 `channelLocal.handler`와 동일 trust basis(Electron 프로세스 경계 — 파이프 미노출)" |
| `worktree.handler.ts:3-5` | "렌더러-전용 IPC 표면(파이프 RpcRouter 미노출 — channelLocal/fanout과 동일 trust basis)" |
| `FanOutService.ts:76-77` | `verifiedWorkspaceId` is documented as "렌더러 신뢰 신원" — the service takes it on faith |
| `plans/j1-fanout-design-2026-07-10.md:6` | Explicit J1 non-goal: "MCP fan-out 도구 (사람이 시작하는 여정이 J1의 본질 — §6.M 계약 1 'born-owned')" |

So the reason is **two-part, and only one part is technical**:

1. **Trust (technical).** `FanOutRequest.verifiedWorkspaceId` and `repoPath` arrive
   as plain request fields. That is safe *only* because `ipcMain.handle` is
   reachable exclusively across the Electron process boundary — the renderer is
   the one caller, and it is trusted by construction. Put the same shape on the
   pipe and both fields become caller-forgeable.
2. **Product (deliberate).** J1 decided the fan-out journey is human-initiated:
   the human clicking "Fan out" *is* the authorization, which is why the renderer
   path has no approval prompt.

`FanOutService` itself is already transport-agnostic — it is constructed from a
daemon RPC port and a renderer spawn port, and nothing in it assumes an IPC
caller. **The blocker is identity + path provenance, not architecture.** This
design does not weaken (1); it replaces the renderer's implicit trust with the
same server-side stamp the channel surface already uses, and re-adds (2) as an
explicit approval gate for the agent-initiated path.

---

## 1. Threat model — what a naive `router.register('task.fanout.start', …)` would open

Three caller-supplied fields become attack surface the moment the method is on
the wire:

| # | Field | Naive exposure | Impact |
|---|---|---|---|
| T1 | `verifiedWorkspaceId` | caller asserts any workspace id | mission WorkTask + private mission channel minted **owned by a victim workspace**; `task.mission.close` authz then keys off that owner |
| T2 | `repoPath` | caller names any path on disk | `git worktree add` + `wtask/*` branch creation + an agent CLI spawned with the caller's prompt **in a repo the caller has no relationship to**. This is the one the brief calls out, and it is the worst: it turns a read-scoped MCP client into a write primitive on every git repo the user owns |
| T3 | `agentCmd` | caller names any command | `buildInitialCommand()` (`FanOutService.ts:426`) interpolates it **unquoted** into `` `${agentCmd} "$(cat '…')"` `` which is then fired into a PTY → arbitrary shell execution. Safe today only because a human types it into `FanOutDialog` |

Plus the standing residual: `#113` — same-user identity on this machine is
forgeable at the ceiling (a same-user process can read the pipe token). Nothing
here claims to fix that; the goal is to not be *worse* than the channel surface,
which lives under the same ceiling.

---

## 2. Design

### D1 — New pipe RPC `task.fanout.start`, new registrar

`src/main/pipe/handlers/fanout.rpc.ts`. It lives in `main` (not the daemon)
because `FanOutService` needs the renderer spawn bridge and the filesystem;
`task.mission.*` forwarding stays where it is.

Name follows the existing `task.mission.*` family — same domain (WorkTask),
different verb.

### D2 — Identity: reuse the D5 stamp verbatim, invent nothing

`senderPtyId` (params) → `input.findOwnerWorkspace` (renderer) → `workspaceId`.
That value is stamped over **any** client-supplied `verifiedWorkspaceId`.
Unresolvable → `NOT_AUTHORIZED`, fail closed (fan-out is a mutation).

This is byte-for-byte the discipline in `a2a.channel.rpc.ts:66-83, 202-216`, and
it is the same anchor `task.mission.start` already uses — so a fan-out's mission
tasks end up owned by exactly the workspace that would have owned a hand-rolled
`channel_mission_start`. **Closes T1** (to the `#113` ceiling, no better and no
worse than channels).

### D3 — `repoPath` is not a wire parameter (closes T2)

The server derives it from the caller's own pane:

```
senderPtyId ──> input.findOwnerWorkspace ──> workspaceId
             └> surface.list({ workspaceId }) ──> the surface whose ptyId === senderPtyId
                                              └> that surface's live cwd
```

`surface.list` already returns a per-surface `cwd` that is live-updated from
OSC 7 / prompt scrape (`useRpcBridge.ts:634-652`), with the workspace-level cwd
as fallback. That cwd is handed to `FanOutService` as `repoPath`, and
`TaskWorktreeManager.preflight` then does the real validation it already does:
`realpath` + `git rev-parse --show-toplevel` + bare/submodule/LFS rejection
(`TaskWorktreeManager.ts:171-196`). **The worktree is therefore always rooted in
the repo the caller's own terminal is sitting in.**

An explicitly-supplied `repoPath` is **rejected**, not silently ignored:
silent ignore would let a caller believe it fanned out over repo B while it
actually fanned out over repo A. Loud `INVALID_ARGUMENT` instead.

Accepted consequence (stated, not hidden): an *external* MCP client (Claude Code
in cmd.exe) pinned to an `mcp.claimWorkspace` workspace has a cwd of whatever
`startupDirectory` resolves to — usually not a repo — so its fan-out fails
preflight. That is the correct fail-closed outcome, and it makes the contract
honest: **fan-out is scoped to the repo your own pane is in.** An agent that
wants to fan out over a repo should be running in a pane in that repo.

### D4 — `agentCmd` is not exposed (closes T3)

The pipe surface always uses the default (`claude`). Quoting `agentCmd` properly
would mean deciding whether it is a bare binary, a binary + flags, or a shell
snippet — the renderer path deliberately allows the last one because a human
typed it. Rather than build a parser/allowlist for a v1 surface nobody has asked
to parameterize yet, the field simply is not on the wire. Documented as a known
limitation, not a TODO stub.

### D5 — Approval: reuse the execute gate, with honest copy

Fan-out spawns N autonomous agent CLIs. That is execute-class, and the brief is
explicit: reuse the existing gate, do not invent one.

The existing gate is `requestExecuteApproval()`
(`src/renderer/utils/executeApprovalGate.ts`) → `pendingExecuteApproval` in
`a2aSlice` → `ExecuteApprovalDialog`. It already owns: the 30 s auto-deny, the
`a2aAutoApproveExecute` (YOLO) escape hatch, and the approval queue. All three
are reused as-is.

What changes: the dialog's copy is A2A-specific ("A remote A2A caller wants to
spawn a Claude CLI with bypassPermissions **in this workspace**"). For a fan-out
that sentence is wrong in a security-relevant way — the spawn happens in N *new*
worktree workspaces. The file itself already carries a comment about exactly this
failure mode (the `sameWs` wording fix at `ExecuteApprovalDialog.tsx:32-35`:
"be explicit so the user isn't social-engineered into waving through…"). So the
pending-approval record gets **one optional field**, `fanout?: { taskCount,
repoPath }`, and the dialog branches its copy on it. Same queue, same timer, same
toggle, same component — a variant, not a second gate.

Asymmetry, on purpose:

| Path | Gate |
|---|---|
| `FanOutDialog` (human clicks) | none — the click is the authorization (unchanged) |
| `task.fanout.start` (agent/MCP) | execute approval prompt, every call |

Prompting happens **before** `FanOutService.start`, i.e. before the idempotency
LRU is consulted. A retried key therefore re-prompts and then returns the cached
result. Slightly redundant, but the alternative — probing the cache to decide
whether to prompt — leaks the cache and lets a caller skip the gate by replaying
a key.

### D6 — One `FanOutService` instance, shared

`FanOutService` owns two pieces of process-global state: the idempotency LRU
(`§2 G1 CRITICAL`) and a `TaskWorktreeManager` whose **serial queue** is what
keeps concurrent `git worktree add` off the same repo. Two instances = two
queues = the exact race that queue exists to prevent.

So `main/index.ts` constructs the service once and passes it to both registrars.
`registerFanOutHandler` gains a `service` parameter instead of building its own.

### D7 — Read surface: `channel_mission_list`

`task.mission.list` is **already** registered on the router
(`a2a.channel.rpc.ts:287`), already capability-mapped, already returns full
`WorkTask` records — `status`, `branch`, `worktreePath`, `paneGroupId`,
`missionChannelId` (`WorkTaskService.listMissions`, owner-scoped). It has no MCP
tool only because J0 deliberately left it pipe-only.

So the second surface is a thin tool in `src/mcp/channels.ts` alongside
`channel_mission_start` / `channel_mission_close`, plus one entry in
`FIRST_PARTY_METHODS`. Zero new server-side authz: the daemon already refuses a
list without a server-resolved `verifiedWorkspaceId` and filters to
`task.owner.verifiedWorkspaceId === caller` (`daemon/index.ts:3216-3232`).

### D8 — Origin gate

`ctx.origin !== 'local'` → reject. The LanLink LAN listener is a separate router
that stamps `origin:'remote'`, and `origin` is a required `RpcContext` field
precisely so a future remote transport cannot silently inherit a spawn path
(same reasoning as `a2a.rpc.ts:438-445`). Fan-out is strictly more powerful than
`a2a execute`, so it gets the same guard.

### D9 — Commander brains: unchanged, fail-closed by default

`COMMANDER_TOOL_SURFACE` / `COMMANDER_RPC_METHODS` are **allowlists**. Neither
new tool nor the new method is added, so a commander brain simply cannot reach
fan-out. That is a deliberate hold: commander scope is a separate decision with
its own review basis (`plans/byob-role-gate-2026-07-17.md`), and widening it is
out of this task's scope.

---

## 3. Wire contract

```
task.fanout.start
  params:
    senderPtyId       string   (required — the MCP server's PID-map-walked ptyId)
    idempotencyKey    string   (required — FanOutService §2 G1)
    titles            string[] (1..FANOUT_MAX_TASKS = 8)
    prompt            string?  (shared prompt)
    taskPrompts       string[]? (index-aligned with titles)
    memberId          string?  (defaults to the caller workspace id)
    repoPath          — REJECTED if present
    agentCmd          — REJECTED if present
    verifiedWorkspaceId — accepted on the wire but always overwritten
  result:
    { ok, error?, tasks: FanOutTaskResult[] }   (FanOutService's envelope, verbatim)
```

MCP tool `fanout_start` mirrors it in snake_case, minus `senderPtyId` (injected
by the bundled server, never agent-settable) and minus the rejected fields.

---

## 4. Wiring checklist

| # | File | Change |
|---|---|---|
| 1 | `src/shared/rpc.ts` | `task.fanout.start` → `RpcMethod` union + `ALL_RPC_METHODS` |
| 2 | `src/main/mcp/methodCapabilityMap.ts` | `{ capability: 'a2a.execute', riskClass: 'a2a' }` — the same capability `a2a.task.send{execute:true}` uses, described as "spawn agents with bypassPermissions" |
| 3 | `src/main/mcp/firstParty.ts` | `task.fanout.start` + `task.mission.list` → `FIRST_PARTY_METHODS` |
| 4 | `src/main/pipe/handlers/fanout.rpc.ts` | **new** — D2/D3/D5/D8 |
| 5 | `src/main/ipc/handlers/fanout.handler.ts` | take an injected `FanOutService` (D6); export `createFanOutService` |
| 6 | `src/main/index.ts` | build the service once, hand it to both registrars |
| 7 | `src/renderer/stores/slices/a2aSlice.ts` | `PendingExecuteApproval.fanout?: { taskCount, repoPath }` |
| 8 | `src/renderer/components/A2a/ExecuteApprovalDialog.tsx` | fan-out copy branch |
| 9 | `src/renderer/hooks/useRpcBridge.ts` | `fanout.requestApproval` bridge method → `requestExecuteApproval` |
| 10 | `src/mcp/channels.ts` | `fanout_start` + `channel_mission_list` tools |
| 11 | `docs/api/reference.md` | regenerate (`node scripts/gen-api-reference.mjs`) — drift guard is a test |
| 12 | `README.md` | 84 → 86 tools |
| 13 | `CHANGELOG.md` | `## [Unreleased]` entry |

---

## 5. Self-verification of the design

| Question | Answer |
|---|---|
| Can a wire caller mint a mission owned by another workspace? | No — `verifiedWorkspaceId` is overwritten by the `senderPtyId` resolution, and an unresolvable sender is rejected. Identical to `a2a.channel.post`. |
| Can a wire caller create a worktree in an arbitrary repo? | No — `repoPath` is server-derived from the caller's own surface cwd, and an explicit one is rejected. |
| Can a wire caller run an arbitrary command? | No — `agentCmd` is not on the wire; the only caller-controlled string reaching the shell is the prompt, and it goes through a **file** (`prompt.md`), read back via `"$(cat '…')"` with the *path* single-quoted (`FanOutService.ts:414-437`). The prompt body never touches the shell's parser. |
| Can a wire caller bypass the approval? | Only via the pre-existing `a2aAutoApproveExecute` YOLO toggle — which is the human's own standing decision, and the same one that already waives A2A execute. Idempotency replay does not skip the prompt (D5). |
| Can a remote (LanLink) caller reach it? | No — D8 origin gate, plus LanLink runs a separate router. |
| Can a commander brain reach it? | No — allowlists, not touched (D9). |
| Does this widen anything for the existing renderer path? | No. `FanOutDialog` → `fanout:start` IPC is unchanged, still ungated, still `ipcMain`-only. The only change on that path is that the service instance is injected rather than self-constructed. |
| New trust primitive introduced? | None. Identity = existing D5 stamp. Approval = existing execute gate. Path validation = existing `TaskWorktreeManager.preflight`. |
| What is strictly worse than before? | The fan-out spawn path becomes reachable by a same-user process that can read the pipe token (`#113` ceiling) *and* get past a user-visible approval prompt. Before, it was reachable only by the renderer. This is the accepted cost of the surface, and the approval prompt is the mitigation the renderer path never needed. |

### Residuals accepted

- **`#113` same-user identity ceiling** — `senderPtyId` is a request param, not a
  connection-peer PID, so a same-user process can forge it. Attribution is
  advisory, exactly as documented in `a2a.channel.rpc.ts:33-43`. Unchanged by
  this work; the real fix is the B1/B2/B3 peer-PID track.
- **cwd freshness** — the derived repo path comes from OSC 7 / prompt scrape. A
  shell that reports no cwd yields a rejection (fail-closed); a *stale* cwd
  yields a fan-out in a previously-visited directory of the caller's own pane.
  Bounded by the caller's own terminal history, never by the caller's assertion.
- **External MCP clients cannot usefully fan out** unless their claimed
  workspace's cwd is a repo (D3). Stated in the tool description.
