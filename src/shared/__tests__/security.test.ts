import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  existsSync: fsMock.existsSync,
  mkdirSync: fsMock.mkdirSync,
  writeFileSync: fsMock.writeFileSync,
}));

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

describe('secureWriteTokenFile', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fsMock.existsSync.mockReturnValue(true);
  });

  it('creates the parent directory and writes the token file', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const { secureWriteTokenFile } = await import('../security');
    const tokenPath = path.join('C:', 'Users', 'tester', '.wmux', 'daemon-auth-token');

    secureWriteTokenFile(tokenPath, 'secret-token');

    expect(fsMock.existsSync).toHaveBeenCalledWith(path.dirname(tokenPath));
    expect(fsMock.mkdirSync).toHaveBeenCalledWith(path.dirname(tokenPath), { recursive: true });
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(tokenPath, 'secret-token', {
      encoding: 'utf8',
      mode: 0o600,
    });
  });

  it('applies Windows ACL hardening when running on Windows', async () => {
    vi.stubEnv('USERNAME', 'tester');
    vi.stubEnv('SystemRoot', 'C:\\Windows');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const { secureWriteTokenFile } = await import('../security');
    const tokenPath = path.join('C:', 'Users', 'tester', '.wmux-auth-token');
    secureWriteTokenFile(tokenPath, 'secret-token');

    expect(execFileSyncMock).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\icacls.exe',
      [tokenPath, '/inheritance:r', '/grant:r', 'tester:F'],
      { windowsHide: true },
    );
  });
});
