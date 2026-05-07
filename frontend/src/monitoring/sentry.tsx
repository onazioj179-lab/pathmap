/**
 * PATHMAP - Sentry Frontend Integration
 * =====================================
 * Client-side error tracking and performance monitoring.
 */

import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

// Configuration
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || 'development';
const RELEASE_VERSION = import.meta.env.VITE_RELEASE_VERSION || '1.0.0';

/**
 * Initialize Sentry for React application.
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: `pathmap-frontend@${RELEASE_VERSION}`,

    // Integrations
    integrations: [
      // React Router integration
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),

      // Replay for session recording
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Sampling
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Options
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    debug: ENVIRONMENT === 'development',

    // Before send filter
    beforeSend(event, hint) {
      // Don't send in development unless explicitly enabled
      if (ENVIRONMENT === 'development' && !import.meta.env.VITE_SENTRY_DEV_ENABLED) {
        return null;
      }

      // Filter specific errors
      const error = hint?.originalException;
      if (error instanceof Error) {
        // Ignore network errors during development
        if (error.message.includes('NetworkError') && ENVIRONMENT !== 'production') {
          return null;
        }

        // Ignore cancelled requests
        if (error.message.includes('AbortError')) {
          return null;
        }
      }

      return event;
    },

    // Before sending transactions
    beforeSendTransaction(event) {
      // Don't trace health checks
      if (event.transaction?.includes('/health') || event.transaction?.includes('/api/v1/health')) {
        return null;
      }
      return event;
    },
  });

  console.log(`Sentry initialized for ${ENVIRONMENT}`);
}

/**
 * Set user context for error tracking.
 */
export function setUser(user: { id: string; username?: string; email?: string }): void {
  Sentry.setUser({
    id: user.id,
    username: user.username,
    email: user.email,
  });
}

/**
 * Clear user context (on logout).
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging.
 */
export function addBreadcrumb(
  message: string,
  category: string = 'custom',
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, any>
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

/**
 * Set tag for filtering.
 */
export function setTag(key: string, value: string): void {
  Sentry.setTag(key, value);
}

/**
 * Set extra context data.
 */
export function setExtra(key: string, value: any): void {
  Sentry.setExtra(key, value);
}

/**
 * Capture exception with context.
 */
export function captureException(error: Error, context?: Record<string, any>): string {
  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture message event.
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, any>
): string {
  return Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Start a performance transaction.
 */
export function startTransaction(name: string, op: string = 'task'): Sentry.Span | undefined {
  return Sentry.startInactiveSpan({
    name,
    op,
  });
}

/**
 * Sentry Error Boundary component.
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/**
 * Sentry profiler HOC.
 */
export const withSentryProfiler = Sentry.withProfiler;

/**
 * Custom error boundary fallback component.
 */
export function ErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-gray-400 mb-4">We've been notified and are working to fix this issue.</p>
        <pre className="text-sm bg-gray-800 p-4 rounded mb-4 overflow-auto text-left">
          {error.message}
        </pre>
        <button
          onClick={resetError}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

/**
 * Wrap app with Sentry error boundary.
 */
export function SentryProvider({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <SentryErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallback
          error={error instanceof Error ? error : new Error(String(error))}
          resetError={resetError}
        />
      )}
      showDialog
    >
      {children}
    </SentryErrorBoundary>
  );
}

// Export Sentry for direct access if needed
export { Sentry };
