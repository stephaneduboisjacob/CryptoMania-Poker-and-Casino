import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { isNative, getToken } from '../utils/tokenStorage';
import { PlayingCard, CardBack } from '../components/PlayingCard';
import { Home, Wifi, WifiOff, Users, Trophy, LogOut, Plus, Coffee, Clock, List, X } from 'lucide-react';
import { fmtUsd, btcToUsd } from '../utils/usd';
import { sound } from '../utils/sound';

// Elliptical seat ring matching the painted table art
function seatPos(i, n, maxSeats) {
  // Hero (my seat) always bottom-center when seated
  const order = n <= 2 ? [0, 1] : [...Array(n).keys()];
  const idx = order.indexOf(i);
  const angle = Math.PI / 2 + (2 * Math.PI * idx) / n;
  const rx = n <= 2 ? 30 : 40;
  const ry = n <= 2 ? 30 : 34;
  return {
    left: 50 + rx * Math.cos(angle),
    top: 46 + ry * Math.sin(angle),
  };
}

function chipsLabel(chips, currency) {
  const n = Number(chips || 0);
  if (currency === 'btc') return '$' + (n / 100).toFixed(2);
  return n.toLocaleString();
}

function Seat({ p, state, mySeat, currency }) {
  if (!p || p.empty) {
    return (
      <div className="cseat__inner">
        <div className="cseat__box" style={{ opacity: 0.35, borderStyle: 'dashed' }}>
          <span className="cseat__avatar">🪑</span>
          <div className="cseat__meta"><span className="cseat__name" style={{ color: '#6b6257' }}>Open seat</span></div>
        </div>
      </div>
    );
  }
  const isTurn = state.actionOn === p.seat;
  const folded = state.mySeat !== undefined && p.inHand === false && state.inHand && p.waiting === false && p.lastAction === 'fold';
  const bet = state.seatBets?.[p.seat] || 0;
  const isDealer = state.dealerSeat === p.seat && state.inHand;
  const showCards = p.seat === mySeat ? state.myCards : (state.revealed?.[p.seat]?.cards || (p.inHand && state.phase !== 'showdown' ? [null, null] : []));
  return (
    <div className={`cseat__inner`}>
      <div className={`cseat__box ${p.seat === mySeat ? 'cseat--me' : ''}`}>
        <span className="cseat__avatar">{p.avatar || '🃏'}</span>
        <div className="cseat__meta">
          <div className="cseat__name">
            {p.username}{p.isAi ? ' 🤖' : ''}{p.disconnected ? ' ⚠️' : ''}
          </div>
          <div className="cseat__chips">{chipsLabel(p.chips, currency)}</div>
          {p.sittingOut && <span className="cseat__tag">Sitting out</span>}
          {!p.sittingOut && p.lastAction && <span className="cseat__tag" style={{ color: '#96897a' }}>{p.lastAction}</span>}
        </div>
        {showCards && showCards.length > 0 && (
          <div className="cseat__cards">
            {showCards.map((c, i) => c ? <PlayingCard key={i} card={c} small /> : <CardBack key={i} small />)}
          </div>
        )}
      </div>
      {isDealer && <div className="cseat__dealer">D</div>}
      {isTurn && <div className="cseat__timer" />}
      {bet > 0 && <div className="cseat__bet">{chipsLabel(bet, currency)}</div>}
    </div>
  );
}

