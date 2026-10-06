import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Editors built on Electron (VS Code and others) can leak ELECTRON_RUN_AS_NODE=1 into terminals.
// It makes Electron start as plain Node and crash, so clear it before electron-vite launches the app.
delete process.env.ELECTRON_RUN_AS_NODE;

// No runtime "dependencies" are declared, so everything is bundled into the
// main, preload and renderer outputs. Only `electron` and Node built-ins stay external.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
  },
});
