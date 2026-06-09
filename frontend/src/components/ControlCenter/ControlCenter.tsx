/**
 * ControlCenter - the on-screen "control everything on the map" cluster.
 *
 * Every control drives the map through mapCommandBus (zoom, recenter, follow-me,
 * compass, tilt, mode) and reflects live camera state via the eventBus. It owns
 * no map state of its own. Fullscreen routes through controlState so Home can
 * collapse the bottom sheet.
 */
import { useEngineState } from '../../hooks/useEngineState';
import { eventBus } from '../../services/eventBus';
import { mapCommandBus, CameraState, ViewMode } from '../../services/mapCommandBus';
import { controlState, CONTROL_STATE_EVENT } from '../../services/controlState';
import { hapticFeedback } from '../../services/hapticFeedback';
import { CompassIcon, LocationIcon } from '../Icons';
import './ControlCenter.css';

const MODES: Array<{ id: ViewMode; label: string; title: string }> = [
  { id: '2d', label: '2D', title: 'Flat top-down view' },
  { id: '3d', label: '3D', title: 'Tilted perspective view' },
  { id: 'satellite', label: 'Sat', title: 'Satellite imagery' },
  { id: 'globe', label: 'Globe', title: 'Globe view' },
];

/** Approximate metres-per-pixel at the equator for a web-mercator zoom. */
function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function scaleLabel(camera: CameraState | undefined): string {
  if (!camera) return '';
  const mpp = metersPerPixel(camera.lat, camera.zoom);
  const meters = mpp * 80; // ~80px scale bar
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export default function ControlCenter() {
  const camera = useEngineState<CameraState | undefined>('map:camera', () =>
    eventBus.getLast<CameraState>('map:camera')
  );
  const ui = useEngineState(CONTROL_STATE_EVENT, controlState.getSnapshot);

  const activeMode: ViewMode | null = camera
    ? camera.mode === 'standard'
      ? camera.pitch > 30
        ? '3d'
        : '2d'
      : (camera.mode as ViewMode)
    : null;

  return (
    <div className="ctl-center" role="group" aria-label="Map controls">
      {/* Mode segmented control */}
      <div className="ctl-modes" role="group" aria-label="Map view mode">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`ctl-mode-btn${activeMode === m.id ? ' is-active' : ''}`}
            aria-pressed={activeMode === m.id}
            title={m.title}
            onClick={() => void mapCommandBus.setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Zoom cluster with live readout */}
      <div className="ctl-stack">
        <button
          type="button"
          className="ctl-btn"
          aria-label="Zoom in"
          onClick={() => mapCommandBus.zoomBy(1)}
        >
          <span aria-hidden="true">+</span>
        </button>
        <span className="ctl-zoom" aria-label="Zoom level">
          {camera ? camera.zoom.toFixed(1) : '--'}
        </span>
        <button
          type="button"
          className="ctl-btn"
          aria-label="Zoom out"
          onClick={() => mapCommandBus.zoomBy(-1)}
        >
          <span aria-hidden="true">&minus;</span>
        </button>
      </div>

      {/* Tilt cluster */}
      <div className="ctl-stack">
        <button
          type="button"
          className="ctl-btn"
          aria-label="Tilt up"
          onClick={() => mapCommandBus.tiltBy(15)}
        >
          <span aria-hidden="true">&#9650;</span>
        </button>
        <button
          type="button"
          className="ctl-btn"
          aria-label="Tilt down"
          onClick={() => mapCommandBus.tiltBy(-15)}
        >
          <span aria-hidden="true">&#9660;</span>
        </button>
      </div>

      {/* Compass - rotates with bearing; click resets to north */}
      <button
        type="button"
        className="ctl-btn ctl-compass"
        aria-label={`Bearing ${camera ? Math.round(camera.bearing) : 0} degrees, reset to north`}
        onClick={() => mapCommandBus.resetNorth()}
      >
        <span
          className="ctl-compass-rose"
          style={{ transform: `rotate(${camera ? -camera.bearing : 0}deg)` }}
        >
          <CompassIcon size="md" />
        </span>
      </button>

      {/* Recenter */}
      <button
        type="button"
        className="ctl-btn"
        aria-label="Recenter on my location"
        onClick={() => mapCommandBus.recenter()}
      >
        <LocationIcon size="md" />
      </button>

      {/* Follow-me */}
      <button
        type="button"
        className={`ctl-btn${ui.followMe ? ' is-on' : ''}`}
        aria-label="Toggle follow-me"
        aria-pressed={ui.followMe}
        onClick={() => {
          hapticFeedback.trigger('selection');
          mapCommandBus.toggleFollowMe();
        }}
      >
        <span aria-hidden="true">&#9678;</span>
      </button>

      {/* Bearing lock to heading */}
      <button
        type="button"
        className={`ctl-btn${ui.bearingLock ? ' is-on' : ''}`}
        aria-label="Lock map rotation to heading"
        aria-pressed={ui.bearingLock}
        onClick={() => {
          hapticFeedback.trigger('selection');
          mapCommandBus.setBearingLock(!ui.bearingLock);
        }}
      >
        <span aria-hidden="true">&#8635;</span>
      </button>

      {/* Fullscreen map (collapse the bottom sheet) */}
      <button
        type="button"
        className={`ctl-btn${ui.activeOverlay === 'fullscreen' ? ' is-on' : ''}`}
        aria-label="Toggle fullscreen map"
        aria-pressed={ui.activeOverlay === 'fullscreen'}
        onClick={() =>
          controlState.setActiveOverlay(ui.activeOverlay === 'fullscreen' ? null : 'fullscreen')
        }
      >
        <span aria-hidden="true">&#10530;</span>
      </button>

      {/* Scale bar */}
      <div className="ctl-scale" aria-label={`Map scale ${scaleLabel(camera)}`}>
        <span className="ctl-scale-bar" />
        <span className="ctl-scale-label">{scaleLabel(camera)}</span>
      </div>
    </div>
  );
}
