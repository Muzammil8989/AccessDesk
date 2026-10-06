import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects: the main process runs in plain Node (it is written so it does not need Electron),
// the React UI runs in jsdom with Testing Library.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main/index.ts',
        'src/main/window.ts',
        'src/main/ipc.ts',
        'src/preload/**',
        'src/renderer/src/main.tsx',
        'src/renderer/src/components/ui/**',
        'src/shared/**',
        '**/*.d.ts',
      ],
      reporter: ['text-summary', 'text', 'lcov'],
      reportsDirectory: './coverage',
      // A floor, not a goal: coverage may go up freely but must not quietly fall below this.
      thresholds: { lines: 90, statements: 88, functions: 85, branches: 75 },
    },
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['test/unit/main/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { '@': path.resolve(__dirname, 'src/renderer/src') } },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['test/unit/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['./test/unit/renderer/setup.ts'],
        },
      },
    ],
  },
});
