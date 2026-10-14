import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
    build: {
      // Smaller scripts parse and compile faster, which is most of the start-up cost on a slow CPU.
      minify: 'esbuild',
      cssMinify: true,
    },
  },
});
