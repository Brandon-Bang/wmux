import { useEffect, useState, useCallback } from 'react';
import type { Terminal } from '@xterm/xterm';

interface BookmarkIndicatorProps {
  terminal: Terminal | null;
  bookmarks: number[]; // absolute line numbers (baseY + viewportY at time of creation)
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Renders small colored markers on the left edge of the terminal container
 * at the scroll positions where bookmarks were created.
 *
 * Each marker is absolutely positioned. We translate from absolute buffer line
 * numbers to pixel offsets by using the terminal's current viewport metrics:
 *
 *   visibleLine = absoluteLine - term.buffer.active.baseY
 *   pixelTop    = visibleLine * lineHeight
 *
 * Lines outside the current viewport are not rendered (the marker would be
 * off-screen). We re-compute on every scroll event so markers track correctly
 * as the user scrolls.
 */
export default function BookmarkIndicator({ terminal, bookmarks, containerRef }: BookmarkIndicatorProps) {
  // Re-render whenever the terminal scrolls or the bookmarks list changes
  const [, forceUpdate] = useState(0);

  const scheduleUpdate = useCallback(() => {
    forceUpdate((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!terminal) return;
    const disposable = terminal.onScroll(() => scheduleUpdate());
    return () => disposable.dispose();
  }, [terminal, scheduleUpdate]);

  // Also re-render when bookmarks array reference changes (handled by the
  // parent passing a new array reference via Zustand selector)

  if (!terminal || bookmarks.length === 0) return null;

  const container = containerRef.current;
  if (!container) return null;

  const rows = terminal.rows;
  if (rows <= 0) return null;

  // Compute pixel height per terminal row
  const termElement = terminal.element;
  if (!termElement) return null;

  // The xterm .xterm-screen element holds the actual character grid
  const screenEl = termElement.querySelector('.xterm-screen') as HTMLElement | null;
  const lineHeight = screenEl ? screenEl.offsetHeight / rows : container.offsetHeight / rows;
  if (lineHeight <= 0) return null;

  const baseY = terminal.buffer.active.baseY;
  const viewportY = terminal.buffer.active.viewportY;

  // Visible line range in absolute coordinates
  const visibleTop = baseY + viewportY;
  const visibleBottom = visibleTop + rows;

  const markers: { top: number; absoluteLine: number }[] = [];

  for (const absoluteLine of bookmarks) {
    if (absoluteLine < visibleTop || absoluteLine >= visibleBottom) continue;
    const rowInViewport = absoluteLine - visibleTop;
    markers.push({
      top: rowInViewport * lineHeight + lineHeight / 2 - 4, // center the 8px dot vertically in the row
      absoluteLine,
    });
  }

  return (
    <>
      {markers.map(({ top, absoluteLine }) => (
        <div
          key={absoluteLine}
          style={{
            position: 'absolute',
            left: 2,
            top,
            width: 6,
            height: 8,
            borderRadius: 2,
            background: 'var(--accent-yellow)',
            opacity: 0.85,
            zIndex: 20,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
