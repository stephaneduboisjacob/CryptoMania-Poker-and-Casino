import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

if (Capacitor.isNativePlatform()) {
  axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://10.0.2.2:3001';
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: '#08090b' });
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
            background: '#141416',
            color: '#fafafa',
            border: '1px solid rgba(255,255,255,0.09)',
            fontFamily: '"Inter", sans-serif',
            borderRadius: '12px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#141416' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#141416' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
