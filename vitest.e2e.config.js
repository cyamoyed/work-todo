import { defineConfig } from 'vitest/config';

// Standalone config: e2e runs in node env and must not merge the unit include list.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.js'],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
});
