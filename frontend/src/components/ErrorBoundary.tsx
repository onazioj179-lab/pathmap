/**
 * V98: Global Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 * 
 * Features:
 * - Graceful error handling
 * - Error logging to console (can be extended to error reporting service)
 * - User-friendly fallback UI
 * - Retry functionality
 * - Production-ready with sanitized error messages
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console (can be extended to error reporting service)
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    this.setState({ errorInfo });
    
    // V98: Send error to backend for logging (optional)
    this.reportError(error, errorInfo);
  }

  private async reportError(error: Error, errorInfo: ErrorInfo): Promise<void> {
    try {
      // Only report in production
      if (import.meta.env.PROD) {
        await fetch('/api/errors/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
          })
        }).catch(() => {
          // Silently fail if error reporting fails
        });
      }
    } catch {
      // Don't let error reporting cause more errors
    }
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.iconContainer}>
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0066FF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            
            <h1 style={styles.title}>Something went wrong</h1>
            
            <p style={styles.message}>
              We're sorry, but something unexpected happened. 
              Please try again or refresh the page.
            </p>
            
            {/* Show error details in development */}
            {import.meta.env.DEV && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details (Dev Only)</summary>
                <pre style={styles.errorStack}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            
            <div style={styles.buttonContainer}>
              <button
                onClick={this.handleRetry}
                style={styles.primaryButton}
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                style={styles.secondaryButton}
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Inline styles matching PathMap's design system
const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center' as const,
    border: '1px solid #222222'
  },
  iconContainer: {
    marginBottom: '24px'
  },
  title: {
    color: '#FFFFFF',
    fontSize: '24px',
    fontWeight: 600,
    marginBottom: '16px',
    margin: '0 0 16px 0'
  },
  message: {
    color: '#888888',
    fontSize: '16px',
    lineHeight: 1.6,
    marginBottom: '24px',
    margin: '0 0 24px 0'
  },
  details: {
    backgroundColor: '#1a1a1a',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    textAlign: 'left' as const
  },
  summary: {
    color: '#0066FF',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '12px'
  },
  errorStack: {
    color: '#ff6b6b',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    margin: '12px 0 0 0',
    padding: '12px',
    backgroundColor: '#0d0d0d',
    borderRadius: '4px'
  },
  buttonContainer: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap' as const
  },
  primaryButton: {
    backgroundColor: '#0066FF',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: '#0066FF',
    border: '1px solid #0066FF',
    borderRadius: '8px',
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default ErrorBoundary;
