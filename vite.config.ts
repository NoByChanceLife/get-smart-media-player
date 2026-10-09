import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const isNativeBuild = mode === 'capacitor';

  return {
    // Android TV/Fire TV devices can ship older System WebView versions.
    // Compile the packaged web UI to syntax they can parse reliably.
    build: {
      target: 'chrome80',
    },
    plugins: [
      react(),
      tailwindcss(),
      // A service worker is useful for the browser PWA, but must never own the
      // packaged Capacitor origin. Native assets are versioned by the APK and a
      // service worker can otherwise keep serving an older UI after an update.
      ...(!isNativeBuild
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['icon.svg'],
              manifest: {
                id: '/',
                name: 'Get Smart Media Player',
                short_name: 'Get Smart',
                description: 'High-performance smart media and IPTV player with Live TV, EPG, VOD movies & Series.',
                theme_color: '#080b11',
                background_color: '#080b11',
                display: 'standalone',
                orientation: 'any',
                start_url: '/',
                scope: '/',
                icons: [
                  {
                    src: '/icon.svg',
                    sizes: '512x512',
                    type: 'image/svg+xml',
                    purpose: 'any',
                  },
                ],
              },
              devOptions: {
                enabled: true,
              },
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
