import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only cleans up automatically when test globals are enabled. They are not here.
afterEach(() => {
  cleanup();
});
