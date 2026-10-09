import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate(location.state?.from?.pathname || '/play', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden relative"
      style={{ backgroundImage: 'url(/login-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Subtle darkening: heavier at edges so the card reads, art stays vivid */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.25) 0%, rgba(9,9,11,0.05) 45%, rgba(9,9,11,0.45) 100)' }} />

      {/* Login box pinned to the far right (empty space in the artwork) */}
      <div className="relative z-10 h-full flex items-center justify-end">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md px-6 md:pr-14"
        >
          <div className="glass-card p-8 rounded-2xl">
            {/* Brand */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center text-2xl font-black"
                style={{ background: 'linear-gradient(135deg,#f7931a,#c96f08)', color: '#09090b' }}>
                ₿
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-black tracking-wide leading-tight" style={{ color: '#fafafa' }}>
                CryptoMania <span className="text-heisenberg-neon">Casino</span> LLC
              </h1>
              <div className="mt-3 h-px bg-gradient-to-r from-transparent via-heisenberg-neon/30 to-transparent" />
            </div>

            <h2 className="text-heisenberg-muted text-xs font-display tracking-[0.25em] uppercase text-center mb-6">
              Sign In to Play
            </h2>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <input
                  className="input-field"
                  placeholder="Username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <input
                  className="input-field"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  'ENTER THE CASINO'
                )}
              </button>
            </form>

            <p className="text-center text-heisenberg-muted text-sm mt-6">
              New player?{' '}
              <Link to="/register" state={location.state} className="text-heisenberg-neon hover:text-white transition-colors font-semibold">
                Create Account
              </Link>
            </p>

            <p className="flex items-center justify-center gap-1.5 text-center text-heisenberg-muted/60 text-[10px] font-mono mt-5">
              <ShieldCheck size={11} className="text-heisenberg-green" />
              2,000+ cryptocurrencies accepted for deposits · not just Bitcoin
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
