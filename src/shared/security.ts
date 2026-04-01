import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export function secureWriteTokenFile(filePath: string, token: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, token, { encoding: 'utf8', mode: 0o600 });

  if (process.platform === 'win32') {
    try {
      const icacls = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\icacls.exe`;
      execFileSync(icacls, [
        filePath,
        '/inheritance:r',
        '/grant:r',
        `${process.env.USERNAME}:F`,
      ], { windowsHide: true });
    } catch (aclErr) {
      console.warn('[secureWriteTokenFile] Could not set file ACL:', aclErr);
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Best effort cleanup of an insecure token file.
      }
      const message = aclErr instanceof Error ? aclErr.message : String(aclErr);
      throw new Error(`Failed to set secure ACL on ${filePath}: ${message}`);
    }
  }
}
