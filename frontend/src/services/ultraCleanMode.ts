/**
 * =====================================================================
 * PATHFINDER — ULTRA CLEAN MODE
 * Removes all unnecessary UI elements, leaving only:
 *   - Map
 *   - Header (algorithm + version)
 *   - Bottom navigation bar
 * =====================================================================
 * Author: Onazi Treasure
 * Watermark: OJ
 */

class UltraCleanMode {
  private cleanSweep = true;

  /**
   * Remove all unnecessary UI elements
   */
  removeUnnecessary(): void {
    const selectors = [
      '.tile-debugger',
      '#v89-tile-debugger',
      '.debug-panel',
      '.heatmap-toggle',
      '.calc-panel',
      '.visualization-controls',
      '.mode-selector',
      '.search-wrapper',
      '.floating-toolbar',
      '.right-side-controls',
      '.zoom-wrapper',
      '.visualization-speed',
      '.explore-panel',
      '.pop-message',
      '.map-error-overlay',
      '.center-overlay',
      '.mid-panel',
      '.floating-buttons',
      '.draw-controls'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });

    console.log('[UltraClean] Unnecessary UI elements removed');
  }

  /**
   * Clear legacy panels from previous builds
   */
  clearLegacyPanels(): void {
    const legacySelectors = ['.panel', '.control-box', '.card'];
    
    legacySelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        // Only remove if not essential (bottom nav, header)
        if (!el.closest('.v58-topbar') && !el.closest('.bottom-nav-v39')) {
          el.remove();
        }
      });
    });

    console.log('[UltraClean] Legacy panels cleared');
  }

  /**
   * Force clean map view with proper dimensions
   * Fixes: blank map, collapsed container, floating UI
   */
  forceFullMap(): void {
    const map = document.getElementById('map');
    if (!map) {
      console.warn('[UltraClean] Map container not found, retrying...');
      setTimeout(() => this.forceFullMap(), 100);
      return;
    }

    // Force proper dimensions (fixes blank map issue)
    map.style.minHeight = '100vh';
    map.style.height = 'calc(100vh - 160px)'; // Space for header + bottom nav
    map.style.width = '100vw';
    map.style.display = 'block';
    map.style.visibility = 'visible';
    map.style.opacity = '1';
    map.style.position = 'fixed';
    map.style.top = '80px'; // Below header
    map.style.left = '0';
    map.style.background = '#000';
    map.style.zIndex = '1';

    console.log('[UltraClean] Full map view forced');
  }

  /**
   * Disable all advanced features
   */
  disableAdvancedFeatures(): Record<string, boolean> {
    return {
      heatmap: false,
      exploration: false,
      arMode: false,
      gpsLock: false,
      pathReveal: false,
      speedControl: false,
      debugMode: false,
      compareMode: false,
      visualization: false
    };
  }

  /**
   * Initialize ultra-clean mode
   */
  init(): void {
    if (!this.cleanSweep) return;

    console.log('[UltraClean] Initializing ultra-clean mode...');

    // Run cleanup when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.removeUnnecessary();
        this.clearLegacyPanels();
        this.forceFullMap();
      });
    } else {
      // DOM already ready
      setTimeout(() => {
        this.removeUnnecessary();
        this.clearLegacyPanels();
        this.forceFullMap();
      }, 100);
    }

    console.log('[UltraClean] [OK] Ultra-clean mode active');
  }
}

// Export singleton
export const ultraCleanMode = new UltraCleanMode();

// Auto-initialize
ultraCleanMode.init();

export default ultraCleanMode;
