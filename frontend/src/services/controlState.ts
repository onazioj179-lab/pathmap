/**
 * PATHMAP - Control State
 * =======================
 * The small, reactive UI-coordination store for the control surface: which
 * overlays are open (command palette, telemetry HUD), and a mirror of the map's
 * follow-me / bearing-lock / camera so controls can render current state.
 *
 * No new dependency: backed by eventBus + a referentially-stable snapshot so
 * hooks/useEngineState can drive React re-renders. The store mirrors map state
 * by listening to the bus; it does not own the map - controls call mapCommandBus
 * for map actions and this store for overlay state, which avoids feedback loops.
 */

import { eventBus } from './eventBus';
import type { CameraState } from './mapCommandBus';

export const CONTROL_STATE_EVENT = 'control:state';

export interface ControlState {
  paletteOpen: boolean;
  hudVisible: boolean;
  commandCenter: boolean;
  feedbackOpen: boolean;
  followMe: boolean;
  bearingLock: boolean;
  activeOverlay: string | null;
  lastCamera: CameraState | null;
}

const INITIAL: ControlState = {
  paletteOpen: false,
  hudVisible: false,
  commandCenter: true,
  feedbackOpen: false,
  followMe: false,
  bearingLock: false,
  activeOverlay: null,
  lastCamera: null,
};

class ControlStateStore {
  private state: ControlState = INITIAL;

  constructor() {
    // Mirror low-frequency map toggles emitted by the command bus. (Camera is
    // intentionally NOT mirrored here - consumers read `map:camera` directly to
    // avoid churning this store ~30x/sec during map movement.)
    eventBus.on<boolean>('map:followMe', v => this.set({ followMe: v }));
    eventBus.on<boolean>('map:bearingLock', v => this.set({ bearingLock: v }));
  }

  /** Stable snapshot for useSyncExternalStore. */
  getSnapshot = (): ControlState => this.state;

  private set(patch: Partial<ControlState>): void {
    // Skip no-op updates so subscribers don't churn (esp. the throttled camera).
    let changed = false;
    for (const k of Object.keys(patch) as (keyof ControlState)[]) {
      if (this.state[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    eventBus.emit(CONTROL_STATE_EVENT, this.state);
  }

  togglePalette(open?: boolean): void {
    this.set({ paletteOpen: open ?? !this.state.paletteOpen });
  }

  toggleHud(visible?: boolean): void {
    this.set({ hudVisible: visible ?? !this.state.hudVisible });
  }

  toggleCommandCenter(on?: boolean): void {
    this.set({ commandCenter: on ?? !this.state.commandCenter });
  }

  toggleFeedback(open?: boolean): void {
    this.set({ feedbackOpen: open ?? !this.state.feedbackOpen });
  }

  setActiveOverlay(overlay: string | null): void {
    this.set({ activeOverlay: overlay });
  }
}

export const controlState = new ControlStateStore();
export default controlState;
