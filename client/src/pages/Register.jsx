import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Passwords do not match');
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(username, password);
      navigate(location.state?.from?.pathname || '/play', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden relative"
      style={{ backgroundImage: 'url(/login-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.25) 0%, rgba(9,9,11,0.05) 45%, rgba(9,9,11,0.45) 100)' }} />

      <div className="relative z-10 h-full flex items-center justify-end">
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md px-6 md:pr-14"
        >
          <div className="glass-card p-8 rounded-2xl">
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
              Create Your Account
            </h2>

            <form onSubmit={submit} className="space-y-4">
              <input
                className="input-field"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <input
                className="input-field"
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <input
                className="input-field"
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  'CREATE ACCOUNT'
                )}
              </button>
            </form>

            <p className="text-center text-heisenberg-muted text-sm mt-6">
              Already have an account?{' '}
              <Link to="/login" state={location.state} className="text-heisenberg-neon hover:text-white transition-colors font-semibold">
                Sign In
              </Link>
            </p>
            <p className="text-center text-heisenberg-muted/60 text-[10px] font-mono mt-4">
              2,000+ cryptocurrencies accepted for deposits · 10,000 free practice chips on signup
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
