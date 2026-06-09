/* eslint-disable react/no-unknown-property */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MapView3D from '../components/MapView3D';
import {
  AlertTriangle,
  Bell,
  Bluetooth,
  Brain,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Crosshair,
  Download,
  Hand,
  Home as HomeIcon,
  Laptop,
  Loader2,
  MapPin,
  Moon,
  Navigation,
  Package,
  Plus,
  Radar,
  Route,
  Save,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Tablet,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { trackingService, type LocationData, type Geofence } from '../services/trackingService';
import { accountBillingService } from '../services/accountBillingService';
import { tunnelService } from '../services/tunnelService';
import { liveStatus } from '../services/liveStatus';
import { mapCommandBus } from '../services/mapCommandBus';
import { telemetryBus } from '../services/telemetryBus';
import { eventBus } from '../services/eventBus';
import { commandRegistry } from '../services/commandRegistry';
import { controlState, CONTROL_STATE_EVENT } from '../services/controlState';
import CommandPalette from '../components/CommandPalette/CommandPalette';
import ControlCenter from '../components/ControlCenter/ControlCenter';
import TelemetryHUD from '../components/TelemetryHUD/TelemetryHUD';
import CommandCenter from '../components/CommandCenter/CommandCenter';
import FeedbackBox from '../components/Feedback/FeedbackBox';
import SheetTabs from './home/SheetTabs';
import { applyPrefs } from '../utils/applyPrefs';
import { sharingService } from '../services/sharingService';
import { authService } from '../services/authService';
import { holographicMapEngine } from '../services/holographicMapEngine';
import { sharpLocationEngine } from '../services/sharpLocationEngine';
import { universalDeviceEngine, type DeviceInfo } from '../services/universalDeviceEngine';
import {
  satelliteIntegration,
  type GNSSPosition,
  type SatelliteInfo,
} from '../services/satelliteIntegration';
import { embeddedBridge, type EmbeddedDevice } from '../services/embeddedBridge';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { ToastStack } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { getApiHttpBase } from '../services/apiConfig';
import '../styles/holographic.css';
import './Home.css';
import MapSearch from '../components/MapSearch/MapSearch';
import '../styles/maps-ui.css';

interface PushLocation {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}

// Rough great-circle distance in metres (equirectangular approximation).
function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const meanLat = (((aLat + bLat) / 2) * Math.PI) / 180;
  const x = dLng * Math.cos(meanLat);
  return Math.hypot(x, dLat) * R;
}

