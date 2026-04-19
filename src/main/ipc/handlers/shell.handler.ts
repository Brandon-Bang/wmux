import { ipcMain, shell } from 'electron';
import { ShellDetector } from '../../pty/ShellDetector';
import { IPC } from '../../../shared/constants';
import { wrapHandler } from '../wrapHandler';

export function registerShellHandlers(): () => void {
  const detector = new ShellDetector();

  ipcMain.removeHandler(IPC.SHELL_LIST);
  ipcMain.handle(IPC.SHELL_LIST, wrapHandler(IPC.SHELL_LIST, (_event: Electron.IpcMainInvokeEvent) => {
    return detector.detect();
  }));

  ipcMain.removeHandler(IPC.SHELL_OPEN_EXTERNAL);
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, wrapHandler(IPC.SHELL_OPEN_EXTERNAL, (_event: Electron.IpcMainInvokeEvent, url: string) => {
    if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      throw new Error('Only http/https URLs are allowed');
    }
    return shell.openExternal(url);
  }));

  return () => {
    ipcMain.removeHandler(IPC.SHELL_LIST);
    ipcMain.removeHandler(IPC.SHELL_OPEN_EXTERNAL);
  };
}
