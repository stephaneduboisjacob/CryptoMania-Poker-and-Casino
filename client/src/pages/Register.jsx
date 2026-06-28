import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Passwords do not match');
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await register(username, password);
      toast.success('Welcome to Heisenberg Rooms!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
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
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        <div className="glass-card p-8 rounded-2xl" style={{ boxShadow: '0 0 60px #ff6b0011, 0 0 120px #ff6b0008' }}>
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-black tracking-widest mb-1" style={{ color: '#00d4ff', textShadow: '0 0 20px #00d4ff, 0 0 40px #00d4ff44' }}>
              HEISENBERG
            </h1>
            <p className="font-display text-sm tracking-[0.4em] text-heisenberg-orange font-semibold">ROOMS</p>
            <div className="mt-3 h-px bg-gradient-to-r from-transparent via-heisenberg-orange/30 to-transparent" />
          </div>

          <h2 className="text-heisenberg-muted text-sm font-display tracking-widest uppercase text-center mb-6">
            Create Account
          </h2>

          <form onSubmit={submit} className="space-y-4">
            <input
              className="input-field"
              placeholder="Username (3-20 characters)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              pattern="[a-zA-Z0-9_]{3,20}"
              title="3-20 alphanumeric characters"
              required
            />
            <input
              className="input-field"
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <input
              className="input-field"
              type="password"
              placeholder="Confirm Password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'JOIN THE GAME'}
            </button>
          </form>

          <p className="text-center text-heisenberg-muted text-sm mt-6">
            Already a player?{' '}
            <Link to="/login" className="text-heisenberg-neon hover:text-white transition-colors font-semibold">Sign In</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
