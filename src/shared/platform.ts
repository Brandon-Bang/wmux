// OS-aware constants and helpers used across main / renderer / daemon / mcp / cli.
//
// Background: prior to this module, ~45 inline `process.platform === 'win32'`
// branches were scattered through src/. New code should prefer `platformChoice`
// and the boolean constants below; existing inline branches migrate boy-scout
// style as files are touched.

export type Platform = 'win32' | 'darwin' | 'linux' | 'other';

export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';
export const isUnix = !isWindows;

export const currentPlatform: Platform = isWindows
  ? 'win32'
  : isMac
    ? 'darwin'
    : isLinux
      ? 'linux'
      : 'other';

// Pick a value per OS. `default` is required so the return type is non-nullable.
//
// Example:
//   const shellCandidates = platformChoice<string[]>({
//     win: ['pwsh.exe', 'powershell.exe', 'cmd.exe'],
//     mac: ['/bin/zsh', '/bin/bash'],
//     linux: ['/bin/bash', '/bin/zsh'],
//     default: ['/bin/sh'],
//   });
export interface PlatformChoice<T> {
  win?: T;
  mac?: T;
  linux?: T;
  default: T;
}

export function platformChoice<T>(choices: PlatformChoice<T>): T {
  if (isWindows && choices.win !== undefined) return choices.win;
  if (isMac && choices.mac !== undefined) return choices.mac;
  if (isLinux && choices.linux !== undefined) return choices.linux;
  return choices.default;
}
