import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { execFileSync } from 'node:child_process';
import { killProcessTree } from '../killProcessTree';

const isWin = process.platform === 'win32';
type ExecMock = typeof execFileSync;

// The unit/runtime vitest configs set WMUX_DISABLE_TREE_KILL=1 so that
// destroySession/dispose in other tests never shell out to a real taskkill.
// These tests exercise the ACTIVE path, so they clear the switch first and
// restore it afterwards (the last test re-asserts the switch itself).
describe('killProcessTree', () => {
  const prev = process.env.WMUX_DISABLE_TREE_KILL;
  beforeEach(() => {
    delete process.env.WMUX_DISABLE_TREE_KILL;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.WMUX_DISABLE_TREE_KILL;
    else process.env.WMUX_DISABLE_TREE_KILL = prev;
  });

  it.runIf(isWin)('invokes `taskkill /PID <pid> /T /F` on Windows', () => {
    const exec = vi.fn();
    expect(killProcessTree(12345, exec as unknown as ExecMock)).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = exec.mock.calls[0];
    expect(String(bin).toLowerCase()).toContain('taskkill');
    expect(args).toEqual(['/PID', '12345', '/T', '/F']);
  });

  it.runIf(isWin)('swallows taskkill failure for an already-dead PID', () => {
    const exec = vi.fn(() => {
      throw new Error('ERROR: The process "999999" not found. (128)');
    });
    expect(() => killProcessTree(999999, exec as unknown as ExecMock)).not.toThrow();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('no-ops on an invalid pid without shelling out', () => {
    const exec = vi.fn();
    expect(killProcessTree(0, exec as unknown as ExecMock)).toBe(false);
    expect(killProcessTree(undefined, exec as unknown as ExecMock)).toBe(false);
    expect(killProcessTree(null, exec as unknown as ExecMock)).toBe(false);
    expect(killProcessTree(-1, exec as unknown as ExecMock)).toBe(false);
    expect(killProcessTree(3.5, exec as unknown as ExecMock)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it.runIf(isWin)('honors the WMUX_DISABLE_TREE_KILL kill-switch', () => {
    process.env.WMUX_DISABLE_TREE_KILL = '1';
    const exec = vi.fn();
    expect(killProcessTree(12345, exec as unknown as ExecMock)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });
});
