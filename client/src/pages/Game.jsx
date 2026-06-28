import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { isNative, getToken } from '../utils/tokenStorage';
import { PlayingCard, CardBack } from '../components/PlayingCard';
import ActionPanel from '../components/ActionPanel';
import Chat from '../components/Chat';
import BlindTimer from '../components/BlindTimer';
import HandStrengthMeter from '../components/HandStrengthMeter';
import SessionStats from '../components/SessionStats';
import PreActionButtons from '../components/PreActionButtons';
import PlayerNotes from '../components/PlayerNotes';
import { Home, Wifi, WifiOff, Coffee, Clock, BellOff, MessageCircle, X } from 'lucide-react';
import { fmtUsd, btcToUsd } from '../utils/usd';
import { sound } from '../utils/sound';

const TABLE_BACKGROUNDS = ['/table.png', '/table2.png', '/table3.png', '/table4.png'];

function backgroundForTable(tableId) {
  const hash = String(tableId || '').split('').reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0);
  return TABLE_BACKGROUNDS[hash % TABLE_BACKGROUNDS.length];
}

// Initialize sound engine from stored prefs
const initSound = () => {
  try {
    const p = localStorage.getItem('prefs');
    if (p) {
      const prefs = JSON.parse(p);
      sound.setEnabled(prefs.sound_enabled !== false);
      sound.setVolume(prefs.sound_volume ?? 80);
    }
  } catch {}
};

function PrizeDisplay({ prizePool, tier }) {
  const [usdPrice, setUsdPrice] = useState(null);
  useEffect(() => {
    if (tier !== 'play' && tier) {
      // Two entries fund the prize; 5% of each entry is retained as rake.
      setUsdPrice(parseFloat(tier) * 2 * 0.95);
    }
  }, [tier]);
  if (usdPrice != null) return <span>Prize: ${usdPrice.toFixed(2)}</span>;
  if (prizePool > 0) return <span>Prize: ₿ {parseFloat(prizePool).toFixed(6)}</span>;
  return null;
}

function ChipCount({ amount, color = '#00d4ff' }) {
  if (amount == null) return null;
  return (
    <div className="chip-count"
      style={{ background: `${color}18`, border: `1px solid ${color}55`, color }}>
      <div className="chip-count__icon" style={{ borderColor: color }} />
      {Number(amount).toLocaleString()}
    </div>
  );
}

function TimebankBar({ seconds, max = 30, pos, label }) {
  if (!seconds || seconds <= 0) return null;
  const pct = Math.min(100, (seconds / max) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <Clock size={10} className="text-heisenberg-gold shrink-0" />
      <div className="flex-1 h-1 bg-heisenberg-dark rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#ffd700' }} />
      </div>
      <span className="text-[10px] font-mono text-heisenberg-gold">{seconds}s</span>
    </div>
  );
}

function PlayerSeat({ name, chips, cards, isActive, isMe, bet, isDealer, avatar, timebank, sitout, isTurn }) {
  return (
    <div className={`player-seat ${isActive ? 'player-seat--active' : ''} ${isMe ? 'player-seat--hero' : ''}`}>
      <div className="player-seat__cards">
        {cards && cards.length > 0 ? (
          cards.map((card, i) =>
            card
              ? <PlayingCard key={`${card}-${i}`} card={card} delay={i * 0.12} />
              : <CardBack key={i} delay={i * 0.12} />
          )
        ) : (
          <div className="flex gap-1.5 md:gap-2 opacity-20">
            <div className="card-placeholder" />
            <div className="card-placeholder" />
          </div>
        )}
      </div>
      <div className="player-seat__identity">
        <div className="player-seat__avatar">{avatar || '🃏'}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
          {isDealer && (
              <span className="dealer-button">D</span>
          )}
            <span className="player-seat__name">{name || (isMe ? 'You' : 'Opponent')}</span>
            {isMe && <span className="player-seat__you">You</span>}
            {sitout && <span className="text-heisenberg-orange text-[10px]">Sitting out</span>}
          </div>
          <div className="player-seat__stack">
            <ChipCount amount={chips} color={isMe ? '#5eead4' : '#fb923c'} />
            {bet > 0 && <span className="player-seat__bet">In front {Number(bet).toLocaleString()}</span>}
          </div>
        </div>
        {isActive && !sitout && <span className="turn-indicator" title="Acting" />}
        {isTurn && timebank > 0 && (
          <div className="player-seat__timebank">
            <TimebankBar seconds={timebank} pos={isMe ? 'me' : 'opp'} />
          </div>
        )}
      </div>
    </div>
  );
}

