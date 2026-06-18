import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Source-level invariants for the crash-forensics instrumentation added
// 2026-06-18 after the recurring incident: panes exit "-1" en masse → menu
// Reload brings every pane back as a fresh PowerShell → dozens of orphaned
// node/Claude processes → Jarvis (a long-running agent) is lost. See
// plans/RCA-recurring-crash-forensics-2026-06-18.md.
//
// Update 2026-06-18: the RCA's two lowest-risk fixes have since landed —
// §6-2 (launcher reaps the PTY tree before SIGKILL) and §6-1 (generic shutdown
// exits via hardExit, not process.exit(0)) — so the launcher/shutdown cases
// below now lock FIX invariants; the remaining cases still lock forensics.
//
// The bug is not currently reproducible, so these log lines ARE the debugging
// plan: they land the forensics on disk (daemon ~/.wmux/logs/daemon-*.log,
// main %APPDATA%/wmux/logs/main-*.log) for the next recurrence. A refactor
// that silently drops any of them regresses our ability to root-cause it, so
// each marker is locked here exactly like shutdownPhaseInstrumentation.test.ts.

const read = (...segs: string[]) =>
  fs.readFileSync(path.join(__dirname, ...segs), 'utf-8');

describe('crash-forensics instrumentation — source invariants', () => {
  it('killProcessTree logs whether taskkill ran AND whether it succeeded', () => {
    // The pre-fix code swallowed the taskkill result entirely, so a recurrence
    // could not distinguish "tree-kill never ran" from "ran but failed".
    const src = read('..', '..', 'shared', 'killProcessTree.ts');
    expect(src).toContain('[killProcessTree] reaped tree');
    expect(src).toContain('[killProcessTree] taskkill failed');
  });

  it('launcher reaps the PTY tree (killProcessTree) before BOTH daemon SIGKILLs', () => {
    // RCA §6-2 fix: a bare process.kill(daemonPid) orphans the daemon's
    // powershell->claude->node subtree. killProcessTree (taskkill /T /F) must run
    // at both kill sites (ensureDaemon respawn + killDaemonByPidFile backstop)
    // BEFORE the SIGKILL. A regression that drops it re-introduces the orphan leak.
    const src = read('..', '..', 'main', 'daemon', 'launcher.ts');
    expect(src).toMatch(/import \{ killProcessTree \} from/);
    const calls = src.match(/killProcessTree\((existingPid|pid)\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('the main↔renderer boundary records rawExitCode vs the fabricated -1', () => {
    const src = read('..', '..', 'main', 'ipc', 'handlers', 'pty.handler.ts');
    expect(src).toContain('[lifecycle] session:died');
    expect(src).toMatch(/rawExitCode=.*willRender=/);
  });

  it.each([
    // recovery is shell-restart, not agent-reattach (symptoms 2 & 4)
    ['[recovery] re-spawn', 'recovery shell-only marker'],
    ['SHELL only', 'recovery shell-only emphasis'],
    // cap-skipped sessions never reattach this launch (symptom 4 alt path)
    ['[recovery.cap] skipped', 'recovery cap-skip ids'],
    // unambiguous per-generation boot marker (disambiguates symptom 2)
    ['[boot] daemon generation', 'daemon boot generation marker'],
    // RCA §6-1 fix: generic shutdown() final exit now routes through hardExit(0)
    // (TerminateProcess) instead of the wedge-prone process.exit(0)
    ['[shutdown.exit] hardExit(0)', 'shutdown final-exit via hardExit'],
  ])('daemon index.ts contains %s (%s)', (marker) => {
    const src = read('..', 'index.ts');
    expect(src).toContain(marker);
  });
});
