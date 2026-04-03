import type { BrowserWindow } from 'electron';
import type { RpcRouter } from '../RpcRouter';
import { sendToRenderer } from './_bridge';
import type { ClaudeWorker } from '../../a2a/ClaudeWorker';
import * as fs from 'fs';
import { getPidMapDir } from '../../../shared/constants';

type GetWindow = () => BrowserWindow | null;

export function registerA2aRpc(router: RpcRouter, getWindow: GetWindow, claudeWorker: ClaudeWorker): void {
  // a2a.resolve.identity — handled in main process (not renderer)
  // Returns all known sessionId/PID → workspaceId mappings so MCP can resolve itself
  router.register('a2a.resolve.identity', async () => {
    const dir = getPidMapDir();
    const mappings: Record<string, string> = {};
    try {
      if (fs.existsSync(dir)) {
        for (const file of fs.readdirSync(dir)) {
          const wsId = fs.readFileSync(`${dir}/${file}`, 'utf8').trim();
          if (wsId) mappings[file] = wsId;
        }
      }
    } catch { /* best-effort */ }
    return { mappings };
  });

  // A2A protocol — passthrough to renderer
  router.register('a2a.whoami', (params) => sendToRenderer(getWindow, 'a2a.whoami', params));
  router.register('a2a.discover', (params) => sendToRenderer(getWindow, 'a2a.discover', params));
  router.register('a2a.task.query', (params) => sendToRenderer(getWindow, 'a2a.task.query', params));
  router.register('a2a.task.update', (params) => sendToRenderer(getWindow, 'a2a.task.update', params));
  router.register('a2a.broadcast', (params) => sendToRenderer(getWindow, 'a2a.broadcast', params));
  router.register('meta.setSkills', (params) => sendToRenderer(getWindow, 'meta.setSkills', params));

  // task.send: store via renderer + background execution for new tasks
  router.register('a2a.task.send', async (params) => {
    // 1) Save task to store + deliver via PTY paste (renderer handles both)
    const result = await sendToRenderer(getWindow, 'a2a.task.send', params);

    // 2) Background execution only when explicitly requested (execute: true)
    if (params.execute) {
      const taskId = (result as Record<string, unknown>)?.taskId as string | undefined;
      if (taskId && !params.taskId) {
        const receiverWsId = typeof params.to === 'string' ? params.to : '';
        const message = typeof params.message === 'string' ? params.message : '';
        const cwd = typeof params.cwd === 'string' ? params.cwd : undefined;
        claudeWorker.execute(taskId, receiverWsId, message, cwd).catch((err) => {
          console.error(`[a2a.rpc] Background worker failed for task ${taskId}:`, err);
        });
      }
    }

    return result;
  });

  // task.cancel: cancel worker + update store
  router.register('a2a.task.cancel', async (params) => {
    const taskId = typeof params.taskId === 'string' ? params.taskId : '';
    if (taskId) claudeWorker.cancel(taskId);
    return sendToRenderer(getWindow, 'a2a.task.cancel', params);
  });
}
