/**
 * PATHMAP V97 - Optimized Image Component
 * =======================================
 * Lazy loading images with WebP support, srcset, and blur placeholders.
 */

import React, { useState, useRef, useEffect, memo } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  placeholder?: 'blur' | 'empty' | 'skeleton';
  blurDataURL?: string;
  priority?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  sizes?: string;
  srcSet?: string;
}

// Generate low-quality placeholder
export function generatePlaceholder(width: number = 10, height: number = 10): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#1a1a1a"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Check WebP support
let webpSupported: boolean | null = null;
export function checkWebPSupport(): Promise<boolean> {
  if (webpSupported !== null) return Promise.resolve(webpSupported);

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      webpSupported = img.width > 0;
      resolve(webpSupported);
    };
    img.onerror = () => {
      webpSupported = false;
      resolve(false);
    };
    img.src = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
  });
}

/**
 * Optimized Image Component with lazy loading
 */
export const OptimizedImage = memo(function OptimizedImage({
  src,
  alt,
  width,
  height,
  className = '',
  placeholder = 'skeleton',
  blurDataURL,
  priority = false,
  onLoad,
  onError,
  sizes,
  srcSet,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isLoaded) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority, isLoaded]);

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  // Handle image error
  const handleError = () => {
    setIsError(true);
    onError?.();
  };

  // Generate placeholder based on type
  const getPlaceholderStyle = (): React.CSSProperties => {
    if (placeholder === 'blur' && blurDataURL) {
      return {
        backgroundImage: `url(${blurDataURL})`,
        backgroundSize: 'cover',
        filter: 'blur(10px)',
      };
    }
    if (placeholder === 'skeleton') {
      return {
        background: 'linear-gradient(90deg, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      };
    }
    return { backgroundColor: '#1a1a1a' };
  };

  // Container styles
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: width ? `${width}px` : '100%',
    height: height ? `${height}px` : 'auto',
    aspectRatio: width && height ? `${width}/${height}` : undefined,
  };

  // Image styles
  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
  };

  // Placeholder styles
  const placeholderStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: isLoaded ? 0 : 1,
    transition: 'opacity 0.3s ease-in-out',
    ...getPlaceholderStyle(),
  };

  if (isError) {
    return (
      <div
        ref={containerRef}
        style={{ ...containerStyle, backgroundColor: '#2a2a2a' }}
        className={className}
        aria-label={`Failed to load: ${alt}`}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
            fontSize: '12px',
          }}
        >
          ⚠️ Image unavailable
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle} className={className}>
      {/* Placeholder */}
      <div style={placeholderStyle} aria-hidden="true" />

      {/* Actual image (only render when in view) */}
      {isInView && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          style={imageStyle}
          sizes={sizes}
          srcSet={srcSet}
        />
      )}
    </div>
  );
});

/**
 * Hook for preloading images
 */
export function useImagePreload(src: string): boolean {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => setIsLoaded(true);
    img.onerror = () => setIsLoaded(true); // Consider loaded even on error

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return isLoaded;
}

/**
 * Generate responsive srcset for an image
 */
export function generateSrcSet(
  baseSrc: string,
  widths: number[] = [320, 640, 960, 1280, 1920]
): string {
  // This assumes a URL pattern like: /images/photo.jpg -> /images/photo-640.jpg
  const parts = baseSrc.split('.');
  const ext = parts.pop();
  const base = parts.join('.');

  return widths.map(w => `${base}-${w}.${ext} ${w}w`).join(', ');
}

// CSS for skeleton animation (add to global styles)
export const shimmerCSS = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

export default OptimizedImage;
