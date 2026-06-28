import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Wallet from './pages/Wallet';
import AdminDashboard from './pages/Admin';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Help from './pages/Help';
import Settings from './pages/Settings';
import Friends from './pages/Friends';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/" replace />;
}

export default function App() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App: CapApp }) => {
        CapApp.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack) window.history.back();
          else CapApp.exitApp();
        });
      });
    }
  }, []);

  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/"         element={<PrivateRoute><Lobby /></PrivateRoute>} />
        <Route path="/game/:tournamentId" element={<PrivateRoute><Game /></PrivateRoute>} />
        <Route path="/wallet"   element={<PrivateRoute><Wallet /></PrivateRoute>} />
        <Route path="/leaderboard" element={<PrivateRoute><Leaderboard /></PrivateRoute>} />
        <Route path="/profile"  element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/profile/:username" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/friends"  element={<PrivateRoute><Friends /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
        <Route path="/help"     element={<PrivateRoute><Help /></PrivateRoute>} />
        <Route path="/admin"    element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
