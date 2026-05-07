import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { ToastStack } from './Toast';

describe('Dialog', () => {
  it('renders an accessible dialog and closes on Escape', () => {
    const onClose = vi.fn();

    render(
      <Dialog open title="Preferences" onClose={onClose}>
        <button>Save</button>
      </Dialog>
    );

    expect(screen.getByRole('dialog', { name: 'Preferences' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ToastStack', () => {
  it('announces and dismisses notifications', () => {
    const onDismiss = vi.fn();

    render(
      <ToastStack
        messages={[{ id: '1', kind: 'success', title: 'Saved', message: 'Ready to go.' }]}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Saved' }));
    expect(onDismiss).toHaveBeenCalledWith('1');
  });
});

describe('EmptyState', () => {
  it('renders title, message, and action', () => {
    render(
      <EmptyState
        title="No routes"
        message="Pick a target to calculate a route."
        action={<button>Pick target</button>}
      />
    );

    expect(screen.getByText('No routes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick target' })).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('exposes a loading status label', () => {
    render(<Skeleton variant="card" label="Loading route" />);
    expect(screen.getByRole('status', { name: 'Loading route' })).toBeInTheDocument();
  });
});
