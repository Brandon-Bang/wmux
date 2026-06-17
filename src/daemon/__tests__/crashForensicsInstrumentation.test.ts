import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Source-level invariants for the crash-forensics instrumentation added
// 2026-06-18 after the recurring incident: panes exit "-1" en masse → menu
// Reload brings every pane back as a fresh PowerShell → dozens of orphaned
// node/Claude processes → Jarvis (a long-running agent) is lost. See
// plans/RCA-recurring-crash-forensics-2026-06-18.md.
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

  it('launcher warns at BOTH bare-SIGKILL daemon-kill sites (the orphan source)', () => {
    const src = read('..', '..', 'main', 'daemon', 'launcher.ts');
    const hits = src.match(/WITHOUT tree-kill/g) ?? [];
    // ensureDaemon's unresponsive-daemon respawn + killDaemonByPidFile backstop.
    expect(hits.length).toBeGreaterThanOrEqual(2);
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
    // distinguishes the un-hardExit'd shutdown path (orphan-daemon zombie)
    ['[shutdown.exit] calling process.exit(0)', 'shutdown final-exit path marker'],
  ])('daemon index.ts contains %s (%s)', (marker) => {
    const src = read('..', 'index.ts');
    expect(src).toContain(marker);
  });
});
