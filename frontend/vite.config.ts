import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-friendly __dirname for Node >=18
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // V97: Production/staging build configs
  define: {
    __DEV__: mode === 'development',
    __PROD__: mode === 'production',
    __VERSION__: JSON.stringify(process.env.npm_package_version || '97.0.0'),
  },
  // V97: Optimized chunk splitting for better caching
  build: {
    target: 'esnext',
    minify: mode === 'production' ? 'esbuild' : false,
    sourcemap: mode !== 'production',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Vendor chunk splitting - split large dependencies
        manualChunks: id => {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Map libraries (large)
          if (id.includes('node_modules/maplibre-gl/')) {
            return 'vendor-map';
          }
          // Heroicons
          if (id.includes('node_modules/@heroicons/')) {
            return 'vendor-icons';
          }
        },
        // Asset naming for better caching
        assetFileNames: assetInfo => {
          const name = assetInfo.name || '';
          if (/\.(png|jpe?g|svg|gif|webp|ico)$/i.test(name)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(name)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
    // Optimize deps for faster cold starts
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  // V97: Optimized dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'maplibre-gl'],
    exclude: [],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    port: 3002,
    strictPort: true, // Don't try other ports if 3002 is busy
    host: '0.0.0.0', // Allow network access from other devices (phones on same network)
    proxy: {
      // V1 API routes (social, auth, tracking)
      '/api/v1': 'http://localhost:8000',
      // Legacy routes
      '/route': 'http://localhost:8000',
      '/safe_return': 'http://localhost:8000',
      '/multi_route': 'http://localhost:8000',
      '/compare': 'http://localhost:8000',
      '/explore': 'http://localhost:8000',
      '/live_route': 'http://localhost:8000',
      '/context': 'http://localhost:8000',
      '/world_state': 'http://localhost:8000',
      // V44/V45/V46 routes
      '/v44': 'http://localhost:8000',
      '/v45': 'http://localhost:8000',
      '/api/v44': 'http://localhost:8000',
      '/api/v45': 'http://localhost:8000',
      '/api/v46': 'http://localhost:8000',
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  // Preview server config (for production testing)
  preview: {
    port: 3002,
    strictPort: true,
    host: '0.0.0.0',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
}));
