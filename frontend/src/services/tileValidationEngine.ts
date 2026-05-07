/**
 * V85: Tile URL & Tile Format Validation
 * Validates tile URLs, formats, and ensures map receives correct data.
 * Detects wrong URLs, invalid endpoints, and empty tile responses.
 */

export interface TileValidator {
  check_format: string[];
  verify_dimensions: boolean;
  reject_empty_bytes: boolean;
  test_request_timeout: number;
  test_urls: string[];
}

export interface TileValidationResult {
  valid: boolean;
  url: string;
  format?: string;
  size?: number;
  mimeType?: string;
  dimensions?: { width: number; height: number };
  error?: string;
}

class TileValidationEngine {
  private validator: TileValidator = {
    check_format: ['png', 'jpg', 'jpeg', 'webp'],
    verify_dimensions: true,
    reject_empty_bytes: true,
    test_request_timeout: 3,
    test_urls: []
  };

  init() {
    console.log('[V85:TVE] Tile Validation Engine initialized');
  }

  async validateTileUrl(url: string): Promise<TileValidationResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.validator.test_request_timeout * 1000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          valid: false,
          url,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const mimeType = response.headers.get('content-type') || '';
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

      // Check if empty
      if (this.validator.reject_empty_bytes && contentLength === 0) {
        return {
          valid: false,
          url,
          error: 'Tile response is empty (0 bytes)'
        };
      }

      // Check format
      const format = this.extractFormatFromMimeType(mimeType);
      if (!this.validator.check_format.includes(format)) {
        return {
          valid: false,
          url,
          format,
          mimeType,
          error: `Unsupported format: ${format} (MIME: ${mimeType})`
        };
      }

      return {
        valid: true,
        url,
        format,
        size: contentLength,
        mimeType
      };
    } catch (error: any) {
      return {
        valid: false,
        url,
        error: error.name === 'AbortError' ? 'Request timeout' : error.message
      };
    }
  }

  async validateTileData(url: string): Promise<TileValidationResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.validator.test_request_timeout * 1000);

      const response = await fetch(url, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          valid: false,
          url,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const blob = await response.blob();
      const mimeType = blob.type;
      const size = blob.size;

      if (this.validator.reject_empty_bytes && size === 0) {
        return {
          valid: false,
          url,
          error: 'Tile data is empty (0 bytes)'
        };
      }

      const format = this.extractFormatFromMimeType(mimeType);
      if (!this.validator.check_format.includes(format)) {
        return {
          valid: false,
          url,
          format,
          mimeType,
          error: `Unsupported format: ${format}`
        };
      }

      // Verify dimensions if enabled
      let dimensions: { width: number; height: number } | undefined;
      if (this.validator.verify_dimensions) {
        try {
          dimensions = await this.getImageDimensions(blob);
        } catch (e) {
          return {
            valid: false,
            url,
            format,
            size,
            mimeType,
            error: 'Failed to read image dimensions'
          };
        }
      }

      return {
        valid: true,
        url,
        format,
        size,
        mimeType,
        dimensions
      };
    } catch (error: any) {
      return {
        valid: false,
        url,
        error: error.name === 'AbortError' ? 'Request timeout' : error.message
      };
    }
  }

  private extractFormatFromMimeType(mimeType: string): string {
    const match = mimeType.match(/image\/(png|jpe?g|webp)/i);
    return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'unknown';
  }

  private getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  async testEndpoints(urls: string[]): Promise<TileValidationResult[]> {
    console.log(`[V85:TVE] Testing ${urls.length} tile endpoints...`);
    const results = await Promise.all(urls.map(url => this.validateTileUrl(url)));
    
    const validCount = results.filter(r => r.valid).length;
    console.log(`[V85:TVE] Test complete: ${validCount}/${urls.length} endpoints valid`);
    
    return results;
  }

  updateValidator(partial: Partial<TileValidator>) {
    this.validator = { ...this.validator, ...partial };
    console.log('[V85:TVE] Validator updated:', this.validator);
  }

  getValidator(): TileValidator {
    return { ...this.validator };
  }
}

// Singleton instance
let _tileValidationEngine: TileValidationEngine | null = null;

export function getTileValidationEngine(): TileValidationEngine {
  if (!_tileValidationEngine) {
    _tileValidationEngine = new TileValidationEngine();
    _tileValidationEngine.init();
  }
  return _tileValidationEngine;
}

export const tileValidationEngine = getTileValidationEngine();
