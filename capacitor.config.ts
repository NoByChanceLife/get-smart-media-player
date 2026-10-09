import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.getsmartmedia.player',
  appName: 'Get Smart Media Player',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Use a native-only origin so service workers/caches previously registered
    // on Capacitor's default https://localhost origin cannot control APK assets.
    hostname: 'getsmart.localhost',
  },
};

export default config;
