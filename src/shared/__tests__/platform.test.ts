import { describe, expect, it } from 'vitest';
import { currentPlatform, isLinux, isMac, isUnix, isWindows, platformChoice } from '../platform';

describe('platform constants', () => {
  it('exactly one of isWindows / isMac / isLinux is true on supported OS', () => {
    if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
      const trueCount = [isWindows, isMac, isLinux].filter(Boolean).length;
      expect(trueCount).toBe(1);
    }
  });

  it('isUnix is the negation of isWindows', () => {
    expect(isUnix).toBe(!isWindows);
  });

  it('currentPlatform matches process.platform when supported', () => {
    if (process.platform === 'win32') expect(currentPlatform).toBe('win32');
    else if (process.platform === 'darwin') expect(currentPlatform).toBe('darwin');
    else if (process.platform === 'linux') expect(currentPlatform).toBe('linux');
    else expect(currentPlatform).toBe('other');
  });
});

describe('platformChoice', () => {
  it('returns the OS-specific value when present', () => {
    const result = platformChoice<string>({
      win: 'win-value',
      mac: 'mac-value',
      linux: 'linux-value',
      default: 'default-value',
    });
    if (process.platform === 'win32') expect(result).toBe('win-value');
    else if (process.platform === 'darwin') expect(result).toBe('mac-value');
    else if (process.platform === 'linux') expect(result).toBe('linux-value');
    else expect(result).toBe('default-value');
  });

  it('falls back to default when the OS-specific value is omitted', () => {
    const result = platformChoice<number>({
      // intentionally only set the OS we are NOT on so the default is returned.
      win: process.platform === 'win32' ? undefined : 1,
      mac: process.platform === 'darwin' ? undefined : 2,
      linux: process.platform === 'linux' ? undefined : 3,
      default: 99,
    });
    expect(result).toBe(99);
  });

  it('preserves complex value types (array, object)', () => {
    const arr = platformChoice<string[]>({ win: ['a'], mac: ['b'], linux: ['c'], default: [] });
    expect(Array.isArray(arr)).toBe(true);

    const obj = platformChoice<{ key: string }>({
      win: { key: 'w' },
      mac: { key: 'm' },
      linux: { key: 'l' },
      default: { key: 'd' },
    });
    expect(typeof obj.key).toBe('string');
  });
});
