/**
 * PATHMAP - Event Bus
 * ===================
 * Minimal typed publish/subscribe primitive. This is the no-dependency reactive
 * backbone for the control surface, telemetry HUD, and always-on status: engines
 * emit here and React overlays subscribe via hooks/useEngineState.
 *
 * Deliberately tiny: no wildcard matching, no async, no ordering guarantees
 * beyond registration order. Handlers are isolated so one throwing does not
 * stop the others.
 */

export type EventHandler<T = unknown> = (payload: T) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  // Last emitted payload per event, so late subscribers can read current state.
  private lastPayload = new Map<string, unknown>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler);
    return () => this.off(event, handler);
  }

  /** Unsubscribe a previously registered handler. */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    this.handlers.get(event)?.delete(handler as EventHandler);
  }

  /** Emit an event to all subscribers. The payload is cached for getLast(). */
  emit<T = unknown>(event: string, payload: T): void {
    this.lastPayload.set(event, payload);
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[eventBus] handler for "${event}" threw:`, error);
      }
    }
  }

  /** Read the most recently emitted payload for an event, if any. */
  getLast<T = unknown>(event: string): T | undefined {
    return this.lastPayload.get(event) as T | undefined;
  }
}

export const eventBus = new EventBus();
export default eventBus;
