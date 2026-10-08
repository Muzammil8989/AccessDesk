import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OnboardResultView,
  type OnboardSummary,
} from '../../../src/renderer/src/components/onboard-result';
import { Toaster } from '../../../src/renderer/src/components/toaster';
import { clearToasts } from '../../../src/renderer/src/lib/toast';

const PASSWORD = 'Kd7mPq2xRt9WnH4v';

const summary: OnboardSummary = {
  name: 'Ann Lee',
  username: 'ann.lee',
  email: 'ann@example.com',
  departmentName: 'Engineering',
  role: 'member',
};

const complete = {
  status: 'complete' as const,
  subjectId: '8b1c5f5e-7a62-4a0a-9a52-2f1b8f8c1e11',
  steps: [
    { name: 'create_user' as const, status: 'done' as const },
    { name: 'add_to_group' as const, status: 'done' as const },
    { name: 'assign_role' as const, status: 'done' as const },
  ],
};

function view(props: Partial<React.ComponentProps<typeof OnboardResultView>> = {}) {
  return render(
    <OnboardResultView
      result={complete}
      summary={summary}
      password={PASSWORD}
      retrying={false}
      retryError={null}
      onRetry={() => undefined}
      onReset={() => undefined}
      {...props}
    />,
  );
}

describe('OnboardResultView: the one-time password', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    clearToasts();
    vi.useRealTimers();
  });

  it('is blurred until revealed, but always in the page for screen readers', () => {
    view();

    const password = screen.getByLabelText('Temporary password');
    expect(password).toHaveTextContent(PASSWORD);
    expect(password).toHaveClass('select-none');
    const reveal = screen.getByRole('button', { name: 'Reveal' });
    expect(reveal).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(reveal);
    expect(reveal).toHaveAttribute('aria-pressed', 'true');
    expect(password).not.toHaveClass('select-none');

    fireEvent.click(reveal);
    expect(password).toHaveClass('select-none');
  });

  it('shows a toast when the password is copied, and the button goes back to "Copy" by itself', async () => {
    render(<Toaster />);
    view();
    const notifications = screen.getByRole('region', { name: 'Notifications' });
    expect(notifications).not.toHaveTextContent('copied');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(PASSWORD);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(notifications).toHaveTextContent('Password copied to the clipboard');
    // The toast sits in the polite live region, which is what a screen reader announces.
    expect(within(notifications).getAllByRole('status')[0]).toHaveTextContent(
      'Password copied to the clipboard',
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(notifications).toHaveTextContent('Password copied to the clipboard');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(notifications).not.toHaveTextContent('Password copied');
  });

  it('shows no success toast when the clipboard refuses, only the inline message', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<Toaster />);
    view();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('region', { name: 'Notifications' })).not.toHaveTextContent('copied');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByText(/Could not copy automatically/)).toBeInTheDocument();
  });

  it('does not reset a timer that is no longer there when the block goes away', async () => {
    const { unmount } = view();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('warns once, in a callout that is not a live alert, so it does not interrupt', () => {
    view();

    expect(screen.getAllByText(/will not be shown again/)).toHaveLength(1);
    expect(screen.getByText('Save this password now')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows no password block when there is no password', () => {
    view({ password: null });

    expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument();
    expect(screen.queryByText(/will not be shown again/)).not.toBeInTheDocument();
  });
});

describe('OnboardResultView: the outcome', () => {
  it('focuses a real heading', () => {
    view();

    const heading = screen.getByRole('heading', { level: 2, name: 'Employee onboarded' });
    expect(heading).toHaveFocus();
  });

  it('gives each step an icon next to its status word', () => {
    view({
      result: {
        ...complete,
        status: 'partial',
        steps: [
          { name: 'create_user', status: 'done' },
          { name: 'add_to_group', status: 'failed', message: 'Could not do it' },
          { name: 'assign_role', status: 'skipped' },
        ],
      },
    });

    for (const word of ['Done', 'Failed', 'Skipped']) {
      expect(screen.getByText(word).querySelector('svg')).not.toBeNull();
    }
    expect(screen.getByText('Onboarding is not finished')).toBeInTheDocument();
  });

  it('shows why a retry did not work as an alert', () => {
    view({
      result: { ...complete, status: 'partial' },
      retryError: 'This onboarding cannot be retried from this account',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This onboarding cannot be retried from this account',
    );
  });
});
