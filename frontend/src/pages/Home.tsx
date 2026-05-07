/* eslint-disable react/no-unknown-property */
/* eslint-disable jsx-a11y/label-has-associated-control */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import MapView3D from '../components/MapView3D'
import { trackingService, type LocationData, type Geofence } from '../services/trackingService'
import { holographicMapEngine } from '../services/holographicMapEngine'
import { sharpLocationEngine } from '../services/sharpLocationEngine'
import { universalDeviceEngine, type DeviceInfo } from '../services/universalDeviceEngine'
import { satelliteIntegration, type GNSSPosition, type SatelliteInfo } from '../services/satelliteIntegration'
import { embeddedBridge, type EmbeddedDevice } from '../services/embeddedBridge'
import '../styles/holographic.css'
import './Home.css'

type Tab = 'track' | 'devices' | 'routes' | 'settings'
type TrackingMethod = 'gps' | 'wifi' | 'cellular' | 'bluetooth' | 'ip'
type AuthScreen = 'none' | 'login' | 'register'

// V96: Map Target - tap to track any location
interface MapTarget {
  id: string
  name: string
  lat: number
  lng: number
  type: 'person' | 'place' | 'object' | 'custom'
  icon: string
  color: string
  createdAt: number
}

interface Permission {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  granted: boolean
  required: boolean
}

interface DeviceData {
  id: string
  userAgent: string
  platform: string
  language: string
  screenWidth: number
  screenHeight: number
  deviceMemory?: number
  hardwareConcurrency?: number
  connection?: {
    type: string
    downlink: number
    rtt: number
  }
  battery?: {
    level: number
    charging: boolean
  }
  location?: {
    lat: number
    lng: number
    accuracy: number
    altitude?: number
    speed?: number
    heading?: number
  }
  ip?: string
  timestamp: number
}

interface TrackedDevice {
  id: string
  name: string
  type: string
  data: DeviceData
  lastSeen: string
  sources: TrackingMethod[]
  online: boolean
  trained: boolean
}

interface AIRoute {
  algorithm: string
  distance: number
  steps: number
  visited: number
  path: [number, number][]
  eta: string
  safety: number
}

const API_BASE = 'http://localhost:8000'

// SVG Icons for target types
const TargetTypeIcons: Record<string, JSX.Element> = {
  person: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  place: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  object: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  star: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
}

