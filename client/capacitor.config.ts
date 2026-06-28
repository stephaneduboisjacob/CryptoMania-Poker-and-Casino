import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'exchange.btcpay.poker.heisenberg',
  appName: 'Heisenberg Rooms',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['poker.btcpay.exchange', 'node.btcpay.exchange'],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
  },
};

export default config;
