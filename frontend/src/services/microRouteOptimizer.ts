export interface MicroRouteAdvice {
  preferZoomDelta?: number;
  etaAdjustmentSec?: number;
  detourSuggestion?: { present: boolean; reason?: string };
  confidence: number; // 0-1
}

export function microRouteOptimizer(routeData: any, speedMps: number): MicroRouteAdvice {
  if (!routeData) return { confidence: 0.3 } as MicroRouteAdvice;
  let hasTraffic = false;
  try {
    const segs = Array.isArray(routeData.segments) ? routeData.segments : [];
    hasTraffic = segs.some((s: any) => (s.status || s.safety || '').toLowerCase() === 'traffic');
  } catch {}

  const preferZoomDelta = hasTraffic ? 0.5 : (speedMps > 7 ? -0.2 : 0);
  const etaAdjustmentSec = hasTraffic ? 30 : 0;
  const detourSuggestion = { present: hasTraffic, reason: hasTraffic ? 'Local congestion ahead' : undefined };
  const confidence = hasTraffic ? 0.7 : 0.5;
  return { preferZoomDelta, etaAdjustmentSec, detourSuggestion, confidence };
}
