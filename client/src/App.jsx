import { Component, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { MotionConfig } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import Casino from './pages/Casino';
import CasinoTable from './pages/CasinoTable';
import BlackjackTable from './pages/BlackjackTable';
import RouletteTable from './pages/RouletteTable';
import SlotMachine from './pages/SlotMachine';
import DiceGame from './pages/DiceGame';
import VideoPoker from './pages/VideoPoker';
import PlinkoGame from './pages/PlinkoGame';
import BaccaratTable from './pages/BaccaratTable';
import Fair from './pages/Fair';
import MyBets from './pages/MyBets';
import CrashGame from './pages/CrashGame';
import MinesGame from './pages/MinesGame';
import Game from './pages/Game';
import Wallet from './pages/Wallet';
import AdminDashboard from './pages/Admin';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Help from './pages/Help';
import Settings from './pages/Settings';
import Friends from './pages/Friends';
import SupportChat from './components/SupportChat';

function PrivateRoute({ children }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center"><div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" /></div>;
  return user ? children : <Navigate to="/login" state={{ from: location }} replace />;
}

function AdminRoute({ children }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!user.isAdmin) return <Navigate to="/play" replace />;
  return children;
}

function PublicRoute({ children }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to={location.state?.from?.pathname || '/play'} replace />;
}

class CasinoErrorBoundary extends Component {
  state = { failed: false, details: '' };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[casino] page render failed', error, info.componentStack);
    this.setState({ details: error?.message || String(error) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-[#09090b] px-5 py-16 text-center text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-heisenberg-gold/20 bg-white/[0.03] p-8">
          <p className="font-mono text-[10px] tracking-[0.25em] text-heisenberg-gold">CASINO LOBBY</p>
          <h1 className="mt-3 font-display text-2xl font-black">We hit a loading error</h1>
          <p className="mt-2 text-sm text-white/55">Your balance and bets have not been changed. Reload the lobby to try again.</p>
          {this.state.details && <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-left font-mono text-[11px] leading-relaxed text-amber-200/80">{this.state.details}</pre>}
          <button onClick={() => window.location.reload()} className="btn-primary mt-6 px-5 py-2.5 text-xs">Reload casino</button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const location = useLocation();

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
      <MotionConfig reducedMotion="user">
      <Routes>
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/"         element={<Landing />} />
        <Route path="/play"     element={<PrivateRoute><Lobby /></PrivateRoute>} />
        <Route path="/casino"   element={<PrivateRoute><CasinoErrorBoundary key={location.pathname}><Casino /></CasinoErrorBoundary></PrivateRoute>} />
        <Route path="/casino/table/:tableId" element={<PrivateRoute><CasinoTable /></PrivateRoute>} />
        <Route path="/casino/game/:gameId" element={<PrivateRoute><CasinoErrorBoundary key={location.pathname}><Casino /></CasinoErrorBoundary></PrivateRoute>} />
        <Route path="/casino/slots" element={<Navigate to="/casino/game/slots" replace />} />
        <Route path="/casino/blackjack/:tableId" element={<PrivateRoute><BlackjackTable /></PrivateRoute>} />
        <Route path="/casino/roulette/:tableId" element={<PrivateRoute><RouletteTable /></PrivateRoute>} />
        <Route path="/casino/baccarat/:tableId" element={<PrivateRoute><BaccaratTable /></PrivateRoute>} />
        <Route path="/casino/slots/:machineId" element={<PrivateRoute><SlotMachine /></PrivateRoute>} />
        <Route path="/casino/dice" element={<PrivateRoute><DiceGame /></PrivateRoute>} />
        <Route path="/casino/videopoker" element={<PrivateRoute><VideoPoker /></PrivateRoute>} />
        <Route path="/casino/plinko" element={<PrivateRoute><PlinkoGame /></PrivateRoute>} />
        <Route path="/casino/fair" element={<PrivateRoute><Fair /></PrivateRoute>} />
        <Route path="/casino/bets" element={<PrivateRoute><MyBets /></PrivateRoute>} />
        <Route path="/casino/crash/:tableId" element={<PrivateRoute><CrashGame /></PrivateRoute>} />
        <Route path="/casino/mines" element={<PrivateRoute><MinesGame /></PrivateRoute>} />
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
      <SupportChat />
      </MotionConfig>
    </AuthProvider>
  );
}
