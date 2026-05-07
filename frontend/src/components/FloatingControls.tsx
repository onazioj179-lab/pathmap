import { hapticFeedback } from '../services/hapticFeedback';
import { microInteractions } from '../services/interactions';
import { useRef, useEffect } from 'react';
import { usagePatternMemory } from '../services/usagePatternMemory';

export default function FloatingControls() {
  const zoomInRef = useRef<HTMLButtonElement>(null);
  const zoomOutRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const attachInteractions = (button: HTMLButtonElement | null) => {
      if (!button) return;

      const handlePointerDown = (e: PointerEvent) => {
        microInteractions.applyPressEffect(button, 'medium');
        if (e.pointerType === 'touch') {
          microInteractions.applyRipple(button, e.clientX, e.clientY);
        }
      };

      const handlePointerEnter = () => {
        microInteractions.applyHoverEffect(button, true);
      };

      const handlePointerLeave = () => {
        microInteractions.applyHoverEffect(button, false);
      };

      button.addEventListener('pointerdown', handlePointerDown);
      button.addEventListener('pointerenter', handlePointerEnter);
      button.addEventListener('pointerleave', handlePointerLeave);

      return () => {
        button.removeEventListener('pointerdown', handlePointerDown);
        button.removeEventListener('pointerenter', handlePointerEnter);
        button.removeEventListener('pointerleave', handlePointerLeave);
      };
    };

    const cleanupZoomIn = attachInteractions(zoomInRef.current);
    const cleanupZoomOut = attachInteractions(zoomOutRef.current);

    return () => {
      cleanupZoomIn?.();
      cleanupZoomOut?.();
    };
  }, []);

  return (
    <>
      {/* Left side: GPS and AR */}
      <div className="v58-floating-controls-left">
        {/* GPS Location */}
        <button
          className="v58-control-btn gps-btn"
          onClick={() => {
            hapticFeedback.tapMedium();
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude } = position.coords;
                const map = (window as any).glMap || (window as any).map;
                if (map && typeof map.setView === 'function') {
                  map.setView([latitude, longitude], 15);
                }
              });
            }
          }}
          title="Current Location"
        >
          <svg className="v58-control-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        {/* AR Mode */}
        <button
          className="v58-control-btn ar-btn"
          onClick={() => {
            hapticFeedback.tapMedium();
            console.log('[AR] AR mode activated');
            // AR functionality placeholder
          }}
          title="AR View"
        >
          <svg className="v58-control-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
      
      {/* Right side: Zoom controls */}
      <div className="v58-floating-controls">
      {/* Zoom In (+) */}
      <button
        ref={zoomInRef}
        className="v58-control-btn"
        onClick={() => {
          hapticFeedback.tapLight();
          const map = (window as any).glMap || (window as any).map;
          if (!map) return;
          if (typeof map.zoomIn === 'function') {
            map.zoomIn({ duration: 200 });
          } else if (typeof map.setZoom === 'function' && typeof map.getZoom === 'function') {
            map.setZoom(map.getZoom() + 1);
          }
          usagePatternMemory.record({ type: 'zoom', delta: +1, timestamp: Date.now() });
        }}
        title="Zoom In"
      >
        <svg className="v58-control-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      {/* Zoom Out (-) */}
      <button
        ref={zoomOutRef}
        className="v58-control-btn"
        onClick={() => {
          hapticFeedback.tapLight();
          const map = (window as any).glMap || (window as any).map;
          if (!map) return;
          if (typeof map.zoomOut === 'function') {
            map.zoomOut({ duration: 200 });
          } else if (typeof map.setZoom === 'function' && typeof map.getZoom === 'function') {
            map.setZoom(map.getZoom() - 1);
          }
          usagePatternMemory.record({ type: 'zoom', delta: -1, timestamp: Date.now() });
        }}
        title="Zoom Out"
      >
        <svg className="v58-control-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
        </svg>
      </button>
      </div>
    </>
  );
}
