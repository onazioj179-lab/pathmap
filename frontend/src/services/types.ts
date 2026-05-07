export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type VisibilityLevel = 'clear' | 'dim' | 'low' | 'critical';

export interface SafetyState {
  risk_level: RiskLevel;
  visibility_level: VisibilityLevel;
  safe_path_rating: number; // 0-100
  hazard_flags: string[];
  recommended_action: 'none' | 'slowdown' | 'reroute' | 'hold-course';
  last_update: number;
}

export interface RouteLikeV64 {
  path?: [number, number][];
  segments?: Array<{ path?: [number, number][]; indices?: [number, number]; status?: string }>;
}

export interface MotionSnapshot {
  mode: 'walking' | 'driving' | 'cycling' | 'idle' | string;
  speed?: number;
  heading?: number;
}
