import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/server.ts', 'src/infra/db.ts', 'src/infra/jobs.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      reportsDirectory: './coverage',
      // A floor, not a goal: coverage may go up freely but must not quietly fall below this.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 75 },
    },
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
