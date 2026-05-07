/**
 * =====================================================================
 * PATHFINDER — SEARCH ENGINE
 * Simple location search using Nominatim (OpenStreetMap)
 * =====================================================================
 * Features:
 *   - Enter key to search
 *   - Nominatim geocoding API
 *   - Auto-pan map to result
 *   - No complex features
 * =====================================================================
 * Author: Onazi Treasure
 * Watermark: OJ
 */

import { mapEngine } from './mapEngine';
import L from 'leaflet';

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  importance: number;
}

interface SearchEngine {
  input: HTMLInputElement | null;
  marker: L.Marker | null;
}

class SearchEngineClass implements SearchEngine {
  input: HTMLInputElement | null = null;
  marker: L.Marker | null = null;

  /**
   * Initialize search engine
   * Binds to search input and enables Enter key search
   */
  init(): void {
    console.log('[SearchEngine] Initializing search engine...');

    this.input = document.getElementById('searchInput') as HTMLInputElement;
    if (!this.input) {
      console.warn('[SearchEngine] Search input not found, skipping init on this route');
      return;
    }

    // Bind Enter key to search
    this.input.addEventListener('keydown', async (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;

      const query = this.input?.value.trim();
      if (!query) return;

      await this.search(query);
    });

    console.log('[SearchEngine] [OK] Search engine ready');
  }

  /**
   * Search for location using Nominatim API
   */
  async search(query: string): Promise<void> {
    console.log('[SearchEngine] Searching for:', query);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

      const response = await fetch(url);
      const data: SearchResult[] = await response.json();

      if (data.length === 0) {
        console.warn('[SearchEngine] No results found for:', query);
        return;
      }

      // Get first result
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      console.log('[SearchEngine] Found:', result.display_name);
      console.log('[SearchEngine] Location:', lat, lon);

      // Pan map to location
      this.panToResult(lat, lon);

      // Place marker
      this.placeMarker(lat, lon, result.display_name);
    } catch (error) {
      console.error('[SearchEngine] Search failed:', error);
    }
  }

  /**
   * Pan map to search result
   */
  private panToResult(lat: number, lon: number): void {
    mapEngine.panTo(lat, lon, 13); // Zoom level 13 for city view
  }

  /**
   * Place marker at search result
   */
  private placeMarker(lat: number, lon: number, name: string): void {
    const map = mapEngine.getMap();
    if (!map) return;

    // Remove old marker
    if (this.marker) {
      this.marker.remove();
    }

    // Create new marker
    this.marker = L.marker([lat, lon]).addTo(map);

    console.log('[SearchEngine] Marker placed at:', name);
  }

  /**
   * Clear search input
   */
  clear(): void {
    if (this.input) {
      this.input.value = '';
    }

    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }
}

// Export singleton instance
export const searchEngine = new SearchEngineClass();

export default searchEngine;
