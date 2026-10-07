import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 75 },
    },
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
