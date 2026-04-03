import { spawn, type ChildProcess } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { sendToRenderer } from '../pipe/handlers/_bridge';

type GetWindow = () => BrowserWindow | null;

interface WorkerSession {
  proc: ChildProcess;
  taskId: string;
  lineBuffer: string;
  sessionId: string | null;
}

const MAX_CONCURRENT = 4;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Background Claude Code worker — spawns CLI in stream-json mode
 * to execute A2A tasks without touching the PTY terminal.
 */
export class ClaudeWorker {
  private readonly sessions = new Map<string, WorkerSession>();
  private readonly getWindow: GetWindow;

  constructor(getWindow: GetWindow) {
    this.getWindow = getWindow;
  }

  get isFull(): boolean {
    return this.sessions.size >= MAX_CONCURRENT;
  }

  /**
   * Execute a task in the background via Claude CLI.
   * Fire-and-forget: updates task status via sendToRenderer when done.
   */
  async execute(
    taskId: string,
    receiverWorkspaceId: string,
    message: string,
    cwd?: string,
  ): Promise<void> {
    if (this.isFull) {
      await this.updateTaskStatus(taskId, receiverWorkspaceId, 'failed', 'Worker at capacity');
      return;
    }

    // Mark task as working
    await this.updateTaskStatus(taskId, receiverWorkspaceId, 'working');

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
    ];

    const proc = spawn('claude', args, {
      cwd: cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const session: WorkerSession = {
      proc,
      taskId,
      lineBuffer: '',
      sessionId: null,
    };
    this.sessions.set(taskId, session);

    // Send the user message as first stdin input
    proc.stdin!.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: message },
    }) + '\n');

    // Process NDJSON stdout
    proc.stdout!.on('data', (chunk: Buffer) => {
      session.lineBuffer += chunk.toString();

      if (session.lineBuffer.length > MAX_BUFFER_BYTES) {
        console.error(`[ClaudeWorker] Buffer overflow for task ${taskId}, destroying`);
        proc.kill('SIGTERM');
        return;
      }

      let newlineIndex: number;
      while ((newlineIndex = session.lineBuffer.indexOf('\n')) !== -1) {
        const line = session.lineBuffer.slice(0, newlineIndex).trim();
        session.lineBuffer = session.lineBuffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          this.processLine(session, receiverWorkspaceId, line);
        }
      }
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().slice(0, 500);
      console.warn(`[ClaudeWorker] task=${taskId} stderr: ${text}`);
    });

    proc.on('error', (err) => {
      console.error(`[ClaudeWorker] spawn error for task ${taskId}:`, err);
      this.sessions.delete(taskId);
      this.updateTaskStatus(taskId, receiverWorkspaceId, 'failed', `Spawn error: ${err.message}`);
    });

    proc.on('close', (code) => {
      const sess = this.sessions.get(taskId);
      if (!sess) return; // already handled via processLine 'result'
      this.sessions.delete(taskId);
      if (code !== 0) {
        this.updateTaskStatus(taskId, receiverWorkspaceId, 'failed', `Process exited with code ${code}`);
      }
    });
  }

  /**
   * Process a single NDJSON line from Claude CLI stdout.
   */
  private processLine(session: WorkerSession, receiverWorkspaceId: string, line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // skip non-JSON lines
    }

    const type = parsed.type as string;

    if (type === 'system' && parsed.subtype === 'init') {
      session.sessionId = parsed.session_id as string;
    } else if (type === 'result') {
      const resultText = (parsed.result as string) ?? '';
      const isError = parsed.is_error as boolean;
      const costUsd = parsed.total_cost_usd as number;

      this.sessions.delete(session.taskId);

      const status = isError ? 'failed' : 'completed';
      const statusMessage = isError
        ? `Error: ${resultText}`
        : resultText;

      this.updateTaskStatus(session.taskId, receiverWorkspaceId, status, statusMessage);

      console.log(`[ClaudeWorker] task=${session.taskId} ${status} cost=$${costUsd?.toFixed(4) ?? '?'}`);
    }
  }

  /**
   * Update task status via the renderer store.
   */
  private async updateTaskStatus(
    taskId: string,
    workspaceId: string,
    status: string,
    message?: string,
  ): Promise<void> {
    try {
      await sendToRenderer(this.getWindow, 'a2a.task.update', {
        taskId,
        workspaceId,
        status,
        ...(message ? { message } : {}),
      });
    } catch (err) {
      console.error(`[ClaudeWorker] Failed to update task ${taskId}:`, err);
    }
  }

  /**
   * Cancel a running task.
   */
  cancel(taskId: string): boolean {
    const session = this.sessions.get(taskId);
    if (!session) return false;

    session.proc.kill('SIGTERM');
    this.sessions.delete(taskId);

    // Fallback SIGKILL after 5s
    const pid = session.proc.pid;
    if (pid) {
      setTimeout(() => {
        try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }

    return true;
  }

  /**
   * Stop all running tasks (graceful shutdown).
   */
  stop(): void {
    for (const [taskId, session] of this.sessions) {
      session.proc.kill('SIGTERM');
      console.log(`[ClaudeWorker] Stopping task ${taskId}`);
    }
    this.sessions.clear();
  }
}
