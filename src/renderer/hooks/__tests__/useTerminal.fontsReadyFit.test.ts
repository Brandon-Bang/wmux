import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Source locks must not depend on line endings: `validate` runs on
// windows-latest, where the checkout is CRLF, so any assertion carrying a
// literal \n passes on macOS/Linux and fails only in CI. Normalise once here and
// keep every pattern below whitespace-tolerant.
const readSource = (p: string) => fs.readFileSync(p, 'utf-8').replace(/\r\n/g, '\n');

// Post-font re-fit regression lock (source-level).
//
// font-display:swap paints with a fallback font first, so the mount-time fit()
// measures the wrong cell width. On Windows the fallback (Consolas) is narrower
// than the bundled JetBrains Mono, so that first fit OVER-counts columns — 56
// where only 49 fit. xterm then paints a grid wider than its container and the
// overflow is clipped: every line silently loses its tail, mid-glyph, no error.
//
// The fonts.ready handler already existed to repair this, but it called
// fitAddon.fit() directly. That corrects the VIEW and never reaches sendResize,
// so the PTY keeps the fallback-derived width and the shell keeps wrapping at
// it for the whole session. sendResize lives only in runFit(), whose only
// trigger is a real container resize — which is why restarting the app does not
// help (the same race replays on every launch) while nudging the window does.
//
// This is exactly the failure #747 names: "a hand-rolled fitAddon.fit() in the
// handler would resize xterm while leaving the PTY on the old size". #747 fixed
// the selection-release retry and the ResizeObserver; fonts.ready was the last
// site still holding a thinner copy. Pinned at source level for the same reason
// as the #191 atlas lock and the #747 lock beside it: the behaviour needs real
// font loading and a live xterm to observe.
describe('post-font re-fit must reach the PTY, not just the view', () => {
  const hookPath = path.join(__dirname, '..', 'useTerminal.ts');
  const src = readSource(hookPath);

  const start = src.indexOf('document.fonts.ready.then(');
  // Bound the block by the next declaration rather than an indentation pattern —
  // a formatter change must not silently shrink or widen the slice.
  const end = src.indexOf('pendingFitRef.current = false;', start);
  const block = src.slice(start, end);

  it('locates the fonts.ready block', () => {
    expect(start).toBeGreaterThan(-1);
    expect(
      end,
      'fonts.ready is no longer followed by the pendingFitRef reset — re-anchor this slice',
    ).toBeGreaterThan(start);
  });

  it('runs the real fit path, not a thinner copy', () => {
    // The load-bearing assertion. runFit() is the only path that carries
    // sendResize, so routing through it is what actually resizes the PTY.
    expect(
      block,
      'the fonts.ready re-fit does not go through runFit() — the corrected ' +
        'dimensions would reach xterm but never the PTY',
    ).toMatch(/runFit\(\)/);
    expect(
      block,
      'the fonts.ready handler calls fitAddon.fit() directly again — that is the ' +
        'thinner copy that leaves the PTY on the fallback-font size',
    ).not.toMatch(/fitAddon\.fit\(\)/);
  });

  it('still repaints after the atlas rebuild', () => {
    expect(block).toMatch(/terminal\.refresh\(0, terminal\.rows - 1\)/);
  });

  it('keeps the guards that make a post-mount fit safe', () => {
    // Identity: a ptyId change re-runs the create effect, and a late fonts
    // promise must not fit the old container and resize the new pty.
    expect(block).toMatch(/terminalRef\.current !== terminal/);
    // Zero dimensions: fitting a display:none workspace collapses cols and
    // corrupts the buffer.
    expect(block).toMatch(/container\.offsetWidth === 0/);
  });

  it('the mount-time fit it repairs is still there', () => {
    // If the pre-font fit is ever removed this lock loses its subject, and the
    // comment above it would be describing a race that no longer exists.
    const mountFit = src.slice(0, start);
    expect(mountFit).toMatch(/fitAddon\.fit\(\)/);
  });
});
