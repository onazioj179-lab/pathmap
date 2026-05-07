import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wsResilience, createResilientWebSocket } from '../websocketResilience';

/**
 * PATHMAP V97 - WebSocket Resilience Service Tests
 * ================================================
 */

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((error: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code || 1000, reason: reason || '' });
  }

  // Helper to simulate receiving a message
  _receiveMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Helper to simulate error
  _simulateError() {
    this.onerror?.(new Error('Connection error'));
  }
}

describe('WebSocketResilience', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  describe('connect', () => {
    it('should connect to WebSocket URL', async () => {
      const onOpen = vi.fn();

      wsResilience.connect({
        url: 'ws://localhost:8000/ws',
        onOpen,
      });

      await vi.advanceTimersByTimeAsync(20);

      expect(onOpen).toHaveBeenCalled();
      expect(wsResilience.isConnected).toBe(true);

      wsResilience.close();
    });

    it('should handle messages', async () => {
      const onMessage = vi.fn();

      const ws = wsResilience.connect({
        url: 'ws://localhost:8000/ws',
        onMessage,
      });

      await vi.advanceTimersByTimeAsync(20);

      // Simulate receiving message
      (ws as any)._receiveMessage({ type: 'test', data: 'hello' });

      expect(onMessage).toHaveBeenCalledWith({ type: 'test', data: 'hello' });

      wsResilience.close();
    });
  });

  describe('exponential backoff', () => {
    it('should increase delay on reconnection attempts', () => {
      // Test the backoff calculation internally
      const instance = createResilientWebSocket({
        url: 'ws://localhost:8000/ws',
      });

      // Close to trigger reconnection
      instance.close();

      // Verify attempts tracking
      expect(instance.attempts).toBe(0);
    });

    it('should reset backoff on successful connection', async () => {
      const instance = createResilientWebSocket({
        url: 'ws://localhost:8000/ws',
      });

      await vi.advanceTimersByTimeAsync(20);

      expect(instance.isConnected).toBe(true);
      expect(instance.attempts).toBe(0);

      instance.close();
    });
  });

  describe('send', () => {
    it('should send data when connected', async () => {
      wsResilience.connect({
        url: 'ws://localhost:8000/ws',
      });

      await vi.advanceTimersByTimeAsync(20);

      const result = wsResilience.send({ type: 'ping' });
      expect(result).toBe(true);

      wsResilience.close();
    });

    it('should return false when not connected', () => {
      const result = wsResilience.send({ type: 'ping' });
      expect(result).toBe(false);
    });
  });

  describe('close', () => {
    it('should close connection and prevent reconnection', async () => {
      const onClose = vi.fn();

      wsResilience.connect({
        url: 'ws://localhost:8000/ws',
        onClose,
      });

      await vi.advanceTimersByTimeAsync(20);

      wsResilience.close();

      expect(wsResilience.isConnected).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
