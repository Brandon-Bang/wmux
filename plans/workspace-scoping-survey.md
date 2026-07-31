# Workspace Scoping Survey (read-only census)

Date: 2026-07-28. Scope: `src/` on `main` @ d3c4aca5.
Purpose: enumerate every point where workspace ownership/scope is decided, as raw material for
the "task-owner workspace may read + unblock the panes of tasks it owns" design. **No proposals here — observations only.**

Legend for "hierarchy impact" (observation, not recommendation):
- **candidate** — this is an equality check that would have to become "same OR owner-of-the-pane's-task" for the feature to work.
- **unchanged** — orthogonal to the feature (already cross-workspace, or not a workspace boundary).
- **unclear — needs decision** — could go either way; depends on design choices not made yet.

Method notes: four sub-surveys (pipe handlers / daemon / MCP / renderer+shared) were merged.
`events.rpc.ts` rows appear once (§1) even though three surveys covered them.
All anchors were read-verified at survey time. ⚠️SILENT = the check fails by silently returning
empty/filtered/no-op results rather than erroring — the most dangerous places to add a hierarchy.

---

## 1. Main process — RpcRouter + pipe handlers (`src/main/pipe/`)

| # | file:line | what it decides | comparison | on failure | hierarchy impact |
|---|---|---|---|---|---|
| 1 | src/main/pipe/RpcRouter.ts:180 | `ctx.firstParty` set only by in-process dispatch; wire can never set it | function-arg flag | n/a (population point) | unchanged |
| 2 | src/main/pipe/RpcRouter.ts:205 | `ctx.origin` hardcoded `'local'` for pipe + loopback TCP | literal assignment | n/a | unchanged |
| 3 | src/main/pipe/RpcRouter.ts:229-237 | commander token → `ctx.commanderWorkspace` | token validation | throw (fail closed, never demoted) | unchanged (identity, not scope) |
| 4 | src/main/pipe/RpcRouter.ts:238-244 | teardown-effect methods denied to commanders | denylist (`COMMANDER_TEARDOWN_DENY`) | throw | unchanged |
| 5 | src/main/pipe/handlers/input.rpc.ts:112 | ownership assert SKIPPED when caller passed no `workspaceId` (internal CLI/UI) | absence check | ⚠️SILENT pass-through (fail-open by design) | unclear — needs decision (owner-scoped calls must not accidentally ride this hole) |
| 6 | src/main/pipe/handlers/input.rpc.ts:118-122 | `assertWorkspaceOwnsPty`: PTY belongs to caller ws | derived lookup (`input.findOwnerWorkspace`) + simple equality | throw "not owned by workspace … Cross-workspace terminal access is not allowed." | **candidate** — this is THE gate that blocks the orchestrator (terminal_read/terminal_send) |
| 7 | src/main/pipe/handlers/input.rpc.ts:64 | agent caller (has `senderPtyId`) may not omit `ptyId` | presence check | `{allow:false}` → throw | unchanged |
| 8 | src/main/pipe/handlers/input.rpc.ts:181 | `input.send` target ownership (assert call) | derived lookup + equality | throw | **candidate** (write path) |
| 9 | src/main/pipe/handlers/input.rpc.ts:311 | `input.sendKey` target ownership | derived lookup + equality | throw | **candidate** (write path — unblock via Enter/Esc) |
| 10 | src/main/pipe/handlers/input.rpc.ts:355,370 | `input.readScreen` ownership (pre-read + post-resolve re-assert) | derived lookup + equality | throw | **candidate** (read path) |
| 11 | src/main/pipe/handlers/input.rpc.ts:389 | `terminal.readEvents` ownership | derived lookup + equality | throw | **candidate** (read path) |
| 12 | src/main/pipe/handlers/input.rpc.ts:81 | active-pty resolution scoped to caller ws | scope param → renderer resolve | miss → throw | unclear — needs decision (what does "active pane" mean under owner scope?) |
| 13 | src/main/pipe/handlers/deck.rpc.ts:50-52 | commander session liveness for `deck.resolvePaneRoute` | token validation | throw | unchanged |
| 14 | src/main/pipe/handlers/deck.rpc.ts:64-72 | pane must be inside the commander token's workspace | derived lookup + simple equality | throw "outside this orchestrator's workspace" | unclear — needs decision (commander-brain variant of the same feature) |
| 15 | src/main/pipe/handlers/deck.rpc.ts:85-88 | `deck.resolveCommanderWorkspace` returns token's own ws | token validation | throw | unchanged |
| 16 | src/main/pipe/handlers/surface.rpc.ts:39-46 | `surface.new` commander confinement; omitted ws → pinned | equality vs `ctx.commanderWorkspace` | reject | unchanged (write confinement) |
| 17 | src/main/pipe/handlers/surface.rpc.ts:18 | `surface.list` — no main-side ws check, renderer decides | none | ⚠️SILENT active-ws fallback when unscoped | unchanged |
| 18 | src/main/pipe/handlers/pane.rpc.ts:257-260 | `pane.focus` commander confinement forwarded as `confineWorkspaceId` | token-derived forward; renderer enforces | renderer-side refusal | unchanged |
| 19 | src/main/pipe/handlers/pane.rpc.ts:289-296 | `pane.split` commander confinement | equality vs `ctx.commanderWorkspace`; omitted → pinned | reject | unchanged |
| 20 | src/main/pipe/handlers/pane.rpc.ts:349-364 | paneId ∈ workspaceId before metadata read/write | derived lookup (`pane.validateWorkspace` renderer IPC) | throw | unclear — needs decision (does owner get metadata of task panes?) |
| 21 | src/main/pipe/handlers/pane.rpc.ts:365-374 | active-leaf resolution scoped to `workspaceId` | derived lookup | throw | unchanged |
| 22 | src/main/pipe/handlers/pane.rpc.ts:479-489 | `orchestrator.role` metadata key is first-party-only | `ctx.firstParty` + key strip | ⚠️SILENT — field stripped, rest of patch applies | unchanged |
| 23 | src/main/pipe/handlers/pane.rpc.ts:587-600 | `pane.clearMetadata` preserves `orchestrator.role` for non-first-party | `ctx.firstParty` + derived value | ⚠️SILENT partial clear | unchanged |
| 24 | src/main/pipe/handlers/pane.rpc.ts:640-650 | `pane.search` scope forwarded; cross-ws search unsupported | type validation only | ⚠️SILENT active-ws fallback when unscoped | unclear — needs decision |
| 25 | src/main/pipe/handlers/pane.rpc.ts:135 | `pane.list` forwarded with no main-side ws gate | none | ⚠️SILENT renderer scoping | unchanged (read already reaches any ws by param) |
| 26 | src/main/pipe/handlers/pane.rpc.ts:315-320 | `pane.close` resolves across ALL workspaces (globally-unique paneId) | global derived lookup | error if not found | unchanged (already cross-ws) |
| 27 | src/main/pipe/handlers/events.rpc.ts:223-225 | poll `clientScope` = caller-supplied `workspaceId(+Ids)` union | self-asserted set | n/a | unchanged |
| 28 | src/main/pipe/handlers/events.rpc.ts:233-238 | private scope: first-party keeps client scope; agents get server-resolved ws from `senderPtyId` (caller value ignored) | `ctx.firstParty` + derived lookup | ⚠️SILENT — unresolvable ⇒ empty privateSet ⇒ ALL private events dropped | **candidate** — owner would need private scope = {self} ∪ {owned-task workspaces}; today it is a single server-derived id |
| 29 | src/main/pipe/handlers/events.rpc.ts:246-250 | `a2a.task` dual-party visibility (from OR to) | set membership | ⚠️SILENT filtered | unchanged (already the dual-party precedent) |
| 30 | src/main/pipe/handlers/events.rpc.ts:256-262 | `channel.message` per-recipient scope | set membership on ws + `recipientWorkspaceIds` | ⚠️SILENT filtered | unchanged |
| 31 | src/main/pipe/handlers/events.rpc.ts:265-274 | `channel.catalog` scope + `'*'` public broadcast sentinel | set membership + sentinel | ⚠️SILENT filtered | unchanged |
| 32 | src/main/pipe/handlers/events.rpc.ts:280 | `channel.nudgeExhausted` owner-only | set membership | ⚠️SILENT filtered | unchanged |
| 33 | src/main/pipe/handlers/events.rpc.ts:283-286 | lifecycle events: caller-supplied scope; unscoped ⇒ all-workspace firehose | set membership else pass-all | ⚠️SILENT (deliberate convenience filter) | unchanged (already fleet-global) |
| 34 | src/main/pipe/handlers/events.rpc.ts:305-313 | `notification.received` gated on declared capability | allowlist (`notifications.read`) | ⚠️SILENT filtered | unchanged |
| 35 | src/main/pipe/handlers/events.rpc.ts:102-105 | caps `workspaceIds` union at 64 | length bound | ⚠️SILENT over-cap dropped | unchanged |
| 36 | src/main/pipe/handlers/a2a.channel.rpc.ts:66-83 | caller ws resolved from `senderPtyId` (server pin) | derived lookup; error → `''` | `''` ⇒ unresolvable | unchanged |
| 37 | src/main/pipe/handlers/a2a.channel.rpc.ts:167-178 | `local-ui` reserved GUI identity rejected from pipe | string equality | `{ok:false, NOT_AUTHORIZED}` | unchanged |
| 38 | src/main/pipe/handlers/a2a.channel.rpc.ts:190-200 | `ws-human` may not be claimed/targeted | equality vs `HUMAN_WORKSPACE_ID` | `{ok:false, NOT_AUTHORIZED}` | unchanged |
| 39 | src/main/pipe/handlers/a2a.channel.rpc.ts:202-205 | server overwrite of `verifiedWorkspaceId` for verified callers | server stamp | n/a | unchanged |
| 40 | src/main/pipe/handlers/a2a.channel.rpc.ts:207-215 | channel mutation requires resolvable `senderPtyId` | presence | `{ok:false}` fail-closed | unchanged |
| 41 | src/main/pipe/handlers/a2a.channel.rpc.ts:235-243 | `ws-human` read scope is first-party-only | equality + `ctx.firstParty` | `{ok:false, NOT_AUTHORIZED}` | unchanged |
| 42 | src/main/pipe/handlers/a2a.channel.rpc.ts:244-247 | no-PTY reads keep client-supplied `verifiedWorkspaceId` (process-boundary trust) | none | allowed (documented residual) | unchanged |
| 43 | src/main/pipe/handlers/a2a.channel.rpc.ts:117-134 | forgeable `principalId` stripped from identity refs | key deletion | ⚠️SILENT strip | unchanged |
| 44 | src/main/pipe/handlers/a2a.channel.rpc.ts:296-304 | `archive`/`kick` unregistered on pipe (humans-only) | absence from registry | "Unknown method" | unchanged |
| 45 | src/main/pipe/handlers/a2a.rpc.ts:145-155 | `callerPid` self-asserted, explicitly not a boundary | none | n/a | unchanged |
| 46 | src/main/pipe/handlers/a2a.rpc.ts:219-234 | live pty→ws resolution replaces stored ids; stale entries purged | derived lookup + prefix match | ⚠️SILENT entry dropped | unchanged |
| 47 | src/main/pipe/handlers/a2a.rpc.ts:445-457 | `execute:true` spawn only for `origin==='local'` + `!taskId` + approved | positive-allow equality on `ctx.origin` | ⚠️SILENT drop of spawn (message-only) | unchanged |
| 48 | src/main/pipe/handlers/browser.rpc.ts:209-217 | `browser.tabs` requires resolved `workspaceId` | presence | structured error | unchanged |
| 49 | src/main/pipe/handlers/browser.rpc.ts:551-569 | `browser.cdp.info` filters targets to caller ws; untagged dropped | simple equality | ⚠️SILENT filtered (+`targetsScoped:true`) | unclear — needs decision (owner browsing a task pane's browser?) |
| 50 | src/main/pipe/handlers/browser.rpc.ts:306-347 | `browser.open`/`close`: absent ws ⇒ renderer uses UI-active ws | presence-conditional spread | ⚠️SILENT active-ws fallback | unchanged |
| 51 | src/main/pipe/handlers/mcp.rpc.ts:26-53 | caller-name resolution (`ctx.clientName` preferred) | declared identity | n/a | unchanged |
| 52 | src/main/pipe/handlers/uiPlugin.rpc.ts:39-40 | plugin attribution via `ctx.clientName` | declared identity | — | unchanged |
| 53 | src/main/mcp/PermissionEnforcer.ts:198 | commander allow lane: token authorizes, not clientName | allowlist (`COMMANDER_RPC_METHODS`) + `ctx.commanderWorkspace` presence | falls through to normal enforcement → rejection | unchanged |
| 54 | src/main/pipe/handlers/hooks.rpc.ts:1073-1092 | `resolvePtyIdForSignal` matches `ptyWorkspaceId === signal.workspaceId` (routing, not authz) | simple equality | no route | unchanged (attribution) |
| 55 | src/main/ipc/handlers/worktask.handler.ts:149,165 | scan entry `ownerWorkspaceId` defaults to `verifiedWorkspaceId` when absent | fallback | ⚠️SILENT default | **candidate** — this is the owner-identity source the feature would anchor on |

## 2. Daemon (`src/daemon/`)

| # | file:line | what it decides | comparison | on failure | hierarchy impact |
|---|---|---|---|---|---|
| 56 | src/daemon/channels/channelCallerIdentity.ts:93-95 | trusts a pre-stamped `verifiedWorkspaceId` verbatim | none (verbatim trust) | n/a | unchanged |
| 57 | src/daemon/channels/channelCallerIdentity.ts:107-122 | stamps `verifiedWorkspaceId` from `senderPtyId` → live session env | derived lookup | `NOT_AUTHORIZED` fail-closed | unchanged |
| 58 | src/daemon/channels/channelCallerIdentity.ts:130-137 | backfills caller identity only when omitted | presence | n/a | unchanged |
| 59 | src/daemon/channels/ChannelService.ts:723-727 | `isVisibleTo` — membership gate behind all writes | public allowlist OR member equality | boolean false | unchanged |
| 60 | src/daemon/channels/ChannelService.ts:751-754 | `isObservableBy` — read gate wider than membership (`ws-human`) | `isVisibleTo` OR equality to `HUMAN_WORKSPACE_ID` | boolean false | unchanged (existing read>write precedent) |
| 61 | src/daemon/channels/ChannelService.ts:576 | `list` filters channels per caller | `isObservableBy` | ⚠️SILENT filtered list | unchanged |
| 62 | src/daemon/channels/ChannelService.ts:596 | `get` discloses channel row | `isObservableBy` | ⚠️SILENT `null` (= not-found) | unchanged |
| 63 | src/daemon/channels/ChannelService.ts:617 | `operatorList`: existence-only gate, returns ALL channels incl. private | non-empty string check (not a filter) | ⚠️SILENT empty array if unstamped | unchanged (see uncertainty U3) |
| 64 | src/daemon/channels/ChannelService.ts:641,673 | `getMembers` / `getMessages` disclosure | `isObservableBy` | ⚠️SILENT empty array | unchanged |
| 65 | src/daemon/channels/ChannelService.ts:679-690 | private-channel per-viewer history floor | derived member-row lookup | ⚠️SILENT empty for non-human non-member | unchanged |
| 66 | src/daemon/channels/ChannelService.ts:836-845,857,876 | `create`: rejects seeding `ws-human`; pins creator to `verifiedWorkspaceId` | equality / server pin | `NOT_AUTHORIZED` / forged value discarded | unchanged |
| 67 | src/daemon/channels/ChannelService.ts:976-987 | `archive` authz: member OR CEO | two equalities | `NOT_AUTHORIZED` | unchanged (existing "owner-or" precedent shape) |
| 68 | src/daemon/channels/ChannelService.ts:1060 | `join` gate | `isVisibleTo` | not-found-style error (existence hiding) | unchanged |
| 69 | src/daemon/channels/ChannelService.ts:1271,1408 | `operatorJoin` requires stamped id; `leave` self-pinned | non-empty / own-row equality | `NOT_AUTHORIZED` / `NOT_A_MEMBER` | unchanged |
| 70 | src/daemon/channels/ChannelService.ts:1505-1518 | `kick`: actor member-or-CEO; target row composite match | equality ×2 | `NOT_AUTHORIZED` / `NOT_A_MEMBER` | unchanged |
| 71 | src/daemon/channels/ChannelService.ts:1681-1713 | `invite`: inviter must be member; `ws-human` cannot be invited | `isVisibleTo` + equality | `NOT_AUTHORIZED` | unchanged |
| 72 | src/daemon/channels/ChannelService.ts:1819-1827 | `post` sender pin: `sender.workspaceId === verifiedWorkspaceId` | simple equality | `NOT_AUTHORIZED` (pre-idempotency) | unchanged |
| 73 | src/daemon/channels/ChannelService.ts:1888-1891 | `post` membership keyed on workspaceId only | equality over member rows | `NOT_A_MEMBER` | unchanged |
| 74 | src/daemon/channels/ChannelService.ts:2372-2374 | `ack` gate (strict membership) | `isVisibleTo` | `CHANNEL_NOT_FOUND` (existence hiding) | unchanged |
| 75 | src/daemon/a2a/A2aTaskService.ts:313-315 | task `transition`: only receiver ws may update | simple equality (`to.workspaceId === caller`) | error result | unchanged |
| 76 | src/daemon/a2a/A2aTaskService.ts:319-328 | pane-granular authz for pane-pinned tasks; soft-defer when unresolved | pane equality / presence | error / soft refusal | unchanged |
| 77 | src/daemon/a2a/A2aTaskService.ts:416-420 | `cancelTask`: sender OR receiver | two equalities | error result | unchanged (dual-party precedent) |
| 78 | src/daemon/a2a/A2aTaskService.ts:474 | teardown fails tasks addressed to removed ws | equality on `to.workspaceId` | n/a | unchanged |
| 79 | src/daemon/a2a/A2aTaskService.ts:515-521 | `queryTasks` visibility: from OR to + role filter | dual-party equality | ⚠️SILENT filtered | unchanged |
| 80 | src/daemon/a2a/A2aTaskService.ts:614-635 | audit principal + eventlog `authContext` stamping | server stamp (non-authorizing) | n/a | unchanged |
| 81 | src/daemon/worktask/WorkTaskService.ts:363 | one open mission per workspace | equality on `owner.verifiedWorkspaceId` | conflict | unchanged |
| 82 | src/daemon/worktask/WorkTaskService.ts:450-458 | `closeMission`: owner OR CEO | two equalities | "not the task owner or CEO" error | unchanged (existing owner-or-CEO shape) |
| 83 | src/daemon/worktask/WorkTaskService.ts:522-530 | `updateMission`: owner OR CEO | two equalities | error | unchanged |
| 84 | src/daemon/worktask/WorkTaskService.ts:623-627 | `listMissions` scope | equality `owner.verifiedWorkspaceId === caller` | ⚠️SILENT filtered list | unchanged |
| 85 | src/daemon/worktask/WorkTaskService.ts:219,714-747 | idempotency identity from persisted `authContext`; keys namespaced `{op}:{verifiedWorkspaceId}:{key}` | derived from server stamp | cache miss | unchanged |
| 86 | src/daemon/index.ts:2661-2679 (+2696-3060 per-handler) | channel/worktask RPCs require server-resolved `verifiedWorkspaceId` (`stampCaller`) | non-empty check after stamping | `NOT_AUTHORIZED` fail-closed | unchanged |
| 87 | src/daemon/index.ts:2845-2879 | `a2a.channel.create` stamped; `archive` deliberately NOT stamped (humans-only) | non-empty / absence of stamping | `NOT_AUTHORIZED` | unchanged |
| 88 | src/daemon/index.ts:3020-3045 | `operatorJoin` humans-only, unstamped, params stripped | presence | `NOT_AUTHORIZED` | unchanged |
| 89 | src/daemon/index.ts:3161-3250 | `task.mission.*` require server-resolved ws | non-empty after `stampCaller` | `NOT_AUTHORIZED` | unchanged |
| 90 | src/daemon/index.ts:3071-3140 | `a2a.task.create/update/cancel/query`: caller ws taken VERBATIM from `p.workspaceId`, no `stampCaller` | none (caller-supplied) | validation error only; query ⚠️SILENT scoped set | resolved → **U1: ACCEPTED** (equal protection strength to the channel path, not an asymmetry) |
| 91 | src/daemon/index.ts:3293-3304 | `a2a.principal.upsert`: `record.ptyId` must resolve to `record.workspaceId` | derived lookup + equality | `NOT_AUTHORIZED` fail-closed | unchanged |
| 92 | src/daemon/index.ts:3314-3336 | `principal.remove` / `markStaleWorkspace`: stamped id required but NOT compared to target | non-empty presence only | `NOT_AUTHORIZED` only when absent | unchanged (see U4) |
| 93 | src/daemon/principals/PrincipalService.ts:201-208 | bulk stale-marking by workspace | simple equality | `false` if empty | unchanged |
| 94 | src/daemon/DaemonPipeServer.ts:447-449 (+252) | whole-pipe admission token; pre-auth rate limit | `crypto.timingSafeEqual` / counter | socket dropped / refused | unchanged |
| 95 | src/daemon/web/WebTerminalServer.ts:1555-1574 | phone-supplied `workspaceId` stamped into spawned pane only if it matches a live session | regex allowlist + derived lookup | `unknown-workspace-id` fail-closed | unchanged |
| 96 | src/daemon/lanlink/router.ts:27-40 | inbound peer message kinds admitted | frozen positive allowlist | `RouterError` throw | unchanged |
| 97 | src/daemon/lanlink/deliver.ts:17-18 | local vs lanlink recipient routing (discriminant, not authz) | tagged union | n/a | unchanged |
| 98 | src/daemon/approvals/types.ts:29-33 | approval `workspaceId` from resolved session env, never hook envelope | derived | ⚠️SILENT field omitted if unresolvable | unchanged |

## 3. MCP layer (`src/mcp/`)

| # | file:line | what it decides | comparison | on failure | hierarchy impact |
|---|---|---|---|---|---|
| 99 | src/mcp/workspaceIdentity.ts:25-37 | env-hinted/cached ws classified live/absent/unknown | derived lookup (list scan) | `'unknown'` keeps trusting hint (deliberately not fail-closed) | unchanged |
| 100 | src/mcp/paneResolver.ts:96-103 | claimed external route usable only with both ptyId+workspaceId | shape validation | throw fail-closed | unchanged |
| 101 | src/mcp/paneResolver.ts:53-69, connectionScope.ts:59-64 | per-connection vs per-process pin/identity state | AsyncLocalStorage derived lookup | falls back to module globals | unchanged |
| 102 | src/mcp/terminalRouting.ts:88-96 | invariant: never route a terminal RPC with empty workspaceId (empty skips main's assert) | emptiness check | throw fail-closed | **candidate** — router must learn to emit an owner-scoped route, or the feature dies here before main is reached |
| 103 | src/mcp/terminalRouting.ts:106-155 | verified-cache fast path; PID-map hit ⇒ first-party; rpc-down/empty-map retries | derived lookups + counters | throw or degrade-to-external | unchanged |
| 104 | src/mcp/terminalRouting.ts:172-180 | external caller + explicit ptyId REFUSED before claiming a dedicated terminal | pin presence | throw fail-closed ("External MCP callers cannot target an explicit ptyId…") | **candidate** — an orchestrator targeting its task's pane by ptyId hits this refusal at the MCP layer first |
| 105 | src/mcp/terminalRouting.ts:200-219 | commander-brain fleet-wide targeting via `WMUX_COMMANDER_TOKEN` → `deck.resolvePaneRoute` | token validation | ⚠️SILENT null ⇒ falls through to external rules | unclear — needs decision (nearest existing mechanism to "owner reads a foreign pane") |
| 106 | src/mcp/index.ts:419-439 | stale-identity self-heal: regex `/no workspace found|not owned by workspace/i` on every RPC result/error | regex match | invalidate cache, rethrow | **candidate** side-effect — an owner-allowed call that still errors this way would wrongly nuke identity cache; conversely allowed calls stop producing the signal |
| 107 | src/mcp/index.ts:506-556 | identity resolution: server PID walk → client PID-chain walk | derived lookups | miss ⇒ confirmed external | unchanged |
| 108 | src/mcp/index.ts:602-666 | weak resolver for A2A/non-terminal tools: cache → commander home ws → spoofable `WMUX_WORKSPACE_ID` env hint → cached-id-unless-dead | liveness classification, no ownership proof | ⚠️SILENT `''` ⇒ downstream active-ws fallback | unchanged |
| 109 | src/mcp/index.ts:724-733 | hard identity gate on every workspace-routed WRITE tool | non-empty check | throw "Workspace identity unknown…" | unchanged |
| 110 | src/mcp/index.ts:750-761 | fail-soft READ scoping for `pane_list`/`surface_list`/CREATE family; pin preferred over UI-active | derived + liveness + pin fallback | ⚠️SILENT `''` ⇒ renderer UI-active ws | unchanged |
| 111 | src/mcp/index.ts:770-794 | commander route → verified terminal route binding for all four terminal tools | token validation + router | commander failure silent; router throws | unclear — needs decision |
| 112 | src/mcp/index.ts:809,826,846 | `browser_open`/`browser_close`/PlaywrightEngine use strict `requireWorkspaceId` (never `''`) | non-empty check | throw | unchanged |
| 113 | src/mcp/index.ts:854-856 | browser SESSION tools carry no workspaceId (global by design) | none | n/a | unchanged |
| 114 | src/mcp/index.ts:891-943 | all four terminal tools stamp `workspaceId: route.workspaceId` from the verified router; main then asserts ownership | derived (router) + main-side assert | throw (router) or "not owned by workspace ws-…" (main) | **candidate** — the stamped ws is what main compares; owner semantics must be expressed here or in main's assert |
| 115 | src/mcp/index.ts:1024-1037 | `surface_list`/`pane_list`: caller-supplied ws wins, no ownership check MCP-side | caller override | ⚠️SILENT `''` ⇒ renderer active ws | unchanged |
| 116 | src/mcp/index.ts:1046-1077 | `pane_set/get_metadata`, `wmux_search_panes` confined to calling ws | `requireWorkspaceId` | throw | unclear — needs decision |
| 117 | src/mcp/index.ts:1088-1101 | `wmux_events_poll`: self-asserted ws scopes lifecycle only; PRIVATE types scoped by server-resolved `senderPtyId` | derived + main re-resolution | ⚠️SILENT — missing senderPtyId ⇒ private types fail closed silently | **candidate** (same as #28, MCP side) |
| 118 | src/mcp/index.ts:1117-1174 | `a2a_whoami` / `send_message`: `requireWorkspaceId` + weak senderPtyId; pane must belong to `to` (renderer enforces) | non-empty + renderer-side pane↔to match | throw / renderer reject; absent senderPtyId ⇒ ⚠️SILENT paste-suppress | unchanged |
| 119 | src/mcp/index.ts:1207-1338 | all `a2a_task_*` / `company_a2a_*` stamp caller ws | `requireWorkspaceId` (weak resolver under it) | throw on identity miss | unchanged |
| 120 | src/mcp/index.ts:344-346,1368-1371 | `senderPtyId` provenance split: channel tools get walk-hit-only `MY_PTY_ID` (never env hint) | derived, no weak fallback | ⚠️SILENT `''` ⇒ main fails closed on mutations | unchanged |
| 121 | src/mcp/index.ts:400-413 | commander tool-surface allowlist at every registration site | allowlist (`COMMANDER_TOOL_SURFACE`) | ⚠️SILENT tool not registered | unchanged |
| 122 | src/mcp/index.ts:1384-1387, paneLifecycle.ts:107-143 | CREATE family (`pane_split`, `surface_new`): explicit ws else own; `''` ⇒ renderer active-ws | caller override / fail-soft resolver | ⚠️SILENT fallback; explicit-unknown rejected renderer-side | unchanged |
| 123 | src/mcp/paneLifecycle.ts:120,128,151 | ADDRESS family (`pane_close`, `pane_focus`, `surface_close`): NO ownership check, id resolved across ALL workspaces | none (unguessable UUID + OS-user ceiling) | n/a | unchanged (already cross-ws; the asymmetry the feature request cites) |
| 124 | src/mcp/channels.ts:96-97,274-541 | every channel RPC stamps `workspaceId`+`verifiedWorkspaceId` from one resolver; main re-derives from `senderPtyId` | derived; real check main-side | structured `isError` | unchanged |
| 125 | src/mcp/channels.ts:449-450 | private-channel member list for non-members | main-side membership | ⚠️SILENT empty list (intentional non-leak) | unchanged |
| 126 | src/mcp/channels.ts:380-386 | no `channel_archive` MCP tool exists | allowlist-by-omission | unreachable | unchanged |
| 127 | src/mcp/playwright/PlaywrightEngine.ts:398-413 | selection ctx resolved before shared state; external-backend ws w/o surface refused | derived + equality | throw fail-closed | unchanged |
| 128 | src/mcp/playwright/PlaywrightEngine.ts:455-462,487-494 | resolver absent/throwing/empty ⇒ `unscoped` (legacy-lenient, cross-ws read possible); legacy client-side filter `t.workspaceId === workspaceId` | derived / simple equality | ⚠️SILENT unscoped | unchanged (see U7) |
| 129 | src/mcp/playwright/PlaywrightEngine.ts:477-482,506-547,573 | modern `targetsScoped` empty ⇒ auto-open own surface, never borrow; ws-keyed locks/latches | server filter + derived keys | `{kind:'none'}` → auto-open | unchanged |
| 130 | src/mcp/playwright/PlaywrightEngine.ts:651-666,713-720,804-811 | auto-open fails closed w/o resolvable ws; targets[0] fallback ws-scoped server-side (#580) | non-empty / scoped RPC | ⚠️SILENT `false`, stderr only / unscoped when ws undefined | unchanged |
| 131 | src/mcp/playwright/tools/navigation.ts:227-244 | `browser_tabs` refuses without resolved caller ws | strict resolver (throws, no UI-active fallback) | structured error fail-closed | unchanged |
| 132 | src/mcp/playwright/automationLease.ts:16-31 | automation lease (concurrency, not a ws boundary) | token | ⚠️SILENT fail-OPEN | unchanged |

## 4. Renderer + shared (`src/renderer/`, `src/shared/`)

| # | file:line | what it decides | comparison | on failure | hierarchy impact |
|---|---|---|---|---|---|
| 133 | src/renderer/hooks/useRpcBridge.ts:872-884 | `pane.focus`: owner resolved across ALL workspaces; then commander confinement equality | derived lookup + simple equality | error fail-closed | unchanged |
| 134 | src/renderer/hooks/useRpcBridge.ts:677,907 | `pane.split`/`surface.new`: explicit-but-unknown ws is an error, never active-ws fallback | derived + explicitness check | error | unchanged |
| 135 | src/renderer/hooks/useRpcBridge.ts:1030-1042 | `pane.validateWorkspace`: pane↔ws binding oracle for MetadataStore | scoped derived lookup | error | unclear — needs decision (same question as #20) |
| 136 | src/renderer/hooks/useRpcBridge.ts:1074 | `pane.search` explicit-unknown ws errors (comment rejects silent-empty) | derived lookup | error | unchanged |
| 137 | src/renderer/hooks/useRpcBridge.ts:1269-1288 | `input.findOwnerWorkspace`: pty → owning ws (the oracle main's terminal gate consumes) | derived lookup over all ws trees | ⚠️SILENT `{workspaceId:null}` (main expected to fail closed on it) | **candidate** — the "who owns this pty" answer the owner-check would compose with |
| 138 | src/renderer/hooks/useRpcBridge.ts:1295,1313-1326 | `input.readScreen`: caller ws else active; pty-in-ws membership when both given | fallback + membership scan | error / ⚠️SILENT `{ptyId:null,text:''}` | **candidate** (read path resolution) |
| 139 | src/renderer/hooks/useRpcBridge.ts:1389 | `input.getActivePtyId` uses activeWorkspaceId unconditionally | active-ws implicit | ⚠️SILENT `{ptyId:null}` | unchanged |
| 140 | src/renderer/hooks/useRpcBridge.ts:1407,1413 | `meta.setStatus`/`setProgress` write ACTIVE workspace metadata, no caller scope | active-ws implicit | ⚠️SILENT always ok:true | unchanged (see U8) |
| 141 | src/renderer/hooks/useRpcBridge.ts:1430,1479-1511 | `browser.open` target ws; `browser.close` byWorkspace scoped to routed ws only | caller-supplied else active / scoped lookup | error | unchanged |
| 142 | src/renderer/hooks/useRpcBridge.ts:1545-1580 | `a2a.resolve.identity` / `whoami` validation; `a2a.discover` enumerates EVERY workspace | derived lookups / none | ⚠️SILENT `''` / error / n/a | unchanged (discover already fleet-global) |
| 143 | src/renderer/hooks/useRpcBridge.ts:1704,1727,2054-2067 | a2a reply/update: caller ∈ {from,to}; same-ws pane-anchored participant check | simple equality / pane equality | error "not authorized" | unchanged |
| 144 | src/renderer/hooks/useRpcBridge.ts:1802-1856 | new-task target resolution (id/name/number/substring, ambiguity refused); address resolved ONLY in target ws tree; `senderPtyId` trusted only if live terminal pty in sender's own ws | derived + ambiguity + membership | error / ⚠️SILENT treated-as-absent → paste suppressed | unchanged |
| 145 | src/renderer/hooks/useRpcBridge.ts:2154-2160 | `a2a.task.cancel` `daemonCommitted` envelope applied verbatim, no re-validation | marker flag | ⚠️SILENT trust delegated to daemon | unchanged (see U9) |
| 146 | src/renderer/hooks/useRpcBridge.ts:393-399 | a2a task event stamped base `workspaceId === from` | derived from task metadata | early return if fields missing | unchanged |
| 147 | src/renderer/hooks/a2aAddressing.ts:65-68,120-133 | pane/surface must exist in TARGET ws; same-ws ambiguity/self-send rejected; unverified sender ⇒ paste suppressed | scoped membership / equality | error / reject / ⚠️SILENT suppress | unchanged |
| 148 | src/renderer/stores/slices/a2aSlice.ts:201,213 | `updateTaskStatus`: receiver-only + pane-granular | simple equality / pane equality | `{ok:false}` | unchanged |
| 149 | src/renderer/stores/slices/a2aSlice.ts:296-299,318-320,369 | `cancelTask` sender-or-receiver; `queryTasks` dual-party filter; mention queue scoped to `to` | equalities | error / ⚠️SILENT filtered | unchanged |
| 150 | src/renderer/stores/slices/a2aSlice.ts:353-357 | agent skills map: keyed lookup, any ws readable | keyed lookup, no authz | ⚠️SILENT null | unchanged |
| 151 | src/renderer/stores/slices/channelsSlice.ts:499-670,589-607,867-1137 | member dedup on composite `(workspaceId,memberId)`; unread/mention keyed on `HUMAN_WORKSPACE_ID`; every daemon mutation stamps caller's `verifiedWorkspaceId` (daemon re-checks) | composite equality / constant / caller-derived | ⚠️SILENT filters / daemon-side rejection | unchanged |
| 152 | src/renderer/hooks/useChannelsHydration.ts:102-106,135,196-203,245 | reads stamp `workspaceId`=`verifiedWorkspaceId` (identity alignment); hydration identity = `HUMAN_WORKSPACE_ID` | self-asserted | ⚠️SILENT `return 0` (no hydration) | unchanged |
| 153 | src/renderer/hooks/useChannelsEventSubscription.ts:220-246,555-557,656-660 | poll set = all local ws ∪ human seat; mention routing by ws membership; catalog re-hydration for `'*'`/own/recipient | union set / membership + sentinel | ⚠️SILENT skip | unchanged |
| 154 | src/renderer/stores/slices/paneSlice.ts:380,507-530,655,679-681 | split/close target ws else active; `focusPaneSurface` exact-ws resolve, no fallback; `pane.focused` emits true owner ws | fallback / simple equality / derived | ⚠️SILENT no-op / silent return | unchanged |
| 155 | src/renderer/stores/slices/surfaceSlice.ts:93-242,161-176,271-353 | surface mutations `workspaceId || activeWorkspaceId`; `diffOwnerWorkspaceId` write-once on create; six all-ws surface scans | fallback / absence check / global scan | ⚠️SILENT no-op / keeps existing owner / ⚠️SILENT | `diffOwnerWorkspaceId` is an existing per-surface owner field — the closest in-tree precedent for "owner ≠ container ws" |
| 156 | src/renderer/components/Pane/Pane.tsx:949,1037 | diff panel identity = `diffOwnerWorkspaceId || workspaceId` | fallback | ⚠️SILENT fallback | same precedent as #155 |
| 157 | src/renderer/stores/slices/deckSlice.ts:95-100,171 | brain thread auto-created for ANY workspaceId, no ownership validation | keyed lookup/write | never fails | unchanged (see U10) |
| 158 | src/renderer/stores/slices/workTaskSlice.ts:83,159-161 | missions cache keyed by owner ws; renderer list call passes parent ws as `verifiedWorkspaceId` (process-boundary trust) | keyed map / self-asserted | n/a | **candidate** — the renderer already reads missions AS the parent workspace; the feature generalizes this pattern |
| 159 | src/shared/rpc.ts:34,152 | `commanderToken` presence = role claim; `commanderWorkspace` written only by validation (documented invariant) | field presence / invariant | router rejects | unchanged |
| 160 | src/shared/commanderSurface.ts:47,100,157 | commander MCP-tool allowlist / RPC-method allowlist / teardown denylist | allowlists + denylist | uncallable / rejection | unclear — needs decision (whether owner-scope reuses or parallels this surface) |
| 161 | src/shared/events.ts:128,357-359,411-436 | every event carries `workspaceId`; a2a.task invariant base=from, from/to required; `recipientWorkspaceIds` + `'*'` | schema invariants | event dropped if ws unresolvable | unchanged |
| 162 | src/shared/orchestratorRole.ts:94 | role→model bindings operator-level, cross-workspace by design | none | n/a | unchanged |
| 163 | src/shared/workTask.ts:23-27,244 | `verifiedWorkspaceId` is the authz anchor (principalId display-only); `ownerWorkspaceId` on scan entries = close-time identity | schema | absent ⇒ handler default (#55) | **candidate** — owner-identity data model for the feature |
| 164 | src/shared/eventlog.ts:33,57,131 | eventlog `authContext.verifiedWorkspaceId` is audit anchor, explicitly "not authz" | server stamp | n/a | unchanged |

---

## Classification summary

- **Total decision points recorded: 164** (rows above; several rows bundle 2–4 adjacent checks in one function — counted as listed).
- By kind (a row with both read+write counted in both):
  - **Read checks:** ~48 (terminal read gates, channel/list/get disclosure, browser target filters, identity oracles)
  - **Write checks:** ~72 (terminal send, channel mutations, a2a transitions, mission ops, commander pinning, browser open/close)
  - **Event filters:** ~20 (events.rpc.ts poll scoping, renderer channel subscription, shared event schema)
  - **Non-boundary infrastructure** (identity population, transport admission, audit stamps): ~24
- The load-bearing equality that produced the observed cross-workspace refusal (`terminal_read`/`terminal_send`) is a **three-layer chain**: MCP `terminalRouting.ts:172-180` (refuses explicit foreign ptyId before main is even called) → route stamp `index.ts:891-943` → main `input.rpc.ts:118-122` `assertWorkspaceOwnsPty` (simple equality vs `useRpcBridge.ts:1269` owner oracle). All three would be touched by an "same-or-owner" rule; changing only main's assert would still be blocked at the MCP router.

## Already-cross-workspace exceptions (with in-code justification)

1. **ADDRESS-family pane lifecycle** (`pane_close`/`pane_focus`/`surface_close`) — src/mcp/paneLifecycle.ts:20-26: "the renderer resolves it across ALL workspaces — no workspaceId, no MCP-layer ownership re-check … ids are unguessable UUIDs and the OS-user account is the trust ceiling (issue #113)". Mirrored main-side at pane.rpc.ts:315-320 and useRpcBridge.ts:778-783, 865-870 ("so an external agent can focus a pane in its own background workspace").
2. **A2A tasks are dual-party** — src/mcp/index.ts:179: "UNLIKE every other event type … 'a2a.task' is DUAL-PARTY: visible to BOTH the sending (from) and receiving (to) workspace, and to no third workspace." Enforced at events.rpc.ts:169-177/246-250, A2aTaskService.ts:416-420, 515-521.
3. **Cross-workspace A2A send is the normal path** — a2aAddressing.ts:99: "Different workspace → always deliver (cross-ws path unchanged)."
4. **Channels: per-recipient fan-out + public catalog broadcast** — events.rpc.ts:254-257 ("every member workspace appears in recipientWorkspaceIds so a post reaches its full set without leaking to third parties") and events.rpc.ts:268-272 / events.ts:435-437 ("'*' sentinel = broadcast to every workspace"). `channel_invite` adds another workspace by design (channels.ts:416-420).
5. **Human operator observation** — ChannelService.ts:729-750: `isObservableBy` is "Intentionally WIDER than isVisibleTo and used ONLY by the read paths … observation grants no post and no roster seat." An existing read-wider-than-write precedent.
6. **CEO override** — ChannelService.ts:976, 1505; WorkTaskService.ts:452, 524 (owner OR CEO). An existing two-party authz precedent.
7. **Lifecycle-event firehose** — events.rpc.ts:283-286: "Not a confidentiality boundary — an unscoped poll already returns the all-workspace firehose … honoring the client's workspaceId here is a convenience filter."
8. **Commander brain** — commanderSurface.ts:35-41: "READS are fleet-global, WRITES are confined to the commander's workspace." Fleet-wide pane targeting via token at terminalRouting.ts:186-219. Note: the WRITE half is enforced at exactly three sites (pane.rpc.ts:289-295, pane.rpc.ts:259→useRpcBridge.ts:884, surface.rpc.ts:39-46); the READ half is enforced nowhere by design.
9. **Internal callers skip the terminal ownership assert entirely** — input.rpc.ts:110-112: "Returns silently when expectedWorkspaceId is undefined — internal callers (CLI, UI) skip this check."
10. **Browser sessions are global** — src/mcp/index.ts:854-856; CDP port disclosure acknowledged as same-user ceiling at browser.rpc.ts:539-546.
11. **Role→model bindings** — orchestratorRole.ts:94: "Operator-level, cross-workspace."
12. **Process-boundary trust of renderer-supplied `verifiedWorkspaceId`** — a2a.channel.rpc.ts:244-247 and useRpcBridge.ts:227-230, 254-256 (renderer-only IPC lanes trust the caller-supplied id; documented same-user residual).

## Silent-failure points (complete list — highest-risk places for a hierarchy change)

Empty/filtered/no-op instead of an error:

- events.rpc.ts:235-238 — unresolvable agent identity ⇒ empty privateSet ⇒ ALL private events silently dropped (#28)
- events.rpc.ts:246-286, 305-313, 102-105 — every per-type event filter drops silently (#29–#35)
- input.rpc.ts:112 — ownership assert silently skipped for internal callers (#5)
- surface.rpc.ts:18 / pane.rpc.ts:135, 640-650 — unscoped list/search silently falls back to UI-active ws (#17, #24, #25)
- pane.rpc.ts:479-489, 587-600 — `orchestrator.role` silently stripped/preserved (#22, #23)
- browser.rpc.ts:551-569 — cdp targets silently filtered (#49); browser.rpc.ts:306-347 — active-ws fallback (#50)
- a2a.rpc.ts:219-234 — stale pid-map entries silently dropped (#46); a2a.rpc.ts:445-457 — spawn silently downgraded to message-only (#47)
- a2a.channel.rpc.ts:117-134 — principalId silently stripped (#43)
- ChannelService.ts:576, 596, 617, 641, 673, 679-690 — list/get/members/messages return filtered/empty/null indistinguishable from not-found (#61–#65)
- A2aTaskService.ts:515-521 / a2aSlice.ts:318-320, 369 — query/mention visibility silently filtered (#79, #149)
- WorkTaskService.ts:623-627 — listMissions silently filtered to owner (#84)
- approvals/types.ts:29-33 — workspaceId silently omitted when unresolvable (#98)
- terminalRouting.ts:200-219 — commander route failure silently degrades to external rules (#105)
- src/mcp/index.ts:602-666, 750-761, 1088-1101, 344-346, 400-413 — weak-resolver `''`, fail-soft read scope, missing senderPtyId private-event fail-close, commander tool non-registration — all silent (#108, #110, #117, #120, #121)
- PlaywrightEngine.ts:455-462, 487-494, 506-520, 651-666, 713-720, 804-811 — unscoped lenience, silent auto-open refusal (#128–#130); automationLease.ts:16-31 fail-open (#132)
- channels.ts:449-450 — member list silently empty for non-members (#125)
- useRpcBridge.ts:1269-1288 (`{workspaceId:null}`), 1326, 1389, 1407-1413, 1545, 1570, 1856, 2154-2160 (#137–#140, #142, #144, #145)
- a2aAddressing.ts:133 — task persisted but paste silently suppressed (#147)
- paneSlice.ts:507-530, 655; surfaceSlice.ts:93-242, 271-353; Pane.tsx:949, 1037 — silent no-ops/fallbacks (#154–#156)
- useChannelsHydration.ts:102/196 — silent no-hydration (#152); useChannelsEventSubscription.ts:555-557, 656-660 — silent skip (#153)
- worktask.handler.ts:149,165 — ownerWorkspaceId silent default (#55)

## Uncertainties (not resolved by this survey)

- **U1 — `a2a.task.*` daemon handlers are unstamped.** daemon/index.ts:3071-3140 takes `callerWorkspaceId` verbatim from `p.workspaceId` with no `stampCaller`, unlike every `a2a.channel.*`/`task.mission.*` handler; main's a2a.rpc.ts:329-468 also passes `params.workspaceId` through. Whether the #113 same-user ceiling is the intended cover was not traced end-to-end. → **Resolved in "Verification of open items": U1 = ACCEPTED.** It is the intended cover, and the channel path's stamp is an enablement device, not an anti-forgery boundary. → **U1: ACCEPTED** — verified, not a protection gap; see §Verification of open items
- **U2 — where `pane.focus` confinement lands for non-commander wire callers** when `confineWorkspaceId` is absent (main forwards only; renderer resolves globally). Verified for commanders, unverified for the general wire case.
- **U3 — `operatorList` comment vs registration.** ChannelService.ts:604-612 + daemon/index.ts:3040-3046 say "파이프 미등록 + 렌더러 전용" but the handler IS registered on `pipeServer` at daemon/index.ts:3050. Stale comment or wider-than-designed surface — not determined.
- **U4 — `a2a.principal.remove`/`markStaleWorkspace`** (daemon/index.ts:3314-3336) require a stamped id but never compare it to the target workspace; whether that is a humans-only transport like archive/kick is undocumented.
- **U5 — `resolveCallerWorkspace`** (events.rpc.ts ~58) renderer round-trip: not verified immune to a caller-supplied `senderPtyId` mapping to a foreign pane.
- **U6 — LanLink inbound path has no workspace concept** (router.ts gates by message kind only); presumed intentional, not documented as such.
- **U7 — PlaywrightEngine `{kind:'unscoped'}`** (PlaywrightEngine.ts:455-462, 490, 519) is the widest not-explicitly-intentional cross-ws read surface found; field frequency of the lenient path unknown.
- **U8 — `meta.setStatus`/`setProgress`** (useRpcBridge.ts:1407,1413) write to whatever workspace the human is viewing, with no caller scope and no acknowledging comment. Intentional legacy or unguarded write — not determined.
- **U9 — `daemonCommitted` verbatim-apply path** (useRpcBridge.ts:2154-2160): whether the daemon envelope is authenticated vs a settable plain param was decided outside the surveyed files.
- **U10 — deckSlice `threadOf`** auto-creates a brain thread for any workspaceId; whether untrusted ids can reach it depends on the deck event envelope path, untraced.
- **U11 — company.rpc.ts:232-277** passes `workspaceId` straight to the renderer with no main-side verification; the authz point, if any, is renderer-side and was not located.
- **U12 — `assertWorkspaceOwnsPty` strictness** was read main-side (input.rpc.ts:118-122, simple equality), but the MCP survey could not independently confirm the `''`-workspaceId skip described at terminalRouting.ts:31-34 is still current main-side behavior (it is — input.rpc.ts:112 — but the two readings were not made against the same call graph).
- **U13 — `COMMANDER_TOOL_SURFACE` membership** (which MCP tools it admits) was not enumerated.
- **U14 — `HUMAN_WORKSPACE_ID` privilege model**: whether the daemon treats the constant as a privileged principal beyond `isObservableBy` was not confirmed.

---

# Verification of open items

Date: 2026-07-28, same tree (`main` @ d3c4aca5). Read-only; no code changed.
Each item's call chain was re-read from scratch rather than re-using §1–§4 notes.

**Verdict vocabulary.** REAL = reachable defect, stated with a concrete path (who / what they
send / what happens), every step anchored. BLOCKED = an upstream check stops it; the blocking
`file:line` is named. ACCEPTED = real but inside an already-accepted risk envelope.
STILL UNCLEAR = the code does not settle it.

**The discriminator used throughout.** This repo carries an accepted limitation, the
**#113 same-user ceiling**: `senderPtyId`/`callerPid` arrive as RPC *params*, not from the
connection peer, and any same-OS-user process can read the pipe auth token — so a same-user
process can forge identity. Stated in-code at `src/mcp/index.ts:502-509`
("a same-user caller could assert a foreign pid … stays within the #113 same-user trust
ceiling"), `src/main/pipe/handlers/events.rpc.ts:38-47`, and `src/mcp/paneLifecycle.ts:20-26`.
"A same-user process could forge it" therefore does NOT make a finding REAL. REAL requires
(a) an agent in ANOTHER workspace crossing its boundary through ordinary in-app MCP tool
calls, (b) a prompt-injected agent crossing a boundary with no human approval step, or
(c) sibling surfaces that gate the same thing where one does not.

One structural fact underpins most of the BLOCKED/ACCEPTED verdicts below: **MCP tool handlers
construct their RPC params object server-side from a declared zod shape.** A model can only
influence values that appear in that shape. Consequently "the handler forwards
`params.workspaceId` verbatim" is only exploitable by a raw pipe client — unless the tool's own
shape exposes a workspace or surface selector, which is exactly what makes U7 different.

## Verdict summary

| Item | Verdict | One-line reason |
|---|---|---|
| U7 — Playwright explicit `surfaceId` | **REAL (critical)** | Model-supplied `surfaceId` selects any workspace's browser page; no ownership check anywhere on the path |
| U7b — Playwright `{kind:'unscoped'}` | **REAL (fail-open)** | Identity/RPC failure downgrades to global page selection; trigger is a fault, not attacker-controlled |
| U8 — `meta.setStatus`/`setProgress` | **REAL (low severity)** | Caller-supplied `workspaceId` honored with zero verification; display-only blast radius |
| U1 — `a2a.task.*` unstamped | ACCEPTED (corrected — first pass said REAL(c)) | Mechanism differs from channel/mission, protection strength does not; MCP surface pins the id |
| U2 — `pane.focus` non-commander | ACCEPTED | Documented ADDRESS-family contract; `pane_close` is the sharper instance of the same envelope |
| U3 — `operatorList` | ACCEPTED | Daemon socket only; not on the main router, not an MCP tool. Comment is confusing, not stale |
| U4 — `principal.remove`/`markStale` | ACCEPTED | Daemon socket only; ≤60 s self-healing availability degradation |
| U5 — `resolveCallerWorkspace` | ACCEPTED / BLOCKED for MCP | Forgeable `senderPtyId` is the documented #113 residual; MCP builds it server-side |
| U9 — `daemonCommitted` | ACCEPTED (premise falsified) | Caller params DO survive to the renderer on the fallthrough; pipe-only caller class |
| U10 — `deckSlice.threadOf` | BLOCKED | No wire origin; workspace id is main-stamped and regex-validated |
| U11 — `company.*` | ACCEPTED | MCP tools pin the id; two non-security findings recorded |

---

## U7 — PlaywrightEngine cross-workspace page selection — **REAL (critical)**

Two distinct defects live here. The second is the one the original survey asked about; the
first was found while verifying it and is considerably worse.

### U7a — explicit `surfaceId` bypasses scoping entirely (attacker-controlled)

`resolveSelectionContext` short-circuits on a caller-supplied surface id **before** any
workspace resolution runs, and returns a context whose `workspaceId` is `undefined`:

- `src/mcp/playwright/PlaywrightEngine.ts:509-510` — `if (explicitSurfaceId) return { key: \`surf:${explicitSurfaceId}\`, surfaceId: explicitSurfaceId, callerHasNoSurface: false }`. No ownership check, no resolver call.

That `undefined` workspaceId then *disables* the server-side filter that #580 added:

- `src/mcp/playwright/PlaywrightEngine.ts:547` — `findViaTargetDomain(surfaceId, ctx.workspaceId)` with `ctx.workspaceId === undefined`.
- `src/mcp/playwright/PlaywrightEngine.ts:713-716` — `sendRpc('browser.cdp.info', workspaceId ? { workspaceId } : {})` → the param-less branch, so `src/main/pipe/handlers/browser.rpc.ts:551-569` returns **every** workspace's targets (`targetsScoped` is only set when the param is present, `browser.rpc.ts:592`).
- `src/mcp/playwright/PlaywrightEngine.ts:718-719` — `info.targets.find((t) => t.surfaceId === surfaceId)` matches the foreign target; `:723-733` attaches it; the page is returned.

**Attack path.** WHO: an agent in workspace A (ordinary in-app MCP client; nothing forged).

1. `workspace_list` — `src/mcp/index.ts:1006-1011`. Input shape is `{}`; the tool returns every workspace id with no scoping. A now knows B's id.
2. `surface_list({ workspaceId: "<B>" })` — the shape exposes `workspaceId` to the model (`src/mcp/index.ts:134-136`) and the handler uses the caller's value verbatim (`src/mcp/index.ts:1024`: `workspaceId || (await resolveScopedReadWorkspaceId())`). Main forwards without a check (`src/main/pipe/handlers/surface.rpc.ts:18`) and the renderer looks up **whatever workspace was named** (`src/renderer/hooks/useRpcBridge.ts:627-630`: `const ws = store.workspaces.find((w) => w.id === targetWsId); if (!ws) return []`), returning each surface's `id`, `surfaceType`, and `browserUrl` (`useRpcBridge.ts:646-659`). A now knows B's browser `surfaceId`.
3. `browser_snapshot({ surfaceId: "<B's browser surface>" })` — `surfaceId` is a declared model input on the browser tools (`src/mcp/playwright/tools/inspection.ts` BROWSER_SNAPSHOT_SHAPE; `extraction.ts:22,38,48`; `file.ts:26,37,49,60`; `navigation.ts:26,30`).
4. `engine.getPage(surfaceId)` (`PlaywrightEngine.ts:391,398`) → the `:509-510` short-circuit → `:713-719` → B's page.

WHAT HAPPENS: `src/mcp/playwright/tools/inspection.ts:309-311` returns B's full accessibility
snapshot. The same selection feeds `browser_evaluate` (`inspection.ts:414-416`,
`evaluateWithGesture(page, expression)` — **arbitrary JS in B's page**, so DOM, `localStorage`,
and any in-page token), `browser_console` (`:451-456`), `browser_network` (`:491+`),
`browser_response_body` (`:531+`), element screenshots (`:350-357`), `browser_smart_snapshot`
and `browser_extract_data` (`extraction.ts:74-77`, `:155-157`), and the write-side
click/fill/type in `interaction.ts:196,251,296`.

No identity is forged at any step, and no approval prompt sits on the path, so the #113 ceiling
does not absorb this: criteria (a) and (b) both apply. It is also criterion (c) — the
*omitted*-surfaceId path was hardened twice (#554 workspace scoping, #580 server-side target
filtering) while the *explicit*-surfaceId path skips both gates.

The engine's own contract states the invariant this breaks —
`src/mcp/playwright/PlaywrightEngine.ts:436-439`:
> "selection must still be scoped to the caller's workspace, mirroring the write path
> (browser.open / navigate) which already routes by the caller's resolved workspace. Otherwise,
> with two live browser surfaces, an agent in workspace A can read workspace B's page."

Precondition: workspace B must have a live browser surface at that moment. `surface_list`
(step 2) reports exactly that, so the attacker can check before trying.

Note the same unchecked-`surfaceId` pattern reaches the automation lease
(`src/mcp/playwright/automationLease.ts:16-31`, itself fail-open) and every `withAutomationLease`
call site, but the lease is a throttle, not a boundary.

### U7b — `{kind:'unscoped'}` is a fail-open on identity/RPC failure

Five `return { kind: 'unscoped' }` sites exist in `resolveCallerSurface`
(`PlaywrightEngine.ts:450-495`). Against today's wiring:

| Trigger | file:line | Reachable now? |
|---|---|---|
| resolver never injected | `:455` | **BLOCKED** — `src/mcp/index.ts:846` sets it inside `createWmuxServer`, which both the single-child (`entry.ts:19-29`) and broker (`broker.ts:91`) paths run |
| resolver **throws** | `:458-460` | **YES** — `requireWorkspaceId` throws whenever `resolveWorkspaceId()` yields `''` (`src/mcp/index.ts:723-733`) |
| resolver returns `''` | `:462` | **BLOCKED** — `requireWorkspaceId` throws first (`src/mcp/index.ts:725-731`) |
| `browser.cdp.info` throws | `:468-470` | **YES** — any pipe timeout/fault, even with identity already resolved |
| legacy untagged targets | `:487-490` | **BLOCKED** in a same-version build — `src/main/pipe/handlers/browser.rpc.ts:592` always sets `targetsScoped` when the param is present |

Once unscoped, `ctx.workspaceId` is `undefined` and `callerHasNoSurface` is `false`
(`:519`), so `_getPageImpl` runs the workspace-blind strategies: `:547` (as in U7a) and
`:560-568`, where `getAllPages().find((p) => !this.isShellPage(p.url()))` returns the first
non-shell page in **any** context with no RPC at all — the path that still fires when the
`browser.cdp.info` fault (`:468-470`) caused the downgrade in the first place.

This is criterion (c): the identical identity failure fails **closed** on every sibling —
`browser_open` (`src/mcp/index.ts:809`), `browser_close` (`:826`), `browser_tabs`
(`src/mcp/playwright/tools/navigation.ts:227-244`, returning
`BROWSER_TABS_WORKSPACE_UNRESOLVED`), and the engine's own auto-open
(`PlaywrightEngine.ts:651-666`) — while `resolveCallerSurface:460` fails **open** into global
selection.

**Verdict REAL, with a scope caveat:** the boundary is crossed with no approval, but the
trigger is a fault (identity unresolvable, or a transient RPC failure), not something an
attacker demonstrably drives on demand. Whether an in-app agent can *force* its own identity
miss is **STILL UNCLEAR** — settling it means determining whether the server-side pid walk
(`src/main/pipe/handlers/a2a.rpc.ts:146-218`) can be made to miss for a caller that has not
spawned a forged process. U7a needs no such trigger, which is why it is the critical one.

### Fix status — PR #679 closes U7b, leaves U7a open

Checked against the open PR (`gh pr diff 679`, state OPEN, not present in this tree @ d3c4aca5):
"fix(mcp): fail closed when browser page selection cannot be scoped to the caller".

It removes `{ kind: 'unscoped' }` from the `resolveCallerSurface` union and replaces each of the
five return sites with a `workspaceScopeUnresolved(...)` throw, and collapses the
`resolveSelectionContext` tail so a non-`surface` outcome becomes
`callerHasNoSurface: true`. That is the correct fix for **U7b**, and it also makes the
`targets[0]` pick and the first-non-shell-page strategy structurally unreachable.

It does **not** touch **U7a**. The diff contains no added or removed line matching
`explicitSurfaceId`, the `surf:` key, `t.surfaceId === surfaceId`, or any surface-ownership
assertion. The early return at `PlaywrightEngine.ts:509-510` still short-circuits before any
workspace resolution, so a caller-supplied `surfaceId` still yields `ctx.workspaceId === undefined`,
still produces the param-less `browser.cdp.info` call at `:713-716`, and still matches a foreign
target at `:718-719` — that is the `find((t) => t.surfaceId === surfaceId)` branch, not the
`targets[0]` branch the PR reasons about. The PR's own new comment states the remaining
precondition precisely: *"getPage now always arrives with either a surfaceId or a resolved
workspaceId"* — the `surfaceId` half of that disjunction is exactly the unscoped case U7a uses.

### U7c — the `'unscoped'` lock key — **BLOCKED**

Two workspaces would have to share one `PlaywrightEngine` instance to collide on the literal
key (`PlaywrightEngine.ts:519`, used by the maps at `:416`, `:420-427`, `:583-591`, `:633-638`).
They cannot: `getInstance()` returns the per-connection engine when a connection scope is
active (`PlaywrightEngine.ts:188-198` with `src/mcp/connectionScope.ts:33-39` and
`src/mcp/broker.ts:91`), and single-child mode serves one pane per process
(`src/mcp/entry.ts:19-29`). Same-caller latch artifact only; not part of the defect.

---

## U8 — `meta.setStatus` / `meta.setProgress` — **REAL (low severity)**

The original survey said these take no caller scope and write the active workspace. Re-reading
shows the live path is different and wider: there **is** a `workspaceId` param, and it is
honored with no verification at any layer.

- `src/main/pipe/handlers/meta.rpc.ts:33-39` (`setStatus`) and `:46-53` (`setProgress`) — read an optional `params.workspaceId` and pass it straight into the metadata broadcast (`sendMeta` at `:18-25` → `broadcastMetadataUpdate`). No ownership check.
- `src/renderer/hooks/useNotificationListener.ts:746-748` — `const targetWsId = payloadWsId ?? state.activeWorkspaceId; if (targetWsId) applyToWorkspace(targetWsId, false)` → `state.updateWorkspaceMetadata(wsId, data)` (`:626-639`). A named workspace is written directly; an unnamed call lands on whichever workspace the human is currently viewing.

Two consequences, neither requiring forgery:

1. **Unscoped call → someone else's workspace.** The shipped CLI sends no `workspaceId` (`src/cli/commands/system.ts:71`, `:92`), so an agent running `wmux status "…"` inside workspace B writes the status of whatever workspace the human has on screen.
2. **Named call → any workspace, no check.** Reachable by a raw pipe client (#113 → ACCEPTED on its own) *and* by any plugin granted the `meta.write` capability (`src/main/mcp/methodCapabilityMap.ts:214`). That grant is workspace-blind: approving "this plugin may write metadata" silently authorizes writing *every* workspace's metadata.

Blast radius is display-only — the workspace `status` string and `progress` number — so this is
misleading-UI, not a confidentiality or control breach. There is no MCP tool for either method
(only `meta.setSkills` is exposed, `src/mcp/index.ts:1270`), so criterion (a) does not apply.

**Divergent dead implementation.** `src/renderer/hooks/useRpcBridge.ts:1406-1416` contains a
second implementation that ignores `workspaceId` and always writes `store.activeWorkspaceId`.
It is unreachable: `meta.rpc.ts` handles the method entirely in main and never calls
`sendToRenderer`, and no other emitter sends `meta.setStatus` to the renderer. Two
implementations of one method disagree about whether `workspaceId` is honored, and the live one
is the permissive one.

---

## U1 — `a2a.task.*` caller identity — **ACCEPTED** (corrected)

> **Correction.** This section first graded U1 as REAL under criterion (c). An independent
> re-verification overturned it, and re-reading settles it against the original grade. The
> asymmetry in *mechanism* is real; the asymmetry in *protection strength* is not, so criterion
> (c) does not apply. The two paragraphs at the end of this section record why.

**The asymmetry is factual.** Within the same daemon RPC family:

- Channel mutations: main resolves the caller from `senderPtyId` and **overwrites any client-supplied `verifiedWorkspaceId`** (`src/main/pipe/handlers/a2a.channel.rpc.ts:202-205`), and fails closed when it cannot (`:207-215`, `NOT_AUTHORIZED`, "channel mutation requires a verifiable caller").
- Missions: the daemon runs `stampCaller` for every handler (`src/daemon/index.ts:3153`, `:3194`, `:3220`, `:3242`), with the file's own comment claiming a2a.task-adjacent surfaces follow the "동일 규율" (`src/daemon/index.ts:3144-3147`).
- `a2a.task.*`: no stamping at all. `callerWorkspaceId` is read verbatim from `p.workspaceId` (`src/daemon/index.ts:3094`, `:3105`, `:3121-3125`, `:3133-3135`), and `senderPtyId` is reduced to a boolean `callerHasPaneIdentity` (`:3108`) rather than used to derive identity. The only authz is equality against that caller-asserted string (`src/daemon/a2a/A2aTaskService.ts:313`, `:416-420`, `:515-521`). Main forwards it unchanged (`src/main/pipe/handlers/a2a.rpc.ts:328-329`, `:378-380`, `:466-468`).

**But criterion (a) is BLOCKED.** The A2A task tools declare no workspace input —
`A2A_TASK_QUERY_SHAPE` (`src/mcp/index.ts:183-186`), `A2A_TASK_UPDATE_SHAPE` (`:189-236`),
`A2A_TASK_CANCEL_SHAPE` (`:237-239`) — and each handler pins the id server-side via
`requireWorkspaceId()` (`src/mcp/index.ts:1206`, `:1217-1218`, `:1247-1248`). An agent in
workspace A cannot name workspace B through these tools.

The exploiting caller class is therefore a raw pipe client, i.e. the #113 ceiling. Two details
bound it further: the daemon gate is authoritative for authz (the hard "is not the receiver"
error is **not** in `A2A_DAEMON_SOFT_ERRORS`, `src/main/pipe/handlers/a2a.rpc.ts:33`, so it
returns `reject` and the renderer is never consulted), and `a2a.task.create` — whose `from`/`to`
are entirely unpinned (`src/daemon/index.ts:3071-3087`) — is **not** registered on the main
router at all (`src/main/pipe/handlers/a2a.rpc.ts` registers only `query`/`update`/`send`/`cancel`
at `:305`, `:369`, `:409`, `:463`), so it is reachable only on the daemon socket.

**Why criterion (c) does NOT apply — the correction.** The first pass assumed the channel
stamp is an anti-forgery device that `a2a.task.*` lacks. It is not. Two facts settle it:

1. **The stamp is an enablement device, and says so.** `src/daemon/channels/channelCallerIdentity.ts:17-31` states its acceptance rule in full: rule 1 trusts a pre-stamped `verifiedWorkspaceId` **verbatim** — "*A same-user pipe client can forge it; that is the documented #113 same-user ceiling / audit-B1 residual, NOT a boundary this module claims to close*" (`:21-24`). Rule 2 (resolve from `senderPtyId`) exists to let a **headless** caller act without a live GUI (`:3-8`, `:25-29`), and rule 3 fails closed only on *absence*. The main-side sibling disclaims the same thing: `src/main/pipe/handlers/a2a.channel.rpc.ts:32-44` — "*`senderPtyId` arrives in the request PARAMS and is NOT bound to the pipe connection's PID, so a same-user pipe client can forge it … Treat the resulting `verifiedWorkspaceId` as ADVISORY attribution under the #113 same-user ceiling.*"
2. **The extra bar the channel path appears to add is free.** Impersonating B on a channel needs a live ptyId inside B, and `a2a.discover` hands every workspace's `paneId`/`surfaceId`/`ptyId` to any caller (`src/renderer/hooks/useRpcBridge.ts:1580`, `:1604-1622`) — exposed as the ordinary MCP tool `a2a_discover`. So "know a live ptyId in the victim workspace" costs one tool call, not privileged knowledge.

Both surfaces therefore bottom out in the same place — a caller-supplied params field
(`senderPtyId` for channels, `workspaceId` for tasks) on a token-gated pipe — at the same
effort. The mechanisms differ; the protection does not. Capability gating is symmetric too:
`src/main/mcp/methodCapabilityMap.ts:365-369` maps `a2a.task.update/cancel` → `a2a.send` and
`query` → `a2a.read`, the same grade as `a2a.channel.*` at `:378-392`.

**Blast-radius note.** Forging `from` on a task does not widen *reach* — `to` is free by design
(`SEND_MESSAGE_SHAPE`, `src/mcp/index.ts:272-283`), so an honest workspace can already send to
any other. What forgery buys is attribution and reply-thread access. The part that actually
makes a receiving workspace *act* (background worker spawn) sits behind a human approval gate:
`src/main/pipe/handlers/a2a.rpc.ts:446-459` requires `ctx.origin === 'local'` **and**
`execute === true` **and** `!taskId` **and** `executeApproved === true`, with the renderer
returning `'a2a.task.send: execute approval denied'` otherwise
(`src/renderer/hooks/useRpcBridge.ts:1879`). Unlike U7, there is an approval step on the path.

**Hygiene gap recorded (no reachable impact).** Main's channel forwarder rejects the reserved
identifiers `local-ui` and `ws-human` (`src/main/pipe/handlers/a2a.channel.rpc.ts:167-177`,
`:190-200`); the task path (`src/main/pipe/handlers/a2a.rpc.ts:305-490`) has no counterpart, so
`workspaceId: 'ws-human'` can be supplied. As `a2a.channel.rpc.ts:229-232` notes, ws-human owns
no panes, so it cannot be a task sender or receiver — no reachable effect today.

---

## U3 — `a2a.channel.operatorList` — **ACCEPTED**

The enumeration oracle is real: `operatorList` treats `verifiedWorkspaceId` as an
existence check rather than a filter and returns every channel including private ones
(`src/daemon/channels/ChannelService.ts:604-617`).

It is not reachable by an in-app agent. `pipeServer` in `src/daemon/index.ts` is the **daemon
control socket** (`~/.wmux/daemon.sock`, `src/daemon/config.ts:32-34,90` →
`src/shared/constants.ts:643-649`), with its own auth token
(`src/shared/constants.ts:701-703`). MCP/CLI clients dial a different socket and token
(`src/mcp/wmux-client.ts:208` → `src/shared/constants.ts:493-502`, `:600-603`).

- **Not on the main router.** `src/main/pipe/handlers/a2a.channel.rpc.ts:255-276` registers only `list/get/getMessages/getMembers/unread/ack/create/join/leave/post/invite`; the NOTE at `:297-304` states the omission. The forwarder closes over a literal method string (`:249`), so `method` can never come from params. Unregistered methods hard-fail at `src/main/pipe/RpcRouter.ts:188-197`. Pinned by `src/main/pipe/handlers/__tests__/a2a.channel.rpc.test.ts:380-406`.
- **Not an MCP tool** (no hits in `src/mcp/`), and excluded from `FIRST_PARTY_METHODS` (`src/main/mcp/firstParty.ts:242-251`, pinned by `firstParty.test.ts:80-98`). Its `METHOD_CAPABILITY` entry (`src/main/mcp/methodCapabilityMap.ts:408`) exists only because that table is a total `Record<RpcMethod, …>`.
- The only non-daemon-socket caller is the renderer-only IPC `IPC.CHANNEL_MUTATE_LOCAL` (`src/main/ipc/handlers/channelLocal.handler.ts:88,138`; `src/preload/preload.ts:320`), which agent-driven `<webview>` guests cannot reach — their preload is deleted and sandbox forced (`src/main/window/createWindow.ts:170-178`).

Residual caller = a same-user process on the daemon socket, which already owns
`~/.wmux/channels.json` with full message bodies — accepted explicitly in
`plans/operator-join-design-2026-07-05.md:23`. The API is strictly weaker than the disk.

**On the comment:** `src/daemon/index.ts:3053-3054` ("파이프 미등록 + 렌더러 전용 경로만") is
true of the *main* pipe; the author demonstrably knew the handler sits on the daemon socket
(see the adjacent `operatorJoin` note at `:3025-3031` discussing "데몬 소켓 직결 호출자"). It
reads as stale only because the line below it is a `pipeServer.onRpc` call. Documentation
clarity issue, not a wider surface.

---

## U4 — `a2a.principal.remove` / `markStaleWorkspace` — **ACCEPTED**

The gap is as described: `upsert` cross-checks `resolveSessionWorkspace(record.ptyId) ===
record.workspaceId` (`src/daemon/index.ts:3296-3305`), while `remove`
(`:3309-3321`) and `markStaleWorkspace` (`:3323-3335`) check only that *some* non-empty
`verifiedWorkspaceId` is present and never compare it to the target. The handlers' own header
states the intent — the transport is the gate, and the check is a "no anonymous mutation"
posture (`src/daemon/index.ts:3267-3274`).

Reachability is identical to U3: daemon socket or renderer IPC only. Not on the main router,
not an MCP tool, and mapped `capability: 'wmux.internal'`
(`src/main/mcp/methodCapabilityMap.ts:409-411`), a reserved prefix no plugin may declare.
Legitimate callers are pane close (`src/renderer/stores/slices/paneSlice.ts:626`) and workspace
delete (`src/renderer/stores/slices/workspaceSlice.ts:398`).

Blast radius is bounded and self-healing. `liveness` has exactly one consumer — `livePtyIdOf`
(`src/daemon/principals/PrincipalService.ts:104-108`) feeding `ChannelWakeWorker`
(`src/daemon/index.ts:4556-4559`), whose comment states the fallback: "A stale principal returns
undefined and falls back to the existing slug heuristic." Channel membership lives in
`ChannelService`, not the registry, so delivery and unread are untouched. The renderer re-upserts
on every periodic agent-status broadcast (`src/renderer/hooks/useNotificationListener.ts:670-677`)
behind a 60 s TTL (`src/renderer/stores/slices/channelsSlice.ts:86`, checked at `:716-720`), and
upsert restores `liveness='live'` (`PrincipalService.ts:167`). The daemon already marks every
pane-agent stale on boot (`src/daemon/index.ts:4411-4414`), so `stale` is a routine state.

Not criterion (c): the asymmetry is intra-surface (`upsert` hardened, `remove` not) and
directionally coherent — `upsert` sets the wake worker's keystroke-injection **destination**,
while `remove`/`markStale` can only remove one. The same daemon-socket caller can also invoke
`daemon.shutdown` (`src/daemon/index.ts:3344`), so this grants no incremental power.

---

## U2 — `pane.focus` for non-commander callers — **ACCEPTED**

Nothing is refused. `src/mcp/paneLifecycle.ts:128` sends only `{ id }`; main adds
`confineWorkspaceId` only when `ctx.commanderWorkspace` is set
(`src/main/pipe/handlers/pane.rpc.ts:249-260`), which only a validated commander token produces
(`src/main/pipe/RpcRouter.ts:222-231`); the renderer resolves the owner across all workspaces
(`src/renderer/hooks/useRpcBridge.ts:872`) and refuses only `if (confine && …)` (`:883-885`).
So an ordinary agent naming a foreign pane UUID executes
`store.focusPaneSurface(ownerWs.id, paneId)` (`:886`) against that workspace.

This is the documented ADDRESS-family contract (`src/mcp/paneLifecycle.ts:20-26`, quoted in
§"Already-cross-workspace exceptions"), and the effect is a non-yank focus flag — the human's
on-screen workspace is untouched (`useRpcBridge.ts:865-869`).

**Honest caveat:** it literally satisfies criterion (a) — no forgery is involved; what protects
it is the unguessable UUID, yet the accepting rationale cites #113. Graded ACCEPTED because it
is the explicit contract with a trivial blast radius. If the envelope is ever re-litigated, the
case to examine is `pane_close` (`src/mcp/paneLifecycle.ts:120`) — same family, same absent
confinement, but it disposes another workspace's PTYs.

---

## U5 — `resolveCallerWorkspace` (events.poll) — **ACCEPTED; BLOCKED for MCP**

`src/main/pipe/handlers/events.rpc.ts:48-64` reads `params['senderPtyId']` and resolves it via
`sendToRenderer(getWindow, 'input.findOwnerWorkspace', …)`, returning `''` on miss. It is the
sole gate on private event types (`:236`, `:245-247`, `:250-283`), and it does not check that
the ptyId belongs to the connection's peer — there is no peer identity to check against. So a
raw pipe caller naming a live ptyId in another workspace does receive that workspace's task
pointers and channel traffic.

That is the documented residual, stated at `src/main/pipe/handlers/events.rpc.ts:38-47`:
> "NOT bound to the pipe connection's PID, so it remains ADVISORY attribution under the #113
> same-user ceiling — but it raises events.poll's bar from 'name any workspace id' (B3) to
> 'hold a live pane's ptyId' … A true unforgeable fix is peer-PID
> (GetNamedPipeClientProcessId), deferred with the rest of the #113 track."

**BLOCKED from MCP:** `wmux_events_poll` builds `senderPtyId` server-side from the PID-walked
`MY_PTY_ID` (`src/mcp/index.ts:1095-1098`, `:344-346`) and its shape exposes only
`{ cursor, types, max }` (`:1090`) — the model has no way to inject one.

---

## U9 — `daemonCommitted` envelope — **ACCEPTED (but the premise was wrong)**

The survey assumed main is the only writer of `daemonCommitted`. It is not.

- Main sets it explicitly on the daemon-ok branch (`src/main/pipe/handlers/a2a.rpc.ts:392-396`, `:483-489`), where the spread is followed by `daemonCommitted: true`, so a caller value is overwritten.
- But the **fallthrough passes the raw caller object through unchanged**: `src/main/pipe/handlers/a2a.rpc.ts:400` (`return sendToRenderer(getWindow, 'a2a.task.update', params)`) and `:491` for cancel. Neither strips `daemonCommitted`/`committedTask`, and the router validates only that params is an object (`src/main/pipe/RpcRouter.ts:184-186`).
- The renderer then applies it verbatim, skipping workspace/pane authz and the transition state machine (`src/renderer/hooks/useRpcBridge.ts:2031-2037` for update, `:2151-2160` for cancel → `store.applyDaemonTaskUpdate`).
- The fallthrough is not exotic: `daemonTaskRpc` returns `unavailable` when there is no daemon client (`a2a.rpc.ts:50-51`), on any throw/timeout (`:58-61`), and on any soft error (`:56`) including `'task not found'` (`:33`) — i.e. any task the daemon has never seen.

**ACCEPTED** because the caller class is pipe-only: `a2a_task_update` and `a2a_task_cancel`
build fresh params objects from destructured zod args (`src/mcp/index.ts:1216-1237`, `:1246-1248`),
so no model-controlled string can become `daemonCommitted`. Both sibling surfaces have the
identical hole, so there is no (c) asymmetry either. Recorded as a hardening candidate: the
code comments at `a2a.rpc.ts:365-369` and `useRpcBridge.ts:2026-2030` describe an invariant the
fallthrough does not maintain.

---

## U10 — `deckSlice.threadOf` — **BLOCKED**

`threadOf` does auto-vivify for any id (`src/renderer/stores/slices/deckSlice.ts:95-101`), but no
caller-supplied id reaches it. The three call sites are `startDeckBrainTurn` (`:139`),
`applyDeckBrainEvent` (`:145`), `failDeckBrainTurn` (`:162`), reached only from
`src/renderer/components/Deck/CommanderView.tsx:1134,1168,1177` (local `activeWorkspaceId`,
guarded at `:1107-1109`) and `src/renderer/hooks/useDeckStream.ts:24`, whose envelope id is
stamped by main (`src/main/ipc/handlers/deck.handler.ts:316-320`, `:373`, `:401`) and
regex-validated (`:405-408`).

Blocking anchors: **`src/main/ipc/handlers/deck.handler.ts:405-408`** and
**`src/renderer/hooks/useDeckStream.ts:23`**, with the structural block being that
`IPC.DECK_STREAM` has no wire origin — the pipe-side deck surface registers only
`deck.resolvePaneRoute`/`resolveCommanderWorkspace`/`requestDecision`/`resolveDecision`, all
token-gated (`src/main/pipe/handlers/deck.rpc.ts:48-51`, `:85-88`, `:101-104`, `:166`), and none
touch `brainThreads`. Even a hypothetical bogus id yields an orphan
`{ messages: [], status: 'idle' }` entry in a non-persisted zustand map
(`src/renderer/stores/index.ts:25-45`).

---

## U11 — `company.*` handlers — **ACCEPTED**

Authz is renderer-side and rests entirely on the caller-supplied `workspaceId`. Main forwards it
verbatim (`src/main/pipe/handlers/company.rpc.ts:231-233`, `:246-253`, `:262-268`, `:270-274`,
`:276-279`); the renderer routes any `company.*` to `handleCompanyRpc` with no pre-check
(`src/renderer/hooks/useRpcBridge.ts:2223-2226`) and derives the actor from that claim
(`src/company/renderer/rpcHandlers.ts:52-57`, `:295`, `:316`, `:350`, `:373`, `:383`) —
discarding the `from` param main insists on.

**Not reachable cross-workspace from MCP:** every `company_a2a_*` tool pins the id via
`requireWorkspaceId()` into a freshly built params object (`src/mcp/index.ts:1288-1289`,
`:1298-1305`, `:1313-1320`, `:1327-1328`, `:1337-1338`), and all six methods are
`wmux.internal` (`src/main/mcp/methodCapabilityMap.ts:444-449`), undeclarable by any plugin and
reachable only through the first-party allowlist (`src/main/mcp/firstParty.ts:265-271`). The
residual — a raw pipe client impersonating any company member — is the same params-supplied
identity forge under #113 (`firstParty.ts:28-37`).

Two non-security findings recorded while verifying:

1. **`company_a2a_send` / `company_a2a_broadcast` are dead on the main MCP server.** Main requires a non-empty `from` (`src/main/pipe/handlers/company.rpc.ts:237-239`, `:256-259`) but the tools never send one (`src/mcp/index.ts:1299-1305`, `:1314-1320`), so every in-app call fails with `missing required param "from"`. The param is vestigial anyway — the renderer overwrites it from `workspaceId` (`rpcHandlers.ts:316`, `:350`).
2. **`company.a2a.status` takes no `workspaceId` at all** (`company.rpc.ts:281-283` forwards `{}`) and `rpcHandlers.ts:389-400` returns the whole company — name, departments, all members, roles, statuses — to any caller, member or not. It is the only unscoped read in a family whose other five are workspace-scoped. Read as intentional discovery given the tool's own description (`src/mcp/index.ts:1345`), hence ACCEPTED, but flagged as an asymmetry.

---

## Additional observation (not one of the listed items)

`assertWorkspaceOwnsPty` returns silently when `expectedWorkspaceId` is undefined
(`src/main/pipe/handlers/input.rpc.ts:112`) — so terminal isolation is enforced only for callers
that **volunteer** a workspace id. MCP always volunteers one (the route stamp at
`src/mcp/index.ts:891-943`, with `src/mcp/terminalRouting.ts:88-96` throwing on an empty id), but
the CLI path does not, so `wmux`-CLI terminal IO is not subject to the check at all. Not a
finding under the criteria (CLI = same-user), but structurally relevant to the survey's purpose:
a "same-or-owner" rule inserted at this assert would govern agents only, and would leave the
CLI's unchecked lane untouched.
