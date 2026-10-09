import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { LogOut, Wallet, LayoutDashboard, Trophy, UserCircle2, Settings, Users2, HelpCircle, Menu, X, Home, Spade, ChevronRight, Bitcoin } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/casino',      icon: Spade,        label: 'Casino' },
  { to: '/leaderboard', icon: Trophy,       label: 'Leaderboard' },
  { to: '/profile',     icon: UserCircle2,  label: 'Profile' },
  { to: '/friends',     icon: Users2,       label: 'Friends' },
  { to: '/wallet',      icon: Wallet,       label: 'Wallet' },
  { to: '/settings',    icon: Settings,     label: 'Settings' },
  { to: '/help',        icon: HelpCircle,   label: 'Help' },
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
  const isActive = (to) => location.pathname === to || (to === '/profile' && location.pathname.startsWith('/profile'));
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <nav className="casino-nav relative z-40 shrink-0">
        <div className="casino-nav__inner">
          <Link to="/play" className="casino-brand" aria-label="Cryptomania casino lobby">
            <span className="casino-brand__crest"><img src="/app-icon.png" alt="" /></span>
            <span className="casino-brand__name">CRYPTOMANIA<span>CASINO</span></span>
          </Link>

          <div className="casino-nav__links">
            <Link to="/play" className={`casino-nav__link ${location.pathname === '/play' ? 'is-active' : ''}`}>
              <Home size={15} /><span>Lobby</span>
            </Link>
            {NAV_ITEMS.filter(({ to }) => to !== '/wallet').map(({ to, icon: Icon, label }) => (
              <Link key={to} title={label} to={to === '/profile' ? profileTo : to} className={`casino-nav__link ${isActive(to) ? 'is-active' : ''}`}>
                <Icon size={15} /><span>{label}</span>
              </Link>
            ))}
            {user?.isAdmin && <Link to="/admin" title="Admin" className={`casino-nav__link ${isActive('/admin') ? 'is-active' : ''}`}><LayoutDashboard size={15} /><span>Admin</span></Link>}
          </div>

          <div className="crypto-acceptance crypto-acceptance--compact crypto-acceptance--nav" title="Deposit through the available BTCPay checkout methods">
            <Bitcoin size={12} /> 2,000+ crypto accepted
          </div>

          <div className="casino-nav__tools">
            {btcPrice && <span className="casino-nav__price"><Bitcoin size={13} />{Number(btcPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
            <Link to="/wallet" className={`casino-nav__wallet ${isActive('/wallet') ? 'is-active' : ''}`}>
              <Wallet size={15} /><span>Wallet</span><ChevronRight size={13} />
            </Link>
            <button onClick={() => setMenuOpen(o => !o)} className="casino-nav__menu md:hidden" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
              {menuOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <button onClick={handleLogout} className="casino-nav__logout" aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div className="casino-mobile-menu md:hidden" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <div className="casino-mobile-menu__head">
              <div className="casino-mobile-menu__avatar">{String(user?.username || 'P').slice(0, 1).toUpperCase()}</div>
              <div><p className="casino-mobile-menu__eyebrow">SIGNED IN AS</p><p className="casino-mobile-menu__username">{user?.username || 'Player'}</p></div>
            </div>
            <div className="crypto-acceptance mb-3"><Bitcoin size={13} /> Deposits in 2,000+ cryptocurrencies</div>
            <Link to="/play" onClick={closeMenu} className={`casino-mobile-menu__link ${location.pathname === '/play' ? 'is-active' : ''}`}><Home size={18} /><span>Lobby</span><ChevronRight size={15} /></Link>
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to === '/profile' ? profileTo : to} onClick={closeMenu} className={`casino-mobile-menu__link ${isActive(to) ? 'is-active' : ''}`}>
                <Icon size={18} /><span>{label}</span><ChevronRight size={15} />
              </Link>
            ))}
            {user?.isAdmin && <Link to="/admin" onClick={closeMenu} className="casino-mobile-menu__link"><LayoutDashboard size={18} /><span>Admin</span><ChevronRight size={15} /></Link>}
            <button onClick={() => { closeMenu(); handleLogout(); }} className="casino-mobile-menu__link is-logout"><LogOut size={18} /><span>Sign out</span><ChevronRight size={15} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
