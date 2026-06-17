import { execFileSync } from 'node:child_process';
import path from 'node:path';

export type ExecFileSyncFn = typeof execFileSync;

/**
 * Reap a PTY child process together with its ENTIRE descendant tree on Windows.
 *
 * node-pty 1.1.0 in ConPTY mode (`useConpty:true`) closes the pseudoconsole and
 * the immediate shell when `ptyProcess.kill()` is called, but it does NOT walk
 * the descendant tree. A wmux pane is `powershell -> claude.exe -> node/bun MCP`,
 * so killing only the shell reparents and ORPHANS the grandchildren — the
 * "claude CLI still alive in memory" the user reported. Worse, the leftover
 * ConPTY/conhost handles keep CSRSS-LPC libuv threads alive inside the daemon,
 * so after a clean shutdown the daemon's own `process.exit(0)` never finalizes
 * and the daemon survives as a ~124 MB undead `wmux.exe` zombie (observed in the
 * field: a post-exit PID with 37 Wait-state threads, 14 of them `EventPairLow`).
 *
 * Reaping the whole tree with `taskkill /T /F` closes BOTH leaks: the
 * grandchildren die, and once no application is attached to the pseudoconsole
 * its conhost host is torn down, releasing the handles that blocked the daemon's
 * exit.
 *
 * Synchronous and best-effort by design: teardown/shutdown callers need the tree
 * gone BEFORE `process.exit`, so we cannot fire-and-forget an async child that a
 * dying daemon would orphan. Callers MUST run this BEFORE `ptyProcess.kill()`,
 * while the parent -> child links are still intact for `taskkill /T` to walk.
 *
 * No-op on non-Windows (node-pty kills the POSIX process group, which already
 * reaps the tree) and when `WMUX_DISABLE_TREE_KILL=1` — an operational
 * kill-switch that doubles as the test-harness guard so unit tests with fake
 * PIDs never shell out to a real `taskkill`.
 *
 * @returns `true` if a Windows tree-kill was attempted, `false` if skipped.
 */
export function killProcessTree(
  pid: number | undefined | null,
  exec: ExecFileSyncFn = execFileSync,
): boolean {
  if (process.env.WMUX_DISABLE_TREE_KILL === '1') return false;
  if (process.platform !== 'win32') return false;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const taskkill = path.join(systemRoot, 'System32', 'taskkill.exe');
  try {
    exec(taskkill, ['/PID', String(pid), '/T', '/F'], {
      timeout: 5000,
      windowsHide: true,
      stdio: 'ignore',
    });
    // Forensics (2026-06-18 RCA): a fully-swallowed taskkill result made it
    // impossible, on the next recurrence, to tell "tree-kill never ran" (an
    // abrupt SIGKILL/TerminateProcess path that skips this helper entirely)
    // from "tree-kill ran but failed" (AV/permission blocked taskkill) — two
    // root causes with opposite fixes. Written via stderr so it is captured by
    // the stdout/stderr tee in BOTH the main and daemon logSink.
    try { process.stderr.write(`[${new Date().toISOString()}] [info] [killProcessTree] reaped tree pid=${pid} (taskkill /T /F ok)\n`); } catch { /* ignore */ }
  } catch (err) {
    // taskkill exits 128 when the PID is already gone; that failure is benign —
    // the caller's ptyProcess.kill() / ClosePseudoConsole is the backstop, and
    // an orphan is the worse outcome than a no-op. A non-128 status
    // (EPERM/AV-blocked) means the descendant tree may have survived.
    const status = (err as { status?: number; code?: string } | undefined)?.status
      ?? (err as { code?: string } | undefined)?.code ?? 'unknown';
    const level = status === 128 ? 'info' : 'warn';
    try { process.stderr.write(`[${new Date().toISOString()}] [${level}] [killProcessTree] taskkill failed pid=${pid} status=${status} — descendant PTY tree may be ORPHANED\n`); } catch { /* ignore */ }
  }
  return true;
}
