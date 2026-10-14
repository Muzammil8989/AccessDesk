import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no ResizeObserver; Electron does. Radix measures the tooltip arrow with it. Defined
// directly rather than with vi.stubGlobal, which some tests undo after each test.
if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}

// The first test in a file that renders the real router also pays for loading its lazy screen. On a
// slow CI runner that alone can exceed the 1 s default, so a test failed for being slow, not wrong.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
