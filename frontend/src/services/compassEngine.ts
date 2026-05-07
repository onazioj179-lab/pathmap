/**
 * PATHMAP V98 — COMPASS ENGINE
 * 
 * Integrates phone compass/magnetometer for precise heading:
 * - DeviceOrientationEvent for compass heading
 * - DeviceMotionEvent for movement detection
 * - Gyroscope for rotation tracking
 * - Accelerometer for tilt compensation
 * - Automatic calibration and balance
 * 
 * @version 1.0.0
 * @author PathMap AI
 */

export interface CompassData {
    heading: number           // 0-360 degrees (0 = North)
    accuracy: number          // Compass accuracy in degrees
    tilt: { alpha: number; beta: number; gamma: number }  // Device orientation
    acceleration: { x: number; y: number; z: number }     // Movement
    isMoving: boolean         // Motion detection
    isCalibrated: boolean     // Calibration status
    magneticDeclination: number  // Local magnetic declination
    timestamp: number
}

interface CalibrationData {
    samples: number[]
    minHeading: number
    maxHeading: number
    isComplete: boolean
    accuracy: number
}

class CompassEngine {
    private isActive = false
    private permissionGranted = false
    private heading = 0
    private accuracy = 0
    private tilt = { alpha: 0, beta: 0, gamma: 0 }
    private acceleration = { x: 0, y: 0, z: 0 }
    private magneticDeclination = 0
    private lastMotionTime = 0
    private isMoving = false

    // Calibration
    private calibration: CalibrationData = {
        samples: [],
        minHeading: 360,
        maxHeading: 0,
        isComplete: false,
        accuracy: 0
    }

    // Smoothing
    private headingHistory: number[] = []
    private maxHistorySize = 10

    // Callbacks
    private onUpdateCallbacks: ((data: CompassData) => void)[] = []
    private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null
    private motionHandler: ((e: DeviceMotionEvent) => void) | null = null

    /**
     * Initialize compass engine
     */
    async init(): Promise<boolean> {
        console.log('[Compass] ═══════════════════════════════════════')
        console.log('[Compass] COMPASS ENGINE V1.0 INITIALIZING')
        console.log('[Compass] ═══════════════════════════════════════')

        // Check for DeviceOrientation support
        if (!('DeviceOrientationEvent' in window)) {
            console.warn('[Compass] DeviceOrientationEvent not supported')
            return false
        }

        // Request permission on iOS 13+
        const granted = await this.requestPermission()
        if (!granted) {
            console.warn('[Compass] Permission denied')
            return false
        }

        this.permissionGranted = true
        console.log('[Compass] ✓ Compass available')
        return true
    }

