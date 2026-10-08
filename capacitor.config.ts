import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.getsmartmedia.player',
  appName: 'Get Smart Media Player',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
