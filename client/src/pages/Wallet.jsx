import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ArrowLeft } from 'lucide-react';
import { fmtUsd, btcToUsd } from '../utils/usd';
import { Capacitor } from '@capacitor/core';

const USD_PRESETS = [20, 50, 100, 250, 500];

export default function Wallet() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('deposit');
  const [amountUsd, setAmountUsd] = useState('');
  const [address, setAddress] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState({ btc: 0, usd: null, play: 0 });
  const [btcPrice, setBtcPrice] = useState(null);

  useEffect(() => {
    fetchBalance();
    if (params.get('deposited')) toast.success('Deposit initiated — funds will credit on confirmation');
  }, []);

  const fetchBalance = async () => {
    try {
      const res = await axios.get('/api/wallet/balance');
      setBalance({ btc: res.data.balanceBtc, usd: res.data.balanceUsd, play: res.data.balancePlay });
      setBtcPrice(res.data.btcPrice);
      setTransactions(res.data.transactions);
      await refreshUser();
    } catch {}
  };

  const createDeposit = async () => {
    const usd = parseFloat(amountUsd);
    if (!amountUsd || usd < 5) return toast.error('Minimum deposit: $5');
    setLoading(true);
    try {
      const res = await axios.post('/api/wallet/deposit', { amountUsd: usd });
      setInvoice(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async () => {
    const usd = parseFloat(amountUsd);
    if (!amountUsd || !address) return toast.error('Enter amount and BTC address');
    if (usd < 5) return toast.error('Minimum withdrawal: $5');
    setLoading(true);
    try {
      await axios.post('/api/wallet/withdraw', { amountUsd: usd, address });
      toast.success('Withdrawal submitted!');
      setAmountUsd(''); setAddress('');
      fetchBalance();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const txTypeColor = { deposit: '#00ff88', withdrawal: '#ff3355', winnings: '#ffd700', entry_fee: '#ff6b00', refund: '#5eead4', rake: '#6b6b9a' };

  const txUsd = (tx) => {
    const btc = parseFloat(tx.amount);
    const usd = btcPrice ? btc * btcPrice : null;
    return usd != null ? fmtUsd(usd) : `₿ ${btc.toFixed(6)}`;
  };

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="text-heisenberg-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-heisenberg-card/60">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-2xl font-bold text-heisenberg-neon tracking-widest">WALLET</h1>
        </motion.div>

        {/* Balance */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="glass-card p-5 rounded-xl">
            <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">Balance</p>
            <p className="font-mono text-2xl font-bold text-heisenberg-neon">
              {balance.usd != null ? fmtUsd(balance.usd) : '—'}
            </p>
            <p className="text-heisenberg-muted/60 text-[10px] font-mono mt-0.5">₿ {balance.btc.toFixed(6)}</p>
            {btcPrice && <p className="text-heisenberg-muted/50 text-[10px] font-mono">1 BTC = ${btcPrice.toLocaleString()}</p>}
          </div>
          <div className="glass-card p-5 rounded-xl">
            <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">Play Chips</p>
            <p className="font-mono text-2xl font-bold text-heisenberg-gold">⬡ {balance.play.toLocaleString()}</p>
            <p className="text-heisenberg-muted/50 text-[10px] font-mono mt-0.5">Free practice mode</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {['deposit', 'withdraw'].map(t => (
            <button key={t} onClick={() => { setTab(t); setInvoice(null); setAmountUsd(''); }}
              className={`flex-1 py-3 rounded-xl font-display text-sm tracking-widest uppercase font-semibold transition-all ${tab === t ? 'btn-primary' : 'btn-ghost'}`}>
              {t === 'deposit'
                ? <><ArrowDownLeft size={14} className="inline mr-1" />Deposit</>
                : <><ArrowUpRight size={14} className="inline mr-1" />Withdraw</>}
            </button>
          ))}
        </div>

        {tab === 'deposit' && (
          <div className="glass-card p-6 rounded-2xl mb-6">
            {invoice ? (
              <div className="text-center">
                <p className="font-display text-sm tracking-widest uppercase text-heisenberg-muted mb-1">Scan to Pay</p>
                <p className="font-mono text-heisenberg-neon text-2xl font-bold mb-1">${invoice.amountUsd}</p>
                <p className="text-heisenberg-muted/60 text-xs font-mono mb-4">≈ ₿ {parseFloat(invoice.amountBtc).toFixed(6)}</p>
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-white rounded-2xl">
                    <QRCodeSVG value={invoice.checkoutUrl} size={200} />
                  </div>
                </div>
                <button onClick={() => {
                  if (Capacitor.isNativePlatform()) {
                    import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: invoice.checkoutUrl }));
                  } else {
                    window.open(invoice.checkoutUrl, '_blank');
                  }
                }} className="btn-neon inline-block text-sm py-2 px-6 mt-2">
                  Open Payment Page
                </button>
                <button onClick={() => setInvoice(null)} className="btn-ghost text-sm py-2 px-4 ml-3">Cancel</button>
              </div>
            ) : (
              <>
                <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-4">Select Amount (USD)</p>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {USD_PRESETS.map(a => (
                    <button key={a} onClick={() => setAmountUsd(String(a))}
                      className={`flex-1 py-2.5 rounded-xl font-mono text-sm font-bold transition-all min-w-[60px] ${amountUsd === String(a) ? 'btn-neon' : 'btn-ghost'}`}>
                      ${a}
                    </button>
                  ))}
                </div>
                <div className="relative mb-4">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-heisenberg-muted font-mono font-bold">$</span>
                  <input
                    className="input-field pl-8"
                    type="number" step="1" min="5"
                    placeholder="Custom amount (USD)"
                    value={amountUsd}
                    onChange={e => setAmountUsd(e.target.value)}
                  />
                </div>
                {amountUsd && btcPrice && parseFloat(amountUsd) >= 5 && (
                  <p className="text-heisenberg-muted/60 text-xs font-mono mb-4 text-center">
                    ≈ ₿ {(parseFloat(amountUsd) / btcPrice).toFixed(6)} at current rate
                  </p>
                )}
                <button onClick={createDeposit} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : `Pay ${amountUsd ? `$${amountUsd}` : '—'} via Bitcoin`}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'withdraw' && (
          <div className="glass-card p-6 rounded-2xl mb-6">
            <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-4">Withdraw (USD)</p>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-heisenberg-muted font-mono font-bold">$</span>
              <input
                className="input-field pl-8"
                type="number" step="1" min="5"
                placeholder="Amount in USD"
                value={amountUsd}
                onChange={e => setAmountUsd(e.target.value)}
              />
            </div>
            <input className="input-field mb-4" placeholder="Bitcoin address" value={address} onChange={e => setAddress(e.target.value)} />
            <p className="text-heisenberg-muted text-xs mb-4">
              Available: <span className="text-heisenberg-neon font-bold">{balance.usd != null ? fmtUsd(balance.usd) : '—'}</span>
              {btcPrice && amountUsd && parseFloat(amountUsd) >= 5 && (
                <span className="ml-2 text-heisenberg-muted/60">≈ ₿ {(parseFloat(amountUsd) / btcPrice).toFixed(6)}</span>
              )}
            </p>
            <button onClick={withdraw} disabled={loading} className="btn-primary w-full">
              {loading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                : `Withdraw ${amountUsd ? `$${amountUsd}` : '—'}`}
            </button>
          </div>
        )}

        {/* Transaction history */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-muted">Transaction History</h3>
            <button onClick={fetchBalance} className="text-heisenberg-muted hover:text-white transition-colors"><RefreshCw size={14} /></button>
          </div>
          <div className="space-y-2">
            {transactions.map(tx => (
              <div key={tx.id} className="glass-card p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm" style={{ color: txTypeColor[tx.type] || '#e0e0ff' }}>{tx.type.replace('_', ' ').toUpperCase()}</p>
                  <p className="text-heisenberg-muted text-xs font-mono mt-0.5">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold" style={{ color: ['entry_fee','withdrawal','rake'].includes(tx.type) ? '#ff6b00' : '#00ff88' }}>
                    {['entry_fee','withdrawal','rake'].includes(tx.type) ? '-' : '+'}{txUsd(tx)}
                  </p>
                  <p className={`text-xs font-mono ${tx.status === 'confirmed' ? 'text-heisenberg-green' : tx.status === 'pending' ? 'text-heisenberg-gold' : 'text-heisenberg-red'}`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <p className="text-heisenberg-muted text-sm text-center py-6 font-mono">No transactions yet</p>}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
