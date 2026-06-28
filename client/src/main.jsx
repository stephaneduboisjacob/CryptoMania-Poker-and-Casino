import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

if (Capacitor.isNativePlatform()) {
  axios.defaults.baseURL = 'https://poker.btcpay.exchange';
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark });
    StatusBar.setBackgroundColor({ color: '#0a0a0f' });
  });
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    SplashScreen.hide();
  });
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111120',
            color: '#e0e0ff',
            border: '1px solid #1e1e3a',
            fontFamily: '"Exo 2", sans-serif',
          },
          success: { iconTheme: { primary: '#00ff88', secondary: '#111120' } },
          error: { iconTheme: { primary: '#ff3355', secondary: '#111120' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
