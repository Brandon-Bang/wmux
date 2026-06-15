import { describe, it, expect, vi } from 'vitest';
import { hardExit } from '../hardExit';

describe('hardExit', () => {
  it('on Windows: TerminateProcess(self) via process.kill(SIGKILL) before exit', () => {
    const kill = vi.fn();
    const exit = vi.fn();
    hardExit(0, { platform: 'win32', kill, exit, pid: 4242 });
    expect(kill).toHaveBeenCalledWith(4242, 'SIGKILL');
    // exit is still called as the fallback (the real process.kill would have
    // already terminated the process, so this only runs if kill returned).
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('on POSIX: uses process.exit directly, no kill', () => {
    const kill = vi.fn();
    const exit = vi.fn();
    hardExit(1, { platform: 'linux', kill, exit, pid: 4242 });
    expect(kill).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('on Windows: falls back to exit when kill throws', () => {
    const kill = vi.fn(() => { throw new Error('EPERM'); });
    const exit = vi.fn();
    hardExit(0, { platform: 'win32', kill, exit, pid: 4242 });
    expect(kill).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
