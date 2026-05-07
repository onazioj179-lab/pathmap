import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button, IconButton } from './Button';

describe('Button', () => {
  it('renders and handles click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables interaction while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Saving
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(0);
  });
});

describe('IconButton', () => {
  it('applies aria-label and title', () => {
    render(<IconButton label="Close" icon={<span aria-hidden="true">x</span>} />);

    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('title', 'Close');
  });
});
