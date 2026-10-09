import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ArrowLeft, Bitcoin, ShieldCheck, Copy, ExternalLink, CheckCircle2 } from 'lucide-react';
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

  const txTypeColor = { deposit: '#22c55e', withdrawal: '#ef4444', winnings: '#fbbf24', entry_fee: '#ffb020', refund: '#34d399', rake: '#96897a' };

  const txUsd = (tx) => {
    const btc = parseFloat(tx.amount);
    const usd = btcPrice ? btc * btcPrice : null;
    return usd != null ? fmtUsd(usd) : `₿ ${btc.toFixed(6)}`;
  };

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/play')} aria-label="Back to lobby" className="text-heisenberg-muted hover:text-white transition-colors p-2 rounded-xl hover:bg-heisenberg-card/60">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="font-mono text-[9px] tracking-[0.24em] uppercase text-heisenberg-gold">Treasury · secure checkout</p>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-white tracking-widest">YOUR WALLET</h1>
          </div>
        </motion.div>

        <div className="wallet-hero mb-5">
          <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="font-display text-lg sm:text-xl font-bold text-white">Move funds with clarity.</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/55">Choose an amount, then select a supported cryptocurrency in the secure BTCPay checkout.</p>
              <div className="crypto-acceptance mt-4"><Bitcoin size={14} /> 2,000+ cryptocurrencies accepted · not just Bitcoin</div>
            </div>
            <div className="flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-wider text-white/45">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-2"><ShieldCheck size={13} className="text-heisenberg-green" /> Secure BTCPay checkout</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-2"><CheckCircle2 size={13} className="text-heisenberg-gold" /> Credited after confirmation</span>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="glass-card p-5 rounded-2xl">
            <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">Balance</p>
            <p className="font-mono text-2xl font-bold text-heisenberg-neon">
              {balance.usd != null ? fmtUsd(balance.usd) : '—'}
            </p>
            <p className="text-heisenberg-muted/60 text-[10px] font-mono mt-0.5">₿ {balance.btc.toFixed(6)}</p>
            {btcPrice && <p className="text-heisenberg-muted/50 text-[10px] font-mono">1 BTC = ${btcPrice.toLocaleString()}</p>}
          </div>
          <div className="glass-card p-5 rounded-2xl">
            <p className="text-heisenberg-muted text-xs font-display tracking-widest uppercase mb-1">Play Chips</p>
            <p className="font-mono text-2xl font-bold text-heisenberg-gold">⬡ {balance.play.toLocaleString()}</p>
            <p className="text-heisenberg-muted/50 text-[10px] font-mono mt-0.5">Free practice mode</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="glass-card flex gap-2 p-1.5 mb-5 rounded-2xl">
          {['deposit', 'withdraw'].map(t => (
            <button key={t} onClick={() => { setTab(t); setInvoice(null); setAmountUsd(''); }}
              className={`flex-1 py-3 rounded-xl font-display text-xs sm:text-sm tracking-widest uppercase font-semibold transition-all ${tab === t ? 'btn-primary' : 'text-white/45 hover:text-white hover:bg-white/5'}`}>
              {t === 'deposit'
                ? <><ArrowDownLeft size={14} className="inline mr-1" />Deposit</>
                : <><ArrowUpRight size={14} className="inline mr-1" />Withdraw</>}
            </button>
          ))}
        </div>

        {tab === 'deposit' && (
          <div className="glass-card p-4 sm:p-6 rounded-2xl mb-6">
            {invoice ? (
              <div className="mx-auto max-w-3xl">
                <div className="mb-5 text-center">
                  <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-heisenberg-gold/30 bg-heisenberg-gold/10 text-heisenberg-gold"><Bitcoin size={23} /></span>
                  <p className="font-mono text-[9px] tracking-[0.24em] uppercase text-heisenberg-gold">Invoice ready</p>
                  <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white">Complete your deposit</h2>
                  <p className="mt-2 text-xs text-white/50">Scan this code or open the checkout to choose from the available payment methods.</p>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr] md:items-center">
                  <div className="mx-auto rounded-[20px] border border-white/10 bg-white p-3 shadow-[0_12px_35px_rgba(0,0,0,.35)]">
                    <QRCodeSVG value={invoice.checkoutUrl} size={190} level="M" includeMargin />
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-heisenberg-gold/20 bg-black/20 p-4">
                      <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/40">Deposit amount</p>
                      <p className="mt-1 font-display text-3xl font-bold text-heisenberg-neon">${invoice.amountUsd}</p>
                      <p className="mt-1 font-mono text-xs text-white/50">Reference: ₿ {Number(invoice.amountBtc).toFixed(6)}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="wallet-step"><span className="wallet-step__num">1</span><p className="text-xs leading-relaxed text-white/65">Open the BTCPay page and pick a payment method supported by this invoice.</p></div>
                      <div className="wallet-step"><span className="wallet-step__num">2</span><p className="text-xs leading-relaxed text-white/65">Send the amount shown at checkout. Your balance updates after payment confirmation.</p></div>
                    </div>
                    {invoice.expiresAt && <p className="px-1 font-mono text-[10px] text-white/35">Invoice expires at {new Date(invoice.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={() => {
                  if (Capacitor.isNativePlatform()) {
                    import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: invoice.checkoutUrl }));
                  } else {
                    window.open(invoice.checkoutUrl, '_blank', 'noopener,noreferrer');
                  }
                      }} className="btn-primary inline-flex flex-1 items-center justify-center gap-2 text-xs py-3 px-4"><ExternalLink size={14} /> Open secure checkout</button>
                      <button onClick={async () => {
                        try { await navigator.clipboard.writeText(invoice.checkoutUrl); toast.success('Checkout link copied'); }
                        catch { toast.error('Could not copy link on this device'); }
                      }} className="btn-ghost inline-flex items-center justify-center gap-2 text-xs py-3 px-4"><Copy size={14} /> Copy link</button>
                      <button onClick={() => setInvoice(null)} className="btn-ghost text-xs py-3 px-4">Close</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[9px] tracking-[0.22em] uppercase text-heisenberg-gold">Add funds</p>
                    <h2 className="mt-1 font-display text-xl font-bold text-white">Choose your amount</h2>
                    <p className="mt-1 text-xs text-white/45">Select an amount in USD. You choose the cryptocurrency at checkout.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 font-mono text-[10px] text-white/50">Minimum $5</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-5">
                  {USD_PRESETS.map(a => (
                    <button key={a} onClick={() => setAmountUsd(String(a))}
                      aria-pressed={amountUsd === String(a)}
                      className={`wallet-amount-chip py-3 font-mono text-sm font-bold ${amountUsd === String(a) ? 'is-selected' : ''}`}>
                      ${a}
                    </button>
                  ))}
                </div>
                <div className="mb-4">
                  <label htmlFor="deposit-amount" className="mb-2 block font-display text-[10px] tracking-[0.14em] uppercase text-white/50">Or enter a custom amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-heisenberg-muted font-mono font-bold">$</span>
                    <input
                      id="deposit-amount"
                      className="input-field pl-8"
                      type="number" step="0.01" min="5" inputMode="decimal"
                      placeholder="Custom amount (USD)"
                      value={amountUsd}
                      onChange={e => setAmountUsd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
                  <span className="text-xs text-white/50">Estimated BTC value <span className="text-white/30">· reference only</span></span>
                  <span className="font-mono text-sm font-bold text-heisenberg-gold">
                    {amountUsd && btcPrice && parseFloat(amountUsd) >= 5 ? `₿ ${(parseFloat(amountUsd) / btcPrice).toFixed(6)}` : '—'}
                  </span>
                </div>
                <button onClick={createDeposit} disabled={loading || !amountUsd || parseFloat(amountUsd) < 5} className="btn-primary w-full flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-45">
                  {loading ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><ArrowDownLeft size={16} /> Continue to secure checkout {amountUsd ? `· $${Number(amountUsd).toFixed(2)}` : ''}</>}
                </button>
                <p className="mt-3 text-center text-[10px] leading-relaxed text-white/35">Payment methods appear on the BTCPay checkout. Your wallet is credited after the payment is confirmed.</p>
              </>
            )}
          </div>
        )}

        {tab === 'withdraw' && (
          <div className="glass-card p-6 rounded-2xl mb-6">
            <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-4">Withdraw (USD)</p>
            <p className="mb-4 text-xs leading-relaxed text-white/45">Withdrawals are currently sent in Bitcoin (BTC). Deposits can use the cryptocurrency options shown at BTCPay checkout.</p>
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
                  <p className="font-mono text-sm" style={{ color: txTypeColor[tx.type] || '#f3ede2' }}>{tx.type.replace('_', ' ').toUpperCase()}</p>
                  <p className="text-heisenberg-muted text-xs font-mono mt-0.5">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold" style={{ color: ['entry_fee','withdrawal','rake'].includes(tx.type) ? '#ffb020' : '#22c55e' }}>
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
