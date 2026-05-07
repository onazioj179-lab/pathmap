export interface SafeReturnState {
  last_safe_position: { lat: number; lon: number } | null;
  last_stable_heading: number | null;
  last_high_accuracy_fix: { lat: number; lon: number; t: number } | null;
}

let state: SafeReturnState = {
  last_safe_position: null,
  last_stable_heading: null,
  last_high_accuracy_fix: null,
};

export function updateSafeReturn(input: { lat: number; lon: number; heading?: number; accuracyM?: number }) {
  if (input.accuracyM != null && input.accuracyM <= 10) {
    state.last_high_accuracy_fix = { lat: input.lat, lon: input.lon, t: Date.now() };
  }
  if (input.heading != null) {
    // retain heading if stable
    if (state.last_stable_heading == null) state.last_stable_heading = input.heading;
    else {
      const delta = Math.abs(((input.heading - state.last_stable_heading) + 540) % 360 - 180);
      if (delta < 25) state.last_stable_heading = (state.last_stable_heading * 0.7 + input.heading * 0.3);
      else state.last_stable_heading = input.heading;
    }
  }
  // Update last safe position (heuristic: decent accuracy and low speed or matched to route later)
  if ((input.accuracyM ?? 30) <= 20) {
    state.last_safe_position = { lat: input.lat, lon: input.lon };
  }
}

export function getSafeReturnState(): SafeReturnState { return state; }
