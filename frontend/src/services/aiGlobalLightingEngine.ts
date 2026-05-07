/*
 V78: AI-Backed Global Lighting Engine (AIGLE)
 - Computes sun position and lighting parameters from lat/lon/time
 - Produces global light vector, ambient color, shading multipliers
*/

export type AigleInputs = {
  lat: number;
  lon: number;
  time: Date;
  seasonIndex?: number; // 0..1 (optional)
  tileAlbedo?: number;  // 0..1 (optional)
  terrainSlope?: number; // 0..1 (optional)
};

export type AigleOutputs = {
  globalLightVector: [number, number, number];
  sunAzimuth: number;
  sunElevation: number;
  surfaceLightValue: number; // 0..1
  shadingMultiplier: number; // 0..1
  dynamicAmbientColor: string; // rgb(...)
};

function sunPosition(lat: number, lon: number, date: Date) {
  // Simplified NOAA-like approximation for azimuth/elevation
  const rad = Math.PI / 180;
  const d = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const decl = 23.45 * rad * Math.sin(rad * (360 * (284 + d) / 365));
  const timeOffset = (date.getUTCHours() + date.getUTCMinutes() / 60) + lon / 15;
  const hourAngle = rad * 15 * (timeOffset - 12);
  const latR = lat * rad;
  const elevation = Math.asin(Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(hourAngle));
  const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(decl) * Math.cos(latR) - Math.sin(latR) * Math.cos(hourAngle));
  return { azimuth: (azimuth / rad + 360) % 360, elevation: elevation / rad };
}

export const aiGlobalLightingEngine = {
  compute(inputs: AigleInputs): AigleOutputs {
    const { lat, lon, time } = inputs;
    const s = sunPosition(lat, lon, time);
    const elevClamped = Math.max(-5, Math.min(85, s.elevation));
    const elevNorm = (elevClamped + 5) / 90; // 0..1
    const ambientBase = 0.15 + 0.5 * elevNorm;
    const albedo = inputs.tileAlbedo ?? 0.4;
    const slope = inputs.terrainSlope ?? 0.2;
    const surfaceLightValue = Math.max(0.05, Math.min(1, ambientBase * (0.8 + 0.2 * (1 - slope))));
    const shadingMultiplier = Math.max(0.2, 1 - 0.5 * (1 - elevNorm));
    const amb = Math.floor(160 + 80 * elevNorm);
    const dynamicAmbientColor = `rgb(${amb},${amb + 10},${amb + 25})`;
    const azRad = (s.azimuth * Math.PI) / 180;
    const elRad = (elevClamped * Math.PI) / 180;
    const globalLightVector: [number, number, number] = [
      Math.cos(elRad) * Math.cos(azRad),
      Math.cos(elRad) * Math.sin(azRad),
      Math.sin(elRad)
    ];
    return {
      globalLightVector,
      sunAzimuth: s.azimuth,
      sunElevation: elevClamped,
      surfaceLightValue,
      shadingMultiplier,
      dynamicAmbientColor
    };
  }
};
