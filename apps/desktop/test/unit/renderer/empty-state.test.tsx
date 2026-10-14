import { render } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../../../src/renderer/src/components/empty-state';

describe('EmptyState', () => {
  it('draws the icon bare: no tile, circle or background behind it', () => {
    const { container } = render(
      <EmptyState icon={Users}>
        <p>Nothing here</p>
      </EmptyState>,
    );

    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    // The icon is a direct child of the block, so there is no wrapper that could carry a fill.
    expect(icon?.parentElement).toBe(container.firstElementChild);
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.getAttribute('class')).not.toMatch(/\bbg-/);
  });
});
