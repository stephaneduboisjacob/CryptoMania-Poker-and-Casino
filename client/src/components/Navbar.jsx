import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { LogOut, Wallet, LayoutDashboard, Trophy, UserCircle2, Settings, Users2, HelpCircle, Menu, X, Home } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/leaderboard', icon: Trophy,       label: 'Ranks',    color: 'text-heisenberg-gold'   },
  { to: '/profile',     icon: UserCircle2,  label: 'Profile',  color: 'text-heisenberg-neon'   },
  { to: '/friends',     icon: Users2,       label: 'Friends',  color: 'text-heisenberg-purple' },
  { to: '/wallet',      icon: Wallet,       label: 'Wallet',   color: 'text-heisenberg-muted'  },
  { to: '/settings',    icon: Settings,     label: 'Settings', color: 'text-heisenberg-muted'  },
  { to: '/help',        icon: HelpCircle,   label: 'Help',     color: 'text-heisenberg-muted'  },
];

export default function Navbar({ btcPrice }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    navigate('/login');
    toast.success('Signed out');
  };

  const profileTo = `/profile/${user?.username}`;

  return (
    <>
      {/* Top bar — always visible */}
      <nav className="relative z-20 shrink-0 border-b border-heisenberg-border/40 bg-heisenberg-bg/80 backdrop-blur-md">
        <div className="container mx-auto px-3 max-w-6xl flex items-center justify-between h-12 md:h-14">
          <Link to="/" className="font-display font-black tracking-widest text-sm md:text-base flex items-center gap-1.5 shrink-0"
            style={{ color: '#00d4ff', textShadow: '0 0 10px #00d4ff66' }}>
            HEISENBERG <span className="text-heisenberg-orange">ROOMS</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-0.5">
            {btcPrice && (
              <span className="text-heisenberg-gold text-xs font-mono hidden lg:block mr-3">
                ₿ ${btcPrice.toLocaleString()}
              </span>
            )}
            {NAV_ITEMS.map(({ to, icon: Icon, label, color }) => {
              const dest = to === '/profile' ? profileTo : to;
              const isActive = location.pathname === to || (to === '/profile' && location.pathname.startsWith('/profile'));
              return (
                <Link key={to} to={dest}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all ${
                    isActive ? 'bg-heisenberg-card/80 text-white' : `${color} hover:text-white hover:bg-heisenberg-card/60`
                  }`}>
                  <Icon size={15} />
                  <span className="text-[9px] font-display tracking-wider uppercase leading-none">{label}</span>
                </Link>
              );
            })}
            {user?.isAdmin && (
              <Link to="/admin"
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all text-heisenberg-purple hover:text-white hover:bg-heisenberg-card/60">
                <LayoutDashboard size={15} />
                <span className="text-[9px] font-display tracking-wider uppercase leading-none">Admin</span>
              </Link>
            )}
            <button onClick={handleLogout}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all text-heisenberg-muted hover:text-heisenberg-red hover:bg-heisenberg-card/60">
              <LogOut size={15} />
              <span className="text-[9px] font-display tracking-wider uppercase leading-none">Exit</span>
            </button>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMenuOpen(o => !o)} className="md:hidden p-2 text-heisenberg-muted">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-heisenberg-bg/95 backdrop-blur-md pt-14">
          <div className="flex flex-col items-center gap-2 p-6">
            <Link to="/" onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 w-full max-w-xs px-5 py-3 rounded-xl transition-all ${
                location.pathname === '/' ? 'bg-heisenberg-card text-white' : 'text-heisenberg-neon hover:bg-heisenberg-card/60'
              }`}>
              <Home size={18} />
              <span className="font-display text-sm tracking-widest uppercase">Lobby</span>
            </Link>
            {btcPrice && (
              <p className="text-heisenberg-gold text-sm font-mono mb-2">₿ ${btcPrice.toLocaleString()}</p>
            )}
            {NAV_ITEMS.map(({ to, icon: Icon, label, color }) => {
              const dest = to === '/profile' ? profileTo : to;
              const isActive = location.pathname === to || (to === '/profile' && location.pathname.startsWith('/profile'));
              return (
                <Link key={to} to={dest} onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 w-full max-w-xs px-5 py-3 rounded-xl transition-all ${
                    isActive ? 'bg-heisenberg-card text-white' : `${color} hover:bg-heisenberg-card/60`
                  }`}>
                  <Icon size={18} />
                  <span className="font-display text-sm tracking-widest uppercase">{label}</span>
                </Link>
              );
            })}
            {user?.isAdmin && (
              <Link to="/admin" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 w-full max-w-xs px-5 py-3 rounded-xl transition-all text-heisenberg-purple hover:bg-heisenberg-card/60">
                <LayoutDashboard size={18} />
                <span className="font-display text-sm tracking-widest uppercase">Admin</span>
              </Link>
            )}
            <button onClick={() => { setMenuOpen(false); handleLogout(); }}
              className="flex items-center gap-3 w-full max-w-xs px-5 py-3 rounded-xl transition-all text-heisenberg-red hover:bg-heisenberg-card/60">
              <LogOut size={18} />
              <span className="font-display text-sm tracking-widest uppercase">Exit</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
