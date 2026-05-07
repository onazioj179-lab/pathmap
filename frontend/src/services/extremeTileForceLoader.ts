/**
 * PATHFINDER V94 — EXTREME TILE FORCE-LOADER
 * ===========================================
 * 
 * Guarantees tile loading under ANY condition:
 *   - 12 retry attempts with 150ms delay
 *   - 5-source failover chain
 *   - Always-available fallback tile
 *   - CORS failure handling
 *   - Empty byte response handling
 *   - Proxy outage recovery
 * 
 * Purpose: Make it IMPOSSIBLE for the map to show blank.
 * 
 * Author: Onazi Treasure
 * Watermark: OJ
 */

export interface TileLoadResult {
  success: boolean;
  data: ArrayBuffer | null;
  source: string;
  attempts: number;
  error?: string;
}

export class ExtremeTileForceLoader {
  private static instance: ExtremeTileForceLoader | null = null;

  private failoverChain: string[] = [
    'http://localhost:8000/api/v1/tiles/proxy/{z}/{x}/{y}', // V92 Python proxy (primary)
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
  ];

  private maxRetries: number = 12;
  private retryDelay: number = 150; // ms
  private minValidBytes: number = 32;

  private constructor() {
    console.log('[V94:EXTREME] Extreme Tile Force-Loader initialized');
    console.log(`[V94:EXTREME] Max retries: ${this.maxRetries}, Delay: ${this.retryDelay}ms`);
    console.log(`[V94:EXTREME] Failover chain: ${this.failoverChain.length} sources`);
  }

  static getInstance(): ExtremeTileForceLoader {
    if (!ExtremeTileForceLoader.instance) {
      ExtremeTileForceLoader.instance = new ExtremeTileForceLoader();
    }
    return ExtremeTileForceLoader.instance;
  }

  /**
   * Force-load a tile with extreme retry logic.
   * WILL ALWAYS return something (even if fallback).
   */
  async forceTileLoad(url: string): Promise<TileLoadResult> {
    console.log(`[V94:EXTREME] Force-loading tile: ${url}`);
    
    let lastGoodData: ArrayBuffer | null = null;
    let successSource = 'none';

    // Attempt 1: Try primary URL with 12 retries
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();

          if (buffer.byteLength >= this.minValidBytes) {
            console.log(`[V94:EXTREME] [OK] Tile loaded (attempt ${attempt}): ${buffer.byteLength} bytes`);
            return {
              success: true,
              data: buffer,
              source: 'primary',
              attempts: attempt
            };
          } else {
            console.warn(`[V94:EXTREME] [FAIL] Tile too small: ${buffer.byteLength} bytes`);
          }
        } else {
          console.warn(`[V94:EXTREME] [FAIL] HTTP ${response.status} (attempt ${attempt})`);
        }
      } catch (error) {
        console.warn(`[V94:EXTREME] [FAIL] Fetch failed (attempt ${attempt}):`, error);
      }

      // Wait before retry (except last attempt)
      if (attempt < this.maxRetries) {
        await this.wait(this.retryDelay);
      }
    }

    // Attempt 2: Try failover chain
    console.log('[V94:EXTREME] Primary failed, trying failover chain...');
    
    for (let i = 0; i < this.failoverChain.length; i++) {
      const failoverUrl = this.failoverChain[i];
      
      try {
        // Extract z/x/y from original URL
        const coords = this.extractCoordinates(url);
        if (!coords) continue;

        const formattedUrl = failoverUrl
          .replace('{z}', coords.z.toString())
          .replace('{x}', coords.x.toString())
          .replace('{y}', coords.y.toString());

        console.log(`[V94:EXTREME] Trying failover ${i + 1}/${this.failoverChain.length}: ${formattedUrl}`);

        const response = await fetch(formattedUrl, {
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });

        if (response.ok) {
          const buffer = await response.arrayBuffer();

          if (buffer.byteLength >= this.minValidBytes) {
            console.log(`[V94:EXTREME] [OK] Failover success: source ${i + 1}`);
            return {
              success: true,
              data: buffer,
              source: `failover-${i + 1}`,
              attempts: this.maxRetries + i + 1
            };
          }
        }
      } catch (error) {
        console.warn(`[V94:EXTREME] Failover ${i + 1} failed:`, error);
      }

      await this.wait(this.retryDelay);
    }

    // Attempt 3: Return fallback tile
    console.warn('[V94:EXTREME] All sources failed, returning fallback tile');
    return {
      success: false,
      data: this.generateFallbackTile(),
      source: 'fallback',
      attempts: this.maxRetries + this.failoverChain.length,
      error: 'All tile sources exhausted'
    };
  }

  /**
   * Extract z/x/y coordinates from tile URL.
   */
  private extractCoordinates(url: string): { z: number; x: number; y: number } | null {
    // Try pattern: /z/x/y
    const match = url.match(/\/(\d+)\/(\d+)\/(\d+)/);
    if (match) {
      return {
        z: parseInt(match[1], 10),
        x: parseInt(match[2], 10),
        y: parseInt(match[3], 10)
      };
    }
    return null;
  }

  /**
   * Wait helper.
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a 1x1 transparent PNG as last resort fallback.
   */
  private generateFallbackTile(): ArrayBuffer {
    // Minimal 1x1 transparent PNG (67 bytes)
    const png = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,  // IDAT chunk
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,  // IEND chunk
      0x42, 0x60, 0x82
    ]);

    return png.buffer;
  }

  /**
   * Test tile loading capability (used during boot).
   */
  async testTileLoad(z: number = 2, x: number = 2, y: number = 2): Promise<boolean> {
    console.log(`[V94:EXTREME] Testing tile load: z=${z} x=${x} y=${y}`);

    const testUrl = this.failoverChain[0]
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());

    const result = await this.forceTileLoad(testUrl);

    if (result.success) {
      console.log(`[V94:EXTREME] [OK] Test tile loaded successfully`);
      return true;
    } else {
      console.warn(`[V94:EXTREME] [FAIL] Test tile failed, but fallback available`);
      return false; // Still usable due to fallback
    }
  }

  /**
   * Get current failover chain.
   */
  getFailoverChain(): string[] {
    return [...this.failoverChain];
  }

  /**
   * Update primary tile URL (e.g., after backend config changes).
   */
  setPrimaryTileUrl(url: string) {
    this.failoverChain[0] = url;
    console.log(`[V94:EXTREME] Primary tile URL updated: ${url}`);
  }
}

// Singleton export
export function getExtremeTileForceLoader(): ExtremeTileForceLoader {
  return ExtremeTileForceLoader.getInstance();
}