// Build a straight-line "estimate" route for when the backend routing engines
// are unreachable (e.g. backend offline). Ensures the user always sees a clear
// direction, a rough distance, and an ETA instead of a silent failure.
function buildOfflineRoute(
  start: [number, number],
  end: [number, number],
  speedMps?: number
): AIRoute {
  const meters = metersBetween(start[0], start[1], end[0], end[1]);
  const segments = 24;
  const path: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    path.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
  }
  const speedKmh = speedMps && speedMps > 0.3 ? speedMps * 3.6 : 5; // default walking pace
  const etaMinutes = Math.max(1, Math.round((meters / 1000 / speedKmh) * 60));
  return {
    algorithm: 'Offline estimate',
    distance: Math.round(meters),
    steps: path.length,
    visited: 0,
    path,
    eta:
      etaMinutes < 60 ? `${etaMinutes} min` : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`,
    safety: 0,
  };
}

// Send the current position to the backend when signed in, throttled to real
// movement (> ~5 m) or every ~3 s. Prefers the encrypted tunnel; falls back to
// the HTTP sharing endpoint when the tunnel isn't established/registered.
function pushLocationToBackend(
  loc: PushLocation,
  lastRef: React.MutableRefObject<{ t: number; lat: number; lng: number } | null>
): void {
  // Always feed the live-status coordinator so it can track GPS health, cache
  // the last-known position, and adapt the sampling interval (even pre-auth).
  liveStatus.updatePosition(loc.lat, loc.lng, loc.accuracy);
  // Feed the map command bus for follow-me recentering and bearing-lock.
  mapCommandBus.notifyPosition(loc.lat, loc.lng, loc.heading);

  if (!authService.isAuthenticated()) return;
  const now = Date.now();
  const last = lastRef.current;
  // Pace pushes to real movement (> ~5 m) or the coordinator's adaptive interval.
  const interval = liveStatus.recommendedInterval();
  const movedEnough = !last || metersBetween(last.lat, last.lng, loc.lat, loc.lng) > 5;
  const longEnough = !last || now - last.t > interval;
  if (!movedEnough && !longEnough) return;
  lastRef.current = { t: now, lat: loc.lat, lng: loc.lng };

  void tunnelService.sendOrFallback(
    'location_update',
    {
      location: {
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        timestamp: Date.now(),
        altitude: loc.altitude,
        speed: loc.speed,
        heading: loc.heading,
        source: 'gps',
      },
    },
    () =>
      sharingService.updateLocation(
        loc.lat,
        loc.lng,
        loc.accuracy,
        loc.altitude,
        loc.speed,
        loc.heading
      )
  );
}

type Tab = 'track' | 'devices' | 'routes' | 'settings';
type TrackingMethod = 'gps' | 'wifi' | 'cellular' | 'bluetooth' | 'ip';
type AuthScreen = 'none' | 'login' | 'register';

// Map Target - tap to track any location
interface MapTarget {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'person' | 'place' | 'object' | 'custom';
  icon: string;
  color: string;
  createdAt: number;
}

interface Permission {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  granted: boolean;
  required: boolean;
}

interface DeviceData {
  id: string;
  userAgent: string;
  platform: string;
  language: string;
  screenWidth: number;
  screenHeight: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: {
    type: string;
    downlink: number;
    rtt: number;
  };
  battery?: {
    level: number;
    charging: boolean;
  };
  location?: {
    lat: number;
    lng: number;
    accuracy: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  ip?: string;
  timestamp: number;
}

interface TrackedDevice {
  id: string;
  name: string;
  type: string;
  data: DeviceData;
  lastSeen: string;
  sources: TrackingMethod[];
  online: boolean;
  trained: boolean;
}

interface AIRoute {
  algorithm: string;
  distance: number;
  steps: number;
  visited: number;
  path: [number, number][];
  eta: string;
  safety: number;
}

const targetTypeBadgeClass: Record<MapTarget['type'], string> = {
  person: 'target-type-badge--person',
  place: 'target-type-badge--place',
  object: 'target-type-badge--object',
  custom: 'target-type-badge--custom',
};

const API_BASE = getApiHttpBase();

// Monoline (Lucide) icons for target types. Sizing/color come from CSS.
const TargetTypeIcons: Record<string, JSX.Element> = {
  person: <User aria-hidden="true" />,
  place: <MapPin aria-hidden="true" />,
  object: <Package aria-hidden="true" />,
  star: <Star aria-hidden="true" />,
};

// In-app preferences (merged from the former /settings page).
type PrefsTheme = 'dark' | 'light' | 'system';
type PrefsUnits = 'metric' | 'imperial';
type PrefsLang = 'en' | 'es';
type BillingPlan = 'starter' | 'pro' | 'enterprise';
type PrefsBoolKey =
  | 'precisionMode'
  | 'offline'
  | 'safetyAlerts'
  | 'reducedMotion'
  | 'highContrast'
  | 'debug';
type TextSizePref = 'normal' | 'large' | 'xl';

interface PrefsState {
  language: PrefsLang;
  theme: PrefsTheme;
  units: PrefsUnits;
  offline: boolean;
  precisionMode: boolean;
  safetyAlerts: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  textSize: TextSizePref;
  debug: boolean;
  billingPlan: BillingPlan;
}

const PREFS_KEY = 'pathmap.settings.v100';

const defaultPrefs: PrefsState = {
  language: 'en',
  theme: 'dark',
  units: 'metric',
  offline: false,
  precisionMode: true,
  safetyAlerts: true,
  reducedMotion: false,
  highContrast: false,
  textSize: 'normal',
  debug: false,
  billingPlan: 'pro',
};

function loadPrefs(): PrefsState {
  if (typeof window === 'undefined') return defaultPrefs;
  try {
    const stored = window.localStorage.getItem(PREFS_KEY);
    return stored ? { ...defaultPrefs, ...JSON.parse(stored) } : defaultPrefs;
  } catch {
    return defaultPrefs;
  }
}

// Reflect appearance + accessibility prefs onto the DOM root (theme, reduced
// motion, contrast, text scale). See utils/applyPrefs.
function applyAppearance(p: PrefsState): void {
  applyPrefs({
    theme: p.theme,
    reducedMotion: p.reducedMotion,
    highContrast: p.highContrast,
    textSize: p.textSize,
  });
}

const PLAN_LABEL: Record<BillingPlan, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export default function Home() {
  const { i18n } = useTranslation();
  const { messages, showToast, dismiss } = useToast();

  // In-app preferences (merged from the former Settings page)
  const [prefs, setPrefs] = useState<PrefsState>(loadPrefs);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    applyAppearance(prefs);
  }, [prefs.theme, prefs.reducedMotion, prefs.highContrast, prefs.textSize]);

  // High-precision GPS preference drives the live-status sampling cadence.
  useEffect(() => {
    liveStatus.setPrecisionMode(prefs.precisionMode);
  }, [prefs.precisionMode]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = trackingService.getToken();
        const hydrated = await accountBillingService.loadHydratedSettings(token);
        if (active && hydrated && Object.keys(hydrated).length > 0) {
          setPrefs(prev => ({ ...prev, ...hydrated }));
        }
      } catch {
        /* keep local prefs */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPref = <K extends keyof PrefsState>(key: K, value: PrefsState[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setPrefsSaved(false);
  };

  const changeLanguagePref = async (language: PrefsLang) => {
    try {
      await i18n.changeLanguage(language);
    } catch {
      /* i18n optional */
    }
    setPref('language', language);
  };

  const savePrefs = async () => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      await accountBillingService.persistSettings(trackingService.getToken(), prefs as never);
    } catch {
      /* local save still applied */
    }
    setPrefsSaved(true);
    showToast({
      kind: 'success',
      title: 'Settings saved',
      message: 'Your PathMap preferences are now active.',
    });
  };

  const resetPrefs = () => {
    setPrefs(defaultPrefs);
    void i18n.changeLanguage(defaultPrefs.language);
    applyAppearance(defaultPrefs);
    setPrefsSaved(false);
    showToast({ kind: 'info', title: 'Settings reset', message: 'Defaults restored on this device.' });
  };
  const [tab, setTab] = useState<Tab>('track');
  const [authScreen, setAuthScreen] = useState<AuthScreen>('none');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [showGeofenceForm, setShowGeofenceForm] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([
    {
      id: 'location',
      name: 'Location (GPS)',
      icon: <MapPin aria-hidden="true" />,
      description: 'High-accuracy GPS tracking',
      granted: false,
      required: true,
    },
    {
      id: 'location_bg',
      name: 'Background Location',
      icon: <Navigation aria-hidden="true" />,
      description: 'Track when app is closed',
      granted: false,
      required: true,
    },
    {
      id: 'bluetooth',
      name: 'Bluetooth',
      icon: <Bluetooth aria-hidden="true" />,
      description: 'Bluetooth beacon tracking',
      granted: false,
      required: false,
    },
    {
      id: 'notifications',
      name: 'Notifications',
      icon: <Bell aria-hidden="true" />,
      description: 'Location alerts',
      granted: false,
      required: false,
    },
  ]);
  const [showPermissions, setShowPermissions] = useState(false);
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
  const [devices, setDevices] = useState<TrackedDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<TrackedDevice | null>(null);
  const [tracking, setTracking] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [aiRoute, setAiRoute] = useState<AIRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [trainingDevice, setTrainingDevice] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<[number, number][]>([]);

  // Map targets - tap to track locations
  const [mapTargets, setMapTargets] = useState<MapTarget[]>([]);
  const [showTargetMenu, setShowTargetMenu] = useState<{ lat: number; lng: number } | null>(null);
  const [activeTarget, setActiveTarget] = useState<MapTarget | null>(null);
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetType, setNewTargetType] = useState<MapTarget['type']>('place');

  // AI AUTOPILOT - Automatic system control
  const [aiAutopilotActive, setAiAutopilotActive] = useState(false);
  const [autopilotStatus, setAutopilotStatus] = useState('Initializing...');

  // Universal Device + Satellite Integration
  const [universalDevice, setUniversalDevice] = useState<DeviceInfo | null>(null);
  const [satelliteData, setSatelliteData] = useState<{
    satellites: SatelliteInfo[];
    position: GNSSPosition | null;
  }>({ satellites: [], position: null });
  const [connectedHardware, setConnectedHardware] = useState<EmbeddedDevice[]>([]);

  // Sheet collapsed state
  const [sheetCollapsed, setSheetCollapsed] = useState(false);

  // AI AUTOPILOT - Runs automatically on mount, takes full control
  useEffect(() => {
    if (aiAutopilotActive) return; // Already running

    const runAIAutopilot = async () => {
      setAiAutopilotActive(true);
      console.log('[AI Autopilot] Starting autonomous control...');
      setAutopilotStatus('Analyzing device...');

      // Initialize Universal Device Engine (Desktop/Laptop/iOS/Android/HomePod/Embedded)
      try {
        const deviceInfo = await universalDeviceEngine.init();
        setUniversalDevice(deviceInfo);
        console.log(`[AI Autopilot] Universal Device: ${deviceInfo.name} (${deviceInfo.platform})`);
        console.log(
          `[AI Autopilot] Type: ${deviceInfo.type} | GPS: ${deviceInfo.capabilities.hasGPS} | Compass: ${deviceInfo.capabilities.hasCompass}`
        );
        console.log(
          `[AI Autopilot] Satellites: ${universalDeviceEngine.getTotalSatellitesUsed()} in use, PDOP: ${universalDeviceEngine.getBestPDOP().toFixed(1)}`
        );
      } catch (e) {
        console.warn('[AI Autopilot] Device engine:', e);
      }

      // Initialize Multi-GNSS Satellite Integration
      try {
        await satelliteIntegration.init();
        satelliteIntegration.onPositionUpdate(pos => {
          setSatelliteData(prev => ({ ...prev, position: pos }));
        });
        satelliteIntegration.onSatelliteUpdate(sats => {
          setSatelliteData(prev => ({ ...prev, satellites: sats }));
        });
        console.log(`[AI Autopilot] GNSS Active: ${satelliteIntegration.getStatusSummary()}`);
      } catch (e) {
        console.warn('[AI Autopilot] Satellite integration:', e);
      }

      // Initialize Embedded/IoT Bridge
      try {
        await embeddedBridge.init();
        embeddedBridge.onDeviceUpdate(devices => {
          setConnectedHardware(devices);
        });
        embeddedBridge.onGPSData(data => {
          console.log(
            `[AI Autopilot] Hardware GPS: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)} from ${data.source}`
          );
        });
        console.log('[AI Autopilot] IoT/Embedded bridge ready');
      } catch (e) {
        console.warn('[AI Autopilot] Embedded bridge:', e);
      }

      // Step 1: Collect device data immediately
      const nav = navigator as any;
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);

      const deviceInfo: DeviceData = {
        id: deviceId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        deviceMemory: nav.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        timestamp: Date.now(),
      };

      // Get connection info
      if (nav.connection) {
        deviceInfo.connection = {
          type: nav.connection.effectiveType || nav.connection.type || '4g',
          downlink: nav.connection.downlink || 10,
          rtt: nav.connection.rtt || 50,
        };
      }

      // Get battery
      if (nav.getBattery) {
        try {
          const battery = await nav.getBattery();
          deviceInfo.battery = {
            level: Math.round(battery.level * 100),
            charging: battery.charging,
          };
          console.log(
            `[AI Autopilot] Battery: ${deviceInfo.battery.level}% ${deviceInfo.battery.charging ? '(charging)' : ''}`
          );
        } catch {}
      }

      // Get IP
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', {
          signal: AbortSignal.timeout(3000),
        });
        const ipData = await ipRes.json();
        deviceInfo.ip = ipData.ip;
        console.log(`[AI Autopilot] IP: ${deviceInfo.ip}`);
      } catch {}

      setDeviceData(deviceInfo);
      console.log(
        `[AI Autopilot] Device: ${navigator.hardwareConcurrency || 4} cores, ${nav.deviceMemory || 4}GB RAM`
      );

      // Step 2: Request location with optimal settings based on device
      setAutopilotStatus('Getting location...');
      const isHighEndDevice =
        (navigator.hardwareConcurrency || 4) >= 4 && (nav.deviceMemory || 4) >= 4;
      const locationOptions = {
        enableHighAccuracy: isHighEndDevice,
        timeout: isHighEndDevice ? 10000 : 20000,
        maximumAge: isHighEndDevice ? 0 : 30000,
      };

      console.log(
        `[AI Autopilot] Location mode: ${isHighEndDevice ? 'High Accuracy' : 'Balanced'}`
      );

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, locationOptions);
        });

        const location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || undefined,
          speed: pos.coords.speed || undefined,
          heading: pos.coords.heading || undefined,
        };

        setDeviceData(prev => (prev ? { ...prev, location } : { ...deviceInfo, location }));
        console.log(
          `[AI Autopilot] Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)`
        );

        // Initialize Sharp Location Engine with Compass integration
        try {
          await sharpLocationEngine.init(); // Now async with compass
          sharpLocationEngine.startTracking({
            enableHighAccuracy: isHighEndDevice,
            enablePrediction: true,
            enableCompass: true, // Enable compass for better heading
          });
          console.log('[AI Autopilot] Sharp Location Engine + Compass initialized');

          // Update holographic map with initial position
          holographicMapEngine.updateCurrentPosition({
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            heading: location.heading,
            speed: location.speed,
          });

          // Add floating label for current position
          holographicMapEngine.addFloatingLabel({
            id: 'current-pos',
            lat: location.lat,
            lng: location.lng,
            title: 'YOUR LOCATION',
            value: `${location.lat.toFixed(4)}°`,
            subtext: `Accuracy: ±${Math.round(location.accuracy)}m`,
          });
        } catch (e) {
          console.warn('[AI Autopilot] Sharp/Holo init:', e);
        }

        // Grant location permissions in UI
        setPermissions(prev =>
          prev.map(p =>
            p.id === 'location' || p.id === 'location_bg' ? { ...p, granted: true } : p
          )
        );

        // Step 3: Start continuous tracking with optimal settings
        setAutopilotStatus('Starting tracking...');
        const watchOptions = {
          enableHighAccuracy: isHighEndDevice,
          timeout: isHighEndDevice ? 5000 : 15000,
          maximumAge: isHighEndDevice ? 0 : 10000,
        };

        const id = navigator.geolocation.watchPosition(
          newPos => {
            const newLocation = {
              lat: newPos.coords.latitude,
              lng: newPos.coords.longitude,
              accuracy: newPos.coords.accuracy,
              altitude: newPos.coords.altitude || undefined,
              speed: newPos.coords.speed || undefined,
              heading: newPos.coords.heading || undefined,
            };

            setDeviceData(prev =>
              prev
                ? {
                    ...prev,
                    location: newLocation,
                    timestamp: Date.now(),
                  }
                : null
            );
            setTrackingHistory(
              prev =>
                [
                  ...prev,
                  [newPos.coords.latitude, newPos.coords.longitude] as [number, number],
                ].slice(-100) as [number, number][]
            );

            // Update holographic engine with current position
            try {
              holographicMapEngine.updateCurrentPosition({
                lat: newLocation.lat,
                lng: newLocation.lng,
                accuracy: newLocation.accuracy,
                heading: newLocation.heading,
                speed: newLocation.speed,
              });
            } catch {}
          },
          err => console.log(`[AI Autopilot] Location update: ${err.message}`),
          watchOptions
        );
        setWatchId(id);
        console.log('[AI Autopilot] Continuous tracking active');
      } catch (err: any) {
        console.log(`[AI Autopilot] Location error: ${err.message} - will retry`);
        // Retry with lower accuracy
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 30000,
              maximumAge: 60000,
            });
          });
          const location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setDeviceData(prev => (prev ? { ...prev, location } : { ...deviceInfo, location }));
          setPermissions(prev =>
            prev.map(p => (p.id === 'location' ? { ...p, granted: true } : p))
          );
          console.log(
            `[AI Autopilot] Location (fallback): ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`
          );
        } catch {}
      }

      // Step 4: Request notification permission silently
      if (Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission();
          if (result === 'granted') {
            setPermissions(prev =>
              prev.map(p => (p.id === 'notifications' ? { ...p, granted: true } : p))
            );
            console.log('[AI Autopilot] Notifications enabled');
          }
        } catch {}
      } else if (Notification.permission === 'granted') {
        setPermissions(prev =>
          prev.map(p => (p.id === 'notifications' ? { ...p, granted: true } : p))
        );
      }

      // Step 5: Create device entry
      const thisDevice: TrackedDevice = {
        id: deviceId,
        name: getDeviceNameFromUA(navigator.userAgent),
        type: getDeviceTypeFromUA(navigator.userAgent),
        data: deviceInfo,
        lastSeen: 'Now',
        sources: ['gps', 'wifi', 'cellular', 'ip'],
        online: true,
        trained: true,
      };
      setDevices([thisDevice]);

      // Step 6: Auto-hide permissions and activate
      setShowPermissions(false);
      setTracking(true);
      setAutopilotStatus('Active');
      console.log('[AI Autopilot] System fully operational');

      // Notify if possible
      if (Notification.permission === 'granted') {
        new Notification('PathMap AI Active', {
          body: 'Autonomous tracking enabled',
          icon: '/icon-192.png',
          silent: true,
        });
      }
    };

    // Helper functions
    const getDeviceNameFromUA = (ua: string): string => {
      const l = ua.toLowerCase();
      if (l.includes('iphone')) return 'iPhone';
      if (l.includes('ipad')) return 'iPad';
      if (l.includes('android')) return 'Android Device';
      if (l.includes('macintosh')) return 'MacBook';
      if (l.includes('windows')) return 'Windows PC';
      return 'Device';
    };

    const getDeviceTypeFromUA = (ua: string): string => {
      const l = ua.toLowerCase();
      if (l.includes('mobile') || l.includes('iphone') || l.includes('android')) return 'phone';
      if (l.includes('ipad') || l.includes('tablet')) return 'tablet';
      return 'laptop';
    };

    // Run autopilot after short delay to let React settle
    const timer = setTimeout(runAIAutopilot, 500);
    return () => clearTimeout(timer);
  }, []); // Empty deps - runs once on mount

  // Check auth state on mount
  useEffect(() => {
    const unsubscribe = trackingService.onAuthChange(auth => {
      setIsAuthenticated(auth);
      if (auth) {
        // Load user data when authenticated
        loadUserDevices();
        loadGeofences();
        trackingService.connectWebSocket();
      }
    });
    return unsubscribe;
  }, []);

  // Surface a single, non-blocking toast on a prolonged encrypted-tunnel outage,
  // and a confirmation once it recovers (always-on resilience feedback).
  useEffect(() => {
    const offOutage = eventBus.on('live:outage', () => {
      showToast({
        kind: 'info',
        title: 'Reconnecting',
        message: 'Lost the secure connection. Retrying automatically.',
      });
    });
    const offRecovered = eventBus.on('live:recovered', () => {
      showToast({ kind: 'success', title: 'Reconnected', message: 'Secure connection restored.' });
    });
    return () => {
      offOutage();
      offRecovered();
    };
  }, [showToast]);

  // Collapse the bottom sheet when the control cluster requests fullscreen map.
  // Guarded to act only on activeOverlay transitions so it never fights the
  // manual sheet handle or churns during map movement.
  const lastOverlayRef = useRef<string | null>(null);
  useEffect(() => {
    const off = eventBus.on(CONTROL_STATE_EVENT, (s: { activeOverlay: string | null }) => {
      if (s.activeOverlay !== lastOverlayRef.current) {
        lastOverlayRef.current = s.activeOverlay;
        setSheetCollapsed(s.activeOverlay === 'fullscreen');
      }
    });
    return off;
  }, []);

  // WebSocket real-time location updates
  useEffect(() => {
    const unsubscribe = trackingService.onLocationUpdate((location: LocationData) => {
      // Update device location in real-time
      setDeviceData(prev =>
        prev
          ? {
              ...prev,
              location: {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy,
                altitude: location.altitude,
                speed: location.speed,
                heading: location.heading,
              },
              timestamp: Date.now(),
            }
          : null
      );
    });
    return unsubscribe;
  }, []);

  // Geofence events
  useEffect(() => {
    const unsubscribe = trackingService.onGeofenceEvent(event => {
      if (Notification.permission === 'granted') {
        new Notification(
          `${event.type === 'geofence_enter' ? 'Entered' : 'Left'} ${event.geofence.name}`,
          {
            body: `Device ${event.type === 'geofence_enter' ? 'entered' : 'left'} safe zone`,
            icon: '/icon-192.png',
          }
        );
      }
    });
    return unsubscribe;
  }, []);

  const loadUserDevices = async () => {
    try {
      const apiDevices = await trackingService.getDevices();
      // Map API devices to local format
      const mappedDevices: TrackedDevice[] = apiDevices.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        data: {
          id: d.id,
          userAgent: '',
          platform: d.platform || '',
          language: navigator.language,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          timestamp: Date.now(),
        },
        lastSeen: d.last_seen || 'Unknown',
        sources: ['gps'] as TrackingMethod[],
        online: true,
        trained: false,
      }));
      if (mappedDevices.length > 0) {
        setDevices(prev => [
          ...mappedDevices,
          ...prev.filter(d => !mappedDevices.find(m => m.id === d.id)),
        ]);
      }
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  const loadGeofences = async () => {
    try {
      const fences = await trackingService.getGeofences();
      setGeofences(fences);
    } catch (err) {
      console.error('Failed to load geofences:', err);
    }
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      await trackingService.login(loginEmail, loginPassword);
      setAuthScreen('none');
      setLoginEmail('');
      setLoginPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      await trackingService.register(registerEmail, registerPassword, registerName);
      // After register, login
      await trackingService.login(registerEmail, registerPassword);
      setAuthScreen('none');
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await trackingService.logout();
    setAuthScreen('none');
  };

  // Collect full device data
  const collectDeviceData = useCallback(async (): Promise<DeviceData> => {
    const nav = navigator as any;

    const data: DeviceData = {
      id: localStorage.getItem('device_id') || crypto.randomUUID(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      timestamp: Date.now(),
    };

    // Save device ID
    localStorage.setItem('device_id', data.id);

    // Get connection info
    if (nav.connection) {
      data.connection = {
        type: nav.connection.effectiveType || nav.connection.type || 'unknown',
        downlink: nav.connection.downlink || 0,
        rtt: nav.connection.rtt || 0,
      };
    }

    // Get battery info
    if (nav.getBattery) {
      try {
        const battery = await nav.getBattery();
        data.battery = {
          level: Math.round(battery.level * 100),
          charging: battery.charging,
        };
      } catch (e) {}
    }

    // Get IP address
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      data.ip = ipData.ip;
    } catch (e) {}

    return data;
  }, []);

  // Throttle for backend location pushes (last sent point + time).
  const lastPushRef = useRef<{ t: number; lat: number; lng: number } | null>(null);

  // Get real-time location
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      pos => {
        const newLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || undefined,
          speed: pos.coords.speed || undefined,
          heading: pos.coords.heading || undefined,
        };

        setDeviceData(prev =>
          prev
            ? {
                ...prev,
                location: newLocation,
                timestamp: Date.now(),
              }
            : null
        );

        // Add to tracking history (breadcrumb trail)
        setTrackingHistory(prev => {
          const newPoint: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          // Keep last 100 points
          const updated = [...prev, newPoint].slice(-100);
          return updated;
        });

        // Push to the backend so friends can see live movement. Only when
        // signed in; throttled to moves > ~5 m or > 3 s. Encrypted tunnel is
        // preferred, with an HTTP fallback when it isn't established yet.
        pushLocationToBackend(newLocation, lastPushRef);
      },
      err => console.error('Location error:', err),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
    setWatchId(id);
  }, []);

  // Stop location tracking
  const stopLocationTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  }, [watchId]);

  // Initialize device data collection
  useEffect(() => {
    const init = async () => {
      console.log('Initializing device data...');
      const data = await collectDeviceData();
      setDeviceData(data);
      console.log('Device data collected:', data.id);

      // Create this device entry
      const thisDevice: TrackedDevice = {
        id: data.id,
        name: getDeviceName(data),
        type: getDeviceType(data),
        data: data,
        lastSeen: 'Now',
        sources: ['gps', 'wifi', 'cellular', 'ip'],
        online: true,
        trained: false,
      };
      setDevices([thisDevice]);

      // Try to get location immediately if permission already granted
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            console.log('Initial location obtained:', pos.coords.latitude, pos.coords.longitude);
            setDeviceData(prev =>
              prev
                ? {
                    ...prev,
                    location: {
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      accuracy: pos.coords.accuracy,
                      altitude: pos.coords.altitude || undefined,
                      speed: pos.coords.speed || undefined,
                      heading: pos.coords.heading || undefined,
                    },
                  }
                : null
            );

            // Auto-grant location permission in UI
            setPermissions(prev =>
              prev.map(p => (p.id === 'location' ? { ...p, granted: true } : p))
            );
          },
          err => {
            console.log('Initial location not available:', err.message);
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        );
      }
    };
    init();
  }, [collectDeviceData]);

  // Get device name from user agent
  const getDeviceName = (data: DeviceData): string => {
    const ua = data.userAgent.toLowerCase();
    if (ua.includes('iphone')) return 'iPhone';
    if (ua.includes('ipad')) return 'iPad';
    if (ua.includes('android')) return 'Android Device';
    if (ua.includes('macintosh')) return 'MacBook';
    if (ua.includes('windows')) return 'Windows PC';
    return 'Unknown Device';
  };

  // Get device type
  const getDeviceType = (data: DeviceData): string => {
    const ua = data.userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) return 'phone';
    if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
    return 'laptop';
  };

  // Train device - learn movement patterns
  const trainDevice = async (device: TrackedDevice) => {
    setTrainingDevice(true);
    setTrainingProgress(0);

    // Simulate AI training with location samples
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 300));
      setTrainingProgress(i);

      // Collect location sample
      if (navigator.geolocation && i < 100) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            console.log(`Training sample ${i}:`, pos.coords.latitude, pos.coords.longitude);
          },
          () => {},
          { enableHighAccuracy: true }
        );
      }
    }

    // Mark device as trained
    setDevices(prev => prev.map(d => (d.id === device.id ? { ...d, trained: true } : d)));
    setTrainingDevice(false);
  };

  // AI Route Finding - connects to your backend
  const findAIRoute = async (targetDevice: TrackedDevice) => {
    if (!deviceData?.location || !targetDevice.data.location) {
      showToast({
        kind: 'error',
        title: 'Route needs two locations',
        message: 'Enable your location and select a device with a recent position.',
      });
      return;
    }

    setRouteLoading(true);
    setAiRoute(null);
    const routeT0 = performance.now();

    const start = [deviceData.location.lat, deviceData.location.lng];
    const end = [targetDevice.data.location.lat, targetDevice.data.location.lng];

    // Capture speed in the narrowed scope (the guard above proved location is
    // defined here, but that narrowing is lost inside the closure below).
    const speedKmh = deviceData.location.speed ? deviceData.location.speed * 3.6 : 5;

    // Normalize a route payload (tunnel or HTTP) into the UI route model. The
    // backend returns `cost` (metres) and `algo_used`; older code read the
    // non-existent `distance`/`algorithm`, leaving ETA as NaN. Read both.
    const applyRoute = (data: any, algoLabel: string): boolean => {
      const path = data?.path || [];
      if (!Array.isArray(path) || path.length === 0) return false;
      const distance = (data.distance ?? data.cost ?? 0) as number;
      const etaMinutes = Math.round((distance / 1000 / speedKmh) * 60);
      setAiRoute({
        algorithm: data.algorithm || data.algo_used || algoLabel,
        distance,
        steps: data.steps,
        visited: data.visited,
        path,
        eta:
          etaMinutes < 60
            ? `${etaMinutes} min`
            : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`,
        safety: data.safety_score || 85,
      });
      return true;
    };

    let routeFound = false;

    // Prefer the encrypted tunnel so origin/destination never travel in
    // plaintext. Resolves null when the tunnel is unavailable; we then fall
    // back to the HTTP route endpoint below.
    try {
      const tunnelRoute = await tunnelService.sendRouteRequest({ start, end, algo: 'ShadowPath' });
      if (tunnelRoute && applyRoute(tunnelRoute, 'ShadowPath')) {
        routeFound = true;
        showToast({
          kind: 'success',
          title: 'AI route ready',
          message: `Encrypted route to ${targetDevice.name}.`,
        });
      }
    } catch {
      /* fall through to HTTP */
    }

    // HTTP fallback: try different AI algorithms until one returns a path.
    const algorithms = ['ShadowPath', 'BFS', 'DFS', 'Dijkstra'];
    for (const algo of routeFound ? [] : algorithms) {
      try {
        const res = await fetch(`${API_BASE}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            start,
            end,
            algo,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (applyRoute(data, algo)) {
            routeFound = true;
            showToast({
              kind: 'success',
              title: 'AI route ready',
              message: `${data.algorithm || data.algo_used || algo} found a route to ${targetDevice.name}.`,
            });
            break;
          }
        }
      } catch (e) {
        console.log(`${algo} failed, trying next...`);
      }
    }

    if (!routeFound) {
      setAiRoute(
        buildOfflineRoute(
          start as [number, number],
          end as [number, number],
          deviceData.location.speed
        )
      );
      showToast({
        kind: 'info',
        title: 'Showing estimated direction',
        message: 'Live directions need a connection. Showing a straight-line estimate for now.',
      });
    }

    telemetryBus.mark('routeCalc', performance.now() - routeT0);
    setRouteLoading(false);
  };

  // Start tracking a device
  const startTracking = (device: TrackedDevice) => {
    console.log('Starting tracking for device:', device.name);
    setSelectedDevice(device);
    setTracking(true);
    setCalibrating(true);
    showToast({
      kind: 'info',
      title: 'Tracking started',
      message: `PathMap is now tracking ${device.name}.`,
    });

    // Force get location if not available
    if (!deviceData?.location) {
      console.log('No location yet, requesting...');
      navigator.geolocation.getCurrentPosition(
        pos => {
          console.log('Got location for tracking:', pos.coords.latitude, pos.coords.longitude);
          setDeviceData(prev =>
            prev
              ? {
                  ...prev,
                  location: {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    altitude: pos.coords.altitude || undefined,
                    speed: pos.coords.speed || undefined,
                    heading: pos.coords.heading || undefined,
                  },
                }
              : null
          );
        },
        err => {
          console.error('Failed to get location:', err);
          alert('Please enable location access to track devices');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    startLocationTracking();

    // Calibration phase
    setTimeout(() => {
      setCalibrating(false);
      // Auto-find route if both have location
      if (device.data.location && deviceData?.location) {
        findAIRoute(device);
      }
    }, 2000);
  };

  // Stop tracking
  const stopTracking = () => {
    setTracking(false);
    setSelectedDevice(null);
    setAiRoute(null);
    setTrackingHistory([]);
    setActiveTarget(null);
    liveStatus.setNavigating(false);
    stopLocationTracking();
  };

  // Handle map tap - create tracking target
  const handleMapClick = useCallback((lat: number, lng: number) => {
    console.log('Map tapped:', lat, lng);
    setShowTargetMenu({ lat, lng });
  }, []);

  // Create a new map target
  const createMapTarget = useCallback(
    (lat: number, lng: number, name: string, type: MapTarget['type']) => {
      const colors = {
        person: '#3B82F6',
        place: '#10B981',
        object: '#F59E0B',
        custom: '#8B5CF6',
      };
      const icons = {
        person: 'person',
        place: 'place',
        object: 'object',
        custom: 'star',
      };
      const target: MapTarget = {
        id: crypto.randomUUID(),
        name: name || `Target ${mapTargets.length + 1}`,
        lat,
        lng,
        type,
        icon: icons[type],
        color: colors[type],
        createdAt: Date.now(),
      };
      setMapTargets(prev => [...prev, target]);
      // Mirror the target through the encrypted tunnel (best-effort; targets
      // have no HTTP store yet, so the fallback is a no-op).
      void tunnelService.sendTaskUpdate(
        'add',
        { id: target.id, name: target.name, lat, lng, type },
        () => {}
      );
      setShowTargetMenu(null);
      setNewTargetName('');
      return target;
    },
    [mapTargets.length]
  );

  // Start tracking a map target
  const startTrackingTarget = useCallback(
    (target: MapTarget) => {
      console.log('Starting tracking for target:', target.name);
      setActiveTarget(target);
      setTracking(true);
      setCalibrating(true);
      // Hold a screen wake lock while actively navigating to a target.
      liveStatus.setNavigating(true);

      // Force get location if not available
      if (!deviceData?.location) {
        console.log('No location for target tracking, requesting...');
        navigator.geolocation.getCurrentPosition(
          pos => {
            console.log('Got location:', pos.coords.latitude, pos.coords.longitude);
            const newLocation = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude || undefined,
              speed: pos.coords.speed || undefined,
              heading: pos.coords.heading || undefined,
            };
            setDeviceData(prev => (prev ? { ...prev, location: newLocation } : null));
            // Now find route
            findRouteToTarget(target);
          },
          err => {
            console.error('Location error:', err);
            alert('Please enable location to track targets');
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }

      startLocationTracking();

      setTimeout(() => {
        setCalibrating(false);
        // Find route to target if we have location
        if (deviceData?.location) {
          findRouteToTarget(target);
        }
      }, 2000);
    },
    [deviceData?.location, startLocationTracking]
  );

  // Find AI route to map target
  const findRouteToTarget = async (target: MapTarget) => {
    if (!deviceData?.location) {
      showToast({
        kind: 'error',
        title: 'Your location is needed',
        message: 'Enable location before routing to a map target.',
      });
      return;
    }

    setRouteLoading(true);
    setAiRoute(null);
    const routeT0 = performance.now();

    const start = [deviceData.location.lat, deviceData.location.lng];
    const end = [target.lat, target.lng];

    const algorithms = ['ShadowPath', 'A*', 'Dijkstra', 'BFS'];
    let routeFound = false;

    for (const algo of algorithms) {
      try {
        const res = await fetch(`${API_BASE}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({ start, end, algo }),
        });

        if (res.ok) {
          const data = await res.json();
          const speedKmh = deviceData.location.speed ? deviceData.location.speed * 3.6 : 5;
          const distanceKm = data.distance / 1000;
          const etaMinutes = Math.round((distanceKm / speedKmh) * 60);

          setAiRoute({
            algorithm: data.algorithm || algo,
            distance: data.distance,
            steps: data.steps,
            visited: data.visited,
            path: data.path || [],
            eta:
              etaMinutes < 60
                ? `${etaMinutes} min`
                : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`,
            safety: data.safety_score || 85,
          });
          routeFound = true;
          showToast({
            kind: 'success',
            title: 'Target route ready',
            message: `${data.algorithm || algo} found a route to ${target.name}.`,
          });
          break;
        }
      } catch (e) {
        console.log(`${algo} failed, trying next...`);
      }
    }

    if (!routeFound) {
      setAiRoute(
        buildOfflineRoute(
          start as [number, number],
          end as [number, number],
          deviceData.location.speed
        )
      );
      showToast({
        kind: 'info',
        title: 'Showing estimated direction',
        message: 'Live directions need a connection. Showing a straight-line estimate for now.',
      });
    }

    telemetryBus.mark('routeCalc', performance.now() - routeT0);
    setRouteLoading(false);
  };

  // Delete a map target
  const deleteMapTarget = useCallback(
    (targetId: string) => {
      setMapTargets(prev => prev.filter(t => t.id !== targetId));
      void tunnelService.sendTaskUpdate('remove', { id: targetId }, () => {});
      if (activeTarget?.id === targetId) {
        stopTracking();
      }
      showToast({
        kind: 'info',
        title: 'Target removed',
        message: 'The tracking target was removed from this session.',
      });
    },
    [activeTarget, showToast]
  );

  // Register view-specific commands in the Cmd/Ctrl-K palette. Re-registers when
  // the underlying handlers/state change so commands always act on current data.
  useEffect(() => {
    const unregister = commandRegistry.registerMany([
      {
        id: 'track.stop',
        label: 'Stop tracking',
        group: 'Tracking',
        keywords: ['halt', 'end', 'cancel'],
        run: () => stopTracking(),
      },
      {
        id: 'target.addHere',
        label: 'Add target at my location',
        group: 'Tracking',
        keywords: ['pin', 'mark', 'here', 'place'],
        run: () => {
          if (deviceData?.location) {
            createMapTarget(deviceData.location.lat, deviceData.location.lng, '', 'custom');
          } else {
            showToast({
              kind: 'error',
              title: 'No location yet',
              message: 'Enable location to drop a target here.',
            });
          }
        },
      },
      {
        id: 'pref.reducedMotion',
        label: 'Toggle reduced motion',
        group: 'Accessibility',
        keywords: ['animation', 'a11y', 'motion'],
        run: () => setPref('reducedMotion', !prefs.reducedMotion),
      },
      {
        id: 'pref.highContrast',
        label: 'Toggle high contrast',
        group: 'Accessibility',
        keywords: ['contrast', 'a11y', 'vision'],
        run: () => setPref('highContrast', !prefs.highContrast),
      },
      {
        id: 'pref.cycleTheme',
        label: 'Cycle theme (dark / light / system)',
        group: 'Accessibility',
        keywords: ['dark', 'light', 'appearance'],
        run: () => {
          const order: PrefsTheme[] = ['dark', 'light', 'system'];
          const next = order[(order.indexOf(prefs.theme) + 1) % order.length];
          setPref('theme', next);
        },
      },
    ]);
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceData?.location, createMapTarget, showToast, prefs.reducedMotion, prefs.highContrast, prefs.theme]);

  // Grant permission - improved error handling
  const grantPermission = async (id: string) => {
    console.log('Granting permission:', id);

    if (id === 'location' || id === 'location_bg') {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
      }

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            error => {
              console.error('Geolocation error:', error.code, error.message);
              reject(error);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            }
          );
        });

        console.log('Location obtained:', pos.coords.latitude, pos.coords.longitude);

        const newLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || undefined,
          speed: pos.coords.speed || undefined,
          heading: pos.coords.heading || undefined,
        };

        setDeviceData(prev => {
          if (!prev) {
            // Create device data if it doesn't exist
            return {
              id: localStorage.getItem('device_id') || crypto.randomUUID(),
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              language: navigator.language,
              screenWidth: window.screen.width,
              screenHeight: window.screen.height,
              timestamp: Date.now(),
              location: newLocation,
            };
          }
          return { ...prev, location: newLocation };
        });

        // Also start watching location
        startLocationTracking();
      } catch (e: any) {
        console.error('Location permission denied:', e);
        alert(
          `Location access failed: ${e.message || 'Permission denied'}. Please enable location in your browser settings.`
        );
        return; // Don't mark as granted if failed
      }
    }

    if (id === 'notifications') {
      try {
        const result = await Notification.requestPermission();
        console.log('Notification permission:', result);
        if (result !== 'granted') {
          console.warn('Notifications not granted');
        }
      } catch (e) {
        console.error('Notification permission error:', e);
      }
    }

    setPermissions(prev => prev.map(p => (p.id === id ? { ...p, granted: true } : p)));
  };

  const grantAll = async () => {
    console.log('Granting all permissions...');
    for (const perm of permissions) {
      await grantPermission(perm.id);
    }
    setShowPermissions(false);
  };

  const allRequiredGranted = permissions.filter(p => p.required).every(p => p.granted);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'tablet':
        return <Tablet aria-hidden="true" />;
      case 'laptop':
        return <Laptop aria-hidden="true" />;
      case 'phone':
      default:
        return <Smartphone aria-hidden="true" />;
    }
  };

  // Permission Screen
  if (showPermissions && !allRequiredGranted) {
    return (
      <div className="app">
        <div className="permission-screen">
          <div className="permission-header">
            <div className="permission-icon">
              <MapPin size={48} aria-hidden="true" />
            </div>
            <h1>PathMap AI Tracking</h1>
            <p>Grant permissions for full device tracking & AI routing</p>
          </div>

          <div className="permission-list">
            {permissions.map(perm => (
              <button
                key={perm.id}
                className={`permission-item ${perm.granted ? 'granted' : ''}`}
                onClick={() => grantPermission(perm.id)}
              >
                <span className="perm-icon">{perm.icon}</span>
                <div className="perm-info">
                  <div className="perm-name">
                    {perm.name}
                    {perm.required && <span className="required">Required</span>}
                  </div>
                </div>
                <div className={`perm-check ${perm.granted ? 'checked' : ''}`}>
                  {perm.granted ? '✓' : ''}
                </div>
              </button>
            ))}
          </div>

          <div className="permission-actions">
            <button className="btn-primary" onClick={grantAll}>
              Allow All & Start
            </button>
          </div>

          {deviceData && (
            <div className="device-preview">
              <div className="preview-title">Device Detected</div>
              <div className="preview-info">
                <span>{getDeviceIcon(getDeviceType(deviceData))}</span>
                <span>{getDeviceName(deviceData)}</span>
                <span className="preview-badge">{deviceData.platform}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app holo-mode">
      <h1 className="sr-only">PathMap — private live location tracking</h1>
      <a className="skip-link" href="#main-controls">
        Skip to controls
      </a>
      <header className="sys-bar" role="banner">
        <div className="sys-bar-left">
          <span className="sys-brand">
            <span className="sys-mark" aria-hidden="true" />
            PathMap
          </span>
          <span
            className="sys-stat"
            data-state={tracking ? 'live' : 'idle'}
            role="status"
            aria-live="polite"
          >
            <span className="sys-stat-dot" />
            {tracking ? 'Tracking is on' : 'Not tracking'}
          </span>
        </div>
        <div className="sys-bar-right">
          <span className="sys-metric" title="Saved targets">
            <em>Saved targets</em>
            {mapTargets.length}
          </span>
          <span className="sys-metric" title="Directions status">
            <em>Directions</em>
            {aiRoute ? 'Ready' : 'Not set'}
          </span>
          <span className="sys-metric" title="Privacy mode">
            <em>Privacy</em>
            On
          </span>
        </div>
      </header>

      {/* Apple Maps-style floating top: brand, hero search, live status. */}
      <div className="top-overlay" role="banner">
        <div className="top-brand">
          <span className="sys-mark" aria-hidden="true" />
          PathMap
        </div>
        <div className="top-search">
          <MapSearch
            onSelectDestination={dest => {
              const target = createMapTarget(dest.lat, dest.lng, dest.name, 'place');
              if (target) startTrackingTarget(target);
            }}
          />
        </div>
        <div
          className="top-status"
          data-live={tracking ? 'true' : 'false'}
          role="status"
          aria-live="polite"
        >
          <span className="dot" aria-hidden="true" />
          <span className="label">{tracking ? 'Tracking' : 'Idle'}</span>
        </div>
      </div>

      {autopilotStatus !== 'Active' && (
        <div className="launch-status" role="status" aria-live="polite">
          <span className="launch-status-dot" aria-hidden="true" />
          <span>{autopilotStatus}</span>
        </div>
      )}
      <MapView3D
        startPoint={
          deviceData?.location ? [deviceData.location.lat, deviceData.location.lng] : null
        }
        endPoint={
          activeTarget
            ? [activeTarget.lat, activeTarget.lng]
            : selectedDevice?.data.location
              ? [selectedDevice.data.location.lat, selectedDevice.data.location.lng]
              : null
        }
        routeData={aiRoute ? { path: aiRoute.path } : null}
        comparisonResults={null}
        trackingHistory={trackingHistory}
        landmarks={[
          ...geofences.map(g => ({
            id: g.id,
            position: [g.lat, g.lng] as [number, number],
            name: g.name,
            type: g.type,
          })),
          ...mapTargets.map(t => ({
            id: t.id,
            position: [t.lat, t.lng] as [number, number],
            name: `${t.icon} ${t.name}`,
            type: t.type,
          })),
        ]}
        visualizationMode="standard"
        showAlgorithmBehavior={false}
        algorithm="ShadowPath"
        liveNavigation={
          tracking && deviceData?.location
            ? {
                currentPosition: {
                  lat: deviceData.location.lat,
                  lon: deviceData.location.lng,
                  heading: deviceData.location.heading,
                  speedMps: deviceData.location.speed,
                },
                breadcrumbTrail: trackingHistory,
              }
            : null
        }
        isLiveNavActive={tracking}
        onMapClick={handleMapClick}
      />

      <ControlCenter />

      {/* Tracking Status */}
      {tracking && (selectedDevice || activeTarget) && (
        <div className={`tracking-status ${calibrating ? 'calibrating' : ''}`}>
          <div className="tracking-pulse"></div>
          <div className="tracking-info">
            <span className="tracking-label">
              {calibrating ? 'AI Calibrating...' : 'Tracking Active'}
            </span>
            <span className="tracking-target">
              {activeTarget ? (
                <>
                  <span className="target-icon-inline">
                    {TargetTypeIcons[activeTarget.icon] || TargetTypeIcons.place}
                  </span>{' '}
                  {activeTarget.name}
                </>
              ) : (
                selectedDevice?.name
              )}
            </span>
          </div>
          {aiRoute && (
            <div className="route-badge">
              <span>{aiRoute.algorithm}</span>
              <span>{aiRoute.eta}</span>
            </div>
          )}
          <button className="stop-btn" onClick={stopTracking}>
            Stop
          </button>
        </div>
      )}

      {/* Tap-to-Track Target Menu */}
      {showTargetMenu && (
        <div className="target-menu-overlay" onClick={() => setShowTargetMenu(null)}>
          <div className="target-menu" onClick={e => e.stopPropagation()}>
            <div className="target-menu-header">
              <h3>
                <MapPin className="inline-icon" width={18} height={18} aria-hidden="true" />{' '}
                Create Target
              </h3>
              <span className="target-coords">
                {showTargetMenu.lat.toFixed(6)}, {showTargetMenu.lng.toFixed(6)}
              </span>
            </div>

            <input
              type="text"
              className="target-name-input"
              placeholder="Target name (optional)"
              value={newTargetName}
              onChange={e => setNewTargetName(e.target.value)}
              autoFocus
            />

            <div className="target-type-grid">
              <button
                className={`target-type-btn ${newTargetType === 'person' ? 'active' : ''}`}
                onClick={() => setNewTargetType('person')}
              >
                <span className="type-icon">
                  <User aria-hidden="true" />
                </span>
                <span>Person</span>
              </button>
              <button
                className={`target-type-btn ${newTargetType === 'place' ? 'active' : ''}`}
                onClick={() => setNewTargetType('place')}
              >
                <span className="type-icon">
                  <MapPin aria-hidden="true" />
                </span>
                <span>Place</span>
              </button>
              <button
                className={`target-type-btn ${newTargetType === 'object' ? 'active' : ''}`}
                onClick={() => setNewTargetType('object')}
              >
                <span className="type-icon">
                  <Package aria-hidden="true" />
                </span>
                <span>Object</span>
              </button>
              <button
                className={`target-type-btn ${newTargetType === 'custom' ? 'active' : ''}`}
                onClick={() => setNewTargetType('custom')}
              >
                <span className="type-icon">
                  <Star aria-hidden="true" />
                </span>
                <span>Custom</span>
              </button>
            </div>

            <div className="target-menu-actions">
              <button className="btn-secondary" onClick={() => setShowTargetMenu(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const target = createMapTarget(
                    showTargetMenu.lat,
                    showTargetMenu.lng,
                    newTargetName,
                    newTargetType
                  );
                  startTrackingTarget(target);
                }}
              >
                Track Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Route Info */}
      {aiRoute && !calibrating && (
        <div className="ai-route-card">
          <div className="route-header">
            <span className="route-algo">
              <Route className="inline-icon" width={16} height={16} aria-hidden="true" />
              {aiRoute.algorithm}
            </span>
            <span
              className="route-safety"
              data-tier={
                aiRoute.algorithm === 'Offline estimate'
                  ? 'estimate'
                  : aiRoute.safety >= 70
                    ? 'safe'
                    : aiRoute.safety >= 40
                      ? 'mid'
                      : 'unsafe'
              }
            >
              {aiRoute.algorithm === 'Offline estimate' ? 'Estimate' : `${aiRoute.safety}% safe`}
            </span>
          </div>
          <div className="route-stats">
            <div className="stat">
              <span className="stat-value">{aiRoute.eta}</span>
              <span className="stat-label">ETA</span>
            </div>
            <div className="stat">
              <span className="stat-value">{aiRoute.distance}m</span>
              <span className="stat-label">Distance</span>
            </div>
            <div className="stat">
              <span className="stat-value">{aiRoute.steps}</span>
              <span className="stat-label">Steps</span>
            </div>
            <div className="stat">
              <span className="stat-value">{aiRoute.visited}</span>
              <span className="stat-label">AI Nodes</span>
            </div>
          </div>
        </div>
      )}

      {/* Training Progress */}
      {trainingDevice && (
        <div className="training-overlay">
          <div className="training-card">
            <div className="training-icon">
              <Brain width={48} height={48} aria-hidden="true" />
            </div>
            <div className="training-title">Training Device AI</div>
            <div className="training-bar">
              <progress className="training-fill" value={trainingProgress} max={100} />
            </div>
            <div className="training-percent">{trainingProgress}%</div>
            <div className="training-text">Learning movement patterns...</div>
          </div>
        </div>
      )}

      {/* Bottom Sheet */}
      <div
        id="main-controls"
        className={`sheet ${sheetCollapsed ? 'collapsed' : ''}`}
        role="main"
        aria-label="Controls"
      >
        <button
          className="sheet-toggle"
          title={sheetCollapsed ? 'Expand controls' : 'Collapse controls'}
          aria-label={sheetCollapsed ? 'Expand controls' : 'Collapse controls'}
          aria-expanded={!sheetCollapsed}
          onClick={() => setSheetCollapsed(!sheetCollapsed)}
        >
          <ChevronDown aria-hidden="true" width={16} height={16} />
        </button>
        <div className="handle" onClick={() => setSheetCollapsed(!sheetCollapsed)}></div>

        <SheetTabs tab={tab} setTab={setTab} />

        <div className="content">
          {/* Track Tab */}
          {tab === 'track' && (
            <>
              {/* Map Targets */}
              {mapTargets.length > 0 && (
                <div className="section">
                  <div className="section-header">
                    <Crosshair
                      className="section-icon"
                      width={16}
                      height={16}
                      aria-hidden="true"
                    />{' '}
                    Saved targets
                  </div>
                  <div className="device-list">
                    {mapTargets.map(target => (
                      <div
                        key={target.id}
                        className={`device-card ${activeTarget?.id === target.id ? 'selected' : ''}`}
                      >
                        <span className="device-icon">
                          {TargetTypeIcons[target.icon] || TargetTypeIcons.place}
                        </span>
                        <div className="device-info">
                          <div className="device-name">{target.name}</div>
                          <div className="device-meta">
                            <span
                              className={`target-type-badge ${targetTypeBadgeClass[target.type] || 'target-type-badge--custom'}`}
                            >
                              {target.type}
                            </span>
                            <span>
                              {target.lat.toFixed(4)}, {target.lng.toFixed(4)}
                            </span>
                          </div>
                        </div>
                        <div className="target-actions">
                          <button
                            className="track-btn"
                            title={`${activeTarget?.id === target.id ? 'Tracking' : 'Track'} ${target.name}`}
                            aria-label={`${activeTarget?.id === target.id ? 'Tracking' : 'Track'} ${target.name}`}
                            onClick={() => startTrackingTarget(target)}
                          >
                            {activeTarget?.id === target.id ? (
                              <Radar width={16} height={16} aria-hidden="true" />
                            ) : (
                              <Crosshair width={16} height={16} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            className="delete-btn"
                            title={`Delete ${target.name}`}
                            aria-label={`Delete ${target.name}`}
                            onClick={() => deleteMapTarget(target.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tap to track hint */}
              <div className="section tap-hint">
                <div className="hint-icon">
                  <Hand width={28} height={28} aria-hidden="true" />
                </div>
                <div className="hint-text">
                  <strong>No target selected</strong>
                  <span>Ready for live tracking.</span>
                </div>
              </div>

              {/* Use my location Button - always visible */}
              {!deviceData?.location && (
                <button
                  className="btn-primary location-btn"
                  onClick={() => {
                    console.log('Use my location clicked');
                    if (!navigator.geolocation) {
                      alert('Geolocation not supported');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      pos => {
                        console.log('Location obtained:', pos.coords);
                        setDeviceData(prev =>
                          prev
                            ? {
                                ...prev,
                                location: {
                                  lat: pos.coords.latitude,
                                  lng: pos.coords.longitude,
                                  accuracy: pos.coords.accuracy,
                                  altitude: pos.coords.altitude || undefined,
                                  speed: pos.coords.speed || undefined,
                                  heading: pos.coords.heading || undefined,
                                },
                              }
                            : null
                        );
                        startLocationTracking();
                      },
                      err => {
                        console.error('Location error:', err);
                        alert(
                          `Location error: ${err.message}. Please enable location in browser settings.`
                        );
                      },
                      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                    );
                  }}
                >
                  <MapPin width={20} height={20} aria-hidden="true" />
                  Use my location
                </button>
              )}

              {/* Tracking Lock */}
              {deviceData?.location && (
                <div className="section">
                  <div className="section-header">Location</div>
                  <div className="live-card system-status-card">
                    <div>
                      <strong>Your location is ready</strong>
                      <span>
                        Accuracy: within about {Math.round(deviceData.location.accuracy)} m.
                      </span>
                    </div>
                    <span className="system-chip">Private</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Systems Tab */}
          {tab === 'devices' && (
            <>
              <div className="section">
                <div className="section-header">Status</div>
                <div className="system-overview-grid">
                  <div className="system-overview-card">
                    <span className="system-overview-label">Tracking</span>
                    <strong>{tracking ? 'On' : 'Ready'}</strong>
                    <span>{tracking ? 'Tracking is active' : 'Choose a target to start'}</span>
                  </div>
                  <div className="system-overview-card">
                    <span className="system-overview-label">Saved</span>
                    <strong>{mapTargets.length}</strong>
                    <span>{mapTargets.length === 1 ? 'target saved' : 'targets saved'}</span>
                  </div>
                  <div className="system-overview-card">
                    <span className="system-overview-label">Signals</span>
                    <strong>{connectedHardware.length + satelliteData.satellites.length}</strong>
                    <span>Signals available</span>
                  </div>
                </div>
              </div>
              <div className="section">
                <div className="system-status-card">
                  <div>
                    <strong>PathMap is ready</strong>
                    <span>The app shows only the controls you need for tracking.</span>
                  </div>
                  <span className="system-chip">Ready</span>
                </div>
              </div>
            </>
          )}

          {/* AI Route Tab */}
          {tab === 'routes' && (
            <>
              <div className="section">
                <div className="section-header">
                  <Route
                    className="section-header-icon"
                    width={16}
                    height={16}
                    aria-hidden="true"
                  />
                  Directions
                </div>
                <div className="algo-grid">
                  {['ShadowPath', 'Dijkstra', 'A*', 'BFS'].map(algo => (
                    <button key={algo} className="algo-btn">
                      <span className="algo-name">{algo}</span>
                      <span className="algo-desc">
                        {algo === 'ShadowPath'
                          ? 'Safe + Fast'
                          : algo === 'Dijkstra'
                            ? 'Shortest'
                            : algo === 'A*'
                              ? 'Optimal'
                              : 'Explore'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDevice && (
                <button
                  className="btn-primary"
                  onClick={() => findAIRoute(selectedDevice)}
                  disabled={routeLoading}
                >
                  {routeLoading ? (
                    <>
                      <Loader2 className="spin" width={16} height={16} aria-hidden="true" />{' '}
                      Finding directions...
                    </>
                  ) : (
                    <>
                      <Sparkles width={16} height={16} aria-hidden="true" />{' '}
                      Find directions
                    </>
                  )}
                </button>
              )}

              {!selectedDevice && !aiRoute && (
                <EmptyState
                  title="Choose a target first"
                  message="Choose a target first, then PathMap can find directions on the map."
                  icon={<Route width={22} height={22} aria-hidden="true" />}
                />
              )}

              {routeLoading && <Skeleton variant="card" label="Calculating route" />}

              {aiRoute && (
                <div className="section">
                  <div className="section-header">Route Result</div>
                  <div className="result-card">
                    <div className="result-row">
                      <span>Algorithm</span>
                      <span className="result-value">{aiRoute.algorithm}</span>
                    </div>
                    <div className="result-row">
                      <span>Distance</span>
                      <span className="result-value">{aiRoute.distance}m</span>
                    </div>
                    <div className="result-row">
                      <span>ETA</span>
                      <span className="result-value">{aiRoute.eta}</span>
                    </div>
                    <div className="result-row">
                      <span>Safety Score</span>
                      <span className="result-value safety">{aiRoute.safety}%</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Settings Tab */}
          {tab === 'settings' && (
            <>
              {/* Preferences (merged from the former Settings page) */}
              <div className="section">
                <div className="section-header">
                  <SettingsIcon
                    className="section-header-icon"
                    width={16}
                    height={16}
                    aria-hidden="true"
                  />
                  Preferences
                </div>
                <div className="settings-list">
                  <div className="setting-item">
                    <div className="setting-info">
                      <div className="setting-name">Language</div>
                    </div>
                    <div className="pref-seg" role="group" aria-label="Language">
                      <button
                        className={prefs.language === 'en' ? 'active' : ''}
                        onClick={() => changeLanguagePref('en')}
                      >
                        EN
                      </button>
                      <button
                        className={prefs.language === 'es' ? 'active' : ''}
                        onClick={() => changeLanguagePref('es')}
                      >
                        ES
                      </button>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-info">
                      <div className="setting-name">Theme</div>
                    </div>
                    <div className="pref-seg" role="group" aria-label="Theme">
                      <button
                        className={prefs.theme === 'dark' ? 'active' : ''}
                        aria-label="Dark"
                        onClick={() => setPref('theme', 'dark')}
                      >
                        <Moon width={15} height={15} aria-hidden="true" />
                      </button>
                      <button
                        className={prefs.theme === 'light' ? 'active' : ''}
                        aria-label="Light"
                        onClick={() => setPref('theme', 'light')}
                      >
                        <Sun width={15} height={15} aria-hidden="true" />
                      </button>
                      <button
                        className={prefs.theme === 'system' ? 'active' : ''}
                        aria-label="System"
                        onClick={() => setPref('theme', 'system')}
                      >
                        <SlidersHorizontal width={15} height={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-info">
                      <div className="setting-name">Units</div>
                    </div>
                    <div className="pref-seg" role="group" aria-label="Units">
                      <button
                        className={prefs.units === 'metric' ? 'active' : ''}
                        onClick={() => setPref('units', 'metric')}
                      >
                        Metric
                      </button>
                      <button
                        className={prefs.units === 'imperial' ? 'active' : ''}
                        onClick={() => setPref('units', 'imperial')}
                      >
                        Imperial
                      </button>
                    </div>
                  </div>
                  {(
                    [
                      ['precisionMode', 'High-precision GPS'],
                      ['offline', 'Offline mode'],
                      ['safetyAlerts', 'Safety alerts'],
                      ['reducedMotion', 'Reduced motion'],
                      ['highContrast', 'High contrast'],
                      ['debug', 'Debug mode'],
                    ] as Array<[PrefsBoolKey, string]>
                  ).map(([key, label]) => (
                    <div className="setting-item" key={key}>
                      <div className="setting-info">
                        <div className="setting-name">{label}</div>
                      </div>
                      <button
                        type="button"
                        className={`toggle ${prefs[key] ? 'on' : ''}`}
                        aria-pressed={prefs[key]}
                        aria-label={label}
                        onClick={() => setPref(key, !prefs[key])}
                      />
                    </div>
                  ))}
                  <div className="setting-item">
                    <div className="setting-info">
                      <div className="setting-name">Text size</div>
                    </div>
                    <div className="pref-seg" role="group" aria-label="Text size">
                      {(
                        [
                          ['normal', 'A'],
                          ['large', 'A+'],
                          ['xl', 'A++'],
                        ] as Array<[TextSizePref, string]>
                      ).map(([size, glyph]) => (
                        <button
                          key={size}
                          type="button"
                          className={prefs.textSize === size ? 'active' : ''}
                          aria-pressed={prefs.textSize === size}
                          aria-label={`Text size ${size}`}
                          onClick={() => setPref('textSize', size)}
                        >
                          {glyph}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-info">
                      <div className="setting-name">Plan</div>
                      <div className="setting-detail">{PLAN_LABEL[prefs.billingPlan]}</div>
                    </div>
                    <button className="text-btn" onClick={() => setShowPlans(true)}>
                      View plans
                    </button>
                  </div>
                </div>
                <div className="prefs-actions">
                  <button className="btn-secondary" onClick={resetPrefs}>
                    Reset
                  </button>
                  <button className="btn-primary" onClick={savePrefs}>
                    <Save width={16} height={16} aria-hidden="true" />
                    {prefsSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => controlState.toggleFeedback(true)}
                  style={{ marginTop: 'var(--space-2)' }}
                >
                  Send feedback
                </button>
              </div>

              {/* Account Section */}
              <div className="section">
                <div className="section-header">
                  <User className="section-header-icon" width={16} height={16} aria-hidden="true" />
                  Account
                </div>
                {isAuthenticated ? (
                  <div className="settings-list">
                    <div className="setting-item">
                      <span className="setting-icon">
                        <Check width={20} height={20} aria-hidden="true" />
                      </span>
                      <div className="setting-info">
                        <div className="setting-name">Signed In</div>
                      </div>
                      <button className="text-btn" onClick={handleLogout}>
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="auth-buttons">
                    <button className="btn-primary" onClick={() => setAuthScreen('login')}>
                      Sign In
                    </button>
                    <button className="btn-secondary" onClick={() => setAuthScreen('register')}>
                      Create Account
                    </button>
                  </div>
                )}
              </div>

              {/* Safe Zones / Geofences */}
              <div className="section">
                <div className="section-header">
                  <MapPin className="section-header-icon" width={16} height={16} aria-hidden="true" />
                  Safe Zones
                </div>
                <div className="settings-list">
                  {geofences.map(fence => (
                    <div key={fence.id} className="setting-item">
                      <span className="setting-icon">
                        <Circle
                          width={14}
                          height={14}
                          aria-hidden="true"
                          fill="currentColor"
                          color={
                            fence.type === 'home'
                              ? '#7fa86a'
                              : fence.type === 'work'
                                ? '#6f86c4'
                                : '#d6a44a'
                          }
                        />
                      </span>
                      <div className="setting-info">
                        <div className="setting-name">{fence.name}</div>
                        <div className="setting-detail">{fence.radius}m radius</div>
                      </div>
                      <span className={`status-badge ${fence.active ? 'granted' : ''}`}>
                        {fence.active ? 'Active' : 'Off'}
                      </span>
                    </div>
                  ))}
                  <button className="add-btn" onClick={() => setShowGeofenceForm(true)}>
                    <Plus aria-hidden="true" width={20} height={20} />
                    Add Safe Zone
                  </button>
                </div>
              </div>

              <div className="section">
                <div className="section-header">Permissions</div>
                <div className="settings-list">
                  {permissions.map(perm => (
                    <div key={perm.id} className="setting-item">
                      <span className="setting-icon">{perm.icon}</span>
                      <div className="setting-info">
                        <div className="setting-name">{perm.name}</div>
                      </div>
                      <span className={`status-badge ${perm.granted ? 'granted' : ''}`}>
                        {perm.granted ? '✓ On' : 'Off'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section">
                <div className="section-header">
                  <Brain className="section-header-icon" width={16} height={16} aria-hidden="true" />
                  AI Settings
                </div>
                <div className="settings-list">
                  <div className="setting-item">
                    <span className="setting-icon">
                      <Brain aria-hidden="true" width={20} height={20} />
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">Auto-Train Devices</div>
                    </div>
                    <div className="toggle on"></div>
                  </div>
                  <div className="setting-item">
                    <span className="setting-icon">
                      <Crosshair aria-hidden="true" width={20} height={20} />
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">High Accuracy GPS</div>
                    </div>
                    <div className="toggle on"></div>
                  </div>
                  <div className="setting-item">
                    <span className="setting-icon">
                      <Shield aria-hidden="true" width={20} height={20} />
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">Prefer Safe Routes</div>
                    </div>
                    <div className="toggle on"></div>
                  </div>
                </div>
              </div>

              {/* Data & Privacy */}
              {isAuthenticated && (
                <div className="section">
                  <div className="section-header">
                    <Shield className="section-header-icon" width={16} height={16} aria-hidden="true" />
                    Data & Privacy
                  </div>
                  <div className="settings-list">
                    <button
                      className="setting-item clickable"
                      onClick={async () => {
                        const blob = await trackingService.exportData();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'pathmap-data.json';
                        a.click();
                      }}
                    >
                      <span className="setting-icon">
                        <Download aria-hidden="true" width={20} height={20} />
                      </span>
                      <div className="setting-info">
                        <div className="setting-name">Export My Data</div>
                      </div>
                      <ChevronRight width={20} height={20} aria-hidden="true" />
                    </button>
                    <button
                      className="setting-item clickable danger"
                      onClick={async () => {
                        if (confirm('Are you sure? This will delete ALL your data permanently.')) {
                          await trackingService.deleteAllData();
                        }
                      }}
                    >
                      <span className="setting-icon">
                        <Trash2 width={20} height={20} aria-hidden="true" />
                      </span>
                      <div className="setting-info">
                        <div className="setting-name setting-name--danger">Delete All Data</div>
                      </div>
                      <ChevronRight width={20} height={20} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              {/* Legacy device diagnostics removed from UI */}
              <div className="section" hidden>
                <div className="section-header">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    className="section-header-icon"
                  >
                    <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" />
                  </svg>
                  Device Info
                </div>
                <div className="settings-list">
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#0066FF">
                        <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
                      </svg>
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">{universalDevice?.name || 'Detecting...'}</div>
                      <div className="setting-detail">
                        {universalDevice?.os} | {universalDevice?.browser}
                      </div>
                    </div>
                    <span className="status-badge granted">{universalDevice?.type || '...'}</span>
                  </div>
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#0066FF">
                        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06z" />
                      </svg>
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">
                        GPS: {universalDevice?.capabilities?.hasGPS ? 'Yes' : 'No'} | Compass:{' '}
                        {universalDevice?.capabilities?.hasCompass ? 'Yes' : 'No'}
                      </div>
                      <div className="setting-detail">
                        Touch: {universalDevice?.capabilities?.hasTouchscreen ? 'Yes' : 'No'} |
                        Battery: {universalDevice?.capabilities?.batteryLevel || 100}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="section" hidden>
                <div className="section-header">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    className="section-header-icon"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                  GNSS Satellites
                </div>
                <div className="settings-list satellite-grid">
                  <div className="sat-row">
                    <div className="sat-item">
                      <div className="sat-name">GPS</div>
                      <div className="sat-count">
                        {
                          satelliteData.satellites.filter(s => s.constellation === 'GPS' && s.used)
                            .length
                        }
                        /{satelliteData.satellites.filter(s => s.constellation === 'GPS').length}
                      </div>
                    </div>
                    <div className="sat-item">
                      <div className="sat-name">GLONASS</div>
                      <div className="sat-count">
                        {
                          satelliteData.satellites.filter(
                            s => s.constellation === 'GLONASS' && s.used
                          ).length
                        }
                        /
                        {satelliteData.satellites.filter(s => s.constellation === 'GLONASS').length}
                      </div>
                    </div>
                  </div>
                  <div className="sat-row">
                    <div className="sat-item">
                      <div className="sat-name">Galileo</div>
                      <div className="sat-count">
                        {
                          satelliteData.satellites.filter(
                            s => s.constellation === 'Galileo' && s.used
                          ).length
                        }
                        /
                        {satelliteData.satellites.filter(s => s.constellation === 'Galileo').length}
                      </div>
                    </div>
                    <div className="sat-item">
                      <div className="sat-name">BeiDou</div>
                      <div className="sat-count">
                        {
                          satelliteData.satellites.filter(
                            s => s.constellation === 'BeiDou' && s.used
                          ).length
                        }
                        /{satelliteData.satellites.filter(s => s.constellation === 'BeiDou').length}
                      </div>
                    </div>
                  </div>
                  {satelliteData.position && (
                    <div className="sat-status">
                      <span>Fix: {satelliteData.position.fixType}</span>
                      <span>HDOP: {satelliteData.position.hdop.toFixed(1)}</span>
                      <span>Quality: {satelliteData.position.fixQuality}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="section" hidden>
                <div className="section-header">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    className="section-header-icon"
                  >
                    <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z" />
                  </svg>
                  Connected Hardware
                </div>
                <div className="settings-list">
                  {connectedHardware.length === 0 ? (
                    <EmptyState
                      title="No hardware connected"
                      message="Connect Bluetooth GPS, serial GPS, or smart devices when you are ready to enrich navigation data."
                      icon={
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                          <path d="M17.71 7.71 12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" />
                        </svg>
                      }
                    />
                  ) : (
                    connectedHardware.map(device => (
                      <div key={device.id} className="setting-item">
                        <span className="setting-icon">
                          <svg
                            viewBox="0 0 24 24"
                            width="20"
                            height="20"
                            fill={device.status === 'connected' ? '#0066FF' : '#666'}
                          >
                            <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" />
                          </svg>
                        </span>
                        <div className="setting-info">
                          <div className="setting-name">{device.name}</div>
                          <div className="setting-detail">
                            {device.type} via {device.connectionType}
                          </div>
                        </div>
                        <span
                          className={`status-badge ${device.status === 'connected' ? 'granted' : ''}`}
                        >
                          {device.status}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="hardware-buttons">
                    <button
                      className="add-btn"
                      onClick={async () => {
                        try {
                          await embeddedBridge.connectBluetoothGPS();
                        } catch (e) {
                          console.log('Bluetooth GPS:', e);
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" />
                      </svg>
                      Bluetooth GPS
                    </button>
                    <button
                      className="add-btn"
                      onClick={async () => {
                        try {
                          await embeddedBridge.connectSerialGPS();
                        } catch (e) {
                          console.log('Serial GPS:', e);
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14z" />
                      </svg>
                      Serial GPS
                    </button>
                    <button
                      className="add-btn"
                      onClick={async () => {
                        try {
                          await embeddedBridge.connectSmartDevice('homepod');
                        } catch (e) {
                          console.log('HomePod:', e);
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
                      </svg>
                      HomePod
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Plans Modal */}
      {showPlans && (
        <div className="modal-overlay" onClick={() => setShowPlans(false)}>
          <div className="modal-content plans-modal" onClick={e => e.stopPropagation()}>
            <button
              className="modal-close"
              title="Close"
              aria-label="Close plans"
              onClick={() => setShowPlans(false)}
            >
              <X width={22} height={22} aria-hidden="true" />
            </button>
            <h2 className="modal-title">Plans</h2>
            <p className="modal-subtitle">
              PathMap is commercial software. Local use is free; production, resale, or hosted access
              needs a paid plan.
            </p>
            <div className="plans-grid">
              {(
                [
                  {
                    id: 'starter',
                    price: '$19',
                    cadence: 'per seat / mo',
                    features: ['Up to 5 devices', 'Encrypted live map', 'Community support'],
                  },
                  {
                    id: 'pro',
                    price: '$49',
                    cadence: 'per seat / mo',
                    features: ['Up to 25 devices', 'Priority workflows', 'Commercial license'],
                  },
                  {
                    id: 'enterprise',
                    price: 'Custom',
                    cadence: 'annual',
                    features: ['Unlimited devices', 'Private deployment', 'Dedicated support'],
                  },
                ] as Array<{
                  id: BillingPlan;
                  price: string;
                  cadence: string;
                  features: string[];
                }>
              ).map(plan => (
                <button
                  key={plan.id}
                  className={`plan-card ${prefs.billingPlan === plan.id ? 'active' : ''}`}
                  onClick={() => setPref('billingPlan', plan.id)}
                >
                  <span className="plan-name">{PLAN_LABEL[plan.id]}</span>
                  <span className="plan-price">
                    {plan.price}
                    <em>{plan.cadence}</em>
                  </span>
                  <span className="plan-features">
                    {plan.features.map(f => (
                      <span key={f}>
                        <Check width={13} height={13} aria-hidden="true" />
                        {f}
                      </span>
                    ))}
                  </span>
                  <span className="plan-badge">
                    {prefs.billingPlan === plan.id ? 'Current plan' : 'Choose'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {authScreen !== 'none' && (
        <div className="modal-overlay" onClick={() => setAuthScreen('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button
              className="modal-close"
              title="Close dialog"
              aria-label="Close dialog"
              onClick={() => setAuthScreen('none')}
            >
              <X width={24} height={24} aria-hidden="true" />
            </button>

            {authScreen === 'login' ? (
              <>
                <h2 className="modal-title">Sign In</h2>
                <p className="modal-subtitle">Access your devices and tracking data</p>

                {authError && <div className="auth-error">{authError}</div>}

                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <button className="btn-primary full" onClick={handleLogin} disabled={authLoading}>
                  {authLoading ? 'Signing in...' : 'Sign In'}
                </button>

                <p className="auth-switch">
                  Don't have an account?{' '}
                  <button onClick={() => setAuthScreen('register')}>Create one</button>
                </p>
              </>
            ) : (
              <>
                <h2 className="modal-title">Create Account</h2>
                <p className="modal-subtitle">Start tracking your devices securely</p>

                {authError && <div className="auth-error">{authError}</div>}

                <div className="form-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={registerName}
                    onChange={e => setRegisterName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={e => setRegisterEmail(e.target.value)}
                    placeholder="your@email.com"
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={registerPassword}
                    onChange={e => setRegisterPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  className="btn-primary full"
                  onClick={handleRegister}
                  disabled={authLoading}
                >
                  {authLoading ? 'Creating...' : 'Create Account'}
                </button>

                <p className="auth-switch">
                  Already have an account?{' '}
                  <button onClick={() => setAuthScreen('login')}>Sign in</button>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Geofence Form Modal */}
      {showGeofenceForm && (
        <GeofenceForm
          onClose={() => setShowGeofenceForm(false)}
          onCreate={async fence => {
            try {
              const created = await trackingService.createGeofence(fence);
              setGeofences(prev => [...prev, created]);
              setShowGeofenceForm(false);
            } catch (err) {
              console.error('Failed to create geofence:', err);
            }
          }}
          currentLocation={deviceData?.location}
        />
      )}

      {/* FAB */}
      <button
        className="fab"
        title={tracking ? 'Focus current tracking target' : 'Start quick tracking'}
        aria-label={tracking ? 'Focus current tracking target' : 'Start quick tracking'}
        onClick={() => devices[0] && startTracking(devices[0])}
      >
        {tracking ? (
          <Crosshair width={24} height={24} aria-hidden="true" />
        ) : (
          <MapPin width={24} height={24} aria-hidden="true" />
        )}
      </button>
      <ToastStack messages={messages} onDismiss={dismiss} />
      <CommandPalette />
      <TelemetryHUD />
      <CommandCenter targets={mapTargets} activeTarget={activeTarget} route={aiRoute} />
      <FeedbackBox />
    </div>
  );
}

// Geofence Form Component
interface GeofenceFormProps {
  onClose: () => void;
  onCreate: (fence: Omit<Geofence, 'id' | 'created_at'>) => void;
  currentLocation?: { lat: number; lng: number };
}

function GeofenceForm({ onClose, onCreate, currentLocation }: GeofenceFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Geofence['type']>('home');
  const [radius, setRadius] = useState(100);
  const [lat, setLat] = useState(currentLocation?.lat || 0);
  const [lng, setLng] = useState(currentLocation?.lng || 0);

  useEffect(() => {
    if (currentLocation) {
      setLat(currentLocation.lat);
      setLng(currentLocation.lng);
    }
  }, [currentLocation]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({
      name,
      type,
      lat,
      lng,
      radius,
      notify_on_enter: true,
      notify_on_exit: true,
      active: true,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button
          className="modal-close"
          title="Close dialog"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X width={24} height={24} aria-hidden="true" />
        </button>

        <h2 className="modal-title">Add Safe Zone</h2>
        <p className="modal-subtitle">Get alerts when devices enter or leave this area</p>

        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Home, Work, School..."
          />
        </div>

        <div className="form-group">
          <label>Type</label>
          <div className="type-selector">
            {(['home', 'work', 'safe', 'alert'] as const).map(t => (
              <button
                key={t}
                className={`type-btn ${type === t ? 'active' : ''}`}
                onClick={() => setType(t)}
              >
                {t === 'home' && (
                  <HomeIcon aria-hidden="true" width={20} height={20} />
                )}
                {t === 'work' && (
                  <Briefcase aria-hidden="true" width={20} height={20} />
                )}
                {t === 'safe' && (
                  <Shield aria-hidden="true" width={20} height={20} />
                )}
                {t === 'alert' && (
                  <AlertTriangle aria-hidden="true" width={20} height={20} />
                )}
                <span>{t}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="safe-zone-radius">Radius: {radius}m</label>
          <input
            id="safe-zone-radius"
            type="range"
            min="50"
            max="1000"
            step="50"
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="safe-zone-lat">Latitude</label>
            <input
              id="safe-zone-lat"
              type="number"
              step="0.000001"
              value={lat}
              onChange={e => setLat(Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="safe-zone-lng">Longitude</label>
            <input
              id="safe-zone-lng"
              type="number"
              step="0.000001"
              value={lng}
              onChange={e => setLng(Number(e.target.value))}
            />
          </div>
        </div>

        <button className="btn-primary full" onClick={handleSubmit} disabled={!name.trim()}>
          Create Safe Zone
        </button>
      </div>
    </div>
  );
}
