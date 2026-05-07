/**
 * PATHFINDER V91 — TILE SERVER HARD FIX (Frontend)
 * Guaranteed tile load, hard retry logic, blocking initialization
 */

interface TileLoadResult {
  success: boolean;
  data: ArrayBuffer | null;
  url: string;
  attempts: number;
  error?: string;
}

interface HeartbeatResult {
  primaryValid: boolean;
  fallbackUrl?: string;
  message: string;
}

class TileHardLoader {
  private maxAttempts = 5;
  private retryDelay = 200; // ms
  private validMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  private minBytes = 32;

  /**
   * Hard tile loader - retries until success or max attempts
   * @param url Complete tile URL
   * @returns TileLoadResult with data or null
   */
  async loadTileHard(url: string): Promise<TileLoadResult> {
    let attempt = 0;

    while (attempt < this.maxAttempts) {
      attempt++;
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          cache: 'default',
          headers: {
            'User-Agent': 'Pathfinder/V91'
          }
        });

        if (response.status === 200) {
          const contentType = response.headers.get('content-type') || '';
          const buffer = await response.arrayBuffer();

          // Validate MIME type
          if (!this.validMimeTypes.some(mime => contentType.includes(mime))) {
            console.warn(`[V91:HARD_LOADER] Invalid MIME: ${contentType}`);
            continue;
          }

          // Validate byte size
          if (buffer.byteLength <= this.minBytes) {
            console.warn(`[V91:HARD_LOADER] Tile too small: ${buffer.byteLength} bytes`);
            continue;
          }

          console.log(`[V91:HARD_LOADER] [OK] Tile loaded (attempt ${attempt}): ${buffer.byteLength} bytes`);
          return {
            success: true,
            data: buffer,
            url,
            attempts: attempt
          };
        }
      } catch (error) {
        console.warn(`[V91:HARD_LOADER] Attempt ${attempt} failed:`, error);
      }

      // Wait before retry (except last attempt)
      if (attempt < this.maxAttempts) {
        await this.wait(this.retryDelay);
      }
    }

    console.error(`[V91:HARD_LOADER] [FAIL] All ${this.maxAttempts} attempts failed for ${url}`);
    return {
      success: false,
      data: null,
      url,
      attempts: this.maxAttempts,
      error: 'Max retries exceeded'
    };
  }

  /**
   * Test if a tile URL is accessible
   * @param url Complete tile URL
   * @returns true if tile is accessible
   */
  async testTileUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-cache'
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class TileServerHeartbeat {
  private backendUrl = 'http://localhost:8000';
  private heartbeatInterval = 3000; // ms
  private intervalId: number | null = null;
  private onServerSwitch?: (message: string) => void;

  constructor(onServerSwitch?: (message: string) => void) {
    this.onServerSwitch = onServerSwitch;
  }

  /**
   * Check backend tile heartbeat status
   * @returns HeartbeatResult with server status
   */
  async checkHeartbeat(): Promise<HeartbeatResult> {
    try {
      const response = await fetch(`${this.backendUrl}/api/v1/heartbeat/tiles`);
      const data = await response.json();

      if (data.primary_server?.operational) {
        return {
          primaryValid: true,
          message: 'Primary tile server operational'
        };
      } else {
        const fallbackUrl = data.fallback_providers?.[0];
        return {
          primaryValid: false,
          fallbackUrl,
          message: 'Primary server offline - fallback required'
        };
      }
    } catch (error) {
      console.error('[V91:HEARTBEAT] Backend heartbeat check failed:', error);
      return {
        primaryValid: false,
        message: 'Heartbeat check failed - network error'
      };
    }
  }

  /**
   * Start live heartbeat monitoring
   * Checks tile server every 3 seconds and switches on failure
   */
  startMonitoring(): void {
    if (this.intervalId !== null) {
      console.warn('[V91:HEARTBEAT] Monitoring already active');
      return;
    }

    console.log('[V91:HEARTBEAT] Starting live tile heartbeat monitor');

    this.intervalId = window.setInterval(async () => {
      const result = await this.checkHeartbeat();

      if (!result.primaryValid) {
        console.warn('[V91:HEARTBEAT] Server heartbeat failed - switching provider');
        this.onServerSwitch?.(result.message);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat monitoring
   */
  stopMonitoring(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[V91:HEARTBEAT] Heartbeat monitoring stopped');
    }
  }
}

class BlockingMapInitializer {
  private hardLoader = new TileHardLoader();
  private heartbeat: TileServerHeartbeat;
  private backendUrl = 'http://localhost:8000';

  constructor(onServerSwitch?: (message: string) => void) {
    this.heartbeat = new TileServerHeartbeat(onServerSwitch);
  }

  /**
   * Initialize map with blocking validation
   * Map will NOT render until tiles are verified
   * @returns true if initialization successful, false otherwise
   */
  async initializeBlocking(): Promise<boolean> {
    console.log('[V91:INIT] Starting blocking map initialization...');

    // Step 1: Check backend heartbeat
    const heartbeatResult = await this.heartbeat.checkHeartbeat();
    console.log(`[V91:INIT] Heartbeat: ${heartbeatResult.message}`);

    // Step 2: Test actual tile fetch
    const testTileUrl = 'https://basemaps.cartocdn.com/dark_all/2/2/2.png';
    console.log(`[V91:INIT] Testing tile fetch: ${testTileUrl}`);

    const tileResult = await this.hardLoader.loadTileHard(testTileUrl);

    if (tileResult.success) {
      console.log('[V91:INIT] [OK] Tile test PASSED - map ready to initialize');
      
      // Step 3: Start live heartbeat monitoring
      this.heartbeat.startMonitoring();
      
      return true;
    } else {
      console.error('[V91:INIT] [FAIL] Tile test FAILED - map initialization blocked');
      
      // Try fallback if available
      if (heartbeatResult.fallbackUrl) {
        console.log('[V91:INIT] Attempting fallback provider...');
        const fallbackUrl = heartbeatResult.fallbackUrl.replace('{z}', '2').replace('{x}', '2').replace('{y}', '2');
        const fallbackResult = await this.hardLoader.loadTileHard(fallbackUrl);
        
        if (fallbackResult.success) {
          console.log('[V91:INIT] [OK] Fallback tile test PASSED');
          this.heartbeat.startMonitoring();
          return true;
        }
      }
      
      console.error('[V91:INIT] [FAIL] All tile tests failed - map cannot initialize');
      return false;
    }
  }

  /**
   * Stop all monitoring
   */
  cleanup(): void {
    this.heartbeat.stopMonitoring();
  }

  /**
   * Get hard loader instance for manual tile loading
   */
  getHardLoader(): TileHardLoader {
    return this.hardLoader;
  }
}

// Singleton instances
let _tileHardLoader: TileHardLoader | null = null;
let _blockingInitializer: BlockingMapInitializer | null = null;

export function getTileHardLoader(): TileHardLoader {
  if (!_tileHardLoader) {
    _tileHardLoader = new TileHardLoader();
  }
  return _tileHardLoader;
}

export function getBlockingMapInitializer(
  onServerSwitch?: (message: string) => void
): BlockingMapInitializer {
  if (!_blockingInitializer) {
    _blockingInitializer = new BlockingMapInitializer(onServerSwitch);
  }
  return _blockingInitializer;
}

export { TileHardLoader, TileServerHeartbeat, BlockingMapInitializer };
export type { TileLoadResult, HeartbeatResult };
