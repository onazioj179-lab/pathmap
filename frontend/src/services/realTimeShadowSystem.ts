/*
 V78: Real-Time Terrain & Building Shadow System (RTSS)
 - Adds hillshade using existing DEM to simulate terrain shadows
 - Adjusts building edges and extrusion shading for clarity
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GLMap = any;

export const realTimeShadowSystem = {
  _addedHillshade: false,
  _hillshadeId: 'v78-hillshade' as const,

  init(map: GLMap, demSourceId = 'v75-terrain-dem') {
    try {
      if (!this._addedHillshade && map.getSource && map.getSource(demSourceId) && !map.getLayer(this._hillshadeId)) {
        map.addLayer({
          id: this._hillshadeId,
          type: 'hillshade',
          source: demSourceId,
          layout: {},
          paint: {
            'hillshade-exaggeration': 0.6,
            'hillshade-shadow-color': '#0b0b0b',
            'hillshade-highlight-color': '#2c2c2c',
            'hillshade-accent-color': '#1a1a1a'
          }
        } as any, 'building-extrusion');
        this._addedHillshade = true;
      }
      // Strengthen building outlines if present
      if (!map.getLayer('v78-building-edges') && map.getLayer('building-extrusion')) {
        try {
          map.addLayer({
            id: 'v78-building-edges',
            type: 'line',
            source: (map.getLayer('building-extrusion') as any).source,
            'source-layer': (map.getLayer('building-extrusion') as any)['source-layer'],
            minzoom: 15,
            paint: {
              'line-color': '#0e0e0e',
              'line-width': 0.6,
              'line-opacity': 0.6
            }
          } as any, 'building-extrusion');
        } catch {}
      }
    } catch (e) {
      console.warn('[V78:RTSS] Partial init', e);
    }
  },

  update(map: GLMap, zoom: number) {
    try {
      if (this._addedHillshade) {
        const ex = zoom < 6 ? 0.35 : zoom < 10 ? 0.5 : 0.7;
        map.setPaintProperty(this._hillshadeId, 'hillshade-exaggeration', ex);
      }
    } catch {}
  }
};
