import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../../../src/renderer/src/components/theme-toggle';
import { setTheme } from '../../../src/renderer/src/lib/theme';

type ChangeListener = () => void;

function stubSystemTheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<ChangeListener>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: ChangeListener) => listeners.add(listener),
      removeEventListener: (_: string, listener: ChangeListener) => listeners.delete(listener),
    })),
  );
  return {
    flip(next: boolean) {
      dark = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('theme', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies and remembers an explicit choice', async () => {
    const { setTheme, getTheme } = await import('../../../src/renderer/src/lib/theme');

    setTheme('dark');
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem('accessdesk.theme')).toBe('dark');

    setTheme('light');
    expect(isDark()).toBe(false);
    expect(getTheme()).toBe('light');
  });

  it('starts from the saved choice and ignores a corrupt one', async () => {
    window.localStorage.setItem('accessdesk.theme', 'dark');
    const saved = await import('../../../src/renderer/src/lib/theme');
    saved.initTheme();
    expect(saved.getTheme()).toBe('dark');
    expect(isDark()).toBe(true);

    vi.resetModules();
    window.localStorage.setItem('accessdesk.theme', 'neon');
    const corrupt = await import('../../../src/renderer/src/lib/theme');
    expect(corrupt.getTheme()).toBe('system');
  });

  it('follows the OS while set to system, and only then', async () => {
    const os = stubSystemTheme(false);
    const { initTheme, setTheme } = await import('../../../src/renderer/src/lib/theme');

    initTheme();
    expect(isDark()).toBe(false);

    os.flip(true);
    expect(isDark()).toBe(true);

    setTheme('light');
    os.flip(true);
    expect(isDark()).toBe(false);
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { getTheme, setTheme } = await import('../../../src/renderer/src/lib/theme');

    expect(getTheme()).toBe('system');
    expect(() => setTheme('dark')).not.toThrow();
    expect(isDark()).toBe(true);
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('cycles light, dark, system from one button when compact', async () => {
    const user = userEvent.setup();
    setTheme('light');
    render(<ThemeToggle compact />);

    await user.click(screen.getByRole('button', { name: 'Theme: Light. Switch to Dark' }));
    expect(isDark()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Theme: Dark. Switch to System' }));
    expect(screen.getByRole('button', { name: 'Theme: System. Switch to Light' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Theme: System. Switch to Light' }));
    expect(isDark()).toBe(false);
  });

  it('marks the active theme and switches on click', async () => {
    const user = userEvent.setup();
    setTheme('system');
    render(<ThemeToggle />);

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(isDark()).toBe(true);
  });
});
