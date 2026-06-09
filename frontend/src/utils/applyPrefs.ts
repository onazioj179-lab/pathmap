/**
 * applyPrefs - reflect accessibility/appearance preferences onto the DOM root.
 *
 * Extends the original applyThemePref pattern: in addition to the theme, it sets
 * root data-attributes that the stylesheet keys off, so the existing-but-inert
 * toggles (reduced motion, high contrast, text size) actually take effect:
 *   data-pathmap-theme = dark | light
 *   data-reduced-motion = true | false
 *   data-contrast = high | normal
 *   data-text-scale = normal | large | xl  (+ --text-scale CSS var)
 */

export type AppearanceTheme = 'dark' | 'light' | 'system';
export type TextSize = 'normal' | 'large' | 'xl';

export interface AppearancePrefs {
  theme: AppearanceTheme;
  reducedMotion: boolean;
  highContrast: boolean;
  textSize: TextSize;
}

const TEXT_SCALE: Record<TextSize, string> = {
  normal: '1',
  large: '1.15',
  xl: '1.3',
};

/** Resolve 'system' to the OS color scheme; pass dark/light through. */
export function resolveTheme(theme: AppearanceTheme): 'dark' | 'light' {
  if (theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'light' ? 'light' : 'dark';
}

export function applyPrefs(p: AppearancePrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.pathmapTheme = resolveTheme(p.theme);
  root.dataset.reducedMotion = String(!!p.reducedMotion);
  root.dataset.contrast = p.highContrast ? 'high' : 'normal';
  root.dataset.textScale = p.textSize;
  root.style.setProperty('--text-scale', TEXT_SCALE[p.textSize] ?? '1');
}

export default applyPrefs;
