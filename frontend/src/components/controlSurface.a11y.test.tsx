import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ControlCenter from './ControlCenter/ControlCenter';
import CommandPalette from './CommandPalette/CommandPalette';
import TelemetryHUD from './TelemetryHUD/TelemetryHUD';
import { controlState } from '../services/controlState';
import { telemetryBus } from '../services/telemetryBus';

afterEach(() => {
  cleanup();
  controlState.togglePalette(false);
  controlState.toggleHud(false);
  telemetryBus.stop();
});

describe('control surface accessibility', () => {
  it('ControlCenter exposes labelled controls in a named group', () => {
    render(<ControlCenter />);
    expect(screen.getByRole('group', { name: /map controls/i })).toBeInTheDocument();
    // Every interactive control must be reachable by an accessible name.
    expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    expect(screen.getByLabelText('Recenter on my location')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle follow-me')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle fullscreen map')).toBeInTheDocument();
  });

  it('CommandPalette is a labelled modal combobox when open', () => {
    controlState.togglePalette(true);
    render(<CommandPalette />);
    const dialog = screen.getByRole('dialog', { name: /command palette/i });
    expect(dialog).toBeInTheDocument();
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('TelemetryHUD renders a labelled region with controls when visible', () => {
    controlState.toggleHud(true);
    render(<TelemetryHUD />);
    expect(screen.getByRole('region', { name: /system telemetry/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/close telemetry/i)).toBeInTheDocument();
  });
});
