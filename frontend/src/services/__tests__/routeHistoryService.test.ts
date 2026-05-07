import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeHistoryService } from '../routeHistoryService';

/**
 * PATHMAP V97 - Route History Service Tests
 * =========================================
 */

describe('RouteHistoryService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('storeRoute', () => {
    it('should store route in localStorage when SW unavailable', async () => {
      const route = {
        path: [
          [9.082, 7.49],
          [9.085, 7.495],
        ] as [number, number][],
        algorithm: 'ShadowPath',
        distance: 500,
        steps: 10,
        start: [9.082, 7.49] as [number, number],
        end: [9.085, 7.495] as [number, number],
      };

      const result = await routeHistoryService.storeRoute(route);
      expect(result).toBe(true);

      const stored = localStorage.getItem('pathmap_route_history');
      expect(stored).toBeTruthy();

      const history = JSON.parse(stored!);
      expect(history.length).toBe(1);
      expect(history[0].route.algorithm).toBe('ShadowPath');
    });

    it('should enforce max entries limit', async () => {
      // Store 60 routes (limit is 50)
      for (let i = 0; i < 60; i++) {
        await routeHistoryService.storeRoute({
          path: [[9.082, 7.49]] as [number, number][],
          algorithm: 'ShadowPath',
          distance: i,
          steps: 1,
          start: [9.082, 7.49] as [number, number],
          end: [9.085, 7.495] as [number, number],
        });
      }

      const stored = localStorage.getItem('pathmap_route_history');
      const history = JSON.parse(stored!);

      expect(history.length).toBe(50);
      // Should keep the newest (highest distance values)
      expect(history[history.length - 1].route.distance).toBe(59);
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history', async () => {
      const history = await routeHistoryService.getHistory();
      expect(history).toEqual([]);
    });

    it('should return routes in reverse chronological order', async () => {
      // Store routes
      for (let i = 0; i < 5; i++) {
        await routeHistoryService.storeRoute({
          path: [[9.082, 7.49]] as [number, number][],
          algorithm: 'ShadowPath',
          distance: i,
          steps: 1,
          start: [9.082, 7.49] as [number, number],
          end: [9.085, 7.495] as [number, number],
        });
      }

      const history = await routeHistoryService.getHistory(5);

      expect(history.length).toBe(5);
      expect(history[0].route.distance).toBe(4); // Most recent first
      expect(history[4].route.distance).toBe(0); // Oldest last
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await routeHistoryService.storeRoute({
          path: [[9.082, 7.49]] as [number, number][],
          algorithm: 'ShadowPath',
          distance: i,
          steps: 1,
          start: [9.082, 7.49] as [number, number],
          end: [9.085, 7.495] as [number, number],
        });
      }

      const history = await routeHistoryService.getHistory(3);
      expect(history.length).toBe(3);
    });
  });

  describe('clearHistory', () => {
    it('should clear all stored routes', async () => {
      await routeHistoryService.storeRoute({
        path: [[9.082, 7.49]] as [number, number][],
        algorithm: 'ShadowPath',
        distance: 100,
        steps: 1,
        start: [9.082, 7.49] as [number, number],
        end: [9.085, 7.495] as [number, number],
      });

      await routeHistoryService.clearHistory();

      const history = await routeHistoryService.getHistory();
      expect(history).toEqual([]);
    });
  });

  describe('getCount', () => {
    it('should return correct count of stored routes', async () => {
      for (let i = 0; i < 7; i++) {
        await routeHistoryService.storeRoute({
          path: [[9.082, 7.49]] as [number, number][],
          algorithm: 'ShadowPath',
          distance: i,
          steps: 1,
          start: [9.082, 7.49] as [number, number],
          end: [9.085, 7.495] as [number, number],
        });
      }

      const count = await routeHistoryService.getCount();
      expect(count).toBe(7);
    });
  });
});
