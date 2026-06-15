import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      // Operational scripts (migration tooling) keep their tests
      // alongside the source so the algorithm and the test fixture stay
      // in lockstep. Pure ESM (no TS / no Vite transform required).
      'scripts/__tests__/**/*.test.mjs',
      // Plugin integrations (Phase 1 wmux × Claude Code) live outside
      // src/ so they can be packaged as Claude Code marketplace plugins
      // without dragging the rest of the repo. Tests for the
      // shared/signal-types boundary live next to the source.
      'integrations/**/__tests__/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    // Unit tests drive destroySession/dispose with mocked PTYs carrying fake
    // PIDs (e.g. 12345). killProcessTree must NOT shell out to a real
    // `taskkill /F` against those PIDs, so disable the Windows tree-kill for
    // the whole unit suite. Wiring is asserted separately by mocking the helper.
    env: { WMUX_DISABLE_TREE_KILL: '1' },
  },
});