function ButtonDraw({ draw, players, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 4200); return () => clearTimeout(t); }, []);
  useEffect(() => { sound.init(); sound.buttonDraw(); }, []);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-heisenberg-bg/92 backdrop-blur-md">
      <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="glass-card p-8 rounded-3xl text-center max-w-sm w-full mx-4">
        <p className="font-display text-heisenberg-muted text-xs tracking-[0.4em] uppercase mb-4">High Card — Determines Dealer</p>
        <div className="flex items-center justify-center gap-8 mb-5">
          <div className="flex flex-col items-center gap-2">
            <p className="font-display text-xs text-heisenberg-neon tracking-widest uppercase">{players.p1}</p>
            <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: 0.3, duration: 0.4 }}>
              <PlayingCard card={draw.p1Card} />
            </motion.div>
          </div>
          <span className="font-display text-2xl text-heisenberg-muted font-black">vs</span>
          <div className="flex flex-col items-center gap-2">
            <p className="font-display text-xs text-heisenberg-orange tracking-widest uppercase">{players.p2}</p>
            <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: 0.6, duration: 0.4 }}>
              <PlayingCard card={draw.p2Card} />
            </motion.div>
          </div>
        </div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="font-display text-sm font-bold tracking-widest" style={{ color: '#ffd700' }}>
          {draw.winner === 1 ? players.p1 : players.p2} gets the button
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

