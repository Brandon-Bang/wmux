import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/__tests__/**/*.runtime.test.{ts,tsx}',
      'scripts/__tests__/**/*.runtime.test.mjs',
      'integrations/**/__tests__/**/*.runtime.test.{ts,tsx}',
    ],
    environment: 'node',
    fileParallelism: false,
    // Runtime tests spawn real PTYs; keep the tree-kill disabled so teardown
    // behavior matches the pre-fix baseline and no test-spawned shell tree is
    // reaped out from under an assertion. Production teardown still tree-kills.
    env: { WMUX_DISABLE_TREE_KILL: '1' },
  },
});
