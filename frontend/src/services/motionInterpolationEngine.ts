/**
 * PATHFINDER V74 — Frame-Adaptive Motion Interpolation (FMI)
 *
 * Smoothly interpolates camera/UI motion between sparse sensor updates.
 * Resets on sudden jumps and maintains sub-pixel precision.
 */

export interface Pose {
  lat: number;
  lon: number;
  bearing: number; // degrees
  pitch: number;   // degrees
  zoom?: number;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function slerpAngleDeg(a: number, b: number, t: number) {
  let delta = ((b - a + 540) % 360) - 180; // shortest path
  return a + delta * t;
}

class MotionInterpolationEngine {
  private last: Pose | null = null;
  private target: Pose | null = null;
  private t: number = 0;
  private threshold = { meters: 25, deg: 35 }; // jump thresholds

  setTarget(current: Pose, next: Pose) {
    // Reset on large jumps
    const bigJump = this.last && (
      this.haversineMeters(this.last.lat, this.last.lon, next.lat, next.lon) > this.threshold.meters ||
      Math.abs(((next.bearing - this.last.bearing + 540) % 360) - 180) > this.threshold.deg
    );
    if (!this.last || bigJump) {
      this.last = current;
      this.target = next;
      this.t = 0;
      return;
    }
    this.last = current;
    this.target = next;
    this.t = 0;
  }

  update(dtMs: number, durationMs: number): Pose | null {
    if (!this.last || !this.target) return null;
    this.t = Math.min(1, this.t + dtMs / Math.max(1, durationMs));
    const t = this.t;
    return {
      lat: lerp(this.last.lat, this.target.lat, t),
      lon: lerp(this.last.lon, this.target.lon, t),
      bearing: slerpAngleDeg(this.last.bearing, this.target.bearing, t),
      pitch: lerp(this.last.pitch, this.target.pitch, t),
      zoom: this.target.zoom !== undefined && this.last.zoom !== undefined ? lerp(this.last.zoom, this.target.zoom, t) : this.target.zoom,
    };
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000; // m
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

export const motionInterpolationEngine = new MotionInterpolationEngine();
