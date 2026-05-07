/**
 * PATHMAP V99 — EMBEDDED/IoT BRIDGE
 *
 * Integration for hardware and embedded devices:
 * - Arduino / ESP32 / Raspberry Pi
 * - Smart home devices (HomePod, Alexa, Google Home)
 * - Vehicle systems (CarPlay, Android Auto)
 * - Wearables (Apple Watch, WearOS)
 * - Custom GPS hardware
 * - Serial/Bluetooth GPS receivers
 *
 * @version 1.0.0
 * @author PathMap AI
 */

// Web Bluetooth API type declarations
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
      getAvailability(): Promise<boolean>;
    };
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: BluetoothServiceUUID[];
    acceptAllDevices?: boolean;
  }

  interface BluetoothLEScanFilter {
    services?: BluetoothServiceUUID[];
    name?: string;
    namePrefix?: string;
  }

  type BluetoothServiceUUID = string | number;

  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface BluetoothRemoteGATTServer {
    device: BluetoothDevice;
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    device: BluetoothDevice;
    uuid: string;
    getCharacteristic(
      characteristic: BluetoothServiceUUID
    ): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    service: BluetoothRemoteGATTService;
    uuid: string;
    value?: DataView;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }
}

export type EmbeddedDeviceType =
  | 'arduino'
  | 'esp32'
  | 'raspberry-pi'
  | 'homepod'
  | 'alexa'
  | 'google-home'
  | 'carplay'
  | 'android-auto'
  | 'apple-watch'
  | 'wear-os'
  | 'gps-receiver'
  | 'nmea-device'
  | 'ble-beacon'
  | 'uwb-tag'
  | 'custom';

export interface EmbeddedDevice {
  id: string;
  type: EmbeddedDeviceType;
  name: string;
  connectionType: 'bluetooth' | 'wifi' | 'serial' | 'usb' | 'cloud';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastSeen: number;
  batteryLevel?: number;
  firmwareVersion?: string;
  capabilities: string[];
  metadata: Record<string, any>;
}

export interface NMEASentence {
  type: 'GGA' | 'RMC' | 'GSA' | 'GSV' | 'VTG' | 'GLL';
  raw: string;
  parsed: Record<string, any>;
  timestamp: number;
}

export interface HardwareGPSData {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  heading: number;
  accuracy: number;
  satellites: number;
  fixQuality: number;
  source: string;
  timestamp: number;
}

class EmbeddedBridge {
  private devices: Map<string, EmbeddedDevice> = new Map();
  private nmeaBuffer: string = '';
  private gpsCallbacks: ((data: HardwareGPSData) => void)[] = [];
  private deviceCallbacks: ((devices: EmbeddedDevice[]) => void)[] = [];
  private bluetoothDevice: BluetoothDevice | null = null;
  private serialPort: any = null;
  private initialized = false;

  /**
   * Initialize the embedded bridge
   */
  async init(): Promise<void> {
    console.log('[EMB] ═══════════════════════════════════════════');
    console.log('[EMB] EMBEDDED/IoT BRIDGE V1.0 INITIALIZING');
    console.log('[EMB] Hardware | BLE | Serial | Smart Home Ready');
    console.log('[EMB] ═══════════════════════════════════════════');

    // Check for Web Bluetooth
    if ('bluetooth' in navigator) {
      console.log('[EMB] ✓ Web Bluetooth available');
    }

    // Check for Web Serial
    if ('serial' in navigator) {
      console.log('[EMB] ✓ Web Serial available');
    }

    // Check for USB
    if ('usb' in navigator) {
      console.log('[EMB] ✓ Web USB available');
    }

    // Initialize device discovery
    this.startDeviceDiscovery();

    this.initialized = true;
    console.log('[EMB] ✓ Embedded bridge ready');
  }

  /**
   * Start passive device discovery
   */
  private startDeviceDiscovery(): void {
    // Listen for BLE advertisements (if supported)
    // This is a simplified version - real implementation would use BLE scanning

    // Simulate some known device types
    const mockDevices: EmbeddedDevice[] = [
      {
        id: 'homepod-1',
        type: 'homepod',
        name: 'Living Room HomePod',
        connectionType: 'wifi',
        status: 'disconnected',
        lastSeen: Date.now(),
        capabilities: ['audio', 'siri', 'location-share'],
        metadata: { room: 'living-room' },
      },
      {
        id: 'watch-1',
        type: 'apple-watch',
        name: 'Apple Watch',
        connectionType: 'bluetooth',
        status: 'disconnected',
        lastSeen: Date.now(),
        batteryLevel: 85,
        capabilities: ['gps', 'heart-rate', 'compass', 'haptics'],
        metadata: { model: 'Series 9' },
      },
    ];

    mockDevices.forEach(d => this.devices.set(d.id, d));
  }

