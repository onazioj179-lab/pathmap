/**
 * Dev-gated debug logging.
 *
 * Hot interaction paths (drag, tracking points, pipeline state changes) log
 * through here so production builds stay silent and pay no formatting cost,
 * while development keeps the full trace. Real errors should still use
 * console.error/console.warn directly.
 */
const enabled = import.meta.env.DEV;

export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (enabled) console.warn(...args);
}
