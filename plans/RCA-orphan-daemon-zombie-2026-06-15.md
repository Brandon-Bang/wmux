# RCA: orphaned wmux daemon "zombie" + claude CLI memory leak (2026-06-15)

## Status
**Step 1 + F2 SHIPPED** (process-tree kill on PTY teardown + hard-exit guarantee).
Follow-up increments **F3–F4 NOT implemented** (high-risk daemon-lifecycle; implement
one-per-PR with adversarial review + GUI dogfood, per project policy).

## Symptom (user report)
Closing wmux leaves the claude CLI that ran in a pane alive in memory; relaunching
shows fresh PowerShell panes but "the previous instance is still roaming in memory."

## Proven root cause (evidence-grounded — verified against the live machine, not inferred)

The leak is a **two-layer failure**, both rooted in one fact: node-pty's ConPTY
`kill()` does not reap the process tree.

### Layer A — node-pty `kill()` orphans the PTY tree (the "claude stays alive")
`node-pty@1.1.0` `WindowsPtyAgent.kill()` on the ConPTY path (`_useConpty &&
!_useConptyDll`, the wmux path) only:
1. async-forks `conpty_console_list_agent` → `process.kill()`s the **flat
   `GetConsoleProcessList` set** (procs attached to that one pseudoconsole), then
2. `ClosePseudoConsole`.

There is **no Job Object, no `taskkill /T`, no recursive descendant walk**, and the
console-list kill is `.then()`-async (5 s timeout) so it often never completes before
the daemon exits. A wmux pane is `powershell → claude.exe → node/bun MCP`; the
grandchildren are not on that console set, so they are reparented and survive.
(Confirmed by reading `node_modules/node-pty/lib/windowsPtyAgent.js:133-180`.)

### Layer B — retained conhost handles wedge the daemon's own `process.exit(0)`
Because the apps stay attached, `ClosePseudoConsole` does not fully tear down the
pane's `conhost.exe` ConPTY host. Its handles keep CSRSS-LPC libuv threads alive in
the daemon, so when the daemon calls `process.exit(0)` after a clean shutdown, the
process **never finalizes** — it lingers as an undead ~124 MB `wmux.exe`.

**Field proof (PID 11856):** daemon log `daemon-2026-06-15.log:195-212` shows a clean
RPC shutdown that ran every phase (`disposeAll count=12`, `Daemon stopped 1547ms`) and
called `process.exit(0)` at 22:05 — yet the PID was **still alive 5.5 h later** with
37 threads all in `Wait` (14 `EventPairLow` = CSRSS/conhost LPC), WS 124.5 MB, +2
orphaned `conhost.exe`. The existing `daemon.shutdown` force-exit guard
(`index.ts:836-855`) only covers a hung `pipeServer.stop()`, NOT a hung
`process.exit(0)` — so it never fired here.

### Layer C — the zombie becomes permanently un-reapable (why "two daemons")
`ensureDaemon()` resolves its reuse/kill target **solely** from the single
`~/.wmux/daemon.pid` (`launcher.ts:459-468`), and the stale-file cleanup unlinks
`daemon.lock`/`daemon.pid`/`daemon-pipe` before spawning (`launcher.ts:677-680`). Once
a relaunch writes a new daemon PID into `daemon.pid` (verified: it read `9524`, not the
zombie `11856`), the zombie is referenced by nothing on disk and no future
`ensureDaemon()`/`killDaemonByPidFile()` can ever find it. (Call this **D4 / D4b**.)

## Refuted hypotheses (do NOT re-chase — verified false for this incident)
- **D2 (idle-shutdown disabled by `idleShutdownMinutes:0`)** — REFUTED: the field
  `~/.wmux/config.json` has no `idleShutdownMinutes` key → default 5 (enabled).
- **D7 (abnormal death, `disposeAll`/`kill()` never ran)** — REFUTED: the log proves a
  clean shutdown that ran `disposeAll`. The bug is the EXIT not finalizing, not a
  missing trigger.
