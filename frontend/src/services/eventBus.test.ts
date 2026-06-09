import { describe, it, expect, vi } from 'vitest';
import { eventBus } from './eventBus';

describe('eventBus', () => {
  it('delivers emitted payloads to subscribers', () => {
    const handler = vi.fn();
    eventBus.on('test:a', handler);
    eventBus.emit('test:a', { value: 1 });
    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('unsubscribes via the returned function', () => {
    const handler = vi.fn();
    const off = eventBus.on('test:b', handler);
    off();
    eventBus.emit('test:b', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribes via off()', () => {
    const handler = vi.fn();
    eventBus.on('test:c', handler);
    eventBus.off('test:c', handler);
    eventBus.emit('test:c', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler from the others', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    eventBus.on('test:d', bad);
    eventBus.on('test:d', good);
    expect(() => eventBus.emit('test:d', 1)).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('caches the last payload for late readers', () => {
    eventBus.emit('test:e', 42);
    expect(eventBus.getLast('test:e')).toBe(42);
  });
});