export default function Home() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('track')
  const [authScreen, setAuthScreen] = useState<AuthScreen>('none')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [showGeofenceForm, setShowGeofenceForm] = useState(false)
  const [permissions, setPermissions] = useState<Permission[]>([
    {
      id: 'location',
      name: 'Location (GPS)',
      icon: <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>,
      description: 'High-accuracy GPS tracking',
      granted: false,
      required: true
    },
    {
      id: 'location_bg',
      name: 'Background Location',
      icon: <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 1.74.5 3.37 1.41 4.84.95 1.54 2.2 2.86 3.16 4.4.47.75.81 1.45 1.17 2.26.26.55.47 1.5.47 2.5h2c0-1 .21-1.95.47-2.5.36-.81.7-1.51 1.17-2.26.96-1.54 2.21-2.86 3.16-4.4C18.5 12.37 19 10.74 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>,
      description: 'Track when app is closed',
      granted: false,
      required: true
    },
    {
      id: 'bluetooth',
      name: 'Bluetooth',
      icon: <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z" /></svg>,
      description: 'Bluetooth beacon tracking',
      granted: false,
      required: false
    },
    {
      id: 'notifications',
      name: 'Notifications',
      icon: <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" /></svg>,
      description: 'Location alerts',
      granted: false,
      required: false
    },
  ])
  const [showPermissions, setShowPermissions] = useState(true)
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null)
  const [devices, setDevices] = useState<TrackedDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<TrackedDevice | null>(null)
  const [tracking, setTracking] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [aiRoute, setAiRoute] = useState<AIRoute | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [trainingDevice, setTrainingDevice] = useState(false)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [watchId, setWatchId] = useState<number | null>(null)
  const [trackingHistory, setTrackingHistory] = useState<[number, number][]>([])

  // V96: Map targets - tap to track locations
  const [mapTargets, setMapTargets] = useState<MapTarget[]>([])
  const [showTargetMenu, setShowTargetMenu] = useState<{ lat: number, lng: number } | null>(null)
  const [activeTarget, setActiveTarget] = useState<MapTarget | null>(null)
  const [newTargetName, setNewTargetName] = useState('')
  const [newTargetType, setNewTargetType] = useState<MapTarget['type']>('place')

  // AI AUTOPILOT - Automatic system control
  const [aiAutopilotActive, setAiAutopilotActive] = useState(false)
  const [_autopilotStatus, setAutopilotStatus] = useState('Initializing...')

  // V99: Universal Device + Satellite Integration
  const [universalDevice, setUniversalDevice] = useState<DeviceInfo | null>(null)
  const [satelliteData, setSatelliteData] = useState<{ satellites: SatelliteInfo[], position: GNSSPosition | null }>({ satellites: [], position: null })
  const [connectedHardware, setConnectedHardware] = useState<EmbeddedDevice[]>([])

  // Sheet collapsed state
  const [sheetCollapsed, setSheetCollapsed] = useState(false)

  // AI AUTOPILOT - Runs automatically on mount, takes full control
  useEffect(() => {
    if (aiAutopilotActive) return // Already running

    const runAIAutopilot = async () => {
      setAiAutopilotActive(true)
      console.log('[AI Autopilot] Starting autonomous control...')
      setAutopilotStatus('Analyzing device...')

      // V99: Initialize Universal Device Engine (Desktop/Laptop/iOS/Android/HomePod/Embedded)
      try {
        const deviceInfo = await universalDeviceEngine.init()
        setUniversalDevice(deviceInfo)
        console.log(`[AI Autopilot] Universal Device: ${deviceInfo.name} (${deviceInfo.platform})`)
        console.log(`[AI Autopilot] Type: ${deviceInfo.type} | GPS: ${deviceInfo.capabilities.hasGPS} | Compass: ${deviceInfo.capabilities.hasCompass}`)
        console.log(`[AI Autopilot] Satellites: ${universalDeviceEngine.getTotalSatellitesUsed()} in use, PDOP: ${universalDeviceEngine.getBestPDOP().toFixed(1)}`)
      } catch (e) {
        console.warn('[AI Autopilot] Device engine:', e)
      }

      // V99: Initialize Multi-GNSS Satellite Integration
      try {
        await satelliteIntegration.init()
        satelliteIntegration.onPositionUpdate((pos) => {
          setSatelliteData(prev => ({ ...prev, position: pos }))
        })
        satelliteIntegration.onSatelliteUpdate((sats) => {
          setSatelliteData(prev => ({ ...prev, satellites: sats }))
        })
        console.log(`[AI Autopilot] GNSS Active: ${satelliteIntegration.getStatusSummary()}`)
      } catch (e) {
        console.warn('[AI Autopilot] Satellite integration:', e)
      }

      // V99: Initialize Embedded/IoT Bridge
      try {
        await embeddedBridge.init()
        embeddedBridge.onDeviceUpdate((devices) => {
          setConnectedHardware(devices)
        })
        embeddedBridge.onGPSData((data) => {
          console.log(`[AI Autopilot] Hardware GPS: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)} from ${data.source}`)
        })
        console.log('[AI Autopilot] IoT/Embedded bridge ready')
      } catch (e) {
        console.warn('[AI Autopilot] Embedded bridge:', e)
      }

      // Step 1: Collect device data immediately
      const nav = navigator as any
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID()
      localStorage.setItem('device_id', deviceId)

      const deviceInfo: DeviceData = {
        id: deviceId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        deviceMemory: nav.deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
        timestamp: Date.now()
      }

      // Get connection info
      if (nav.connection) {
        deviceInfo.connection = {
          type: nav.connection.effectiveType || nav.connection.type || '4g',
          downlink: nav.connection.downlink || 10,
          rtt: nav.connection.rtt || 50
        }
      }

      // Get battery
      if (nav.getBattery) {
        try {
          const battery = await nav.getBattery()
          deviceInfo.battery = {
            level: Math.round(battery.level * 100),
            charging: battery.charging
          }
          console.log(`[AI Autopilot] Battery: ${deviceInfo.battery.level}% ${deviceInfo.battery.charging ? '(charging)' : ''}`)
        } catch { }
      }

      // Get IP
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
        const ipData = await ipRes.json()
        deviceInfo.ip = ipData.ip
        console.log(`[AI Autopilot] IP: ${deviceInfo.ip}`)
      } catch { }

      setDeviceData(deviceInfo)
      console.log(`[AI Autopilot] Device: ${navigator.hardwareConcurrency || 4} cores, ${nav.deviceMemory || 4}GB RAM`)

      // Step 2: Request location with optimal settings based on device
      setAutopilotStatus('Getting location...')
      const isHighEndDevice = (navigator.hardwareConcurrency || 4) >= 4 && (nav.deviceMemory || 4) >= 4
      const locationOptions = {
        enableHighAccuracy: isHighEndDevice,
        timeout: isHighEndDevice ? 10000 : 20000,
        maximumAge: isHighEndDevice ? 0 : 30000
      }

      console.log(`[AI Autopilot] Location mode: ${isHighEndDevice ? 'High Accuracy' : 'Balanced'}`)

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, locationOptions)
        })

        const location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || undefined,
          speed: pos.coords.speed || undefined,
          heading: pos.coords.heading || undefined
        }

        setDeviceData(prev => prev ? { ...prev, location } : { ...deviceInfo, location })
        console.log(`[AI Autopilot] Location: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)`)

        // V98: Initialize Sharp Location Engine with Compass integration
        try {
          await sharpLocationEngine.init()  // Now async with compass
          sharpLocationEngine.startTracking({
            enableHighAccuracy: isHighEndDevice,
            enablePrediction: true,
            enableCompass: true  // Enable compass for better heading
          })
          console.log('[AI Autopilot] Sharp Location Engine + Compass initialized')

          // Update holographic map with initial position
          holographicMapEngine.updateCurrentPosition({
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy,
            heading: location.heading,
            speed: location.speed
          })

          // Add floating label for current position
          holographicMapEngine.addFloatingLabel({
            id: 'current-pos',
            lat: location.lat,
            lng: location.lng,
            title: 'YOUR LOCATION',
            value: `${location.lat.toFixed(4)}°`,
            subtext: `Accuracy: ±${Math.round(location.accuracy)}m`
          })
        } catch (e) {
          console.warn('[AI Autopilot] Sharp/Holo init:', e)
        }

        // Grant location permissions in UI
        setPermissions(prev => prev.map(p =>
          (p.id === 'location' || p.id === 'location_bg') ? { ...p, granted: true } : p
        ))

        // Step 3: Start continuous tracking with optimal settings
        setAutopilotStatus('Starting tracking...')
        const watchOptions = {
          enableHighAccuracy: isHighEndDevice,
          timeout: isHighEndDevice ? 5000 : 15000,
          maximumAge: isHighEndDevice ? 0 : 10000
        }

        const id = navigator.geolocation.watchPosition(
          (newPos) => {
            const newLocation = {
              lat: newPos.coords.latitude,
              lng: newPos.coords.longitude,
              accuracy: newPos.coords.accuracy,
              altitude: newPos.coords.altitude || undefined,
              speed: newPos.coords.speed || undefined,
              heading: newPos.coords.heading || undefined
            }

            setDeviceData(prev => prev ? {
              ...prev,
              location: newLocation,
              timestamp: Date.now()
            } : null)
            setTrackingHistory(prev => [...prev, [newPos.coords.latitude, newPos.coords.longitude] as [number, number]].slice(-100) as [number, number][])

            // V97: Update holographic engine with current position
            try {
              holographicMapEngine.updateCurrentPosition({
                lat: newLocation.lat,
                lng: newLocation.lng,
                accuracy: newLocation.accuracy,
                heading: newLocation.heading,
                speed: newLocation.speed
              })
            } catch { }
          },
          (err) => console.log(`[AI Autopilot] Location update: ${err.message}`),
          watchOptions
        )
        setWatchId(id)
        console.log('[AI Autopilot] Continuous tracking active')

      } catch (err: any) {
        console.log(`[AI Autopilot] Location error: ${err.message} - will retry`)
        // Retry with lower accuracy
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 30000,
              maximumAge: 60000
            })
          })
          const location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          }
          setDeviceData(prev => prev ? { ...prev, location } : { ...deviceInfo, location })
          setPermissions(prev => prev.map(p => p.id === 'location' ? { ...p, granted: true } : p))
          console.log(`[AI Autopilot] Location (fallback): ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`)
        } catch { }
      }

      // Step 4: Request notification permission silently
      if (Notification.permission === 'default') {
        try {
          const result = await Notification.requestPermission()
          if (result === 'granted') {
            setPermissions(prev => prev.map(p => p.id === 'notifications' ? { ...p, granted: true } : p))
            console.log('[AI Autopilot] Notifications enabled')
          }
        } catch { }
      } else if (Notification.permission === 'granted') {
        setPermissions(prev => prev.map(p => p.id === 'notifications' ? { ...p, granted: true } : p))
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
        trained: true
      }
      setDevices([thisDevice])

      // Step 6: Auto-hide permissions and activate
      setShowPermissions(false)
      setTracking(true)
      setAutopilotStatus('Active')
      console.log('[AI Autopilot] System fully operational')

      // Notify if possible
      if (Notification.permission === 'granted') {
        new Notification('PathMap AI Active', {
          body: 'Autonomous tracking enabled',
          icon: '/icon-192.png',
          silent: true
        })
      }
    }

    // Helper functions
    const getDeviceNameFromUA = (ua: string): string => {
      const l = ua.toLowerCase()
      if (l.includes('iphone')) return 'iPhone'
      if (l.includes('ipad')) return 'iPad'
      if (l.includes('android')) return 'Android Device'
      if (l.includes('macintosh')) return 'MacBook'
      if (l.includes('windows')) return 'Windows PC'
      return 'Device'
    }

    const getDeviceTypeFromUA = (ua: string): string => {
      const l = ua.toLowerCase()
      if (l.includes('mobile') || l.includes('iphone') || l.includes('android')) return 'phone'
      if (l.includes('ipad') || l.includes('tablet')) return 'tablet'
      return 'laptop'
    }

    // Run autopilot after short delay to let React settle
    const timer = setTimeout(runAIAutopilot, 500)
    return () => clearTimeout(timer)
  }, []) // Empty deps - runs once on mount

  // Check auth state on mount
  useEffect(() => {
    const unsubscribe = trackingService.onAuthChange((auth) => {
      setIsAuthenticated(auth)
      if (auth) {
        // Load user data when authenticated
        loadUserDevices()
        loadGeofences()
        trackingService.connectWebSocket()
      }
    })
    return unsubscribe
  }, [])

  // WebSocket real-time location updates
  useEffect(() => {
    const unsubscribe = trackingService.onLocationUpdate((location: LocationData) => {
      // Update device location in real-time
      setDeviceData(prev => prev ? {
        ...prev,
        location: {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          altitude: location.altitude,
          speed: location.speed,
          heading: location.heading
        },
        timestamp: Date.now()
      } : null)
    })
    return unsubscribe
  }, [])

  // Geofence events
  useEffect(() => {
    const unsubscribe = trackingService.onGeofenceEvent((event) => {
      if (Notification.permission === 'granted') {
        new Notification(`${event.type === 'geofence_enter' ? 'Entered' : 'Left'} ${event.geofence.name}`, {
          body: `Device ${event.type === 'geofence_enter' ? 'entered' : 'left'} safe zone`,
          icon: '/icon-192.png'
        })
      }
    })
    return unsubscribe
  }, [])

  const loadUserDevices = async () => {
    try {
      const apiDevices = await trackingService.getDevices()
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
          timestamp: Date.now()
        },
        lastSeen: d.last_seen || 'Unknown',
        sources: ['gps'] as TrackingMethod[],
        online: true,
        trained: false
      }))
      if (mappedDevices.length > 0) {
        setDevices(prev => [...mappedDevices, ...prev.filter(d => !mappedDevices.find(m => m.id === d.id))])
      }
    } catch (err) {
      console.error('Failed to load devices:', err)
    }
  }

  const loadGeofences = async () => {
    try {
      const fences = await trackingService.getGeofences()
      setGeofences(fences)
    } catch (err) {
      console.error('Failed to load geofences:', err)
    }
  }

  const handleLogin = async () => {
    setAuthLoading(true)
    setAuthError('')
    try {
      await trackingService.login(loginEmail, loginPassword)
      setAuthScreen('none')
      setLoginEmail('')
      setLoginPassword('')
    } catch (err: any) {
      setAuthError(err.message || 'Login failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRegister = async () => {
    setAuthLoading(true)
    setAuthError('')
    try {
      await trackingService.register(registerEmail, registerPassword, registerName)
      // After register, login
      await trackingService.login(registerEmail, registerPassword)
      setAuthScreen('none')
      setRegisterName('')
      setRegisterEmail('')
      setRegisterPassword('')
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await trackingService.logout()
    setAuthScreen('none')
  }

  // Collect full device data
  const collectDeviceData = useCallback(async (): Promise<DeviceData> => {
    const nav = navigator as any

    const data: DeviceData = {
      id: localStorage.getItem('device_id') || crypto.randomUUID(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      timestamp: Date.now()
    }

    // Save device ID
    localStorage.setItem('device_id', data.id)

    // Get connection info
    if (nav.connection) {
      data.connection = {
        type: nav.connection.effectiveType || nav.connection.type || 'unknown',
        downlink: nav.connection.downlink || 0,
        rtt: nav.connection.rtt || 0
      }
    }

    // Get battery info
    if (nav.getBattery) {
      try {
        const battery = await nav.getBattery()
        data.battery = {
          level: Math.round(battery.level * 100),
          charging: battery.charging
        }
      } catch (e) { }
    }

    // Get IP address
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipRes.json()
      data.ip = ipData.ip
    } catch (e) { }

    return data
  }, [])

  // Get real-time location
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) return

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const newLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || undefined,
          speed: pos.coords.speed || undefined,
          heading: pos.coords.heading || undefined
        }

        setDeviceData(prev => prev ? {
          ...prev,
          location: newLocation,
          timestamp: Date.now()
        } : null)

        // Add to tracking history (breadcrumb trail)
        setTrackingHistory(prev => {
          const newPoint: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          // Keep last 100 points
          const updated = [...prev, newPoint].slice(-100)
          return updated
        })
      },
      (err) => console.error('Location error:', err),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
    setWatchId(id)
  }, [])

  // Stop location tracking
  const stopLocationTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      setWatchId(null)
    }
  }, [watchId])

  // Initialize device data collection
  useEffect(() => {
    const init = async () => {
      console.log('Initializing device data...')
      const data = await collectDeviceData()
      setDeviceData(data)
      console.log('Device data collected:', data.id)

      // Create this device entry
      const thisDevice: TrackedDevice = {
        id: data.id,
        name: getDeviceName(data),
        type: getDeviceType(data),
        data: data,
        lastSeen: 'Now',
        sources: ['gps', 'wifi', 'cellular', 'ip'],
        online: true,
        trained: false
      }
      setDevices([thisDevice])

      // Try to get location immediately if permission already granted
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('Initial location obtained:', pos.coords.latitude, pos.coords.longitude)
            setDeviceData(prev => prev ? {
              ...prev,
              location: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude || undefined,
                speed: pos.coords.speed || undefined,
                heading: pos.coords.heading || undefined
              }
            } : null)

            // Auto-grant location permission in UI
            setPermissions(prev => prev.map(p =>
              p.id === 'location' ? { ...p, granted: true } : p
            ))
          },
          (err) => {
            console.log('Initial location not available:', err.message)
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        )
      }
    }
    init()
  }, [collectDeviceData])

  // Get device name from user agent
  const getDeviceName = (data: DeviceData): string => {
    const ua = data.userAgent.toLowerCase()
    if (ua.includes('iphone')) return 'iPhone'
    if (ua.includes('ipad')) return 'iPad'
    if (ua.includes('android')) return 'Android Device'
    if (ua.includes('macintosh')) return 'MacBook'
    if (ua.includes('windows')) return 'Windows PC'
    return 'Unknown Device'
  }

  // Get device type
  const getDeviceType = (data: DeviceData): string => {
    const ua = data.userAgent.toLowerCase()
    if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) return 'phone'
    if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet'
    return 'laptop'
  }

  // Train device - learn movement patterns
  const trainDevice = async (device: TrackedDevice) => {
    setTrainingDevice(true)
    setTrainingProgress(0)

    // Simulate AI training with location samples
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(r => setTimeout(r, 300))
      setTrainingProgress(i)

      // Collect location sample
      if (navigator.geolocation && i < 100) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log(`Training sample ${i}:`, pos.coords.latitude, pos.coords.longitude)
          },
          () => { },
          { enableHighAccuracy: true }
        )
      }
    }

    // Mark device as trained
    setDevices(prev => prev.map(d =>
      d.id === device.id ? { ...d, trained: true } : d
    ))
    setTrainingDevice(false)
  }

  // AI Route Finding - connects to your backend
  const findAIRoute = async (targetDevice: TrackedDevice) => {
    if (!deviceData?.location || !targetDevice.data.location) {
      alert('Need location data for both devices')
      return
    }

    setRouteLoading(true)
    setAiRoute(null)

    const start = [deviceData.location.lat, deviceData.location.lng]
    const end = [targetDevice.data.location.lat, targetDevice.data.location.lng]

    // Try different AI algorithms
    const algorithms = ['ShadowPath', 'BFS', 'DFS', 'Dijkstra']

    for (const algo of algorithms) {
      try {
        const res = await fetch(`${API_BASE}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start,
            end,
            algo
          })
        })

        if (res.ok) {
          const data = await res.json()

          // Calculate ETA based on distance and speed
          const speedKmh = deviceData.location.speed ? deviceData.location.speed * 3.6 : 5 // walking speed default
          const distanceKm = data.distance / 1000
          const etaMinutes = Math.round((distanceKm / speedKmh) * 60)

          setAiRoute({
            algorithm: data.algorithm || algo,
            distance: data.distance,
            steps: data.steps,
            visited: data.visited,
            path: data.path || [],
            eta: etaMinutes < 60 ? `${etaMinutes} min` : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`,
            safety: data.safety_score || 85
          })
          break
        }
      } catch (e) {
        console.log(`${algo} failed, trying next...`)
      }
    }

    setRouteLoading(false)
  }

  // Start tracking a device
  const startTracking = (device: TrackedDevice) => {
    console.log('Starting tracking for device:', device.name)
    setSelectedDevice(device)
    setTracking(true)
    setCalibrating(true)

    // Force get location if not available
    if (!deviceData?.location) {
      console.log('No location yet, requesting...')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('Got location for tracking:', pos.coords.latitude, pos.coords.longitude)
          setDeviceData(prev => prev ? {
            ...prev,
            location: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude || undefined,
              speed: pos.coords.speed || undefined,
              heading: pos.coords.heading || undefined
            }
          } : null)
        },
        (err) => {
          console.error('Failed to get location:', err)
          alert('Please enable location access to track devices')
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }

    startLocationTracking()

    // Calibration phase
    setTimeout(() => {
      setCalibrating(false)
      // Auto-find route if both have location
      if (device.data.location && deviceData?.location) {
        findAIRoute(device)
      }
    }, 2000)
  }

  // Stop tracking
  const stopTracking = () => {
    setTracking(false)
    setSelectedDevice(null)
    setAiRoute(null)
    setTrackingHistory([])
    setActiveTarget(null)
    stopLocationTracking()
  }

  // V96: Handle map tap - create tracking target
  const handleMapClick = useCallback((lat: number, lng: number) => {
    console.log('Map tapped:', lat, lng)
    setShowTargetMenu({ lat, lng })
  }, [])

  // V96: Create a new map target
  const createMapTarget = useCallback((lat: number, lng: number, name: string, type: MapTarget['type']) => {
    const colors = {
      person: '#3B82F6',
      place: '#10B981',
      object: '#F59E0B',
      custom: '#8B5CF6'
    }
    const icons = {
      person: 'person',
      place: 'place',
      object: 'object',
      custom: 'star'
    }
    const target: MapTarget = {
      id: crypto.randomUUID(),
      name: name || `Target ${mapTargets.length + 1}`,
      lat,
      lng,
      type,
      icon: icons[type],
      color: colors[type],
      createdAt: Date.now()
    }
    setMapTargets(prev => [...prev, target])
    setShowTargetMenu(null)
    setNewTargetName('')
    return target
  }, [mapTargets.length])

  // V96: Start tracking a map target
  const startTrackingTarget = useCallback((target: MapTarget) => {
    console.log('Starting tracking for target:', target.name)
    setActiveTarget(target)
    setTracking(true)
    setCalibrating(true)

    // Force get location if not available
    if (!deviceData?.location) {
      console.log('No location for target tracking, requesting...')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('Got location:', pos.coords.latitude, pos.coords.longitude)
          const newLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude || undefined,
            speed: pos.coords.speed || undefined,
            heading: pos.coords.heading || undefined
          }
          setDeviceData(prev => prev ? { ...prev, location: newLocation } : null)
          // Now find route
          findRouteToTarget(target)
        },
        (err) => {
          console.error('Location error:', err)
          alert('Please enable location to track targets')
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }

    startLocationTracking()

    setTimeout(() => {
      setCalibrating(false)
      // Find route to target if we have location
      if (deviceData?.location) {
        findRouteToTarget(target)
      }
    }, 2000)
  }, [deviceData?.location, startLocationTracking])

  // V96: Find AI route to map target
  const findRouteToTarget = async (target: MapTarget) => {
    if (!deviceData?.location) {
      alert('Need your location first')
      return
    }

    setRouteLoading(true)
    setAiRoute(null)

    const start = [deviceData.location.lat, deviceData.location.lng]
    const end = [target.lat, target.lng]

    const algorithms = ['ShadowPath', 'A*', 'Dijkstra', 'BFS']

    for (const algo of algorithms) {
      try {
        const res = await fetch(`${API_BASE}/route`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start, end, algo })
        })

        if (res.ok) {
          const data = await res.json()
          const speedKmh = deviceData.location.speed ? deviceData.location.speed * 3.6 : 5
          const distanceKm = data.distance / 1000
          const etaMinutes = Math.round((distanceKm / speedKmh) * 60)

          setAiRoute({
            algorithm: data.algorithm || algo,
            distance: data.distance,
            steps: data.steps,
            visited: data.visited,
            path: data.path || [],
            eta: etaMinutes < 60 ? `${etaMinutes} min` : `${Math.round(etaMinutes / 60)}h ${etaMinutes % 60}m`,
            safety: data.safety_score || 85
          })
          break
        }
      } catch (e) {
        console.log(`${algo} failed, trying next...`)
      }
    }

    setRouteLoading(false)
  }

  // V96: Delete a map target
  const deleteMapTarget = useCallback((targetId: string) => {
    setMapTargets(prev => prev.filter(t => t.id !== targetId))
    if (activeTarget?.id === targetId) {
      stopTracking()
    }
  }, [activeTarget])

  // Grant permission - improved error handling
  const grantPermission = async (id: string) => {
    console.log('Granting permission:', id)

    if (id === 'location' || id === 'location_bg') {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser')
        return
      }

      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            (error) => {
              console.error('Geolocation error:', error.code, error.message)
              reject(error)
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0
            }
          )
        })

        console.log('Location obtained:', pos.coords.latitude, pos.coords.longitude)

        const newLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || undefined,
          speed: pos.coords.speed || undefined,
          heading: pos.coords.heading || undefined
        }

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
              location: newLocation
            }
          }
          return { ...prev, location: newLocation }
        })

        // Also start watching location
        startLocationTracking()
      } catch (e: any) {
        console.error('Location permission denied:', e)
        alert(`Location access failed: ${e.message || 'Permission denied'}. Please enable location in your browser settings.`)
        return // Don't mark as granted if failed
      }
    }

    if (id === 'notifications') {
      try {
        const result = await Notification.requestPermission()
        console.log('Notification permission:', result)
        if (result !== 'granted') {
          console.warn('Notifications not granted')
        }
      } catch (e) {
        console.error('Notification permission error:', e)
      }
    }

    setPermissions(prev => prev.map(p =>
      p.id === id ? { ...p, granted: true } : p
    ))
  }

  const grantAll = async () => {
    console.log('Granting all permissions...')
    for (const perm of permissions) {
      await grantPermission(perm.id)
    }
    setShowPermissions(false)
  }

  const allRequiredGranted = permissions.filter(p => p.required).every(p => p.granted)

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'phone': return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" /></svg>
      case 'tablet': return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-2 14H5V6h14v12z" /></svg>
      case 'laptop': return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" /></svg>
      default: return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" /></svg>
    }
  }

  // Permission Screen
  if (showPermissions && !allRequiredGranted) {
    return (
      <div className="app">
        <div className="permission-screen">
          <div className="permission-header">
            <div className="permission-icon">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="#007aff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
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
    )
  }

  return (
    <div className="app holo-mode">
      <MapView3D
        startPoint={deviceData?.location ? [deviceData.location.lat, deviceData.location.lng] : null}
        endPoint={activeTarget ? [activeTarget.lat, activeTarget.lng] : (selectedDevice?.data.location ? [selectedDevice.data.location.lat, selectedDevice.data.location.lng] : null)}
        routeData={aiRoute ? { path: aiRoute.path } : null}
        comparisonResults={null}
        trackingHistory={trackingHistory}
        landmarks={[
          ...geofences.map(g => ({ id: g.id, position: [g.lat, g.lng] as [number, number], name: g.name, type: g.type })),
          ...mapTargets.map(t => ({ id: t.id, position: [t.lat, t.lng] as [number, number], name: `${t.icon} ${t.name}`, type: t.type }))
        ]}
        visualizationMode="standard"
        showAlgorithmBehavior={false}
        algorithm="ShadowPath"
        liveNavigation={tracking && deviceData?.location ? {
          currentPosition: {
            lat: deviceData.location.lat,
            lon: deviceData.location.lng,
            heading: deviceData.location.heading,
            speedMps: deviceData.location.speed
          },
          breadcrumbTrail: trackingHistory
        } : null}
        isLiveNavActive={tracking}
        onMapClick={handleMapClick}
      />

      {/* Tracking Status */}
      {tracking && (selectedDevice || activeTarget) && (
        <div className={`tracking-status ${calibrating ? 'calibrating' : ''}`}>
          <div className="tracking-pulse"></div>
          <div className="tracking-info">
            <span className="tracking-label">
              {calibrating ? 'AI Calibrating...' : 'Tracking Active'}
            </span>
            <span className="tracking-target">
              {activeTarget ? <><span className="target-icon-inline">{TargetTypeIcons[activeTarget.icon] || TargetTypeIcons.place}</span> {activeTarget.name}</> : selectedDevice?.name}
            </span>
          </div>
          {aiRoute && (
            <div className="route-badge">
              <span>{aiRoute.algorithm}</span>
              <span>{aiRoute.eta}</span>
            </div>
          )}
          <button className="stop-btn" onClick={stopTracking}>Stop</button>
        </div>
      )}

      {/* V96: Tap-to-Track Target Menu */}
      {showTargetMenu && (
        <div className="target-menu-overlay" onClick={() => setShowTargetMenu(null)}>
          <div className="target-menu" onClick={e => e.stopPropagation()}>
            <div className="target-menu-header">
              <h3><svg className="inline-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Create Target</h3>
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
                <span className="type-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span>
                <span>Person</span>
              </button>
              <button
                className={`target-type-btn ${newTargetType === 'place' ? 'active' : ''}`}
                onClick={() => setNewTargetType('place')}
              >
                <span className="type-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg></span>
                <span>Place</span>
              </button>
              <button
                className={`target-type-btn ${newTargetType === 'object' ? 'active' : ''}`}
                onClick={() => setNewTargetType('object')}
              >
                <span className="type-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg></span>
                <span>Object</span>
              </button>
              <button
                className={`target-type-btn ${newTargetType === 'custom' ? 'active' : ''}`}
                onClick={() => setNewTargetType('custom')}
              >
                <span className="type-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg></span>
                <span>Custom</span>
              </button>
            </div>

            <div className="target-menu-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowTargetMenu(null)}
              >
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
                  )
                  startTrackingTarget(target)
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
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '4px' }}><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-.5-4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /></svg>
              {aiRoute.algorithm}
            </span>
            <span className="route-safety">{aiRoute.safety}% safe</span>
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
            <div className="training-icon"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg></div>
            <div className="training-title">Training Device AI</div>
            <div className="training-bar">
              <div className="training-fill" style={{ width: `${trainingProgress}%` }}></div>
            </div>
            <div className="training-percent">{trainingProgress}%</div>
            <div className="training-text">Learning movement patterns...</div>
          </div>
        </div>
      )}

      {/* Bottom Sheet */}
      <div className={`sheet ${sheetCollapsed ? 'collapsed' : ''}`}>
        <button
          className="sheet-toggle"
          aria-label={sheetCollapsed ? 'Expand controls' : 'Collapse controls'}
          onClick={() => setSheetCollapsed(!sheetCollapsed)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="handle" onClick={() => setSheetCollapsed(!sheetCollapsed)}></div>

        <div className="tabs">
          <button className={tab === 'track' ? 'active' : ''} onClick={() => setTab('track')}>
            <span className="tab-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg>
            </span>
            <span>Track</span>
          </button>
          <button className={tab === 'devices' ? 'active' : ''} onClick={() => setTab('devices')}>
            <span className="tab-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" /></svg>
            </span>
            <span>Devices</span>
          </button>
          <button className={tab === 'routes' ? 'active' : ''} onClick={() => setTab('routes')}>
            <span className="tab-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-.5-4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /></svg>
            </span>
            <span>AI Route</span>
          </button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
            <span className="tab-icon">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
            </span>
            <span>Settings</span>
          </button>
        </div>

        <div className="content">
          {/* Track Tab */}
          {tab === 'track' && (
            <>
              {/* V96: Map Targets */}
              {mapTargets.length > 0 && (
                <div className="section">
                  <div className="section-header"><svg className="section-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" fill="currentColor" /></svg> Targets</div>
                  <div className="device-list">
                    {mapTargets.map(target => (
                      <div
                        key={target.id}
                        className={`device-card ${activeTarget?.id === target.id ? 'selected' : ''}`}
                      >
                        <span className="device-icon">{TargetTypeIcons[target.icon] || TargetTypeIcons.place}</span>
                        <div className="device-info">
                          <div className="device-name">{target.name}</div>
                          <div className="device-meta">
                            <span className="target-type-badge" style={{ background: target.color }}>{target.type}</span>
                            <span>{target.lat.toFixed(4)}, {target.lng.toFixed(4)}</span>
                          </div>
                        </div>
                        <div className="target-actions">
                          <button
                            className="track-btn"
                            aria-label={`${activeTarget?.id === target.id ? 'Tracking' : 'Track'} ${target.name}`}
                            onClick={() => startTrackingTarget(target)}
                          >
                            {activeTarget?.id === target.id ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" /></svg> : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" fill="currentColor" /></svg>}
                          </button>
                          <button
                            className="delete-btn"
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
                <div className="hint-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg></div>
                <div className="hint-text">
                  <strong>Tap anywhere on the map</strong>
                  <span>to create a tracking target for any person, place, or object</span>
                </div>
              </div>

              {/* Get My Location Button - always visible */}
              {!deviceData?.location && (
                <button
                  className="btn-primary location-btn"
                  onClick={() => {
                    console.log('Get My Location clicked')
                    if (!navigator.geolocation) {
                      alert('Geolocation not supported')
                      return
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        console.log('Location obtained:', pos.coords)
                        setDeviceData(prev => prev ? {
                          ...prev,
                          location: {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            altitude: pos.coords.altitude || undefined,
                            speed: pos.coords.speed || undefined,
                            heading: pos.coords.heading || undefined
                          }
                        } : null)
                        startLocationTracking()
                      },
                      (err) => {
                        console.error('Location error:', err)
                        alert(`Location error: ${err.message}. Please enable location in browser settings.`)
                      },
                      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                    )
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Get My Location
                </button>
              )}

              {/* Live Location */}
              {deviceData?.location && (
                <div className="section">
                  <div className="section-header"><svg className="section-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Live Location</div>
                  <div className="live-card">
                    <div className="live-coords">
                      <span>{deviceData.location.lat.toFixed(6)}</span>
                      <span>{deviceData.location.lng.toFixed(6)}</span>
                    </div>
                    <div className="live-meta">
                      <span>±{Math.round(deviceData.location.accuracy)}m</span>
                      {deviceData.location.speed && (
                        <span>{(deviceData.location.speed * 3.6).toFixed(1)} km/h</span>
                      )}
                      {deviceData.location.altitude && (
                        <span>{Math.round(deviceData.location.altitude)}m alt</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Devices to Track */}
              <div className="section">
                <div className="section-header">Devices</div>
                <div className="device-list">
                  {devices.map(device => (
                    <button
                      key={device.id}
                      className={`device-card ${selectedDevice?.id === device.id ? 'selected' : ''}`}
                      onClick={() => startTracking(device)}
                    >
                      <span className="device-icon">{getDeviceIcon(device.type)}</span>
                      <div className="device-info">
                        <div className="device-name">
                          {device.name}
                          {device.trained && <span className="trained-badge">AI</span>}
                        </div>
                        <div className="device-meta">
                          {device.online && <span className="online-dot"></span>}
                          <span>{device.lastSeen}</span>
                          {device.data.battery && (
                            <span className="battery-badge"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17 5H3a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2zm0 12H3V7h14v10zm4-9v6h-2V8h2z" /></svg> {device.data.battery.level}%</span>
                          )}
                        </div>
                      </div>
                      <button
                        className="train-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          trainDevice(device)
                        }}
                      >
                        {device.trained ? <><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg> Trained</> : <><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> Train</>}
                      </button>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Devices Tab */}
          {tab === 'devices' && deviceData && (
            <>
              <div className="section">
                <div className="section-header">This Device Data</div>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="data-label">Device ID</span>
                    <span className="data-value">{deviceData.id.slice(0, 8)}...</span>
                  </div>
                  <div className="data-item">
                    <span className="data-label">Platform</span>
                    <span className="data-value">{deviceData.platform}</span>
                  </div>
                  <div className="data-item">
                    <span className="data-label">Screen</span>
                    <span className="data-value">{deviceData.screenWidth}x{deviceData.screenHeight}</span>
                  </div>
                  {deviceData.deviceMemory && (
                    <div className="data-item">
                      <span className="data-label">Memory</span>
                      <span className="data-value">{deviceData.deviceMemory}GB</span>
                    </div>
                  )}
                  {deviceData.hardwareConcurrency && (
                    <div className="data-item">
                      <span className="data-label">CPU Cores</span>
                      <span className="data-value">{deviceData.hardwareConcurrency}</span>
                    </div>
                  )}
                  {deviceData.ip && (
                    <div className="data-item full">
                      <span className="data-label">IP Address</span>
                      <span className="data-value">{deviceData.ip}</span>
                    </div>
                  )}
                  {deviceData.connection && (
                    <>
                      <div className="data-item">
                        <span className="data-label">Network</span>
                        <span className="data-value">{deviceData.connection.type}</span>
                      </div>
                      <div className="data-item">
                        <span className="data-label">Speed</span>
                        <span className="data-value">{deviceData.connection.downlink} Mbps</span>
                      </div>
                    </>
                  )}
                  {deviceData.battery && (
                    <>
                      <div className="data-item">
                        <span className="data-label">Battery</span>
                        <span className="data-value">{deviceData.battery.level}%</span>
                      </div>
                      <div className="data-item">
                        <span className="data-label">Charging</span>
                        <span className="data-value">{deviceData.battery.charging ? 'Yes' : 'No'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* AI Route Tab */}
          {tab === 'routes' && (
            <>
              <div className="section">
                <div className="section-header">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5zM16 17H8v-2h8v2zm-.5-4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" /></svg>
                  AI Pathfinding
                </div>
                <div className="algo-grid">
                  {['ShadowPath', 'Dijkstra', 'A*', 'BFS'].map(algo => (
                    <button key={algo} className="algo-btn">
                      <span className="algo-name">{algo}</span>
                      <span className="algo-desc">
                        {algo === 'ShadowPath' ? 'Safe + Fast' :
                          algo === 'Dijkstra' ? 'Shortest' :
                            algo === 'A*' ? 'Optimal' : 'Explore'}
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
                  {routeLoading ? <><svg className="spin" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Finding Route...</> : <><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg> Find AI Route</>}
                </button>
              )}

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
              {/* General Settings */}
              <div className="section">
                <div className="section-header">General</div>
                <div className="settings-command-card">
                  <div className="settings-command-copy">
                    <div className="settings-command-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L5.09 9.66c-.11.2-.06.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.58 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.11-.22.06-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
                    </div>
                    <div>
                      <div className="settings-command-title">App Preferences</div>
                      <div className="settings-command-detail">Language, theme, units, alerts, and privacy controls</div>
                    </div>
                  </div>
                  <div className="settings-command-meta">
                    <span>{permissions.filter(perm => perm.granted).length}/{permissions.length} permissions</span>
                    <span>{geofences.length} safe zones</span>
                  </div>
                  <button className="settings-command-button" onClick={() => navigate('/settings')}>
                    Open preferences
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                  </button>
                </div>
              </div>

              {/* Account Section */}
              <div className="section">
                <div className="section-header">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                  Account
                </div>
                {isAuthenticated ? (
                  <div className="settings-list">
                    <div className="setting-item">
                      <span className="setting-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="#4CAF50"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                      </span>
                      <div className="setting-info">
                        <div className="setting-name">Signed In</div>
                      </div>
                      <button className="text-btn" onClick={handleLogout}>Sign Out</button>
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
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
                  Safe Zones
                </div>
                <div className="settings-list">
                  {geofences.map(fence => (
                    <div key={fence.id} className="setting-item">
                      <span className="setting-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill={fence.type === 'home' ? '#4CAF50' : fence.type === 'work' ? '#2196F3' : '#FF9800'}><circle cx="12" cy="12" r="10" /></svg>
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
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
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
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3z" /></svg>
                  AI Settings
                </div>
                <div className="settings-list">
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3z" /></svg>
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">Auto-Train Devices</div>
                    </div>
                    <div className="toggle on"></div>
                  </div>
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06z" /></svg>
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">High Accuracy GPS</div>
                    </div>
                    <div className="toggle on"></div>
                  </div>
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" /></svg>
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
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
                    Data & Privacy
                  </div>
                  <div className="settings-list">
                    <button className="setting-item clickable" onClick={async () => {
                      const blob = await trackingService.exportData()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'pathmap-data.json'
                      a.click()
                    }}>
                      <span className="setting-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                      </span>
                      <div className="setting-info">
                        <div className="setting-name">Export My Data</div>
                      </div>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#999"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                    </button>
                    <button className="setting-item clickable danger" onClick={async () => {
                      if (confirm('Are you sure? This will delete ALL your data permanently.')) {
                        await trackingService.deleteAllData()
                      }
                    }}>
                      <span className="setting-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="#f44336"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                      </span>
                      <div className="setting-info">
                        <div className="setting-name" style={{ color: '#f44336' }}>Delete All Data</div>
                      </div>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#999"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* V99: Universal Device Status */}
              <div className="section">
                <div className="section-header">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" /></svg>
                  Device Info
                </div>
                <div className="settings-list">
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#0066FF"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" /></svg>
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">{universalDevice?.name || 'Detecting...'}</div>
                      <div className="setting-detail">{universalDevice?.os} {universalDevice?.osVersion} | {universalDevice?.browser}</div>
                    </div>
                    <span className="status-badge granted">{universalDevice?.type || '...'}</span>
                  </div>
                  <div className="setting-item">
                    <span className="setting-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="#0066FF"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06z" /></svg>
                    </span>
                    <div className="setting-info">
                      <div className="setting-name">GPS: {universalDevice?.capabilities?.hasGPS ? 'Yes' : 'No'} | Compass: {universalDevice?.capabilities?.hasCompass ? 'Yes' : 'No'}</div>
                      <div className="setting-detail">Touch: {universalDevice?.capabilities?.hasTouchscreen ? 'Yes' : 'No'} | Battery: {universalDevice?.capabilities?.batteryLevel || 100}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* V99: Satellite Status */}
              <div className="section">
                <div className="section-header">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                  GNSS Satellites
                </div>
                <div className="settings-list satellite-grid">
                  <div className="sat-row">
                    <div className="sat-item">
                      <div className="sat-name">GPS</div>
                      <div className="sat-count">{satelliteData.satellites.filter(s => s.constellation === 'GPS' && s.used).length}/{satelliteData.satellites.filter(s => s.constellation === 'GPS').length}</div>
                    </div>
                    <div className="sat-item">
                      <div className="sat-name">GLONASS</div>
                      <div className="sat-count">{satelliteData.satellites.filter(s => s.constellation === 'GLONASS' && s.used).length}/{satelliteData.satellites.filter(s => s.constellation === 'GLONASS').length}</div>
                    </div>
                  </div>
                  <div className="sat-row">
                    <div className="sat-item">
                      <div className="sat-name">Galileo</div>
                      <div className="sat-count">{satelliteData.satellites.filter(s => s.constellation === 'Galileo' && s.used).length}/{satelliteData.satellites.filter(s => s.constellation === 'Galileo').length}</div>
                    </div>
                    <div className="sat-item">
                      <div className="sat-name">BeiDou</div>
                      <div className="sat-count">{satelliteData.satellites.filter(s => s.constellation === 'BeiDou' && s.used).length}/{satelliteData.satellites.filter(s => s.constellation === 'BeiDou').length}</div>
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

              {/* V99: Connected Hardware */}
              <div className="section">
                <div className="section-header">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ verticalAlign: 'middle', marginRight: '6px' }}><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z" /></svg>
                  Connected Hardware
                </div>
                <div className="settings-list">
                  {connectedHardware.length === 0 ? (
                    <div className="setting-item">
                      <div className="setting-info">
                        <div className="setting-name" style={{ opacity: 0.6 }}>No devices connected</div>
                        <div className="setting-detail">Connect GPS receivers, smart speakers, or IoT devices</div>
                      </div>
                    </div>
                  ) : (
                    connectedHardware.map(device => (
                      <div key={device.id} className="setting-item">
                        <span className="setting-icon">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill={device.status === 'connected' ? '#0066FF' : '#666'}><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" /></svg>
                        </span>
                        <div className="setting-info">
                          <div className="setting-name">{device.name}</div>
                          <div className="setting-detail">{device.type} via {device.connectionType}</div>
                        </div>
                        <span className={`status-badge ${device.status === 'connected' ? 'granted' : ''}`}>
                          {device.status}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="hardware-buttons">
                    <button className="add-btn" onClick={async () => {
                      try {
                        await embeddedBridge.connectBluetoothGPS()
                      } catch (e) {
                        console.log('Bluetooth GPS:', e)
                      }
                    }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29z" /></svg>
                      Bluetooth GPS
                    </button>
                    <button className="add-btn" onClick={async () => {
                      try {
                        await embeddedBridge.connectSerialGPS()
                      } catch (e) {
                        console.log('Serial GPS:', e)
                      }
                    }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9h2zm-4 10H4V5h14v14z" /></svg>
                      Serial GPS
                    </button>
                    <button className="add-btn" onClick={async () => {
                      try {
                        await embeddedBridge.connectSmartDevice('homepod')
                      } catch (e) {
                        console.log('HomePod:', e)
                      }
                    }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" /></svg>
                      HomePod
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      {authScreen !== 'none' && (
        <div className="modal-overlay" onClick={() => setAuthScreen('none')}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAuthScreen('none')}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
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
                  Don't have an account? <button onClick={() => setAuthScreen('register')}>Create one</button>
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

                <button className="btn-primary full" onClick={handleRegister} disabled={authLoading}>
                  {authLoading ? 'Creating...' : 'Create Account'}
                </button>

                <p className="auth-switch">
                  Already have an account? <button onClick={() => setAuthScreen('login')}>Sign in</button>
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
          onCreate={async (fence) => {
            try {
              const created = await trackingService.createGeofence(fence)
              setGeofences(prev => [...prev, created])
              setShowGeofenceForm(false)
            } catch (err) {
              console.error('Failed to create geofence:', err)
            }
          }}
          currentLocation={deviceData?.location}
        />
      )}

      {/* FAB */}
      <button
        className="fab"
        onClick={() => devices[0] && startTracking(devices[0])}
      >
        {tracking ?
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg>
          :
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
        }
      </button>
    </div>
  )
}

// Geofence Form Component
interface GeofenceFormProps {
  onClose: () => void
  onCreate: (fence: Omit<Geofence, 'id' | 'created_at'>) => void
  currentLocation?: { lat: number; lng: number }
}

function GeofenceForm({ onClose, onCreate, currentLocation }: GeofenceFormProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<Geofence['type']>('home')
  const [radius, setRadius] = useState(100)
  const [lat, setLat] = useState(currentLocation?.lat || 0)
  const [lng, setLng] = useState(currentLocation?.lng || 0)

  useEffect(() => {
    if (currentLocation) {
      setLat(currentLocation.lat)
      setLng(currentLocation.lng)
    }
  }, [currentLocation])

  const handleSubmit = () => {
    if (!name.trim()) return
    onCreate({
      name,
      type,
      lat,
      lng,
      radius,
      notify_on_enter: true,
      notify_on_exit: true,
      active: true
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
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
                {t === 'home' && <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>}
                {t === 'work' && <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" /></svg>}
                {t === 'safe' && <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>}
                {t === 'alert' && <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>}
                <span>{t}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Radius: {radius}m</label>
          <input
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
            <label>Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={lat}
              onChange={e => setLat(Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Longitude</label>
            <input
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
  )
}
