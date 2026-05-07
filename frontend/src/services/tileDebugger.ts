/**
 * V89: Tile Debugger - Real-time Frontend Tile Analyzer
 * Diagnoses blank map, missing tiles, and tile loading failures.
 */

export interface TileRequestLog {
  url: string;
  status: number;
  bytes: number;
  timestamp: number;
  error?: string;
}

export interface TileDiagnostics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  retryAttempts: number;
  averageSize: number;
  lastError: string | null;
}

class TileDebugger {
  private enabled = true;
  private showOverlay = true;
  private overlayPosition: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' = 'bottom-left';
  private logs: TileRequestLog[] = [];
  private maxLogs = 100;
  private overlayElement: HTMLDivElement | null = null;

  init() {
    console.log('[V89:TD] Tile Debugger initialized');
    if (this.showOverlay) {
      this.createOverlay();
    }
  }

  enable() {
    this.enabled = true;
    if (this.overlayElement) {
      this.overlayElement.style.display = 'block';
    }
  }

  disable() {
    this.enabled = false;
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }

  recordTileRequest(url: string, statusCode: number, sizeBytes: number, error?: string) {
    if (!this.enabled) return;

    const log: TileRequestLog = {
      url,
      status: statusCode,
      bytes: sizeBytes,
      timestamp: Date.now(),
      error
    };

    this.logs.push(log);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.log(`[V89:TD] Tile: ${url} | Status: ${statusCode} | Size: ${sizeBytes}B`);
    
    if (error) {
      console.error(`[V89:TD] Tile Error: ${error}`);
    }

    this.updateOverlay();
  }

  showLast10(): TileRequestLog[] {
    return this.logs.slice(-10);
  }

  getDiagnostics(): TileDiagnostics {
    const totalRequests = this.logs.length;
    const successfulRequests = this.logs.filter(log => log.status === 200 && log.bytes > 20).length;
    const failedRequests = this.logs.filter(log => log.status !== 200 || log.bytes <= 20).length;
    const retryAttempts = this.logs.filter(log => log.error?.includes('retry')).length;
    const totalBytes = this.logs.reduce((sum, log) => sum + log.bytes, 0);
    const averageSize = totalRequests > 0 ? Math.round(totalBytes / totalRequests) : 0;
    const lastError = this.logs.filter(log => log.error).slice(-1)[0]?.error || null;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      retryAttempts,
      averageSize,
      lastError
    };
  }

  detectIssues(): string[] {
    const issues: string[] = [];
    const diag = this.getDiagnostics();

    // Check for 404 tiles
    const has404 = this.logs.some(log => log.status === 404);
    if (has404) {
      issues.push('404 tiles detected - wrong tile path');
    }

    // Check for unreachable server
    const hasNetworkError = this.logs.some(log => log.status === 0);
    if (hasNetworkError) {
      issues.push('Unreachable tile server - network/CORS issue');
    }

    // Check for empty tiles
    const hasEmptyTiles = this.logs.some(log => log.bytes < 20 && log.status === 200);
    if (hasEmptyTiles) {
      issues.push('Empty tiles - backend returning invalid data');
    }

    // Check for high failure rate
    if (diag.failedRequests > diag.successfulRequests && diag.totalRequests > 5) {
      issues.push('High failure rate - tile server may be offline');
    }

    // Check for no successful tiles
    if (diag.totalRequests > 10 && diag.successfulRequests === 0) {
      issues.push('CRITICAL: No tiles loaded successfully - map will be blank');
    }

    return issues;
  }

  private createOverlay() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'v89-tile-debugger';
    this.overlayElement.style.cssText = `
      position: fixed;
      ${this.overlayPosition.includes('bottom') ? 'bottom: 90px;' : 'top: 60px;'}
      ${this.overlayPosition.includes('left') ? 'left: 10px;' : 'right: 10px;'}
      background: rgba(10, 10, 10, 0.95);
      color: #10b981;
      padding: 12px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      max-width: 320px;
      z-index: 9998;
      border: 1px solid rgba(16, 185, 129, 0.3);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      pointer-events: none;
    `;

    document.body.appendChild(this.overlayElement);
    this.updateOverlay();
  }

  private updateOverlay() {
    if (!this.overlayElement) return;

    const diag = this.getDiagnostics();
    const issues = this.detectIssues();
    const last5 = this.showLast10().slice(-5);

    let html = '<div style="margin-bottom: 8px; font-weight: bold; color: #10b981;">V89 TILE DEBUGGER</div>';
    
    html += `<div style="margin-bottom: 6px; color: #a0a0a0;">
      Total: ${diag.totalRequests} | OK: ${diag.successfulRequests} | FAIL: ${diag.failedRequests}
    </div>`;

    if (issues.length > 0) {
      html += '<div style="margin-bottom: 6px; color: #ef4444; font-weight: bold;">ISSUES:</div>';
      issues.forEach(issue => {
        html += `<div style="color: #ef4444; margin-bottom: 2px;">• ${issue}</div>`;
      });
    }

    if (last5.length > 0) {
      html += '<div style="margin-top: 8px; margin-bottom: 4px; color: #10b981;">RECENT TILES:</div>';
      last5.forEach(log => {
        const color = log.status === 200 && log.bytes > 20 ? '#10b981' : '#ef4444';
        const shortUrl = log.url.split('/').slice(-3).join('/');
        html += `<div style="color: ${color}; margin-bottom: 2px;">
          ${log.status} | ${log.bytes}B | ${shortUrl}
        </div>`;
      });
    }

    this.overlayElement.innerHTML = html;
  }

  clearLogs() {
    this.logs = [];
    this.updateOverlay();
    console.log('[V89:TD] Logs cleared');
  }

  getOverlayElement(): HTMLDivElement | null {
    return this.overlayElement;
  }
}

// Singleton instance
let _tileDebugger: TileDebugger | null = null;

export function getTileDebugger(): TileDebugger {
  if (!_tileDebugger) {
    _tileDebugger = new TileDebugger();
    _tileDebugger.init();
  }
  return _tileDebugger;
}

export const tileDebugger = getTileDebugger();
