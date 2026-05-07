export interface TBAEState {
  tunnelMode: boolean;
  bridgeLikely: boolean;
  lastChange: number;
}

let state: TBAEState = { tunnelMode: false, bridgeLikely: false, lastChange: 0 };

export function updateTBAE(input: {
  ambientLight?: number; // 0..1
  gpsAccuracyM?: number;
  verticalAccelStd?: number; // derived from devicemotion if available
  elevationDelta?: number; // meters between recent samples
}): TBAEState {
  const now = Date.now();
  const lowLight = (input.ambientLight ?? 0.6) < 0.22;
  const poorGPS = (input.gpsAccuracyM ?? 10) > 35;
  const tunnel = lowLight && poorGPS;
  const bridge = (input.elevationDelta ?? 0) > 4 && (input.verticalAccelStd ?? 0) < 0.12;

  const changed = (tunnel !== state.tunnelMode) || (bridge !== state.bridgeLikely);
  if (changed) {
    state = { tunnelMode: tunnel, bridgeLikely: bridge, lastChange: now };
  }
  return state;
}

export function getTBAEState(): TBAEState { return state; }