- **Split-brain Defects 1–3** — already SHIPPED in #93 (`launcher.ts` 3-state
  liveness, escalated re-ping, `EDAEMON_ALREADY_RUNNING`). `plans/duplicate-daemon-
  split-brain.md`'s "no code changed" is STALE.
- **#102** fixes unrelated JS-heap leaks (MCP capture buffers, A2A GC, a renderer PTY
  listener); it does not touch this process leak.

## Fix — Step 1 (SHIPPED): synchronous process-tree kill on PTY teardown
New `src/shared/killProcessTree.ts`: on Windows runs `taskkill /PID <pid> /T /F`
(synchronous, recursive) **before** `ptyProcess.kill()`, while the parent→child links
are still intact. `ptyProcess.pid` == node-pty `_innerPid` == the shell PID, so the
tree root is correct. No-op on non-Windows and under `WMUX_DISABLE_TREE_KILL=1`
(operational kill-switch + test-harness guard).

Wired into `DaemonSessionManager.destroySession()` and `PTYManager.dispose()`. This
reaps the claude.exe/MCP grandchildren AND lets the now-app-less conhost tear down,
releasing the handles that blocked `process.exit()`.

Tests: `src/shared/__tests__/killProcessTree.test.ts` (helper) + wiring assertions in
`DaemonSessionManager.test.ts`. Daemon build + lint clean. Unit suite green (the lone
`StateWriter saveDebounced` failure is a pre-existing load-timing flake — passes in
isolation).

## F2 — hard-exit guarantee (SHIPPED)
`src/daemon/hardExit.ts`: at every graceful shutdown exit point (`shutdown()` final
exit + the `daemon.shutdown` RPC's force-exit and normal-exit paths in `index.ts`),
Windows now self-terminates via `process.kill(process.pid,'SIGKILL')` (=
`TerminateProcess`, kernel-level, bypasses the libuv/CRT teardown that `process.exit()`
hangs in) instead of `process.exit(0)`. State is durably saved before any exit point, so
skipping the 'exit' handlers loses nothing on the graceful path. `process.exit` remains
the POSIX path + fallback. Verified: unit tests (`hardExit.test.ts`) + a sanity dogfood
(`process.kill(self,'SIGKILL')` terminates immediately, code-after-kill not reached).
> An *external detached watchdog* was prototyped first and REJECTED: Node's
> `detached:true` spawn breaks PowerShell execution on Windows, and a delayed external
> killer is PID-reuse-unsafe. The in-process hard-exit is reliable because the field
> daemon reached the exit *call* (the wedge is inside `exit()` itself), so issuing the
> kill there instead always runs.

## Follow-up increments (designed, NOT yet implemented — one PR each, dogfood-gated)
- **F3 — launcher multi-orphan reaper (closes D4/D4b).** Before clean+spawn, enumerate
  processes whose image == `path.basename(process.execPath)` AND cmdline matches the
  existing daemon-script markers (`launcher.ts:536-542`); reap any verified wmux daemon
  that is not the one being adopted. And do NOT blindly `unlink daemon.lock` before
  confirming no live owner. ⚠ Reuse the verify-before-kill gate to never kill a sibling
  Electron app.
- **F4 — parent-liveness tether + idle-session re-verification.** Pass the Electron PID
  to the daemon; when the parent is confirmed dead AND 0 connections AND 0 live
  sessions, self-terminate after a bounded grace even if `idleShutdownMinutes:0`. And
  batch-verify `detached` session PIDs in the idle path so a phantom session can't
  starve idle-shutdown. ⚠ Grace must exceed the relaunch/reconnect window; preserve
  #93's anti-false-death rule (demote only on POSITIVE proof of death).

## Guard-rails for any of the above
Persistence ("keep sessions after the GUI closes") MUST survive: a normal Quit detaches
and the daemon + PTYs stay alive on purpose. Any reaper/job-object must be **daemon-
owned**, never Electron-owned — the tree may die only when the *daemon* dies. Dogfood:
Quit (keep sessions) → relaunch → exactly one daemon, sessions reattach, zero orphaned
`conhost`/`wmux.exe`.
