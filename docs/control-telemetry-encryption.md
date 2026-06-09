# Control Surface, Telemetry & Encryption Architecture

This note documents the systems added in the "Stable & Sharp" maintenance program:
a user-facing control surface, a live telemetry/flow-tracking layer, an always-on
resilience layer, and the completion of end-to-end encryption. The guiding idea is
**simple surface controls driving complex internals** with no new runtime
dependency.

## Reactive backbone (no new dependency)

- `services/eventBus.ts` - a tiny typed pub/sub (`on/off/emit/getLast`). The only
  reactive primitive; engines emit, overlays subscribe.
- `hooks/useEngineState.ts` - `useSyncExternalStore` over the eventBus, so React
  overlays re-render when an engine emits. `getSnapshot` must be referentially
  stable (engines hold a snapshot object and replace it only on change).
- `services/controlState.ts` - the small UI-coordination store (palette open, HUD
  visible, follow-me/bearing mirror). Backed by the eventBus; mirrors low-frequency
  map toggles only (camera is read directly to avoid churn).

## Map command bus

- `services/mapCommandBus.ts` - an imperative facade over the MapLibre instance.
  `MapView3D` calls `mapCommandBus.attach(map, modeController)` once inside its
  `onMapReady` (single attach point; it never creates a second map or controller).
- Methods: zoom/bearing/pitch/recenter/flyTo/setMode/follow-me/bearing-lock.
  Camera changes are broadcast (throttled) on `map:camera`.
- `notifyPosition(lat,lng,heading)` is fed from the location update path to drive
  follow-me recentering and bearing-lock rotation.
- Dev-only `window.__mapBus` exposes every method for console testing.

## Control surface

- `components/ControlCenter/` - the on-screen cluster (zoom + readout, recenter,
  follow-me, compass/reset-north, tilt, mode segmented control, bearing-lock,
  fullscreen, scale bar). Every control drives the map via `mapCommandBus` and
  reflects live state from `map:camera`. 44px targets, ARIA labels, haptics.
- `components/CommandPalette/` - Cmd/Ctrl-K palette over `services/commandRegistry.ts`.
  Map/control commands register at import; view commands (tracking, accessibility)
  are registered by Home and unregistered on unmount. Fuzzy filter, full keyboard
  operation, focus restore, encrypted on-device recents.

## Telemetry / flow tracking

- `services/telemetryBus.ts` - a pull-based aggregator over existing getters
  (framePacing, quality scaling, map mode, web vitals, tunnel security, live GPS).
  Sampling runs only while started (HUD open), so it is free when closed. `mark()`
  records timings (e.g. route calc) into rolling averages; emits `telemetry:tick`.
- `components/TelemetryHUD/` - the draggable, keyboard-movable "what the system is
  doing right now" panel: FPS sparkline, frame time, device tier, map mode, GPS
  accuracy + quality, route latency, encrypted-tunnel state, network, vitals,
  active engines. Position persists on-device; honors reduced motion.

## Always-on resilience

- `services/liveStatus.ts` - the full-time coordinator above transport + location:
  visibility/online handling, exponential-backoff reconnect (via the tunnel),
  wake lock during navigation, adaptive sampling interval (motion + battery +
  precision mode), last-known-position cache, dead-zone (stale GPS) detection, and
  an aggregated `getLiveStatus()` emitted on `live:status`. Prolonged outages emit
  `live:outage` / `live:recovered` for a single reconnect toast.
- `services/tunnelService.ts` reconnect performs a FULL fresh ECDH handshake (the
  server destroys the session on disconnect) and transparently re-registers; state
  changes broadcast on `tunnel:state`.

## End-to-end encryption (completed)

- Live protocol: ECDH P-256 + HKDF-SHA256 + AES-256-GCM, AAD bound to the session
  id. Client `services/tunnelService.ts` byte-matches `backend/security/tunnel_engine.py`
  and `backend/api/tunnel_api.py`. (The orphan `sdk/pathmap-client.ts`, which used a
  mismatched X25519 scheme, was removed.)
- Location, route requests, and task/target updates all flow through the tunnel
  with graceful HTTP fallback (`tunnelService.sendOrFallback` / `request`). Route
  requests reuse the same routing as the HTTP `/route` endpoint.
- Replay protection guards the live JSON-envelope path (per-session nonce window).
- Graceful teardown sends a close frame and zeroizes key material on logout/unload.

## Accessibility apply layer

- `utils/applyPrefs.ts` sets root data-attributes (`data-pathmap-theme`,
  `data-reduced-motion`, `data-contrast`, `data-text-scale` + `--text-scale`). The
  previously-inert reduced-motion / high-contrast / text-size toggles now take
  effect via rules in `styles/tokens.css`. Skip link, roving-tabindex tablist, and
  focus restoration round out keyboard support.
