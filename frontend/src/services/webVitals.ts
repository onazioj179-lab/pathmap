/**
 * V98: Web Vitals Performance Monitoring
 *
 * Tracks Core Web Vitals metrics:
 * - LCP (Largest Contentful Paint) - loading performance
 * - FID (First Input Delay) - interactivity
 * - CLS (Cumulative Layout Shift) - visual stability
 * - FCP (First Contentful Paint) - perceived load speed
 * - TTFB (Time to First Byte) - server responsiveness
 */

import { onCLS, onFCP, onFID, onLCP, onTTFB, Metric } from 'web-vitals';

interface VitalsReport {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
}

// Thresholds based on Google's Core Web Vitals
const thresholds = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = thresholds[name as keyof typeof thresholds];
  if (!threshold) return 'good';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function formatMetric(metric: Metric): VitalsReport {
  return {
    name: metric.name,
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    rating: getRating(metric.name, metric.value),
    delta: Math.round(metric.delta),
    id: metric.id,
    navigationType: metric.navigationType || 'unknown',
  };
}

// Store metrics for potential batch reporting
const collectedMetrics: VitalsReport[] = [];

function handleMetric(metric: Metric): void {
  const report = formatMetric(metric);
  collectedMetrics.push(report);

  // Log to console in development
  if (import.meta.env.DEV) {
    const color =
      report.rating === 'good'
        ? '#22c55e'
        : report.rating === 'needs-improvement'
          ? '#f59e0b'
          : '#ef4444';
    console.log(
      `%c[WebVitals] ${report.name}: ${report.value}${metric.name === 'CLS' ? '' : 'ms'} (${report.rating})`,
      `color: ${color}; font-weight: bold;`
    );
  }

  // Send to analytics in production
  if (import.meta.env.PROD) {
    sendToAnalytics(report);
  }
}

async function sendToAnalytics(report: VitalsReport): Promise<void> {
  try {
    // Send to backend endpoint (silently fail if unavailable)
    await fetch('/api/analytics/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...report,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      }),
      keepalive: true, // Ensure request completes even on page unload
    }).catch(() => {});
  } catch {
    // Silently fail - don't affect user experience
  }
}

// Initialize web vitals tracking
export function initWebVitals(): void {
  onCLS(handleMetric);
  onFCP(handleMetric);
  onFID(handleMetric);
  onLCP(handleMetric);
  onTTFB(handleMetric);

  console.log('[V98] Web Vitals monitoring initialized');
}

// Get current metrics summary
export function getVitalsSummary(): VitalsReport[] {
  return [...collectedMetrics];
}

// Check if all Core Web Vitals are passing
export function areVitalsPassing(): boolean {
  const coreVitals = ['LCP', 'FID', 'CLS'];
  return coreVitals.every(name => {
    const metric = collectedMetrics.find(m => m.name === name);
    return !metric || metric.rating !== 'poor';
  });
}

export default initWebVitals;
