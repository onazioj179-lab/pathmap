import { describe, it, expect, vi } from 'vitest';
import { controlState, CONTROL_STATE_EVENT } from './controlState';
import { eventBus } from './eventBus';

describe('controlState', () => {
  it('toggles the palette and emits a new snapshot', () => {
    const handler = vi.fn();
    const off = eventBus.on(CONTROL_STATE_EVENT, handler);
    const before = controlState.getSnapshot().paletteOpen;
    controlState.togglePalette();
    expect(controlState.getSnapshot().paletteOpen).toBe(!before);
    expect(handler).toHaveBeenCalled();
    off();
    controlState.togglePalette(false);
  });

  it('produces a fresh snapshot reference on change', () => {
    const a = controlState.getSnapshot();
    controlState.toggleHud(true);
    const b = controlState.getSnapshot();
    expect(b).not.toBe(a);
    expect(b.hudVisible).toBe(true);
    controlState.toggleHud(false);
  });

  it('does not emit when set is a no-op', () => {
    controlState.toggleHud(false); // ensure known state
    const handler = vi.fn();
    const off = eventBus.on(CONTROL_STATE_EVENT, handler);
    controlState.toggleHud(false); // same value -> no emit
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it('mirrors map follow-me state from the bus', () => {
    eventBus.emit('map:followMe', true);
    expect(controlState.getSnapshot().followMe).toBe(true);
    eventBus.emit('map:followMe', false);
    expect(controlState.getSnapshot().followMe).toBe(false);
  });
});
