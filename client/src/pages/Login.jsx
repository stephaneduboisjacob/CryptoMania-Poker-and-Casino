import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center overflow-hidden relative"
      style={{ backgroundImage: 'url(/background-pkr.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-black/50" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="glass-card p-8 rounded-2xl" style={{ boxShadow: '0 0 60px #00d4ff11, 0 0 120px #00d4ff08' }}>
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-black tracking-widest mb-1" style={{ color: '#00d4ff', textShadow: '0 0 20px #00d4ff, 0 0 40px #00d4ff44' }}>
              HEISENBERG
            </h1>
            <p className="font-display text-sm tracking-[0.4em] text-heisenberg-orange font-semibold">ROOMS</p>
            <div className="mt-3 h-px bg-gradient-to-r from-transparent via-heisenberg-neon/30 to-transparent" />
          </div>

          <h2 className="text-heisenberg-muted text-sm font-display tracking-widest uppercase text-center mb-6">
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
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'ENTER THE ROOM'
              )}
            </button>
          </form>

          <p className="text-center text-heisenberg-muted text-sm mt-6">
            New player?{' '}
            <Link to="/register" className="text-heisenberg-neon hover:text-white transition-colors font-semibold">
              Create Account
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