export default function Game() {
  const { tournamentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [connected, setConnected]       = useState(false);
  const [gameState, setGameState]       = useState(null);
  const [tournament, setTournament]     = useState(null);
  const [players, setPlayers]           = useState({ p1: null, p2: null });
  const [playerAvatars, setPlayerAvatars] = useState({ p1: '🃏', p2: '🃏' });
  const [myPos, setMyPos]               = useState(0);
  const [isAiGame, setIsAiGame]         = useState(false);
  const [aiName, setAiName]             = useState('Opponent');
  const [handResult, setHandResult]     = useState(null);
  const [tournamentEnd, setTournamentEnd] = useState(null);
  const [buttonDraw, setButtonDraw]     = useState(null);
  const [showDrawDone, setShowDrawDone] = useState(false);
  const [shownCard, setShownCard]       = useState(null);
  const [actionTimer, setActionTimer]   = useState(30);
  const [isSittingOut, setIsSittingOut] = useState(false);
  const [timebankSeconds, setTimebankSeconds] = useState(null);
  const [timebankActive, setTimebankActive] = useState(false);
  const [friendChallenge, setFriendChallenge] = useState(null);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Session stats
  const sessionRef = useRef({ handsPlayed: 0, handsWon: 0, startChips: null });
  const [sessionStats, setSessionStats] = useState(null);

  const timerRef = useRef(null);
  const timebankRef = useRef(null);

  useEffect(() => {
    initSound();
    const connectSocket = async () => {
      const socketUrl = isNative() ? 'https://poker.btcpay.exchange' : '/';
      const socketOpts = { transports: ['websocket', 'polling'] };
      const token = await getToken();
      if (token) socketOpts.auth = { token };
      const sock = io(socketUrl, socketOpts);
      socketRef.current = sock;

    sock.on('connect', () => {
      setConnected(true);
      sock.emit('joinTournament', { tournamentId });
    });

    sock.on('disconnect', () => setConnected(false));

    sock.on('tournamentInfo', (info) => {
      setTournament(info);
      setMyPos(info.myPos);
      setPlayers({ p1: info.player1, p2: info.player2 });
      setPlayerAvatars({ p1: info.player1Avatar || '🃏', p2: info.player2Avatar || '🃏' });
      setIsAiGame(info.isAi || false);
      if (info.aiName) setAiName(info.aiName);
      if (info.status === 'active' && info.myPos > 0) {
        setTimeout(() => sock.emit('startGame', { tournamentId }), 500);
      }
    });

    sock.on('gameState', (state) => {
      sound.init();
      setGameState(prev => {
        // Sound triggers on state changes
        if (prev && state.phase !== prev.phase && state.communityCards?.length > (prev.communityCards?.length || 0)) {
          sound.newCard();
        }
        if (!prev && state.myCards?.length > 0) sound.cardDeal();
        if (state.handNumber > (prev?.handNumber || 0)) {
          setTimeout(() => sound.cardDeal(), 200);
        }
        return state;
      });
      setHandResult(null);
      setShownCard(null);
      setTimebankActive(false);
      timebankRef.current = false;

      // Update session stats
      setSessionStats(prev => {
        const myChips = state.myPos === 1 ? state.p1Chips : state.p2Chips;
        if (!prev) {
          sessionRef.current.startChips = myChips;
          return { handsPlayed: 0, handsWon: 0, startChips: myChips, currentChips: myChips };
        }
        return { ...prev, currentChips: myChips };
      });
    });

    sock.on('playerJoined', ({ pos, username, avatar }) => {
      setPlayers(prev => ({ ...prev, [`p${pos}`]: username }));
      setPlayerAvatars(prev => ({ ...prev, [`p${pos}`]: avatar || '🃏' }));
      if (pos !== myPos) toast.success(`${username} joined!`);
    });

    sock.on('handResult', (result) => {
      sound.init();
      if (result.winner === myPos) {
        sound.win();
        setSessionStats(prev => prev ? { ...prev, handsWon: prev.handsWon + 1, handsPlayed: prev.handsPlayed + 1 } : prev);
      } else {
        sound.lose();
        setSessionStats(prev => prev ? { ...prev, handsPlayed: prev.handsPlayed + 1 } : prev);
      }
      setGameState(prev => prev ? {
        ...prev,
        phase: 'showdown',
        actionOn: 0,
        communityCards: result.community || prev.communityCards,
        p1Chips: result.p1Chips,
        p2Chips: result.p2Chips,
      } : prev);
      setHandResult(result);
    });

    sock.on('tournamentEnd', (data) => {
      setTournamentEnd(data);
      sound.init();
      if (data.winner === myPos) sound.win();
      else sound.lose();
    });

    sock.on('buttonDraw', (draw) => {
      setButtonDraw(draw);
      setShowDrawDone(false);
    });

    sock.on('showCard', ({ pos, card, taunt }) => {
      setShownCard({ pos, card, taunt });
      setTimeout(() => setShownCard(null), 4000);
    });

    sock.on('sitOutChanged', ({ pos, sitOut }) => {
      if (pos === myPos) setIsSittingOut(sitOut);
    });

    sock.on('timebankUsed', ({ pos, secondsAdded, remaining }) => {
      if (pos === myPos) {
        setTimebankActive(true);
        timebankRef.current = true;
        setTimebankSeconds(remaining);
        toast(`+${secondsAdded}s Time Bank used — ${remaining}s remaining`, { icon: '⏱' });
      }
    });

    sock.on('friendChallenge', ({ from, fromAvatar, tournamentId: tid }) => {
      setFriendChallenge({ from, fromAvatar, tournamentId: tid });
      toast(`${fromAvatar} ${from} challenged you!`, { icon: '⚔️', duration: 10000 });
    });

    sock.on('playerDisconnected', ({ username }) => toast.error(`${username} disconnected`));
    sock.on('actionError', ({ message }) => toast.error(message));
    sock.on('error', ({ message }) => toast.error(message));

    };
    connectSocket();
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [tournamentId]);

  // Action timer with swipe-to-fold gesture
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!gameState || gameState.actionOn !== myPos || gameState.phase === 'showdown') return;

    // Play your-turn sound
    sound.init();
    sound.yourTurn();

    setActionTimer(30);
    timerRef.current = setInterval(() => {
      setActionTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Try to use timebank first
          const myBank = myPos === 1 ? gameState.p1Timebank : gameState.p2Timebank;
          if (myBank > 0 && !timebankRef.current) {
            timebankRef.current = true;
            setTimebankActive(true);
            socketRef.current?.emit('useTimebank', { tournamentId });
            return Math.min(15, myBank);
          } else {
            const myBet = myPos === 1 ? gameState.p1Bet : gameState.p2Bet;
            const canCheck = Math.max(0, (gameState.currentBet || 0) - (myBet || 0)) === 0;
            socketRef.current?.emit('action', { tournamentId, action: canCheck ? 'check' : 'fold' });
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [gameState?.actionOn, gameState?.handNumber, myPos]);

  const onAction = useCallback((action, amount) => {
    sound.init();
    if (action === 'fold') sound.fold();
    else if (action === 'check') sound.check();
    else if (action === 'call') sound.chipCall();
    else if (action === 'bet' || action === 'raise') sound.chipBet();
    socketRef.current?.emit('action', { tournamentId, action, amount });
  }, [tournamentId]);

  const toggleSitOut = () => {
    const next = !isSittingOut;
    setIsSittingOut(next);
    socketRef.current?.emit('sitOut', { tournamentId, sitOut: next });
    toast(next ? '☕ Sitting out — hands will auto-fold' : '👋 Welcome back!');
  };

  const handleExitClick = () => {
    if (tournament?.status === 'waiting') {
      leaveWaitingTable();
      return;
    }
    const isLive = tournament?.status === 'active' && gameState && !tournamentEnd;
    if (isLive) setShowExitWarning(true);
    else navigate('/');
  };

  const leaveWaitingTable = async () => {
    try {
      const response = await fetch(`/api/tournament/${tournamentId}/leave`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not cancel table');
      }
      navigate('/');
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Touch swipe: left = fold, right = check/call
  const touchStartX = useRef(null);
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || gameState?.actionOn !== myPos) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 80) return; // minimum swipe distance
    const myBet = myPos === 1 ? gameState.p1Bet : gameState.p2Bet;
    const callAmt = Math.max(0, (gameState.currentBet || 0) - (myBet || 0));
    if (dx < 0) onAction('fold');
    else if (callAmt === 0) onAction('check');
    else onAction('call', callAmt);
    touchStartX.current = null;
  };

  const oppPos   = myPos === 1 ? 2 : 1;
  const myChips  = myPos === 1 ? gameState?.p1Chips : gameState?.p2Chips;
  const oppChips = myPos === 1 ? gameState?.p2Chips : gameState?.p1Chips;
  const myBet    = myPos === 1 ? gameState?.p1Bet   : gameState?.p2Bet;
  const oppBet   = myPos === 1 ? gameState?.p2Bet   : gameState?.p1Bet;
  const myAvatar = myPos === 1 ? playerAvatars.p1 : playerAvatars.p2;
  const oppAvatar = myPos === 1 ? playerAvatars.p2 : playerAvatars.p1;
  const myName   = user?.username;
  const oppName  = myPos === 1 ? players.p2 : players.p1;
  const myTimebank = myPos === 1 ? gameState?.p1Timebank : gameState?.p2Timebank;
  const oppTimebank = myPos === 1 ? gameState?.p2Timebank : gameState?.p1Timebank;
  const mySitout = myPos === 1 ? gameState?.p1Sitout : gameState?.p2Sitout;
  const oppSitout = myPos === 1 ? gameState?.p2Sitout : gameState?.p1Sitout;

  const iMeDealer  = gameState && ((myPos === 1 && gameState.dealerPos === 0) || (myPos === 2 && gameState.dealerPos === 1));
  const isOppDealer = gameState && !iMeDealer && (gameState.dealerPos === 0 || gameState.dealerPos === 1);

  const myCards  = gameState?.myCards || [];
  const oppHoleCards = handResult?.holeCards
    ? (myPos === 1 ? handResult.holeCards?.p2 : handResult.holeCards?.p1)
    : null;

  const oppCardsDisplay = (() => {
    if (oppHoleCards) return oppHoleCards;
    if (gameState?.phase && gameState.phase !== 'showdown') return [null, null];
    return [];
  })();

  const isMyTurn = gameState?.actionOn === myPos && gameState?.phase !== 'showdown';
  const isOppTurn = gameState?.actionOn === oppPos && gameState?.phase !== 'showdown';

  const statusMsg = (() => {
    const isAllInRunout = gameState?.phase !== 'showdown'
      && (gameState?.p1Chips === 0 || gameState?.p2Chips === 0)
      && gameState?.actionOn === 0;
    if (isAllInRunout) return 'All-in · running the board';
    if (!isMyTurn && !handResult && gameState?.phase !== 'showdown') {
      if (gameState?.actionOn === oppPos) return isAiGame ? `${aiName} is thinking...` : "Opponent's turn...";
    }
    return null;
  })();

  const tierLabel = tournament?.tier === 'play' ? 'Play Money' : `$${tournament?.tier} Buy-in`;
  const tableBackground = backgroundForTable(tournamentId);

  return (
    <div className="game-room h-screen flex flex-col relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ backgroundImage: `url(${tableBackground})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="game-room__overlay" aria-hidden="true" />

      {/* Top bar */}
      <div className="game-topbar shrink-0 relative z-20">
        <button onClick={handleExitClick} className="game-topbar__back">
          <Home size={16} />
          <span>Lobby</span>
        </button>
        <div className="game-topbar__center">
          <span className="game-topbar__brand">HR <i /></span>
          <span className="game-topbar__meta">{tierLabel}</span>
          {gameState?.handNumber > 0 && <span className="game-topbar__meta">Hand {gameState.handNumber}</span>}
          <div className={`game-topbar__connection ${connected ? 'is-online' : 'is-offline'}`}>
            {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
            <span>{connected ? 'Live' : 'Reconnecting'}</span>
          </div>
        </div>
        <div className="game-topbar__prize" id="game-prize-display">
          {tournament?.tier === 'play' ? 'Play Chips' : <PrizeDisplay prizePool={tournament?.prizePool} tier={tournament?.tier} />}
        </div>
      </div>

      {/* Main layout */}
      <div className="game-layout flex-1 flex overflow-hidden relative z-10">
        <div className="table-stage flex-1 flex flex-col justify-between p-2 md:p-4 gap-1 md:gap-3 min-h-0 overflow-y-auto md:overflow-hidden">

          {/* Opponent */}
          <div className="seat-position seat-position--opponent flex justify-center pt-1 md:pt-2">
            <div className="flex flex-col items-center gap-1">
              <PlayerSeat
                name={oppName}
                chips={oppChips}
                cards={oppCardsDisplay}
                isActive={isOppTurn}
                isMe={false}
                bet={oppBet}
                isDealer={isOppDealer}
                avatar={oppAvatar}
                timebank={oppTimebank}
                sitout={oppSitout}
                isTurn={isOppTurn}
              />
              {!isAiGame && oppName && (
                <div className="flex items-center gap-1 mt-1">
                  <PlayerNotes username={oppName} />
                </div>
              )}
            </div>
          </div>

          {/* AI show-one-card */}
          <AnimatePresence>
            {shownCard && shownCard.pos === oppPos && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex justify-center">
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl"
                  style={{ background: 'rgba(10,10,20,0.9)', border: '1px solid #ff6b0044' }}>
                  <PlayingCard card={shownCard.card} small />
                  <span className="text-heisenberg-orange text-sm font-mono">{shownCard.taunt}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center */}
          <div className="community-zone flex flex-col items-center justify-center gap-2 md:gap-4">
            {/* Community cards */}
            <div className="flex gap-1.5 md:gap-2.5 flex-wrap justify-center">
              {gameState?.communityCards?.length > 0 ? (
                gameState.communityCards.map((card, i) => (
                  <PlayingCard key={`${card}-${i}`} card={card} delay={i * 0.07} />
                ))
              ) : (
                <p className="text-heisenberg-muted/40 font-mono text-sm">
                  {gameState ? 'Waiting for flop...' : 'Loading...'}
                </p>
              )}
              {gameState?.communityCards && Array.from({ length: Math.max(0, 5 - gameState.communityCards.length) }).map((_, i) => (
                <div key={`e${i}`} className="w-12 h-[72px] md:w-16 md:h-24 rounded-xl border border-heisenberg-border/25 bg-heisenberg-card/10" />
              ))}
            </div>

            {/* Pot */}
            <AnimatePresence mode="wait">
              {gameState?.pot > 0 && (
                <motion.div key={gameState.pot}
                  initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="pot-badge">
                  <span className="text-[10px] md:text-xs uppercase tracking-widest opacity-60">POT</span>
                  <span className="text-base md:text-xl">{Number(gameState.pot).toLocaleString()}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {gameState?.phase && !['showdown','preflop'].includes(gameState.phase) && (
              <span className="street-label">{gameState.phase}</span>
            )}
            {statusMsg && <div className="table-status"><i />{statusMsg}</div>}

            {/* Hand result */}
            <AnimatePresence>
              {handResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-center px-8 py-4 rounded-2xl"
                  style={{
                    background: 'rgba(10,10,15,0.95)',
                    border: handResult.winner === myPos ? '1px solid #ffd70066' : '1px solid #1e1e3a',
                    boxShadow: handResult.winner === myPos ? '0 0 40px #ffd70022' : 'none',
                  }}>
                  {handResult.winner === 0 ? (
                    <p className="font-display text-xl text-heisenberg-neon font-bold">SPLIT POT</p>
                  ) : handResult.winner === myPos ? (
                    <>
                      <p className="font-display text-2xl font-black" style={{ color: '#ffd700', textShadow: '0 0 20px #ffd700' }}>
                        YOU WIN!
                      </p>
                      <p className="text-heisenberg-gold font-mono text-sm mt-1">+{Number(handResult.pot).toLocaleString()} chips</p>
                    </>
                  ) : (
                    <p className="font-display text-xl text-heisenberg-red font-bold">
                      {oppName || 'Opponent'} wins
                    </p>
                  )}
                  {handResult.showdown && (
                    <p className="text-heisenberg-muted text-xs font-mono mt-2">
                      You: <span className="text-heisenberg-neon">{myPos === 1 ? handResult.showdown.h1?.name : handResult.showdown.h2?.name}</span>
                      {' '}| Opp: <span className="text-heisenberg-orange">{myPos === 1 ? handResult.showdown.h2?.name : handResult.showdown.h1?.name}</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* My seat */}
          <div className="seat-position seat-position--hero flex flex-col items-center gap-1 md:gap-2 pb-1 md:pb-2">
            <PlayerSeat
              name={myName}
              chips={myChips}
              cards={myCards}
              isActive={isMyTurn}
              isMe={true}
              bet={myBet}
              isDealer={iMeDealer}
              avatar={myAvatar}
              timebank={myTimebank}
              sitout={mySitout}
              isTurn={isMyTurn}
            />

            {/* Hand strength meter */}
            <div className="player-controls">
            {myCards.length > 0 && gameState?.phase && gameState.phase !== 'showdown' && (
              <div className="w-full max-w-sm">
                <HandStrengthMeter
                  myCards={myCards}
                  community={gameState?.communityCards || []}
                  phase={gameState?.phase}
                />
              </div>
            )}

            {/* Action timer */}
            {isMyTurn && (
              <div className="w-full max-w-sm action-clock">
                <div className="flex justify-between text-xs font-mono text-heisenberg-muted mb-1">
                  <span>Your turn {timebankActive ? '⏱ Time Bank' : ''}</span>
                  <div className="flex items-center gap-2">
                    {myTimebank > 0 && !timebankActive && (
                      <button onClick={() => socketRef.current?.emit('useTimebank', { tournamentId })}
                        className="text-heisenberg-gold text-[10px] underline">
                        Bank({myTimebank}s)
                      </button>
                    )}
                    <span className={actionTimer <= 10 ? 'text-heisenberg-red animate-pulse font-bold' : ''}>{actionTimer}s</span>
                  </div>
                </div>
                <div className="h-1.5 bg-heisenberg-dark rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${(actionTimer / 30) * 100}%`, background: actionTimer > 10 ? '#00d4ff' : '#ff3355' }} />
                </div>
              </div>
            )}

            {/* Pre-action buttons */}
            {myPos > 0 && gameState?.phase !== 'showdown' && (
              <div className="w-full max-w-xl">
                <PreActionButtons gameState={gameState} myPos={myPos} onAction={onAction} />
              </div>
            )}

            {/* Action panel */}
            {myPos > 0 && (
              <div className="w-full max-w-xl action-dock">
                <ActionPanel gameState={gameState} myPos={myPos} onAction={onAction} myChips={myChips || 0} />
              </div>
            )}

            {/* Sit out / status */}
            <div className="flex items-center gap-3">
              {myPos > 0 && gameState && gameState.phase !== 'showdown' && !tournamentEnd && (
                <button onClick={toggleSitOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-display text-[10px] tracking-widest uppercase transition-all"
                  style={{
                    background: isSittingOut ? 'rgba(255,107,0,0.18)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isSittingOut ? '#ff6b0055' : '#1e1e3a'}`,
                    color: isSittingOut ? '#ff6b00' : '#6b6b9a',
                  }}>
                  <Coffee size={10} />
                  {isSittingOut ? "I'm Back" : 'Sit Out'}
                </button>
              )}
              {myPos === 0 && (
                <p className="text-heisenberg-muted text-sm font-display tracking-widest uppercase">Spectating</p>
              )}
            </div>
            </div>

            {/* Swipe hint on mobile */}
            {isMyTurn && (
              <p className="text-heisenberg-muted/40 text-[10px] font-mono hidden sm:hidden">
                ← Swipe left to fold · Swipe right to call →
              </p>
            )}
          </div>
        </div>

        {/* Right sidebar — desktop always visible, mobile toggle */}
        <div className="side-rail hidden md:flex w-60 flex-col gap-3 p-3">
          <BlindTimer blindStartTime={gameState?.blindStartTime} smallBlind={gameState?.smallBlind} bigBlind={gameState?.bigBlind} />
          <SessionStats stats={sessionStats} />
          <div className="glass-card rounded-xl flex-1 overflow-hidden flex flex-col min-h-0">
            <Chat socket={socketRef.current} tournamentId={tournamentId} username={user?.username} />
          </div>
        </div>

        {/* Mobile sidebar toggle */}
        <button onClick={() => setShowSidebar(o => !o)}
          className="md:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center bg-heisenberg-card border border-heisenberg-neon/40 shadow-lg"
          style={{ boxShadow: '0 0 15px #00d4ff22' }}>
          <MessageCircle size={20} className="text-heisenberg-neon" />
        </button>

        {/* Mobile sidebar overlay */}
        {showSidebar && (
          <div className="md:hidden fixed inset-0 z-50 bg-heisenberg-bg/95 backdrop-blur-md flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-heisenberg-border/40">
              <span className="font-display text-xs tracking-widest uppercase text-heisenberg-muted">Game Info</span>
              <button onClick={() => setShowSidebar(false)} className="p-2 text-heisenberg-muted"><X size={20} /></button>
            </div>
            <div className="flex-1 flex flex-col gap-3 p-4 overflow-y-auto">
              <BlindTimer blindStartTime={gameState?.blindStartTime} smallBlind={gameState?.smallBlind} bigBlind={gameState?.bigBlind} />
              <SessionStats stats={sessionStats} />
              <div className="glass-card rounded-xl flex-1 min-h-[200px] overflow-hidden flex flex-col">
                <Chat socket={socketRef.current} tournamentId={tournamentId} username={user?.username} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Button draw overlay */}
      <AnimatePresence>
        {buttonDraw && !showDrawDone && (
          <ButtonDraw
            draw={buttonDraw}
            players={players}
            onDone={() => setShowDrawDone(true)}
          />
        )}
      </AnimatePresence>

      {/* Friend challenge notification */}
      <AnimatePresence>
        {friendChallenge && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed top-16 right-4 z-50 glass-card p-4 rounded-xl max-w-xs"
            style={{ border: '1px solid #8b5cf644' }}>
            <p className="font-display text-xs tracking-widest uppercase text-heisenberg-purple mb-2">⚔️ Challenge!</p>
            <p className="font-mono text-sm text-white mb-3">
              {friendChallenge.fromAvatar} {friendChallenge.from} challenges you!
            </p>
            <div className="flex gap-2">
              <button onClick={() => { setFriendChallenge(null); navigate(`/game/${friendChallenge.tournamentId}`); }}
                className="flex-1 btn-primary text-xs py-2">Accept</button>
              <button onClick={() => setFriendChallenge(null)} className="flex-1 btn-ghost text-xs py-2">Decline</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tournament end modal */}
      <AnimatePresence>
        {tournamentEnd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-heisenberg-bg/90 backdrop-blur-md">
            <motion.div initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }}
              className="glass-card p-10 rounded-3xl text-center max-w-sm w-full mx-4"
              style={{ boxShadow: tournamentEnd.winner === myPos ? '0 0 80px #ffd70022' : '0 0 40px #ff335511' }}>

              <div className="text-6xl mb-4">{tournamentEnd.winner === myPos ? '🏆' : '💀'}</div>

              {tournamentEnd.winner === myPos ? (
                <>
                  <h2 className="font-display text-3xl font-black mb-2"
                    style={{ color: '#ffd700', textShadow: '0 0 20px #ffd700' }}>WINNER!</h2>
                  <p className="text-heisenberg-muted mb-2">
                    {isAiGame ? `You beat ${aiName}!` : 'You dominated the table'}
                  </p>
                  {tournamentEnd.prizePool > 0 && tournament?.tier && tournament.tier !== 'play' && (
                    <p className="font-mono text-heisenberg-green text-xl font-bold mb-2">
                      +${(parseFloat(tournament.tier) * 2 * 0.95).toFixed(2)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h2 className="font-display text-3xl font-black mb-2 text-heisenberg-red">ELIMINATED</h2>
                  <p className="text-heisenberg-muted mb-2">
                    {isAiGame
                      ? `${aiName} outsmarted you this time.`
                      : `${tournamentEnd.winnerName} takes the pot`}
                  </p>
                </>
              )}

              {/* Session summary */}
              {sessionStats && sessionStats.handsPlayed > 0 && (
                <div className="glass-card p-3 rounded-xl mb-4 text-center">
                  <p className="text-heisenberg-muted text-[10px] font-mono uppercase tracking-widest mb-1">Session</p>
                  <p className="font-mono text-xs text-heisenberg-muted">
                    {sessionStats.handsPlayed} hands · {sessionStats.handsWon} won
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button onClick={() => navigate('/')} className="flex-1 btn-ghost text-sm py-2.5">
                  Lobby
                </button>
                {isAiGame ? (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/tournament/join-ai', { method: 'POST', credentials: 'include' });
                        const data = await res.json();
                        if (data.tournament?.id) navigate(`/game/${data.tournament.id}`);
                      } catch { navigate('/'); }
                    }}
                    className="flex-1 btn-primary text-sm py-2.5">
                    Rematch
                  </button>
                ) : (
                  <button onClick={() => navigate('/')} className="flex-1 btn-primary text-sm py-2.5">
                    Play Again
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit warning modal */}
      <AnimatePresence>
        {showExitWarning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-heisenberg-bg/90 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="glass-card p-8 rounded-2xl text-center max-w-sm mx-4"
              style={{ border: '1px solid #ff335544' }}>
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="font-display text-xl font-black text-heisenberg-red mb-2">LEAVE TABLE?</h3>
              <p className="text-heisenberg-muted font-mono text-sm mb-6">
                You are in an active game. Leaving will forfeit the hand and may result in a penalty.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowExitWarning(false)} className="flex-1 btn-neon text-sm py-2.5">
                  Stay
                </button>
                <button onClick={() => navigate('/')} className="flex-1 btn-ghost text-sm py-2.5 border-heisenberg-red/40 text-heisenberg-red hover:text-heisenberg-red">
                  Leave Anyway
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting for opponent */}
      <AnimatePresence>
        {tournament?.status === 'waiting' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-heisenberg-bg/80 backdrop-blur-sm">
            <div className="glass-card p-10 rounded-2xl text-center max-w-sm mx-4">
              <div className="w-16 h-16 border-2 border-heisenberg-neon border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h2 className="font-display text-xl font-bold text-heisenberg-neon mb-2">WAITING FOR OPPONENT</h2>
              <p className="text-heisenberg-muted text-sm mb-6">Heads-Up — one opponent fills the seat</p>
              <button onClick={leaveWaitingTable} className="btn-ghost text-sm py-2 px-6">Cancel table</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
