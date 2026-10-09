import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowRight, Bitcoin, Clock3, Coins, Crown, MessageSquare, ShieldCheck,
  Sparkles, Spade, Trophy, Users,
} from 'lucide-react';
import LobbyChat from './LobbyChat';

const SEAT_FORMATS = [
  { seats: 2, label: 'Heads-up', detail: '1 vs 1' },
  { seats: 3, label: '3-max', detail: 'Short-handed' },
  { seats: 6, label: '6-max', detail: 'Fast action' },
  { seats: 8, label: '8-max', detail: 'Full table' },
  { seats: 9, label: '9-max', detail: 'Classic ring' },
];
const SPEEDS = ['regular', 'turbo', 'hyper', 'deepstack'];
const SNG_BUYINS = { play: [1000, 5000, 25000], btc: [1, 5, 10, 25, 100] };

function money(value, currency) {
  const amount = Number(value || 0);
  return currency === 'btc' ? `$${amount.toFixed(2)}` : `${amount.toLocaleString()} chips`;
}

function blind(value, currency) {
  return currency === 'btc' ? `$${(Number(value || 0) / 100).toFixed(2)}` : Number(value || 0).toLocaleString();
}

function poolLabel(game) {
  const pool = Math.max(Number(game.prizePool || 0), Number(game.guarantee || 0));
  if (pool > 0) return money(pool, game.currency);
  return Number(game.entryUsd || game.entryFee || 0) > 0 ? 'Entry-funded' : 'No posted prize';
}

