export interface HardExitDeps {
  platform?: NodeJS.Platform;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  exit?: (code: number) => void;
  pid?: number;
}

/**
 * Terminate the daemon process NOW, bypassing the libuv/CRT teardown that
 * `process.exit()` runs.
 *
 * Why: the field zombie (daemon PID 11856) completed a clean shutdown, called
 * `process.exit(0)`, and then WEDGED — its main thread stuck inside the native
 * exit path while leftover ConPTY/conhost handles + their CSRSS-LPC threads
 * blocked libuv loop close, so the process never terminated (124 MB undead
 * `wmux.exe`). On Windows, `process.kill(pid, 'SIGKILL')` maps to
 * `TerminateProcess`, a kernel-level forced termination that does NOT wait for
 * thread joins / handle closure, so it kills the process where `process.exit()`
 * hangs. The daemon reaches this call by RUNNING JS up to the exit point (the
 * wedge is inside `exit()` itself), so issuing the kill here instead is reliable.
 *
 * Safe: shutdown() durably saves state (buffer dumps + state file) BEFORE it
 * reaches any exit point, so skipping `process.exit`'s 'exit' handlers (the
 * win32 last-resort sync save) loses nothing on the graceful path. On POSIX,
 * `process.exit` is reliable, so we use it directly.
 *
 * `process.exit` is still called as a fallback in case `process.kill(self)` ever
 * returns without terminating (it should not).
 */
export function hardExit(code: number, deps: HardExitDeps = {}): void {
  const platform = deps.platform ?? process.platform;
  if (platform === 'win32') {
    const kill = deps.kill ?? ((p: number, s: NodeJS.Signals) => { process.kill(p, s); });
    const pid = deps.pid ?? process.pid;
    try {
      kill(pid, 'SIGKILL'); // TerminateProcess(self) — does not return on success
    } catch {
      /* fall through to process.exit below */
    }
  }
  const exit = deps.exit ?? ((c: number) => { process.exit(c); });
  exit(code);
}