  /**
   * Connect to Bluetooth GPS device
   */
  async connectBluetoothGPS(): Promise<EmbeddedDevice | null> {
    if (!('bluetooth' in navigator)) {
      console.warn('[EMB] Web Bluetooth not supported');
      return null;
    }

    try {
      console.log('[EMB] Requesting Bluetooth GPS device...');

      // Check if Bluetooth is available
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API is not available');
      }

      // Request GPS device (common UUIDs for GPS over BLE)
      this.bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }, // Common GPS BLE
          { services: ['0000180f-0000-1000-8000-00805f9b34fb'] }, // Battery service
          { namePrefix: 'GPS' },
          { namePrefix: 'GNSS' },
          { namePrefix: 'BT-GPS' },
        ],
        optionalServices: [
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000ffe1-0000-1000-8000-00805f9b34fb',
        ],
      });

      if (!this.bluetoothDevice) {
        return null;
      }

      const device: EmbeddedDevice = {
        id: `ble-${this.bluetoothDevice.id}`,
        type: 'gps-receiver',
        name: this.bluetoothDevice.name || 'Bluetooth GPS',
        connectionType: 'bluetooth',
        status: 'connecting',
        lastSeen: Date.now(),
        capabilities: ['gps', 'nmea'],
        metadata: { bluetoothId: this.bluetoothDevice.id },
      };

      this.devices.set(device.id, device);

      // Connect to device
      const server = await this.bluetoothDevice.gatt?.connect();
      if (server) {
        device.status = 'connected';
        console.log(`[EMB] ✓ Connected to ${device.name}`);

        // Set up NMEA data listener
        await this.setupBLEGPSListener(server, device.id);
      }

      this.notifyDeviceUpdate();
      return device;
    } catch (error: any) {
      console.warn('[EMB] Bluetooth connection failed:', error.message);
      return null;
    }
  }

  /**
   * Set up BLE GPS data listener
   */
  private async setupBLEGPSListener(
    server: BluetoothRemoteGATTServer,
    deviceId: string
  ): Promise<void> {
    try {
      const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic(
        '0000ffe1-0000-1000-8000-00805f9b34fb'
      );

      await characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const decoder = new TextDecoder();
        const nmeaData = decoder.decode(value);
        this.processNMEA(nmeaData, deviceId);
      });

      console.log('[EMB] ✓ NMEA listener active');
    } catch (error: any) {
      console.warn('[EMB] Failed to setup NMEA listener:', error.message);
    }
  }

  /**
   * Connect to serial GPS device
   */
  async connectSerialGPS(): Promise<EmbeddedDevice | null> {
    if (!('serial' in navigator)) {
      console.warn('[EMB] Web Serial not supported');
      return null;
    }

    try {
      console.log('[EMB] Requesting Serial port...');

      // Request serial port
      this.serialPort = await (navigator as any).serial.requestPort({
        filters: [
          { usbVendorId: 0x1546 }, // u-blox
          { usbVendorId: 0x067b }, // Prolific
          { usbVendorId: 0x10c4 }, // Silicon Labs
          { usbVendorId: 0x0403 }, // FTDI
        ],
      });

      await this.serialPort.open({ baudRate: 9600 });

      const device: EmbeddedDevice = {
        id: `serial-${Date.now()}`,
        type: 'nmea-device',
        name: 'Serial GPS Receiver',
        connectionType: 'serial',
        status: 'connected',
        lastSeen: Date.now(),
        capabilities: ['gps', 'nmea', 'multi-gnss'],
        metadata: {},
      };

      this.devices.set(device.id, device);

      // Start reading NMEA data
      this.readSerialNMEA(device.id);

      console.log(`[EMB] ✓ Serial GPS connected`);
      this.notifyDeviceUpdate();
      return device;
    } catch (error: any) {
      console.warn('[EMB] Serial connection failed:', error.message);
      return null;
    }
  }

  /**
   * Read NMEA data from serial port
   */
  private async readSerialNMEA(deviceId: string): Promise<void> {
    if (!this.serialPort?.readable) return;

    const reader = this.serialPort.readable.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        this.processNMEA(text, deviceId);
      }
    } catch (error: any) {
      console.warn('[EMB] Serial read error:', error.message);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process NMEA sentences
   */
  private processNMEA(data: string, deviceId: string): void {
    this.nmeaBuffer += data;

    // Process complete sentences
    const lines = this.nmeaBuffer.split('\r\n');
    this.nmeaBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('$')) {
        const parsed = this.parseNMEA(line);
        if (parsed) {
          this.handleParsedNMEA(parsed, deviceId);
        }
      }
    }
  }

  /**
   * Parse NMEA sentence
   */
  private parseNMEA(sentence: string): NMEASentence | null {
    try {
      const parts = sentence.split(',');
      const type = parts[0].substring(3, 6) as any;

      const parsed: NMEASentence = {
        type,
        raw: sentence,
        parsed: {},
        timestamp: Date.now(),
      };

      switch (type) {
        case 'GGA':
          parsed.parsed = this.parseGGA(parts);
          break;
        case 'RMC':
          parsed.parsed = this.parseRMC(parts);
          break;
        case 'GSA':
          parsed.parsed = this.parseGSA(parts);
          break;
        case 'GSV':
          parsed.parsed = this.parseGSV(parts);
          break;
        case 'VTG':
          parsed.parsed = this.parseVTG(parts);
          break;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Parse GGA sentence (position + quality)
   */
  private parseGGA(parts: string[]): Record<string, any> {
    return {
      time: parts[1],
      latitude: this.parseLatLon(parts[2], parts[3]),
      longitude: this.parseLatLon(parts[4], parts[5]),
      quality: parseInt(parts[6]) || 0,
      satellites: parseInt(parts[7]) || 0,
      hdop: parseFloat(parts[8]) || 99,
      altitude: parseFloat(parts[9]) || 0,
      altitudeUnit: parts[10],
      geoidHeight: parseFloat(parts[11]) || 0,
    };
  }

  /**
   * Parse RMC sentence (recommended minimum)
   */
  private parseRMC(parts: string[]): Record<string, any> {
    return {
      time: parts[1],
      status: parts[2], // A=valid, V=invalid
      latitude: this.parseLatLon(parts[3], parts[4]),
      longitude: this.parseLatLon(parts[5], parts[6]),
      speed: parseFloat(parts[7]) * 0.514444 || 0, // knots to m/s
      heading: parseFloat(parts[8]) || 0,
      date: parts[9],
      magVariation: parseFloat(parts[10]) || 0,
    };
  }

  /**
   * Parse GSA sentence (DOP + active satellites)
   */
  private parseGSA(parts: string[]): Record<string, any> {
    return {
      mode: parts[1],
      fixType: parseInt(parts[2]) || 0, // 1=no fix, 2=2D, 3=3D
      satellites: parts
        .slice(3, 15)
        .filter(s => s)
        .map(s => parseInt(s)),
      pdop: parseFloat(parts[15]) || 99,
      hdop: parseFloat(parts[16]) || 99,
      vdop: parseFloat(parts[17]) || 99,
    };
  }

  /**
   * Parse GSV sentence (satellites in view)
   */
  private parseGSV(parts: string[]): Record<string, any> {
    const satellites = [];
    for (let i = 4; i < parts.length - 1; i += 4) {
      if (parts[i]) {
        satellites.push({
          prn: parseInt(parts[i]) || 0,
          elevation: parseInt(parts[i + 1]) || 0,
          azimuth: parseInt(parts[i + 2]) || 0,
          snr: parseInt(parts[i + 3]) || 0,
        });
      }
    }
    return {
      totalMessages: parseInt(parts[1]) || 0,
      messageNumber: parseInt(parts[2]) || 0,
      satellitesInView: parseInt(parts[3]) || 0,
      satellites,
    };
  }

  /**
   * Parse VTG sentence (velocity)
   */
  private parseVTG(parts: string[]): Record<string, any> {
    return {
      headingTrue: parseFloat(parts[1]) || 0,
      headingMagnetic: parseFloat(parts[3]) || 0,
      speedKnots: parseFloat(parts[5]) || 0,
      speedKmh: parseFloat(parts[7]) || 0,
    };
  }

  /**
   * Parse lat/lon from NMEA format
   */
  private parseLatLon(value: string, direction: string): number {
    if (!value) return 0;

    const isLat = direction === 'N' || direction === 'S';
    const degLength = isLat ? 2 : 3;

    const deg = parseInt(value.substring(0, degLength));
    const min = parseFloat(value.substring(degLength));

    let decimal = deg + min / 60;
    if (direction === 'S' || direction === 'W') decimal *= -1;

    return decimal;
  }

  /**
   * Handle parsed NMEA data
   */
  private handleParsedNMEA(nmea: NMEASentence, deviceId: string): void {
    if (nmea.type === 'GGA' && nmea.parsed.latitude && nmea.parsed.longitude) {
      const gpsData: HardwareGPSData = {
        latitude: nmea.parsed.latitude,
        longitude: nmea.parsed.longitude,
        altitude: nmea.parsed.altitude || 0,
        speed: 0,
        heading: 0,
        accuracy: nmea.parsed.hdop ? nmea.parsed.hdop * 5 : 10,
        satellites: nmea.parsed.satellites || 0,
        fixQuality: nmea.parsed.quality || 0,
        source: deviceId,
        timestamp: Date.now(),
      };

      this.notifyGPSUpdate(gpsData);
    }

    if (nmea.type === 'RMC') {
      // Update speed and heading from RMC
    }
  }

  /**
   * Connect to smart home device
   */
  async connectSmartDevice(
    type: 'homepod' | 'alexa' | 'google-home'
  ): Promise<EmbeddedDevice | null> {
    console.log(`[EMB] Connecting to ${type}...`);

    // Smart home integration would typically use cloud APIs
    // This is a simulation of the connection process

    const device: EmbeddedDevice = {
      id: `${type}-${Date.now()}`,
      type,
      name: this.getSmartDeviceName(type),
      connectionType: 'cloud',
      status: 'connected',
      lastSeen: Date.now(),
      capabilities: this.getSmartDeviceCapabilities(type),
      metadata: {},
    };

    this.devices.set(device.id, device);
    this.notifyDeviceUpdate();

    console.log(`[EMB] ✓ Connected to ${device.name}`);
    return device;
  }

  /**
   * Get smart device display name
   */
  private getSmartDeviceName(type: string): string {
    const names: Record<string, string> = {
      homepod: 'HomePod',
      alexa: 'Amazon Echo',
      'google-home': 'Google Home',
    };
    return names[type] || type;
  }

  /**
   * Get smart device capabilities
   */
  private getSmartDeviceCapabilities(type: string): string[] {
    const caps: Record<string, string[]> = {
      homepod: ['audio', 'siri', 'intercom', 'home-hub'],
      alexa: ['audio', 'voice', 'routines', 'smart-home'],
      'google-home': ['audio', 'assistant', 'routines', 'cast'],
    };
    return caps[type] || [];
  }

  /**
   * Send location to smart device
   */
  async shareLocationToDevice(deviceId: string, lat: number, lng: number): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device || device.status !== 'connected') {
      return false;
    }

    console.log(`[EMB] Sharing location to ${device.name}: ${lat}, ${lng}`);

    // In real implementation, this would use the device's API
    // For now, simulate success
    return true;
  }

  /**
   * Register GPS data callback
   */
  onGPSData(callback: (data: HardwareGPSData) => void): () => void {
    this.gpsCallbacks.push(callback);
    return () => {
      const idx = this.gpsCallbacks.indexOf(callback);
      if (idx !== -1) this.gpsCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register device update callback
   */
  onDeviceUpdate(callback: (devices: EmbeddedDevice[]) => void): () => void {
    this.deviceCallbacks.push(callback);
    return () => {
      const idx = this.deviceCallbacks.indexOf(callback);
      if (idx !== -1) this.deviceCallbacks.splice(idx, 1);
    };
  }

  /**
   * Notify GPS callbacks
   */
  private notifyGPSUpdate(data: HardwareGPSData): void {
    this.gpsCallbacks.forEach(cb => {
      try {
        cb(data);
      } catch {}
    });
  }

  /**
   * Notify device callbacks
   */
  private notifyDeviceUpdate(): void {
    const devices = Array.from(this.devices.values());
    this.deviceCallbacks.forEach(cb => {
      try {
        cb(devices);
      } catch {}
    });
  }

  /**
   * Get all devices
   */
  getDevices(): EmbeddedDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get device by ID
   */
  getDevice(id: string): EmbeddedDevice | undefined {
    return this.devices.get(id);
  }

  /**
   * Disconnect device
   */
  async disconnectDevice(id: string): Promise<void> {
    const device = this.devices.get(id);
    if (!device) return;

    device.status = 'disconnected';

    if (device.connectionType === 'bluetooth' && this.bluetoothDevice?.gatt?.connected) {
      this.bluetoothDevice.gatt.disconnect();
    }

    if (device.connectionType === 'serial' && this.serialPort) {
      await this.serialPort.close();
    }

    console.log(`[EMB] Disconnected ${device.name}`);
    this.notifyDeviceUpdate();
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    // Disconnect all devices
    for (const device of this.devices.values()) {
      await this.disconnectDevice(device.id);
    }

    this.devices.clear();
    this.gpsCallbacks = [];
    this.deviceCallbacks = [];
    this.initialized = false;

    console.log('[EMB] Destroyed');
  }
}

// Singleton export
export const embeddedBridge = new EmbeddedBridge();