    /**
     * Request device orientation permission (required for iOS 13+)
     */
    private async requestPermission(): Promise<boolean> {
        // Check if permission API exists (iOS 13+)
        const DeviceOrientationEvent = window.DeviceOrientationEvent as any

        if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission()
                return response === 'granted'
            } catch (error) {
                console.error('[Compass] Permission request failed:', error)
                return false
            }
        }

        // Permission not required (Android, older iOS)
        return true
    }

    /**
     * Start compass tracking
     */
    start(): void {
        if (this.isActive) {
            console.log('[Compass] Already active')
            return
        }

        if (!this.permissionGranted) {
            console.warn('[Compass] Permission not granted, cannot start')
            return
        }

        console.log('[Compass] Starting compass tracking...')

        // Device orientation (compass heading)
        this.orientationHandler = (event: DeviceOrientationEvent) => {
            this.handleOrientation(event)
        }
        window.addEventListener('deviceorientation', this.orientationHandler, true)

        // Device motion (movement detection)
        this.motionHandler = (event: DeviceMotionEvent) => {
            this.handleMotion(event)
        }
        window.addEventListener('devicemotion', this.motionHandler, true)

        this.isActive = true
        console.log('[Compass] ✓ Compass tracking started')

        // Start calibration
        this.startCalibration()
    }

    /**
     * Stop compass tracking
     */
    stop(): void {
        if (!this.isActive) return

        if (this.orientationHandler) {
            window.removeEventListener('deviceorientation', this.orientationHandler, true)
            this.orientationHandler = null
        }

        if (this.motionHandler) {
            window.removeEventListener('devicemotion', this.motionHandler, true)
            this.motionHandler = null
        }

        this.isActive = false
        console.log('[Compass] Stopped')
    }

    /**
     * Handle device orientation event
     */
    private handleOrientation(event: DeviceOrientationEvent): void {
        // alpha: 0-360 (compass direction the device is facing)
        // beta: -180 to 180 (front/back tilt)
        // gamma: -90 to 90 (left/right tilt)

        let heading = event.alpha ?? 0

        // iOS uses webkitCompassHeading for true north
        const webkitEvent = event as any
        if (webkitEvent.webkitCompassHeading !== undefined) {
            heading = webkitEvent.webkitCompassHeading
            this.accuracy = webkitEvent.webkitCompassAccuracy ?? 0
        }

        // Apply tilt compensation
        const beta = event.beta ?? 0
        const gamma = event.gamma ?? 0

        if (beta !== 0 || gamma !== 0) {
            heading = this.compensateForTilt(heading, beta, gamma)
        }

        // Add to smoothing history
        this.addToHeadingHistory(heading)

        // Use smoothed heading
        this.heading = this.getSmoothedHeading()

        this.tilt = {
            alpha: event.alpha ?? 0,
            beta: beta,
            gamma: gamma
        }

        // Update calibration
        this.updateCalibration(heading)

        // Notify callbacks
        this.notifyUpdate()
    }

    /**
     * Handle device motion event
     */
    private handleMotion(event: DeviceMotionEvent): void {
        const acc = event.accelerationIncludingGravity
        if (!acc) return

        this.acceleration = {
            x: acc.x ?? 0,
            y: acc.y ?? 0,
            z: acc.z ?? 0
        }

        // Detect motion
        const motionMagnitude = Math.sqrt(
            Math.pow(acc.x ?? 0, 2) +
            Math.pow(acc.y ?? 0, 2) +
            Math.pow((acc.z ?? 0) - 9.81, 2)  // Subtract gravity
        )

        const now = Date.now()
        if (motionMagnitude > 1.5) {  // Threshold for movement
            this.lastMotionTime = now
            this.isMoving = true
        } else if (now - this.lastMotionTime > 500) {
            this.isMoving = false
        }
    }

    /**
     * Compensate heading for device tilt
     */
    private compensateForTilt(heading: number, beta: number, gamma: number): number {
        // Convert to radians
        const alphaRad = (heading * Math.PI) / 180
        const betaRad = (beta * Math.PI) / 180
        const gammaRad = (gamma * Math.PI) / 180

        // Calculate compensated heading
        const x = Math.cos(alphaRad) * Math.cos(gammaRad) +
            Math.sin(alphaRad) * Math.sin(betaRad) * Math.sin(gammaRad)
        const y = Math.sin(alphaRad) * Math.cos(betaRad)

        let compensatedHeading = (Math.atan2(y, x) * 180) / Math.PI

        // Normalize to 0-360
        if (compensatedHeading < 0) compensatedHeading += 360

        return compensatedHeading
    }

    /**
     * Add heading to smoothing history
     */
    private addToHeadingHistory(heading: number): void {
        this.headingHistory.push(heading)
        if (this.headingHistory.length > this.maxHistorySize) {
            this.headingHistory.shift()
        }
    }

    /**
     * Get smoothed heading using circular mean
     */
    private getSmoothedHeading(): number {
        if (this.headingHistory.length === 0) return 0

        // Circular mean to handle 0/360 wraparound
        let sumSin = 0
        let sumCos = 0

        for (const h of this.headingHistory) {
            const rad = (h * Math.PI) / 180
            sumSin += Math.sin(rad)
            sumCos += Math.cos(rad)
        }

        let avgHeading = (Math.atan2(sumSin, sumCos) * 180) / Math.PI
        if (avgHeading < 0) avgHeading += 360

        return avgHeading
    }

    /**
     * Start calibration process
     */
    private startCalibration(): void {
        this.calibration = {
            samples: [],
            minHeading: 360,
            maxHeading: 0,
            isComplete: false,
            accuracy: 0
        }
        console.log('[Compass] Calibration started - rotate device in figure-8')
    }

    /**
     * Update calibration with new heading
     */
    private updateCalibration(heading: number): void {
        if (this.calibration.isComplete) return

        this.calibration.samples.push(heading)
        this.calibration.minHeading = Math.min(this.calibration.minHeading, heading)
        this.calibration.maxHeading = Math.max(this.calibration.maxHeading, heading)

        // Check if calibration complete (full rotation detected)
        if (this.calibration.samples.length >= 100) {
            const range = this.calibration.maxHeading - this.calibration.minHeading
            if (range > 300) {  // Nearly full rotation
                this.calibration.isComplete = true
                this.calibration.accuracy = Math.min(15, 360 - range)
                console.log('[Compass] ✓ Calibration complete, accuracy:', this.calibration.accuracy, 'degrees')
            }
        }
    }

    /**
     * Register update callback
     */
    onUpdate(callback: (data: CompassData) => void): () => void {
        this.onUpdateCallbacks.push(callback)
        return () => {
            const idx = this.onUpdateCallbacks.indexOf(callback)
            if (idx !== -1) this.onUpdateCallbacks.splice(idx, 1)
        }
    }

    /**
     * Notify all callbacks
     */
    private notifyUpdate(): void {
        const data = this.getData()
        this.onUpdateCallbacks.forEach(cb => {
            try { cb(data) } catch { }
        })
    }

    /**
     * Get current compass data
     */
    getData(): CompassData {
        return {
            heading: this.heading,
            accuracy: this.accuracy || this.calibration.accuracy,
            tilt: this.tilt,
            acceleration: this.acceleration,
            isMoving: this.isMoving,
            isCalibrated: this.calibration.isComplete,
            magneticDeclination: this.magneticDeclination,
            timestamp: Date.now()
        }
    }

    /**
     * Get heading in cardinal direction
     */
    getCardinalDirection(): string {
        const h = this.heading
        if (h >= 337.5 || h < 22.5) return 'N'
        if (h >= 22.5 && h < 67.5) return 'NE'
        if (h >= 67.5 && h < 112.5) return 'E'
        if (h >= 112.5 && h < 157.5) return 'SE'
        if (h >= 157.5 && h < 202.5) return 'S'
        if (h >= 202.5 && h < 247.5) return 'SW'
        if (h >= 247.5 && h < 292.5) return 'W'
        return 'NW'
    }

    /**
     * Set magnetic declination for true north
     */
    setMagneticDeclination(degrees: number): void {
        this.magneticDeclination = degrees
        console.log('[Compass] Magnetic declination set to:', degrees)
    }

    /**
     * Get true north heading (adjusted for declination)
     */
    getTrueNorthHeading(): number {
        let trueHeading = this.heading + this.magneticDeclination
        if (trueHeading < 0) trueHeading += 360
        if (trueHeading >= 360) trueHeading -= 360
        return trueHeading
    }

    /**
     * Check if compass is active
     */
    isRunning(): boolean {
        return this.isActive
    }

    /**
     * Get status
     */
    getStatus(): {
        isActive: boolean
        permissionGranted: boolean
        isCalibrated: boolean
        heading: number
        accuracy: number
    } {
        return {
            isActive: this.isActive,
            permissionGranted: this.permissionGranted,
            isCalibrated: this.calibration.isComplete,
            heading: this.heading,
            accuracy: this.accuracy || this.calibration.accuracy
        }
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.stop()
        this.onUpdateCallbacks = []
        this.headingHistory = []
        console.log('[Compass] Destroyed')
    }
}

// Singleton export
export const compassEngine = new CompassEngine()
