import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Regression tests for the CDP session lifecycle in PlaywrightEngine.
 *
 * Background: The engine opens browser-level CDP sessions for Target discovery
 * (auto-attach, Target.getTargets, Target.attachToTarget). Each session lives
 * inside Playwright's internal connection map until detach() is called. Prior
 * to this test, four session-creation sites in the engine never detached,
 * which accumulated across every browser MCP call and leaked memory even at
 * idle (the sessions stayed subscribed to Target domain events).
 *
 * These tests exercise the connect/disconnect contract — the hottest leak
 * path, triggered on every reconnect and on engine teardown.
 */

const mockSendRpc = vi.fn();
vi.mock('../wmux-client', () => ({
  sendRpc: (...args: unknown[]) => mockSendRpc(...args),
}));

const mockConnectOverCDP = vi.fn();
vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: (...args: unknown[]) => mockConnectOverCDP(...args),
  },
}));

// Import after mocks are declared.
import { PlaywrightEngine } from '../PlaywrightEngine';

interface FakeSession {
  send: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
}

function makeFakeSession(): FakeSession {
  return {
    send: vi.fn().mockResolvedValue({ targetInfos: [] }),
    detach: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeBrowser(sessions: FakeSession[]) {
  return {
    isConnected: vi.fn().mockReturnValue(true),
    newBrowserCDPSession: vi.fn().mockImplementation(async () => {
      const s = makeFakeSession();
      sessions.push(s);
      return s;
    }),
    contexts: vi.fn().mockReturnValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('PlaywrightEngine CDP session lifecycle', () => {
  beforeEach(() => {
    // Reset the singleton so each test gets a clean engine.
    (PlaywrightEngine as unknown as { instance: PlaywrightEngine | null }).instance = null;
    mockSendRpc.mockReset();
    mockConnectOverCDP.mockReset();
  });

  it('detaches the auto-attach session on disconnect', async () => {
    const sessions: FakeSession[] = [];
    const browser = makeFakeBrowser(sessions);
    mockConnectOverCDP.mockResolvedValue(browser);

    const engine = PlaywrightEngine.getInstance();
    await engine.connect(9222);

    // connect() creates exactly one browser-level session for setAutoAttach.
    expect(sessions).toHaveLength(1);
    expect(sessions[0].send).toHaveBeenCalledWith(
      'Target.setAutoAttach',
      expect.objectContaining({ autoAttach: true }),
    );
    // The session must survive until disconnect — detach has NOT been called yet.
    expect(sessions[0].detach).not.toHaveBeenCalled();

    await engine.disconnect();

    // After disconnect, the auto-attach session must be detached so it
    // doesn't remain pinned inside Playwright's internal session map.
    expect(sessions[0].detach).toHaveBeenCalledTimes(1);
  });

  it('detaches the prior auto-attach session when reconnecting to a new CDP port', async () => {
    const sessions: FakeSession[] = [];
    mockConnectOverCDP.mockImplementation(async () => makeFakeBrowser(sessions));

    const engine = PlaywrightEngine.getInstance();
    await engine.connect(9222);
    expect(sessions).toHaveLength(1);

    // Reconnect to a different port — connect() must call disconnect() first,
    // which must detach the prior auto-attach session before creating a new one.
    await engine.connect(9333);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].detach).toHaveBeenCalledTimes(1);
    // The new session is still live.
    expect(sessions[1].detach).not.toHaveBeenCalled();
  });

  it('does not throw if the auto-attach session is already gone on disconnect', async () => {
    const sessions: FakeSession[] = [];
    const browser = makeFakeBrowser(sessions);
    mockConnectOverCDP.mockResolvedValue(browser);

    const engine = PlaywrightEngine.getInstance();
    await engine.connect(9222);

    // Simulate a session that errors on detach (e.g. the remote end already
    // closed). disconnect() must still complete successfully — best-effort.
    sessions[0].detach.mockRejectedValueOnce(new Error('Session closed'));

    await expect(engine.disconnect()).resolves.toBeUndefined();
    expect(sessions[0].detach).toHaveBeenCalledTimes(1);
  });
});
