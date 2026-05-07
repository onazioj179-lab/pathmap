/**
 * PATHMAP V97 - Route History Persistence Service
 * ================================================
 * Stores and retrieves route history for replay functionality.
 * Uses Service Worker for background persistence.
 */

export interface StoredRoute {
  id: number;
  route: {
    path: [number, number][];
    algorithm: string;
    distance: number;
    steps: number;
    start: [number, number];
    end: [number, number];
    eta?: string;
    safety?: number;
  };
  timestamp: string;
}

class RouteHistoryService {
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    if ('serviceWorker' in navigator) {
      try {
        this.swRegistration = await navigator.serviceWorker.ready;
        console.log('[RouteHistory] Service worker ready');
      } catch (error) {
        console.warn('[RouteHistory] Service worker not available:', error);
      }
    }
  }

  /**
   * Store a route for later replay
   */
  async storeRoute(route: StoredRoute['route']): Promise<boolean> {
    if (!this.swRegistration?.active) {
      console.warn('[RouteHistory] Service worker not active');
      // Fallback to localStorage
      return this.storeRouteLocal(route);
    }

    return new Promise(resolve => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = () => {
        resolve(true);
      };

      setTimeout(() => resolve(true), 100); // Assume success if no response

      this.swRegistration!.active!.postMessage({ type: 'STORE_ROUTE', route }, [
        messageChannel.port2,
      ]);
    });
  }

  /**
   * Get route history for replay
   */
  async getHistory(limit: number = 20): Promise<StoredRoute[]> {
    if (!this.swRegistration?.active) {
      console.warn('[RouteHistory] Service worker not active');
      return this.getHistoryLocal(limit);
    }

    return new Promise(resolve => {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = event => {
        if (event.data.type === 'ROUTE_HISTORY') {
          resolve(event.data.history || []);
        }
      };

      // Timeout fallback
      setTimeout(() => {
        resolve(this.getHistoryLocal(limit));
      }, 1000);

      this.swRegistration!.active!.postMessage({ type: 'GET_ROUTE_HISTORY', limit }, [
        messageChannel.port2,
      ]);
    });
  }

  /**
   * LocalStorage fallback for storing routes
   */
  private storeRouteLocal(route: StoredRoute['route']): boolean {
    try {
      const key = 'pathmap_route_history';
      const stored = localStorage.getItem(key);
      const history: StoredRoute[] = stored ? JSON.parse(stored) : [];

      history.push({
        id: Date.now(),
        route,
        timestamp: new Date().toISOString(),
      });

      // Keep only last 50
      const trimmed = history.slice(-50);
      localStorage.setItem(key, JSON.stringify(trimmed));
      return true;
    } catch (error) {
      console.error('[RouteHistory] Local storage failed:', error);
      return false;
    }
  }

  /**
   * LocalStorage fallback for getting history
   */
  private getHistoryLocal(limit: number): StoredRoute[] {
    try {
      const stored = localStorage.getItem('pathmap_route_history');
      if (!stored) return [];

      const history: StoredRoute[] = JSON.parse(stored);
      return history.slice(-limit).reverse();
    } catch (error) {
      console.error('[RouteHistory] Local storage read failed:', error);
      return [];
    }
  }

  /**
   * Clear all route history
   */
  async clearHistory(): Promise<void> {
    localStorage.removeItem('pathmap_route_history');
    // Note: SW IndexedDB clear would need another message type
  }

  /**
   * Get total count of stored routes
   */
  async getCount(): Promise<number> {
    const history = await this.getHistory(1000);
    return history.length;
  }
}

export const routeHistoryService = new RouteHistoryService();
