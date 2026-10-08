import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from '../../../src/renderer/src/components/ui/alert';

describe('Alert', () => {
  it.each(['info', 'success', 'warning', 'destructive'] as const)(
    'shows an icon for the %s variant, so meaning never rests on colour alone',
    (variant) => {
      const { container } = render(
        <Alert variant={variant}>
          <AlertTitle>Title</AlertTitle>
          <AlertDescription>Details</AlertDescription>
        </Alert>,
      );

      const icon = container.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Details')).toBeInTheDocument();
    },
  );

  it('defaults to info and has no live-region role unless asked', () => {
    render(<Alert>Heads up</Alert>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('passes a role through, for something that just went wrong', () => {
    render(
      <Alert variant="destructive" role="alert">
        <AlertTitle>Could not save</AlertTitle>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('accepts a custom icon in place of the default one', () => {
    render(
      <Alert icon={<span data-testid="custom">★</span>}>
        <AlertTitle>Custom</AlertTitle>
      </Alert>,
    );
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });
});
