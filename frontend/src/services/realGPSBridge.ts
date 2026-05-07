/**
 * V63 — REAL GPS BRIDGE
 * Connects deviceLocationService to all AI engines (V61/V62) + navigation loop.
 * No mocks — pure device GPS stream.
 */

import { deviceLocationService, DeviceLocation } from './deviceLocationService';
import { environmentDetectionEngine } from './environmentDetectionEngine';
import { deadZoneRecoverySystem } from './deadZoneRecoverySystem';
import { aiCameraEngine } from './aiCameraEngine';
import { usagePatternMemory } from './usagePatternMemory';
import { globalSafetyEngine } from './globalSafetyEngine';
import { motionClassificationEngine } from './motionClassificationEngine';
 

class RealGPSBridge {
  private static _instance: RealGPSBridge;
  private unsubscribe: (() => void) | null = null;
  private isActive = false;

  static get instance() {
    if (!this._instance) this._instance = new RealGPSBridge();
    return this._instance;
  }

  async start(): Promise<boolean> {
    if (this.isActive) return true;

    // Request location permission
    const status = await deviceLocationService.requestPermission();
    if (!status.granted) {
      console.error('[RealGPSBridge] Permission denied');
      return false;
    }

    // Start device location tracking
    const started = await deviceLocationService.start();
    if (!started) {
      console.error('[RealGPSBridge] Failed to start GPS');
      return false;
    }

    // Subscribe to location updates and feed all AI engines
    this.unsubscribe = deviceLocationService.addLocationListener((loc: DeviceLocation) => {
      this.feedEngines(loc);
    });

    this.isActive = true;
    console.log('[RealGPSBridge] GPS bridge active');
    return true;
  }

  stop() {
    if (!this.isActive) return;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    deviceLocationService.stop();
    this.isActive = false;
    console.log('[RealGPSBridge] GPS bridge stopped');
  }

  private feedEngines(loc: DeviceLocation) {
    const t = Date.now();
    const { latitude: lat, longitude: lon, heading, speed, accuracy } = loc;

    // V62 Motion Classification
    motionClassificationEngine.update({ t, lat, lon, heading: heading ?? 0, speed: speed ?? 0 });

    // V62 Environment Detection
    environmentDetectionEngine.update({ t, lat, lon, heading: heading ?? 0, speed: speed ?? 0, accuracy });

    // V62 Dead-Zone Recovery
    deadZoneRecoverySystem.update(lat, lon, heading ?? undefined, speed ?? undefined);

    // V61 AI Camera (via pose update)
    aiCameraEngine.updateFromPose({
      lat,
      lon,
      headingDeg: (heading ?? 0) % 360,
      speedMps: speed ?? 0,
    });

    // V61 Usage Pattern Memory
    (usagePatternMemory as any).record({
      type: 'gps-update',
      timestamp: t,
      meta: { accuracy, speed: speed ?? 0 },
    });

    // V64 Global Safety Engine update
    try {
      const motion = motionClassificationEngine.getState();
      globalSafetyEngine.updateFromSensors(
        { lat, lon, speed: speed ?? 0, heading: heading ?? 0, accuracyM: accuracy },
        { mode: motion?.mode || 'walking', speed: speed ?? 0, heading: heading ?? 0 }
      );
    } catch (e) {
      // swallow
    }
  }

  getDeviceLocation() {
    return deviceLocationService.getCurrentLocation();
  }

  isRunning() {
    return this.isActive;
  }
}

export const realGPSBridge = RealGPSBridge.instance;
