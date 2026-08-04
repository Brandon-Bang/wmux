import { describe, it, expect, vi } from 'vitest';
import { createAtlasGuard } from '../atlasGuard';

// A coherent rebuild must drop each pane's RENDERER MODEL, not just repaint it.
//
// xterm shares one TextureAtlas across same-config terminals, but every pane's
// WebGL renderer holds its own cell -> texture-coordinate model. Emptying the
// shared atlas invalidates those coordinates everywhere, yet only the pane that
// draws next rebuilds its model; the rest keep sampling rectangles that now
// contain different glyphs. Grid, borders and cursor stay right while the
// CHARACTERS come out wrong.
//
// refresh() repaints from the model it already has, so it cannot cure that.
// Measured 2026-08-05 on a live 7-pane window after a lock/unlock: refresh-all
// left the screen garbled, per-pane clearTextureAtlas() restored 7/7. The
// rebuild must therefore call clearAtlas on every owner pane.
class FakeAtlas {
  static maxAtlasPages = 16;
  pages = [{ currentRow: { x: 0, y: 1 } }];
  clearTexture(): void {
    for (const p of this.pages) p.currentRow = { x: 0, y: 0 };
  }
}

function paneOn(atlas: FakeAtlas, opts: { withClearAtlas: boolean }) {
  const refresh = vi.fn();
  const clearAtlas = vi.fn();
  const entry: {
    getAddon: () => unknown;
    refresh: () => void;
    clearAtlas?: () => void;
  } = {
    getAddon: () => ({ _renderer: { _charAtlas: atlas } }),
    refresh,
  };
  if (opts.withClearAtlas) entry.clearAtlas = clearAtlas;
  return { entry, refresh, clearAtlas };
}

describe('atlasGuard rebuild drops each pane renderer model', () => {
  it('calls clearAtlas on EVERY pane sharing the atlas, not just the active one', () => {
    const atlas = new FakeAtlas();
    const guard = createAtlasGuard({ setIntervalFn: () => 0 as never, clearIntervalFn: vi.fn() });
    const a = paneOn(atlas, { withClearAtlas: true });
    const b = paneOn(atlas, { withClearAtlas: true });
    const c = paneOn(atlas, { withClearAtlas: true });
    guard.register(a.entry);
    guard.register(b.entry);
    guard.register(c.entry);

    guard.recoverNow('visibility');

    // The load-bearing assertion: a rebuild that only refreshed would leave two
    // of these three panes rendering stale glyphs.
    expect(a.clearAtlas).toHaveBeenCalledTimes(1);
    expect(b.clearAtlas).toHaveBeenCalledTimes(1);
    expect(c.clearAtlas).toHaveBeenCalledTimes(1);
  });

  it('still repaints after dropping the model', () => {
    const atlas = new FakeAtlas();
    const guard = createAtlasGuard({ setIntervalFn: () => 0 as never, clearIntervalFn: vi.fn() });
    const a = paneOn(atlas, { withClearAtlas: true });
    guard.register(a.entry);

    guard.recoverNow('system-resumed');

    expect(a.clearAtlas).toHaveBeenCalled();
    expect(a.refresh).toHaveBeenCalled();
  });

  it('an entry registered without clearAtlas still refreshes and does not throw', () => {
    const atlas = new FakeAtlas();
    const guard = createAtlasGuard({ setIntervalFn: () => 0 as never, clearIntervalFn: vi.fn() });
    const legacy = paneOn(atlas, { withClearAtlas: false });
    guard.register(legacy.entry);

    expect(() => guard.recoverNow('visibility')).not.toThrow();
    expect(legacy.refresh).toHaveBeenCalled();
  });

  it('a pane whose clearAtlas throws does not stop the others being cured', () => {
    const atlas = new FakeAtlas();
    const guard = createAtlasGuard({ setIntervalFn: () => 0 as never, clearIntervalFn: vi.fn() });
    const dying = paneOn(atlas, { withClearAtlas: true });
    dying.clearAtlas.mockImplementation(() => { throw new Error('disposed'); });
    const healthy = paneOn(atlas, { withClearAtlas: true });
    guard.register(dying.entry);
    guard.register(healthy.entry);

    expect(() => guard.recoverNow('visibility')).not.toThrow();
    expect(healthy.clearAtlas).toHaveBeenCalledTimes(1);
    expect(healthy.refresh).toHaveBeenCalled();
  });
});

// The wiring in useTerminal cannot be exercised without a live xterm, so it is
// pinned at source level next to the #191 / #747 locks.
describe('useTerminal registers clearAtlas with the guard (source-level)', () => {
  it('passes terminal.clearTextureAtlas, not only refresh', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs
      .readFileSync(path.join(__dirname, '..', '..', 'hooks', 'useTerminal.ts'), 'utf-8')
      .replace(/\r\n/g, '\n');
    const start = src.indexOf('atlasGuard.register({');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('});', start));
    expect(
      block,
      'the atlasGuard entry no longer provides clearAtlas — a rebuild would ' +
        'repaint stale texture coordinates instead of curing them',
    ).toMatch(/clearAtlas\s*:/);
    expect(block).toMatch(/clearTextureAtlas\(\)/);
  });
});
