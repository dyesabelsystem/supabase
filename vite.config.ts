import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for "__dirname is not defined" in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'sw.ts',
          injectRegister: null,
          // Install updates in the background, but leave them waiting until all
          // open app tabs close. This avoids an automatic in-session refresh.
          registerType: 'prompt',
          includeAssets: [
            'favicon.ico', 
            'icons/favicon-16x16.png',
            'icons/favicon-32x32.png',
            'icons/apple-touch-icon.png', 
            'icons/pwa-192x192.png',
            'icons/pwa-512x512.png',
            'icons/maskable-512x512.png'
          ],
          manifest: {
            name: 'DYESABEL PH Inc.',
            short_name: 'DYESABEL PH Inc.',
            description: 'Developing the Youth with Environmentally Sustainable Advocacies Building and Empowering Lives Philippines, Inc.',
            id: '/',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            display_override: ['standalone', 'minimal-ui', 'browser'],
            orientation: 'portrait',
            theme_color: '#051923',
            background_color: '#051923',
            lang: 'en',
            categories: ['non-profit', 'community', 'education'],
            icons: [
              {
                src: '/icons/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: '/icons/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
              {
                src: '/icons/maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
            screenshots: [
              {
                src: '/screenshots/home-portrait.png',
                sizes: '750x1334',
                type: 'image/png',
                form_factor: 'narrow',
                label: 'Homepage',
              },
              {
                src: '/screenshots/home-landscape.png',
                sizes: '1280x720',
                type: 'image/png',
                form_factor: 'wide',
                label: 'Desktop overview',
              },
            ],
          },
        }),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      },
      build: {
        target: 'esnext',
        outDir: 'build', 
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            // manualChunks removed to prevent circular dependency errors
          },
        },
      },
    };
});
