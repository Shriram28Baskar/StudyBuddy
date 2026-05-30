import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables for the current mode (development / production)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // ── Plugins ────────────────────────────────────────────────────────
    plugins: [
      react({
        // Enable fast refresh for all JS/JSX/TSX files
        fastRefresh: true,
      }),
    ],

    // ── Path aliases ───────────────────────────────────────────────────
    // Allows clean imports like:  import Button from '@/components/ui/Button'
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    // ── Dev server ─────────────────────────────────────────────────────
    server: {
      port: 5173,
      strictPort: true,   // fail fast if port is taken
      open: false,        // don't auto-open browser (change to true if preferred)

      // Proxy all /api calls to FastAPI backend — avoids CORS issues in dev
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          secure: false,
        },
      },
    },

    // ── Preview server (for `vite preview`) ───────────────────────────
    preview: {
      port: 4173,
      strictPort: true,
    },

    // ── Build ──────────────────────────────────────────────────────────
    build: {
      outDir: 'dist',
      sourcemap: mode === 'development',  // source maps only in dev builds
      minify: 'esbuild',
      target: 'es2020',

      rollupOptions: {
        output: {
          // Split vendor chunks for better caching
          manualChunks: {
            react:    ['react', 'react-dom'],
            router:   ['react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          },
        },
      },

      // Warn if any chunk exceeds 600 KB
      chunkSizeWarningLimit: 600,
    },

    // ── CSS ────────────────────────────────────────────────────────────
    css: {
      devSourcemap: true,
    },

    // ── Optimise deps ──────────────────────────────────────────────────
    // Pre-bundle heavy deps for faster cold starts
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'axios',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/storage',
      ],
    },

    // ── Environment variable prefix ────────────────────────────────────
    // Only variables prefixed with VITE_ are exposed to client-side code
    envPrefix: 'VITE_',
  }
})