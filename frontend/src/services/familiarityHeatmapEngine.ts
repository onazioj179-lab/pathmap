/**
 * PATHFINDER V35 — PERSONAL FAMILIARITY HEATMAP V2
 * 
 * Tracks visited tiles, visit frequency, dwell time, and return rate
 * to build a personal familiarity map of areas. Used for:
 * - Adjusting safe-return route preference
 * - Highlighting familiar vs unknown areas
 * - Supporting Ambient Mode and Anti-Lost Mode decisions
 * - Providing comfort-based routing
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface TileCoordinate {
  x: number;
  y: number;
  zoom: number; // Zoom level (higher = more granular)
}

export interface VisitedTile {
  coordinate: TileCoordinate;
  firstVisit: number;           // timestamp
  lastVisit: number;            // timestamp
  visitCount: number;
  totalDwellTime: number;       // milliseconds
  averageDwellTime: number;     // milliseconds
  returnCount: number;          // How many times returned after leaving
  familiarityScore: number;     // 0-1 (0 = unknown, 1 = very familiar)
}

export interface FamiliarityZone {
  name: string;
  centerLat: number;
  centerLon: number;
  radius: number;               // meters
  tiles: TileCoordinate[];
  overallFamiliarity: number;   // 0-1
  visitCount: number;
  lastVisit: number;
}

export interface FamiliarityHeatmapState {
  totalTilesVisited: number;
  totalVisits: number;
  totalDwellTime: number;
  mostFamiliarZones: FamiliarityZone[];
  leastFamiliarZones: FamiliarityZone[];
  currentTileFamiliarity: number; // 0-1 for current location
  recentExplorationRate: number;  // 0-1 (0 = staying familiar, 1 = exploring new)
}

// ============================================================================
// FAMILIARITY HEATMAP ENGINE
// ============================================================================

class FamiliarityHeatmapEngine {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private visitedTiles: Map<string, VisitedTile> = new Map();
  private currentTile: TileCoordinate | null = null;
  private currentTileEntryTime: number = 0;
  
  private state: FamiliarityHeatmapState = {
    totalTilesVisited: 0,
    totalVisits: 0,
    totalDwellTime: 0,
    mostFamiliarZones: [],
    leastFamiliarZones: [],
    currentTileFamiliarity: 0,
    recentExplorationRate: 0,
  };

  private readonly ZOOM_LEVEL = 16; // ~600m tiles
  private readonly UPDATE_INTERVAL_MS = 5000; // Update every 5s
  private readonly STORAGE_KEY = 'pathfinder_familiarity_heatmap';
  private readonly MAX_TILES_STORED = 10000;
  private readonly TILE_EXPIRY_DAYS = 365; // 1 year

  private listeners: ((state: FamiliarityHeatmapState) => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  start(): void {
    if (this.isRunning) {
      console.warn('[FamiliarityHeatmap] Already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.updateState();
    }, this.UPDATE_INTERVAL_MS);

    console.log('[FamiliarityHeatmap] Started tracking');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Record final dwell time
    if (this.currentTile) {
      this.recordTileExit();
    }

    this.isRunning = false;
    this.saveToStorage();
    console.log('[FamiliarityHeatmap] Stopped');
  }

  // ==========================================================================
  // LOCATION TRACKING
  // ==========================================================================

  updateLocation(latitude: number, longitude: number): void {
    if (!this.isRunning) {
      return;
    }

    const newTile = this.latLonToTile(latitude, longitude, this.ZOOM_LEVEL);
    const tileKey = this.tileToKey(newTile);

    // Check if we entered a new tile
    if (!this.currentTile || this.tileToKey(this.currentTile) !== tileKey) {
      // Exit previous tile
      if (this.currentTile) {
        this.recordTileExit();
      }

      // Enter new tile
      this.recordTileEntry(newTile);
    }
  }

  private recordTileEntry(tile: TileCoordinate): void {
    const tileKey = this.tileToKey(tile);
    this.currentTile = tile;
    this.currentTileEntryTime = Date.now();

    let visitedTile = this.visitedTiles.get(tileKey);

    if (!visitedTile) {
      // First visit to this tile
      visitedTile = {
        coordinate: tile,
        firstVisit: Date.now(),
        lastVisit: Date.now(),
        visitCount: 1,
        totalDwellTime: 0,
        averageDwellTime: 0,
        returnCount: 0,
        familiarityScore: 0.1, // Base familiarity for first visit
      };
      this.visitedTiles.set(tileKey, visitedTile);
      this.state.totalTilesVisited++;
    } else {
      // Returning to tile
      visitedTile.visitCount++;
      visitedTile.returnCount++;
      visitedTile.lastVisit = Date.now();
    }

    this.state.totalVisits++;
    
    // Update current tile familiarity
    this.state.currentTileFamiliarity = visitedTile.familiarityScore;

    console.log(`[FamiliarityHeatmap] Entered tile ${tileKey} (visits: ${visitedTile.visitCount}, familiarity: ${visitedTile.familiarityScore.toFixed(2)})`);
  }

  private recordTileExit(): void {
    if (!this.currentTile) {
      return;
    }

    const tileKey = this.tileToKey(this.currentTile);
    const visitedTile = this.visitedTiles.get(tileKey);

    if (visitedTile) {
      const dwellTime = Date.now() - this.currentTileEntryTime;
      visitedTile.totalDwellTime += dwellTime;
      visitedTile.averageDwellTime = visitedTile.totalDwellTime / visitedTile.visitCount;

      this.state.totalDwellTime += dwellTime;

      // Recalculate familiarity score
      visitedTile.familiarityScore = this.calculateFamiliarityScore(visitedTile);

      console.log(`[FamiliarityHeatmap] Exited tile ${tileKey} (dwell: ${(dwellTime / 1000).toFixed(0)}s, familiarity: ${visitedTile.familiarityScore.toFixed(2)})`);
    }
  }

  // ==========================================================================
  // FAMILIARITY CALCULATION
  // ==========================================================================

  private calculateFamiliarityScore(tile: VisitedTile): number {
    // Factors:
    // 1. Visit count (more visits = more familiar)
    // 2. Return rate (returning = familiar)
    // 3. Average dwell time (spending time = familiar)
    // 4. Recency (recent visits = more familiar)

    const visitScore = Math.min(tile.visitCount / 10, 1.0); // Cap at 10 visits
    const returnScore = tile.returnCount > 0 ? Math.min(tile.returnCount / 5, 1.0) : 0;
    const dwellScore = Math.min(tile.averageDwellTime / (5 * 60 * 1000), 1.0); // Cap at 5 min avg dwell
    
    const daysSinceVisit = (Date.now() - tile.lastVisit) / (24 * 60 * 60 * 1000);
    const recencyScore = Math.max(0, 1 - daysSinceVisit / 30); // Decay over 30 days

    return (visitScore * 0.4 + returnScore * 0.2 + dwellScore * 0.2 + recencyScore * 0.2);
  }

  // ==========================================================================
  // STATE UPDATES
  // ==========================================================================

  private updateState(): void {
    // Update zones
    this.identifyFamiliarZones();

    // Calculate exploration rate (last 10 tiles)
    this.calculateExplorationRate();

    // Notify listeners
    this.notifyListeners();

    // Periodic save
    if (this.state.totalVisits % 20 === 0) {
      this.saveToStorage();
    }
  }

  private identifyFamiliarZones(): void {
    // Group tiles into zones (simplified clustering)
    const tileArray = Array.from(this.visitedTiles.values());
    
    // Sort by familiarity
    tileArray.sort((a, b) => b.familiarityScore - a.familiarityScore);

    // Most familiar (top 10)
    this.state.mostFamiliarZones = tileArray.slice(0, 10).map(tile => ({
      name: this.generateZoneName(tile.coordinate),
      centerLat: this.tileToLatLon(tile.coordinate).lat,
      centerLon: this.tileToLatLon(tile.coordinate).lon,
      radius: 300,
      tiles: [tile.coordinate],
      overallFamiliarity: tile.familiarityScore,
      visitCount: tile.visitCount,
      lastVisit: tile.lastVisit,
    }));

    // Least familiar (bottom 10)
    tileArray.sort((a, b) => a.familiarityScore - b.familiarityScore);
    this.state.leastFamiliarZones = tileArray.slice(0, 10).map(tile => ({
      name: this.generateZoneName(tile.coordinate),
      centerLat: this.tileToLatLon(tile.coordinate).lat,
      centerLon: this.tileToLatLon(tile.coordinate).lon,
      radius: 300,
      tiles: [tile.coordinate],
      overallFamiliarity: tile.familiarityScore,
      visitCount: tile.visitCount,
      lastVisit: tile.lastVisit,
    }));
  }

  private calculateExplorationRate(): void {
    // Look at last 10 tile entries
    const recentTiles = Array.from(this.visitedTiles.values())
      .sort((a, b) => b.lastVisit - a.lastVisit)
      .slice(0, 10);

    if (recentTiles.length === 0) {
      this.state.recentExplorationRate = 0;
      return;
    }

    // Count how many are new or low-familiarity
    const newOrUnfamiliarCount = recentTiles.filter(t => t.familiarityScore < 0.4).length;
    this.state.recentExplorationRate = newOrUnfamiliarCount / recentTiles.length;
  }

  // ==========================================================================
  // TILE UTILITIES
  // ==========================================================================

  private latLonToTile(lat: number, lon: number, zoom: number): TileCoordinate {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
    );
    return { x, y, zoom };
  }

  private tileToLatLon(tile: TileCoordinate): { lat: number; lon: number } {
    const n = Math.pow(2, tile.zoom);
    const lon = (tile.x / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tile.y) / n)));
    const lat = (latRad * 180) / Math.PI;
    return { lat, lon };
  }

  private tileToKey(tile: TileCoordinate): string {
    return `${tile.zoom}/${tile.x}/${tile.y}`;
  }

  private generateZoneName(tile: TileCoordinate): string {
    return `Zone ${tile.x},${tile.y}`;
  }

  // ==========================================================================
  // STORAGE
  // ==========================================================================

  private saveToStorage(): void {
    try {
      const data = {
        tiles: Array.from(this.visitedTiles.entries()),
        state: this.state,
        lastSaved: Date.now(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      console.log(`[FamiliarityHeatmap] Saved ${this.visitedTiles.size} tiles to storage`);
    } catch (error) {
      console.error('[FamiliarityHeatmap] Failed to save to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.visitedTiles = new Map(parsed.tiles);
        this.state = parsed.state;
        
        // Prune old tiles
        this.pruneOldTiles();

        console.log(`[FamiliarityHeatmap] Loaded ${this.visitedTiles.size} tiles from storage`);
      }
    } catch (error) {
      console.error('[FamiliarityHeatmap] Failed to load from storage:', error);
    }
  }

  private pruneOldTiles(): void {
    const expiryTime = Date.now() - this.TILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    let prunedCount = 0;

    for (const [key, tile] of this.visitedTiles.entries()) {
      if (tile.lastVisit < expiryTime) {
        this.visitedTiles.delete(key);
        prunedCount++;
      }
    }

    // If still too many, remove least familiar
    if (this.visitedTiles.size > this.MAX_TILES_STORED) {
      const sorted = Array.from(this.visitedTiles.entries())
        .sort((a, b) => a[1].familiarityScore - b[1].familiarityScore);
      
      const toRemove = this.visitedTiles.size - this.MAX_TILES_STORED;
      for (let i = 0; i < toRemove; i++) {
        this.visitedTiles.delete(sorted[i][0]);
        prunedCount++;
      }
    }

    if (prunedCount > 0) {
      console.log(`[FamiliarityHeatmap] Pruned ${prunedCount} old/unfamiliar tiles`);
    }
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  getState(): FamiliarityHeatmapState {
    return { ...this.state };
  }

  getFamiliarityAtLocation(latitude: number, longitude: number): number {
    const tile = this.latLonToTile(latitude, longitude, this.ZOOM_LEVEL);
    const tileKey = this.tileToKey(tile);
    const visitedTile = this.visitedTiles.get(tileKey);
    return visitedTile ? visitedTile.familiarityScore : 0;
  }

  getMostFamiliarZones(): FamiliarityZone[] {
    return [...this.state.mostFamiliarZones];
  }

  getCurrentTileFamiliarity(): number {
    return this.state.currentTileFamiliarity;
  }

  isExploring(): boolean {
    return this.state.recentExplorationRate > 0.6;
  }

  getTileData(latitude: number, longitude: number): VisitedTile | null {
    const tile = this.latLonToTile(latitude, longitude, this.ZOOM_LEVEL);
    const tileKey = this.tileToKey(tile);
    return this.visitedTiles.get(tileKey) || null;
  }

  onStateChange(callback: (state: FamiliarityHeatmapState) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  reset(): void {
    this.stop();
    this.visitedTiles.clear();
    this.currentTile = null;
    this.currentTileEntryTime = 0;
    this.state = {
      totalTilesVisited: 0,
      totalVisits: 0,
      totalDwellTime: 0,
      mostFamiliarZones: [],
      leastFamiliarZones: [],
      currentTileFamiliarity: 0,
      recentExplorationRate: 0,
    };
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('[FamiliarityHeatmap] Reset all data');
  }

  exportData(): string {
    const data = {
      tiles: Array.from(this.visitedTiles.entries()),
      state: this.state,
      exportedAt: Date.now(),
    };
    return JSON.stringify(data, null, 2);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let familiarityHeatmapEngineInstance: FamiliarityHeatmapEngine | null = null;

export function getFamiliarityHeatmapEngine(): FamiliarityHeatmapEngine {
  if (!familiarityHeatmapEngineInstance) {
    familiarityHeatmapEngineInstance = new FamiliarityHeatmapEngine();
  }
  return familiarityHeatmapEngineInstance;
}

export default getFamiliarityHeatmapEngine;