export default function CasinoTable() {
  const { tableId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const serverOffsetRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [game, setGame] = useState(null);
  const [mySeat, setMySeat] = useState(-1);
  const [myCards, setMyCards] = useState([]);
  const [handResult, setHandResult] = useState(null);
  const [finished, setFinished] = useState(null);
  const [actionTimer, setActionTimer] = useState(0);
  const [showStandings, setShowStandings] = useState(false);
  const [standings, setStandings] = useState(null);
  const [isSittingOut, setIsSittingOut] = useState(false);

  const soundInit = () => { sound.init(); };

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      const socketUrl = isNative() ? (import.meta.env.VITE_SOCKET_URL || 'http://10.0.2.2:3001') : '/';
      const opts = { transports: ['websocket', 'polling'] };
      const token = await getToken();
      if (cancelled) return;
      if (token) opts.auth = { token };
      const sock = io(socketUrl, opts);
      socketRef.current = sock;

      sock.on('connect', () => { setConnected(true); sock.emit('joinTable', { tableId }); });
      sock.on('disconnect', () => setConnected(false));

      sock.on('tableInit', ({ state, game, mySeat }) => {
        if (cancelled) return;
        serverOffsetRef.current = (state.serverTime || Date.now()) - Date.now();
        setGame(game);
        setMySeat(mySeat);
        setState(state);
        setMyCards(state.myCards || []);
      });

      sock.on('gameState', (s) => {
        if (cancelled) return;
        serverOffsetRef.current = (s.serverTime || Date.now()) - Date.now();
        soundInit();
        setState(prev => {
          if (prev && s.phase !== prev.phase && s.communityCards?.length > (prev.communityCards?.length || 0)) sound.newCard();
          return { ...prev, ...s };
        });
        if (s.mySeat !== undefined) setMySeat(s.mySeat);
      });

      sock.on('myCards', ({ cards }) => { if (!cancelled) { setMyCards(cards || []); sound.cardDeal?.(); } });
      sock.on('tableSeats', ({ seats }) => setState(prev => prev ? { ...prev, seats } : prev));
      sock.on('handResult', (r) => {
        if (cancelled) return;
        soundInit();
        const myAward = r.awards?.find(a => a.seat === mySeat);
        if (myAward && myAward.amount > 0) sound.win(); else sound.lose?.();
        setState(prev => prev ? { ...prev, phase: 'showdown', actionOn: null, revealed: r.revealed, potCollected: 0 } : prev);
        setHandResult(r);
        setTimeout(() => setHandResult(null), 4200);
      });
      sock.on('levelUp', ({ level, smallBlind, bigBlind }) => {
        toast(`⏱ Level ${level} — blinds ${smallBlind.toLocaleString()}/${bigBlind.toLocaleString()}`, { icon: '⏫' });
        setState(prev => prev ? { ...prev, level, smallBlind, bigBlind } : prev);
      });
      sock.on('playerEliminated', ({ username, place, prize }) => {
        toast(`${username} eliminated in ${place}${prize ? ` — wins ${prize}` : ''}`, { icon: '💀' });
      });
      sock.on('tournamentFinished', ({ winner }) => {
        setFinished(winner);
        if (winner?.userId === user?.id) { sound.win(); refreshUser(); }
      });
      sock.on('timebankUsed', ({ seat, secondsAdded, remaining }) => {
        toast(`⏱ +${secondsAdded}s (${remaining}s left)`, { icon: '🕐' });
      });
      sock.on('actionError', ({ message }) => toast.error(message));
      sock.on('casinoError', ({ message }) => toast.error(message));
      sock.on('tableChat', ({ username, message }) => {
        // lightweight chat toast for now
        if (username !== user?.username) toast(`${username}: ${message}`, { icon: '💬', duration: 3000 });
      });
    };
    connect();
    return () => { cancelled = true; socketRef.current?.disconnect(); };
  }, [tableId]);

  // Action countdown from server deadline
  useEffect(() => {
    if (state?.actionOn == null || !state?.deadline) return;
    const iv = setInterval(() => {
      setState(prev => {
        if (!prev?.deadline) { setActionTimer(0); return prev; }
        const left = Math.max(0, Math.ceil((prev.deadline - (Date.now() + serverOffsetRef.current)) / 1000));
        setActionTimer(left);
        return prev;
      });
    }, 500);
    return () => clearInterval(iv);
  }, [state?.actionOn, state?.deadline]);

  const onAction = useCallback((action, amount) => {
    soundInit();
    if (action === 'fold') sound.fold?.();
    socketRef.current?.emit('casinoAction', { tableId, action, amount });
  }, [tableId]);

  const doLeave = async () => {
    if (game?.gameType === 'cash' && mySeat >= 0) {
      try {
        const res = await fetch('/api/poker/cash/leave', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId }),
        });
        const data = await res.json();
        if (data.error) toast.error(data.error);
        else { toast.success(data.pending ? data.message : `Cashed out ${chipsLabel(data.chips, game?.currency)}`); refreshUser(); }
      } catch { toast.error('Leave failed'); }
    } else {
      socketRef.current?.emit('leaveTable', { tableId });
    }
    navigate('/casino');
  };

  const doRebuy = async () => {
    try {
      const res = await fetch('/api/poker/cash/rebuy', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId }),
      });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else { toast.success('Chips added'); refreshUser(); }
    } catch { toast.error('Rebuy failed'); }
  };

  const toggleSitOut = () => {
    const next = !isSittingOut;
    setIsSittingOut(next);
    socketRef.current?.emit('sitToggle', { tableId, sitOut: next });
  };

  const useTimebank = () => socketRef.current?.emit('casinoTimebank', { tableId });

  const loadStandings = async () => {
    if (!game?.id) return;
    setShowStandings(true);
    try {
      const res = await fetch(`/api/poker/game/${game.id}`, { credentials: 'include' });
      const data = await res.json();
      setStandings(data);
    } catch {}
  };

  if (!state) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const occupied = state.seats?.filter(Boolean) || [];
  const n = occupied.length || state.seats?.length || 9;
  const isMyTurn = state.actionOn !== null && state.actionOn === mySeat;
  const myPlayer = mySeat >= 0 ? state.seats[mySeat] : null;
  const callAmt = myPlayer ? Math.max(0, (state.currentBet || 0) - (state.seatBets?.[mySeat] || 0)) : 0;
  const bg = (state.maxSeats || game?.maxSeats || 9) <= 2 ? '/table-hu.png' : '/table-9max.png';
  const levelEndsIn = state.levelEndsAt ? Math.max(0, Math.floor((state.levelEndsAt - Date.now()) / 60000)) : null;

  return (
    <div className="poker-table-room" style={{ backgroundImage: `url(${bg})` }}>
      <div className="poker-table-room__dim" />

      {/* Top bar */}
      <div className="croom-topbar">
        <button onClick={doLeave} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5">
          <Home size={14} /> Lobby
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="croom-chip">{game?.name}</span>
          {state.gameType !== 'cash' && <span className="croom-chip">Lv <b>{state.level}</b> · {state.smallBlind?.toLocaleString()}/{state.bigBlind?.toLocaleString()}</span>}
          {state.gameType === 'cash' && <span className="croom-chip">Blinds <b>{chipsLabel(state.smallBlind, game?.currency)}/{chipsLabel(state.bigBlind, game?.currency)}</b></span>}
          {state.gameType !== 'cash' && <span className="croom-chip"><Users size={10} className="inline" /> <b>{state.playersAlive ?? '—'}</b></span>}
          {state.handNumber > 0 && <span className="croom-chip">Hand <b>{state.handNumber}</b></span>}
          <div className={`croom-chip flex items-center gap-1 ${connected ? 'text-heisenberg-green' : 'text-heisenberg-red'}`}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />} {connected ? 'Live' : 'Reconnecting'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {game?.gameType !== 'cash' && (
            <button onClick={loadStandings} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5">
              <List size={14} /> Standings
            </button>
          )}
          {game?.gameType === 'cash' && mySeat >= 0 && (
            <>
              {(myPlayer?.chips || 0) < state.bigBlind * 20 && (
                <button onClick={doRebuy} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5">
                  <Plus size={14} /> Rebuy
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Seats */}
      {state.seats?.map((p) => {
        if (!p || p.empty) return null;
        const pos = seatPos(p.seat, state.seats.length, state.seats.length);
        return (
          <div key={p.seat} className={`cseat cseat--max-${state.seats.length}`} style={{ left: `${pos.left}%`, top: `${pos.top}%` }}>
            <Seat p={p} state={{ ...state, myCards }} mySeat={mySeat} currency={game?.currency} />
          </div>
        );
      })}

      {/* Board */}
      <div className="cboard">
        <div className="cboard__cards">
          {Array.from({ length: 5 }).map((_, i) => {
            const card = state.communityCards?.[i];
            return card
              ? <PlayingCard key={i} card={card} />
              : <div key={i} className="cboard__slot" />;
          })}
        </div>
        {state.inHand && (
          <div className="cpot">POT {chipsLabel(state.pot, game?.currency)}</div>
        )}
        {state.inHand && state.phase !== 'preflop' && <div className="cphase">{state.phase}</div>}
        {isMyTurn && (
          <div className="cphase" style={{ color: '#fbbf24' }}>
            Your turn{actionTimer > 0 ? ` · ${actionTimer}s` : ''}
          </div>
        )}
      </div>

      {/* Hand result */}
      <AnimatePresence>
        {handResult && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="chand-result">
            {handResult.awards?.length === 1 ? (
              <>
                <p className="font-display text-lg font-black" style={{ color: handResult.awards[0].seat === mySeat ? '#fbbf24' : '#f3ede2' }}>
                  {handResult.awards[0].seat === mySeat ? 'YOU WIN ' : ''}
                  {handResult.awards[0].username} +{chipsLabel(handResult.awards[0].amount, game?.currency)}
                </p>
                {handResult.awards[0].handName && <p className="text-xs text-heisenberg-muted font-mono">{handResult.awards[0].handName}</p>}
              </>
            ) : handResult.awards?.length > 1 ? (
              <p className="font-display text-lg font-black text-heisenberg-neon">
                SPLIT POT — {handResult.awards.map(a => `${a.username} +${chipsLabel(a.amount, game?.currency)}`).join(' · ')}
              </p>
            ) : null}
            {handResult.revealed && Object.entries(handResult.revealed).map(([seat, r]) => (
              <p key={seat} className="text-xs text-heisenberg-muted font-mono">{state.seats[seat]?.username}: {r.handName}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action dock */}
      {mySeat >= 0 && state.inHand && (
        <div className="caction-dock">
          <div className="flex gap-2 items-center mb-2 justify-center">
            <button onClick={toggleSitOut} className="btn-ghost text-[10px] py-1.5 px-3 flex items-center gap-1">
              <Coffee size={11} /> {isSittingOut ? "I'm back" : 'Sit out'}
            </button>
            {isMyTurn && (
              <button onClick={useTimebank} className="btn-ghost text-[10px] py-1.5 px-3 flex items-center gap-1">
                <Clock size={11} /> Timebank
              </button>
            )}
          </div>
          <ActionDock state={{ ...state, myCards }} mySeat={mySeat} currency={game?.currency} onAction={onAction} />
        </div>
      )}

      {/* Spectating note */}
      {mySeat < 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
          <span className="croom-chip">Spectating — take a seat from the lobby</span>
        </div>
      )}

      {/* Standings modal */}
      <AnimatePresence>
        {showStandings && standings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="cbuy-modal" onClick={() => setShowStandings(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
              className="glass-card p-6 rounded-2xl w-full max-w-md max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-sm tracking-widest uppercase text-heisenberg-neon">Standings</h3>
                <button onClick={() => setShowStandings(false)} className="p-1 text-heisenberg-muted"><X size={18} /></button>
              </div>
              {standings.game?.prizePool > 0 && (
                <p className="text-heisenberg-gold font-mono text-sm mb-3">
                  Prize pool: {standings.game.currency === 'btc'
                    ? (standings.game._prizeUsd ? `$${standings.game._prizeUsd.toFixed(2)}` : `₿ ${parseFloat(standings.game.prizePool).toFixed(8)}`)
                    : `${Number(standings.game.prizePool).toLocaleString()} chips`}
                </p>
              )}
              {standings.players?.map((p, i) => (
                <div key={p.userId} className="cstandings-row">
                  <span className="text-heisenberg-muted">#{p.place || i + 1}</span>
                  <span className="flex-1 ml-3 truncate">{p.username}{p.isBot ? ' 🤖' : ''}</span>
                  <span className="text-heisenberg-neon">{p.chips > 0 ? chipsLabel(p.chips, standings.game.currency) : `${p.place || '—'}`}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tournament finished */}
      <AnimatePresence>
        {finished && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cbuy-modal">
            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="glass-card p-10 rounded-3xl text-center max-w-sm">
              <div className="text-6xl mb-4">{finished.userId === user?.id ? '🏆' : '💀'}</div>
              <h2 className="font-display text-2xl font-black mb-2" style={{ color: finished.userId === user?.id ? '#fbbf24' : '#ef4444' }}>
                {finished.userId === user?.id ? 'VICTORY!' : 'TOURNAMENT OVER'}
              </h2>
              <p className="text-heisenberg-muted mb-4">
                {finished.username} wins{finished.prize ? ` ${finished.currency === 'btc' ? '$' + Number(finished.prize).toFixed(2) : Number(finished.prize).toLocaleString() + ' chips'}` : ''}!
              </p>
              <button onClick={() => navigate('/casino')} className="btn-primary text-sm py-2.5 px-8">Back to Casino</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Minimal raise slider + fold/check/call buttons
function ActionDock({ state, mySeat, currency, onAction }) {
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState(0);

  if (state.actionOn !== mySeat) return null;
  const me = state.seats[mySeat];
  const myBet = state.seatBets?.[mySeat] || 0;
  const callAmt = Math.max(0, (state.currentBet || 0) - myBet);
  const maxTotal = (me?.chips || 0) + myBet;
  const minRaiseTo = state.minRaiseTo || state.bigBlind;
  const canRaise = maxTotal > state.currentBet;
  const amountOf = (v) => currency === 'btc' ? '$' + (v / 100).toFixed(2) : Number(v).toLocaleString();

  const openRaise = () => {
    setRaiseAmt(Math.min(minRaiseTo, maxTotal));
    setRaiseOpen(true);
  };
  const confirm = () => {
    onAction('raise', Math.min(Math.max(raiseAmt, Math.min(minRaiseTo, maxTotal)), maxTotal));
    setRaiseOpen(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
      <AnimatePresence>
        {raiseOpen && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="glass-card p-4 rounded-xl">
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[
                { label: 'Min', v: Math.min(minRaiseTo, maxTotal) },
                { label: '½ Pot', v: state.currentBet + Math.floor((state.pot + callAmt) / 2) },
                { label: 'Pot', v: state.currentBet + state.pot + callAmt },
                { label: 'All-in', v: maxTotal },
              ].map(p => (
                <button key={p.label} onClick={() => setRaiseAmt(Math.max(Math.min(p.v, maxTotal), Math.min(minRaiseTo, maxTotal)))}
                  className="py-1.5 rounded-lg text-xs font-display tracking-wider uppercase"
                  style={{ border: '1px solid #f7931a33', color: '#f7931a', background: 'rgba(247,147,26,0.08)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <input type="range" min={Math.min(minRaiseTo, maxTotal)} max={maxTotal} step={Math.max(1, Math.floor(state.bigBlind / 2))}
              value={raiseAmt} onChange={e => setRaiseAmt(Number(e.target.value))} className="w-full mb-2 accent-heisenberg-orange" />
            <div className="text-center font-mono text-heisenberg-gold text-sm mb-2">{amountOf(raiseAmt)}</div>
            <div className="flex gap-2">
              <button onClick={() => setRaiseOpen(false)} className="flex-1 btn-ghost text-xs py-2">Cancel</button>
              <button onClick={confirm} className="flex-1 btn-primary text-xs py-2">Raise to {amountOf(raiseAmt)}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-2">
        <button onClick={() => onAction('fold')}
          className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
          style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid #ef444455', color: '#ef4444' }}>
          Fold
        </button>
        {callAmt === 0 ? (
          <button onClick={() => onAction('check')}
            className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
            style={{ background: 'rgba(247,147,26,0.14)', border: '1px solid #f7931a55', color: '#f7931a' }}>
            Check
          </button>
        ) : (
          <button onClick={() => onAction('call', callAmt)}
            className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
            style={{ background: 'rgba(247,147,26,0.14)', border: '1px solid #f7931a55', color: '#f7931a' }}>
            Call {amountOf(Math.min(callAmt, me?.chips || 0))}
          </button>
        )}
        <button onClick={openRaise} disabled={!canRaise}
          className="flex-1 py-3 rounded-xl font-display font-bold text-sm tracking-widest uppercase"
          style={{ background: 'rgba(255,176,32,0.14)', border: '1px solid #ffb02055', color: '#ffb020', opacity: canRaise ? 1 : 0.35 }}>
          {state.currentBet > 0 ? 'Raise' : 'Bet'}
        </button>
      </div>
    </motion.div>
  );
}