function formatStart(at) {
  if (!at) return 'Starting when the field fills';
  const date = new Date(at);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })}`;
}

function SeatSelector({ value, onChange, compact = false }) {
  return (
    <div className={`grid ${compact ? 'grid-cols-5' : 'grid-cols-2 sm:grid-cols-5'} gap-1.5`}>
      {SEAT_FORMATS.map(format => (
        <button key={format.seats} onClick={() => onChange(format.seats)} aria-pressed={value === format.seats}
          className={`poker-format-chip ${value === format.seats ? 'is-active' : ''}`}>
          <span className="block font-display text-[10px] font-black">{format.label}</span>
          {!compact && <span className="mt-1 block truncate font-mono text-[7px] text-white/35">{format.detail}</span>}
        </button>
      ))}
    </div>
  );
}

function PokerSectionTitle({ eyebrow, title, copy }) {
  return (
    <div className="mb-4">
      <p className="font-mono text-[8px] font-bold tracking-[0.22em] text-heisenberg-gold">{eyebrow}</p>
      <h2 className="mt-1 font-display text-lg font-black tracking-[0.07em] text-white">{title}</h2>
      {copy && <p className="mt-1 text-[10px] leading-relaxed text-white/45">{copy}</p>}
    </div>
  );
}

export default function PokerHall({ snapshot = {}, mine = [], socket, username, onRefresh, refreshUser }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('cash');
  const [cashCurrency, setCashCurrency] = useState('play');
  const [cashSeats, setCashSeats] = useState(2);
  const [sngCurrency, setSngCurrency] = useState('play');
  const [sngBuyin, setSngBuyin] = useState(1000);
  const [sngSeats, setSngSeats] = useState(2);
  const [sngSpeed, setSngSpeed] = useState('regular');
  const [joining, setJoining] = useState(null);

  const cashOptions = (snapshot.cash || []).filter(option => option.currency === cashCurrency && option.maxSeats === cashSeats);
  const sngs = (snapshot.sngs || []).filter(option => option.currency === sngCurrency && Number(option.buyin) === Number(sngBuyin)
    && option.seats === sngSeats && option.speed === sngSpeed);
  const tournaments = useMemo(() => (snapshot.mtts || [])
    .filter(game => game.status !== 'completed' && game.status !== 'cancelled')
    .sort((a, b) => new Date(a.startAt || 0) - new Date(b.startAt || 0)), [snapshot.mtts]);
  const myGames = mine.filter(game => game.gameType === 'cash' || game.gameType === 'sng' || game.gameType === 'mtt');

  const refresh = () => { onRefresh?.(); refreshUser?.(); };

  const joinCash = async option => {
    const key = option.formatKey || `${option.key}:${option.maxSeats}`;
    setJoining(key);
    try {
      const result = await axios.post('/api/poker/cash/join', { stakeKey: option.key, maxSeats: option.maxSeats });
      toast.success(result.data.already ? 'Returning you to your table' : `Seat ${Number(result.data.seat) + 1} reserved · ${option.maxSeats}-max`);
      refresh();
      navigate(`/casino/table/${result.data.tableId}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not join this table');
    } finally { setJoining(null); }
  };

  const joinSng = async () => {
    setJoining('sng');
    try {
      const result = await axios.post('/api/poker/sng/join', {
        currency: sngCurrency, buyin: Number(sngBuyin), seats: Number(sngSeats), speed: sngSpeed,
      });
      toast.success(`Registered · ${result.data.registered}/${result.data.needed} seats filled`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not register for the Sit & Go');
    } finally { setJoining(null); }
  };

  const registerMtt = async game => {
    const key = `mtt:${game.id}`;
    setJoining(key);
    try {
      await axios.post('/api/poker/mtt/register', { gameId: game.id });
      toast.success(`Registered for ${game.name}`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not register for this tournament');
    } finally { setJoining(null); }
  };

  const unregisterMtt = async game => {
    const key = `mtt:${game.id}`;
    setJoining(key);
    try {
      await axios.post('/api/poker/mtt/unregister', { gameId: game.id });
      toast.success('Registration cancelled and entry returned');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not cancel registration');
    } finally { setJoining(null); }
  };

  const enterMyGame = game => {
    if (!game) return;
    if (game.tableId && game.status === 'running') navigate(`/casino/table/${game.tableId}`);
  };

  return (
    <div className="poker-hall">
      <section className="poker-hall__hero relative mb-5 overflow-hidden rounded-[26px] border border-violet-300/20">
        <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: 'url(/banner-poker.webp)' }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0910] via-[#0a0910]/95 to-[#10091a]/55" />
        <div className="relative grid min-h-[222px] gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-black/40 px-3 py-1.5 font-mono text-[8px] tracking-[0.22em] text-violet-200 backdrop-blur">
              <Spade size={11} /> THE CARD ROOM <span className="text-white/25">/</span> LIVE POKER
            </div>
            <h2 className="font-display text-3xl font-black tracking-[0.04em] text-white sm:text-4xl">YOUR SEAT IS <span className="text-violet-300">WAITING.</span></h2>
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/55">Pick your table size and stakes, take a seat at a live cash table, or register for a scheduled tournament. Play-chip and BTC rooms are clearly separated.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:min-w-[310px]">
            <div className="poker-stat"><p>FORMATS</p><strong>2–9 MAX</strong></div>
            <div className="poker-stat"><p>TOURNAMENTS</p><strong>{tournaments.length} OPEN</strong></div>
            <div className="poker-stat"><p>FREEROLLS</p><strong>HOURLY</strong></div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {myGames.length > 0 && (
            <section className="mb-4 rounded-2xl border border-heisenberg-gold/20 bg-heisenberg-gold/[0.035] p-4">
              <PokerSectionTitle eyebrow="BACK TO THE ACTION" title="MY TABLES & ENTRIES" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {myGames.map(game => (
                  <div key={game.gameId} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 p-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-heisenberg-gold/20 bg-heisenberg-gold/[0.07] text-heisenberg-gold">
                      {game.gameType === 'mtt' ? <Trophy size={15} /> : <Spade size={15} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[10px] font-bold text-white">{game.name}</p>
                      <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-wider text-white/40">{game.status}{game.chips > 0 ? ` · ${Number(game.chips).toLocaleString()} chips` : ''}</p>
                    </div>
                    <button onClick={() => enterMyGame(game)} disabled={!game.tableId || game.status !== 'running'}
                      className="rounded-lg border border-white/10 px-2.5 py-2 font-display text-[8px] font-bold uppercase tracking-wider text-white/65 transition hover:border-heisenberg-gold/35 hover:text-heisenberg-gold disabled:opacity-35">
                      {game.tableId && game.status === 'running' ? 'Return' : 'Waiting'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="poker-hall__tabs mb-4" role="tablist" aria-label="Poker formats">
            {[
              { id: 'cash', label: 'Cash tables', icon: <Coins size={14} /> },
              { id: 'sng', label: 'Sit & Go', icon: <Users size={14} /> },
              { id: 'mtt', label: 'Tournaments', icon: <Trophy size={14} /> },
            ].map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} role="tab" aria-selected={tab === item.id}
                className={`poker-hall__tab ${tab === item.id ? 'is-active' : ''}`}>
                {item.icon}<span>{item.label}</span>{item.id === 'mtt' && <span className="poker-hall__tab-count">{tournaments.length}</span>}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab === 'cash' && (
              <motion.section key="cash" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                <PokerSectionTitle eyebrow="OPEN SEATING · REAL-TIME TABLES" title="CASH GAME LOBBY" copy="Choose a table size and currency, then compare blinds and buy-in limits before you sit." />
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="poker-currency-switch" role="group" aria-label="Cash game currency">
                    {['play', 'btc'].map(value => <button key={value} onClick={() => setCashCurrency(value)} className={cashCurrency === value ? 'is-active' : ''}>
                      {value === 'btc' ? <Bitcoin size={13} /> : <Coins size={13} />}{value === 'btc' ? 'BTC tables' : 'Play chips'}
                    </button>)}
                  </div>
                </div>
                <SeatSelector value={cashSeats} onChange={setCashSeats} />
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {cashOptions.map(option => (
                    <article key={option.formatKey || option.key} className="poker-lobby-card rounded-2xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="font-display text-sm font-black text-white">{option.name}</p><p className="mt-1 font-mono text-[8px] tracking-wider text-white/40">{option.maxSeats === 2 ? 'HEADS-UP' : option.maxSeats === 3 ? 'SHORT-HANDED' : `${option.maxSeats}-PLAYER TABLE`}</p></div>
                        <span className={`poker-currency-badge ${cashCurrency}`}>{cashCurrency === 'btc' ? '₿ BTC' : 'PLAY'}</span>
                      </div>
                      <div className="my-4 grid grid-cols-3 gap-2">
                        <div className="poker-lobby-metric"><span>BLINDS</span><b>{blind(option.sb, cashCurrency)} / {blind(option.bb, cashCurrency)}</b></div>
                        <div className="poker-lobby-metric"><span>BUY-IN</span><b>{cashCurrency === 'btc' ? `$${(option.min / 100).toFixed(0)}–$${(option.max / 100).toFixed(0)}` : `${(option.min / 1000).toFixed(0)}k–${(option.max / 1000).toFixed(0)}k`}</b></div>
                        <div className="poker-lobby-metric"><span>SEATED</span><b>{option.players}/{Math.max(option.maxSeats, (option.tables || []).reduce((count, table) => count + table.maxSeats, 0))}</b></div>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                        <span className="font-mono text-[8px] text-white/35">{option.tables?.length || 0} table{option.tables?.length === 1 ? '' : 's'} running</span>
                        <button onClick={() => joinCash(option)} disabled={joining === (option.formatKey || `${option.key}:${option.maxSeats}`)} className="poker-action-button">
                          {joining === (option.formatKey || `${option.key}:${option.maxSeats}`) ? 'RESERVING…' : 'TAKE A SEAT'}<ArrowRight size={12} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </motion.section>
            )}

            {tab === 'sng' && (
              <motion.section key="sng" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                <PokerSectionTitle eyebrow="ONE TABLE · ONE WINNER" title="SIT & GO" copy="Choose a buy-in, table size, and blind speed. The game starts when the table fills or the registration timer expires." />
                <div className="poker-config-panel rounded-2xl p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="poker-currency-switch" role="group" aria-label="Sit and Go currency">
                      {['play', 'btc'].map(value => <button key={value} onClick={() => { setSngCurrency(value); setSngBuyin(SNG_BUYINS[value][0]); }} className={sngCurrency === value ? 'is-active' : ''}>
                        {value === 'btc' ? <Bitcoin size={13} /> : <Coins size={13} />}{value === 'btc' ? 'BTC buy-in' : 'Play chips'}
                      </button>)}
                    </div>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[8px] text-white/40"><ShieldCheck size={12} /> Entry is shown before registration</span>
                  </div>
                  <div className="mb-4">
                    <p className="poker-control-label">BUY-IN</p>
                    <div className="mt-2 flex flex-wrap gap-2">{SNG_BUYINS[sngCurrency].map(value => (
                      <button key={value} onClick={() => setSngBuyin(value)} className={`poker-choice ${Number(sngBuyin) === value ? 'is-active' : ''}`}>
                        {sngCurrency === 'btc' ? `$${value}` : `${value.toLocaleString()} chips`}
                      </button>
                    ))}</div>
                  </div>
                  <div className="mb-4">
                    <p className="poker-control-label">TABLE SIZE</p>
                    <div className="mt-2"><SeatSelector value={sngSeats} onChange={setSngSeats} compact /></div>
                  </div>
                  <div>
                    <p className="poker-control-label">BLIND STRUCTURE</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{SPEEDS.map(speed => (
                      <button key={speed} onClick={() => setSngSpeed(speed)} className={`poker-choice capitalize ${sngSpeed === speed ? 'is-active' : ''}`}>{speed}</button>
                    ))}</div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                    <p className="font-mono text-[9px] text-white/50">{sngSeats}-max · {sngSpeed} · {money(sngBuyin, sngCurrency)} entry</p>
                    <button onClick={joinSng} disabled={joining === 'sng'} className="poker-action-button !px-5">
                      {joining === 'sng' ? 'REGISTERING…' : 'REGISTER FOR SIT & GO'}<ArrowRight size={12} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                  <p className="poker-control-label">OPEN MATCHES FOR THIS FORMAT</p>
                  {sngs[0]?.open ? <p className="mt-2 font-mono text-[10px] text-heisenberg-green">{sngs[0].open} table{ sngs[0].open === 1 ? '' : 's' } gathering players. Join above to take the next seat.</p>
                    : <p className="mt-2 font-mono text-[9px] text-white/35">No table is waiting yet. Your registration opens one.</p>}
                </div>
              </motion.section>
            )}

            {tab === 'mtt' && (
              <motion.section key="mtt" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
                <PokerSectionTitle eyebrow="SCHEDULED FIELDS · MULTI-TABLE" title="TOURNAMENTS" copy="Hourly free-entry events sit alongside regular, turbo, and deepstack tournaments." />
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.045] p-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-200"><Sparkles size={15} /></div>
                  <div className="min-w-0"><p className="font-display text-[10px] font-bold tracking-wider text-emerald-100">FREEROLL FEVER · EVERY HOUR AT :15 UTC</p><p className="mt-1 font-mono text-[8px] text-emerald-100/50">Free entry · 10,000 play-chip guaranteed pool · 9-max turbo</p></div>
                  <Clock3 size={14} className="ml-auto shrink-0 text-emerald-200/70" />
                </div>
                {tournaments.length ? <div className="space-y-3">
                  {tournaments.slice(0, 10).map(game => {
                    const registered = mine.some(m => m.gameId === game.id);
                    const canUnregister = registered && game.status === 'registering';
                    const isPlaying = registered && game.status === 'running';
                    const key = `mtt:${game.id}`;
                    return (
                      <article key={game.id} className={`poker-lobby-card rounded-2xl p-4 ${game.name === 'Freeroll Fever' ? 'is-freeroll' : ''}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display text-sm font-black text-white">{game.name}</h3>
                              <span className={`poker-currency-badge ${game.currency}`}>{game.currency === 'btc' ? '₿ BTC' : 'PLAY'}</span>
                            </div>
                            <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-white/40">{game.maxSeats}-max · {game.speed} · {formatStart(game.startAt)}</p>
                          </div>
                          <div className="text-right"><p className="font-mono text-[7px] tracking-[0.16em] text-white/35">FIELD</p><p className="mt-1 font-display text-sm font-bold text-white">{game.registered}/{game.maxSeats}{game.status === 'running' ? ` · ${game.playersAlive} alive` : ''}</p></div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[8px] text-white/45">
                            <span>ENTRY <b className="text-white/75">{game.currency === 'btc' ? `$${Number(game.entryUsd || 0).toFixed(2)}` : money(game.entryFee, game.currency)}</b></span>
                            <span>POOL <b className="text-heisenberg-gold">{poolLabel(game)}</b></span>
                          </div>
                          {isPlaying ? <button onClick={() => enterMyGame(mine.find(m => m.gameId === game.id))} className="poker-action-button">RETURN TO TABLE<ArrowRight size={12} /></button>
                            : canUnregister ? <button onClick={() => unregisterMtt(game)} disabled={joining === key} className="poker-secondary-button">{joining === key ? 'PLEASE WAIT…' : 'CANCEL ENTRY'}</button>
                              : registered ? <span className="poker-registered-pill">REGISTERED</span>
                                : <button onClick={() => registerMtt(game)} disabled={joining === key} className="poker-action-button">{joining === key ? 'REGISTERING…' : game.status === 'running' ? 'LATE REGISTER' : 'REGISTER'}<ArrowRight size={12} /></button>}
                        </div>
                      </article>
                    );
                  })}
                </div> : <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-12 text-center"><Crown size={20} className="mx-auto text-heisenberg-gold/60" /><p className="mt-3 font-display text-sm font-bold text-white/70">NEXT FIELD IS BEING SCHEDULED</p><p className="mt-1 font-mono text-[9px] text-white/35">Freerolls run every hour at :15 UTC.</p></div>}
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-4">
          <div className="poker-side-card rounded-2xl p-4">
            <div className="mb-3 flex items-center gap-2"><MessageSquare size={14} className="text-heisenberg-gold" /><div><p className="font-display text-[10px] font-black tracking-widest text-white">THE RAIL</p><p className="font-mono text-[7px] tracking-wider text-white/35">LIVE LOBBY CHAT</p></div><span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" /></div>
            <LobbyChat socket={socket} username={username} embedded />
          </div>
          <div className="rounded-2xl border border-heisenberg-gold/15 bg-heisenberg-gold/[0.035] p-4">
            <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-heisenberg-gold" /><p className="font-display text-[9px] font-bold tracking-wider text-white/80">CLEAR ENTRY DETAILS</p></div>
            <p className="mt-2 font-mono text-[8px] leading-relaxed text-white/40">Review the stake, buy-in, table size, and currency on every card before joining. BTC poker entries are valued in USD and converted at registration.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
