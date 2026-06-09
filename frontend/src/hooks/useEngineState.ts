/**
 * useEngineState - subscribe a component to an engine's state via the eventBus.
 *
 * This is the no-dependency bridge between the service-singleton world and React:
 * an engine emits on `event`, and any component using this hook re-renders with
 * the latest snapshot. Built on useSyncExternalStore so it is concurrent-safe.
 *
 * getSnapshot MUST return a referentially-stable value while the state is
 * unchanged (engines should hold a snapshot object and only replace it on
 * change), otherwise React will re-render in a loop.
 */
import { useSyncExternalStore } from 'react';
import { eventBus } from '../services/eventBus';

export function useEngineState<T>(event: string, getSnapshot: () => T): T {
  return useSyncExternalStore(
    cb => eventBus.on(event, cb as () => void),
    getSnapshot,
    getSnapshot
  );
}

export default useEngineState;
