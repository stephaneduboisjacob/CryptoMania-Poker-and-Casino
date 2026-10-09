import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'buzz.cryptomania.casino',
  appName: 'CryptoMania Casino',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['localhost', '10.0.2.2'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#09090b',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#09090b',
    },
  },
};

export default config;
