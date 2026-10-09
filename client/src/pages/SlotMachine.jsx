import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { formatCasinoBalance } from '../utils/usd';
import { Home, Play, Minus, Plus, Zap, Gauge, History, Sparkles, Trophy } from 'lucide-react';
import { symbolDisplay, SLOT_THEMES, SLOT_SYMBOL_EMOJI, slotReelCount, slotArtwork } from '../utils/slotSymbols';

const FALLBACK_SYMBOLS = ['BTC', 'USD', 'GOLD', 'SEVEN', 'BAR', 'CHERRY'];

function fmt(n, currency) {
  return currency === 'btc' ? '$' + (Number(n || 0) / 100).toFixed(2) : Number(n || 0).toLocaleString();
}

function pickSymbol(symbols) {
  const pool = symbols?.length ? symbols : FALLBACK_SYMBOLS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomGrid(reelCount, symbols) {
  return Array.from({ length: reelCount }, () => Array.from({ length: 3 }, () => pickSymbol(symbols)));
}

function makeSpinTape(symbols) {
  const loop = Array.from({ length: 6 }, () => pickSymbol(symbols));
  return [...loop, ...loop];
}

function makeStopTape(finalColumn, symbols) {
  const leadIn = Array.from({ length: 6 }, () => pickSymbol(symbols));
  const tail = Array.from({ length: 3 }, () => pickSymbol(symbols));
  return [...leadIn, ...finalColumn, ...tail];
}

function reelWithResult(center, symbols) {
  const pool = symbols?.filter(s => s !== center) || FALLBACK_SYMBOLS;
  return [pickSymbol(pool.length ? pool : symbols), center, pickSymbol(pool.length ? pool : symbols)];
}

function symbolLabel(symbol) {
  return String(symbol || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toUpperCase();
}

function SlotSymbol({ symbol, accent }) {
  const art = symbolDisplay(symbol);
  const isIllustrated = art !== symbol || Object.hasOwn(SLOT_SYMBOL_EMOJI, symbol);
  const monogram = String(symbol || '•').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '✦';
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-center">
      <span className="select-none leading-none drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" style={{ fontSize: 'clamp(1.35rem, 4vw, 2.65rem)' }}>
        {isIllustrated ? art : <span className="font-display font-black tracking-tight" style={{ color: accent }}>{monogram}</span>}
      </span>
      <span className="max-w-full truncate font-mono text-[7px] font-bold tracking-[0.11em] text-white/70 sm:text-[9px]">
        {symbolLabel(symbol)}
      </span>
    </div>
  );
}

export default function SlotMachine() {
  const { machineId } = useParams();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(null);
  const [bet, setBet] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [grid, setGrid] = useState([]);
  const [reelModes, setReelModes] = useState([]);
  const [spinTapes, setSpinTapes] = useState([]);
  const [stopTapes, setStopTapes] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const stopTimers = useRef([]);
  const spinLock = useRef(false);
  const spinSequenceRef = useRef(0);
  const stoppedReelsRef = useRef(new Set());
  const finishOutcomeRef = useRef(null);

  const machineKey = (machineId || '').replace('slots-', '').replace('-btc', '');
  const theme = SLOT_THEMES[machineKey] || { grad: 'linear-gradient(160deg,#17171a,#101012)', accent: '#f7931a' };
  const backgroundArt = ({
    'heisenberg-special': '/slot-heisenberg-special-scene.webp',
    'razor-returns-crypto': '/slot-scene-razor-returns-crypto.webp',
    'jokers-crypto-millions': '/slot-scene-jokers-crypto-millions.webp',
    'thunder-zeus-1000': '/slot-scene-thunder-zeus-1000.webp',
    'wild-west-gold-rush': '/slot-scene-wild-west-gold-rush.webp',
    'egyptian-gold-rush': '/slot-scene-egyptian-gold-rush.webp',
  })[machineKey] || slotArtwork(machineKey);

  useEffect(() => {
    let cancelled = false;
    spinSequenceRef.current += 1;
    setCfg(null);
    setResult(null);
    setHistory([]);
    setSpinning(false);
    setReelModes([]);
    spinLock.current = false;
    axios.get('/api/house/tables').then(r => {
      const machine = r.data.instant?.find(x => x.id === machineId);
      if (cancelled) return;
      if (!machine) return navigate('/casino');
      const reelCount = slotReelCount(machineKey, machine.reelCount);
      setCfg({ ...machine, reelCount });
      setBet(machine.min);
      setGrid(randomGrid(reelCount, machine.reelSymbols || FALLBACK_SYMBOLS));
    }).catch(() => { if (!cancelled) navigate('/casino'); });

    return () => {
      cancelled = true;
      spinSequenceRef.current += 1;
      stopTimers.current.forEach(clearTimeout);
    };
  }, [machineId, navigate]);

  const spin = async () => {
    if (spinLock.current || !cfg) return;
    spinLock.current = true;
    const spinSequence = ++spinSequenceRef.current;
    setSpinning(true);
    setResult(null);

    const symbols = cfg.reelSymbols?.length ? cfg.reelSymbols : FALLBACK_SYMBOLS;
    const reelCount = slotReelCount(machineKey, cfg.reelCount);
    stoppedReelsRef.current = new Set();
    finishOutcomeRef.current = null;
    setReelModes(Array.from({ length: reelCount }, () => 'rolling'));
    setSpinTapes(Array.from({ length: reelCount }, () => makeSpinTape(symbols)));
    setStopTapes(Array.from({ length: reelCount }, () => null));
    try {
      const res = await axios.post(`/api/house/play/${machineId}`, { bet });
      const outcome = res.data;
      // A settled spin must refresh the wallet even if the player navigated away
      // before the reel-stop animation completed.
      refreshUser().catch(() => {});
      if (spinSequence !== spinSequenceRef.current) return;
      const finalReels = Array.isArray(outcome.reels) ? outcome.reels : [];
      if (!finalReels.length) throw new Error('The machine returned an invalid result');
      const finalGrid = finalReels.map(symbol => reelWithResult(symbol, symbols));
      setGrid(finalGrid);
      // The result is authoritative. If an older API process supplied stale
      // setup metadata, start every returned reel before scheduling the stops.
      setReelModes(Array.from({ length: finalGrid.length }, () => 'rolling'));
      setSpinTapes(Array.from({ length: finalGrid.length }, () => makeSpinTape(symbols)));
      setStopTapes(Array.from({ length: finalReels.length }, () => null));
      finishOutcomeRef.current = () => {
        setSpinning(false);
        spinLock.current = false;
        setResult(outcome);
        setHistory(current => [outcome, ...current].slice(0, 8));
        if (outcome.jackpotWin) {
          toast.success(`${outcome.jackpotWin.tier.toUpperCase()} JACKPOT · ${fmt(outcome.jackpotWin.amount, cfg.currency)}!`);
        } else if (outcome.payout > 0) {
          toast.success(`WIN · ${fmt(outcome.payout, cfg.currency)}`);
        }
      };

      finalGrid.forEach((column, index) => {
        const timer = setTimeout(() => {
          stopTimers.current = stopTimers.current.filter(t => t !== timer);
          setStopTapes(current => current.map((tape, reelIndex) => (
            reelIndex === index ? makeStopTape(column, symbols) : tape
          )));
          setReelModes(current => current.map((mode, reelIndex) => (
            reelIndex === index ? 'slowing' : mode
          )));
        }, 330 + index * 220);
        stopTimers.current.push(timer);
      });
    } catch (err) {
      if (spinSequence !== spinSequenceRef.current) return;
      stopTimers.current.forEach(clearTimeout);
      stopTimers.current = [];
      finishOutcomeRef.current = null;
      setReelModes([]);
      setSpinning(false);
      spinLock.current = false;
      toast.error(err.response?.data?.error || err.message || 'Spin failed');
    }
  };

  const onReelAnimationEnd = (index) => {
    if (reelModes[index] !== 'slowing' || stoppedReelsRef.current.has(index)) return;
    stoppedReelsRef.current.add(index);
    setReelModes(current => current.map((mode, reelIndex) => (
      reelIndex === index ? 'stopped' : mode
    )));
    if (stoppedReelsRef.current.size === reelModes.length) {
      finishOutcomeRef.current?.();
      finishOutcomeRef.current = null;
    }
  };

  if (!cfg) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[#09090b]">
        <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${backgroundArt})` }} />
        <div className="relative h-12 w-12 animate-spin rounded-full border-2 border-heisenberg-neon border-t-transparent" />
      </div>
    );
  }

  const chipDenoms = [...new Set([cfg.min, cfg.min * 5, cfg.min * 25, cfg.min * 100].filter(v => v <= cfg.max))];
  const rtp = (cfg.rtp * 100).toFixed(2);
  const reelCount = grid.length || slotReelCount(machineKey, cfg.reelCount);

  return (
    <div className="relative h-screen overflow-y-auto bg-[#09090b] text-white">
      <div className="fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backgroundArt})`, filter: 'blur(2px)', transform: 'scale(1.03)' }} />
      <div className="fixed inset-0" style={{ background: 'linear-gradient(180deg,rgba(5,6,10,0.72),rgba(5,5,8,0.82) 42%,rgba(5,5,8,0.95))' }} />
      <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(ellipse at 50% 36%, ${theme.accent}26 0%, transparent 48%)` }} />

      <div className="relative z-10 min-h-full">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
          <button onClick={() => navigate('/casino')} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-[10px] sm:text-xs">
            <Home size={14} /> Lobby
          </button>
          <div className="flex min-w-0 items-center justify-center gap-2">
            <span className="hidden rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] sm:inline-flex" style={{ color: theme.accent, borderColor: `${theme.accent}55`, background: '#050507a8' }}>
              {cfg.reelCount || 3} REELS · {rtp}% RTP
            </span>
            <span className="croom-chip max-w-[44vw] truncate !text-[10px] sm:!text-xs">{cfg.label}</span>
          </div>
          <span className="croom-chip shrink-0 !text-[10px] sm:!text-xs">Bal <b>{formatCasinoBalance(user, cfg.currency)}</b></span>
        </header>

        <main className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-4 px-3 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-5">
          {/* Full video slot cabinet */}
          <motion.section initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative overflow-hidden rounded-[30px] border p-[5px] sm:p-[7px]"
            style={{
              background: `linear-gradient(135deg,${theme.accent} 0%,#39210e 20%,#09090b 48%,#24170d 78%,${theme.accent} 100%)`,
              borderColor: `${theme.accent}aa`,
              boxShadow: `0 0 0 1px ${theme.accent}35, 0 24px 90px rgba(0,0,0,0.72), 0 0 42px ${theme.accent}20`,
            }}>
            <div className="relative rounded-[25px] p-2.5 sm:p-4" style={{ background: 'linear-gradient(155deg,#25201a 0%,#0d0d10 28%,#17120d 100%)', border: '1px solid rgba(255,255,255,0.13)' }}>
              <div className="mb-2 flex items-center justify-center gap-1.5 px-5" aria-hidden="true">
                {Array.from({ length: 11 }, (_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: theme.accent, boxShadow: `0 0 8px ${theme.accent}`, opacity: i % 3 === 1 ? 0.55 : 1 }} />)}
              </div>

              {/* The cabinet's illuminated game marquee */}
              <div className="relative h-32 overflow-hidden rounded-[18px] border sm:h-44" style={{ borderColor: `${theme.accent}77`, boxShadow: `inset 0 0 28px ${theme.accent}22, 0 6px 24px rgba(0,0,0,0.5)` }}>
                <img src={backgroundArt} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg,rgba(5,5,8,0.88),rgba(5,5,8,0.4) 53%,rgba(5,5,8,0.08)),linear-gradient(0deg,rgba(0,0,0,0.58),transparent 72%)' }} />
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 font-mono text-[8px] tracking-[0.2em] text-white/75 backdrop-blur sm:left-5 sm:top-4 sm:text-[9px]">
                  <Sparkles size={11} style={{ color: theme.accent }} /> PREMIUM VIDEO SLOT
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 sm:bottom-5 sm:left-5 sm:right-5">
                  <div className="min-w-0">
                    <p className="font-mono text-[8px] tracking-[0.25em] text-white/65 sm:text-[9px]">HEISENBERG CASINO PRESENTS</p>
                    <h1 className="mt-0.5 truncate font-display text-xl font-black uppercase leading-none tracking-[0.06em] text-white drop-shadow-lg sm:text-3xl" style={{ textShadow: `0 2px 18px ${theme.accent}88` }}>{cfg.label}</h1>
                  </div>
                  <div className="shrink-0 rounded-xl border px-2.5 py-1.5 text-right backdrop-blur-md sm:px-3 sm:py-2" style={{ color: theme.accent, borderColor: `${theme.accent}75`, background: 'rgba(4,4,6,0.72)' }}>
                    <p className="font-mono text-[7px] tracking-[0.18em] opacity-70 sm:text-[8px]">RETURN TO PLAYER</p>
                    <p className="font-display text-sm font-black sm:text-lg">{rtp}%</p>
                  </div>
                </div>
              </div>

              {/* Glass-front reel window */}
              <div className="mx-auto mt-3 max-w-5xl rounded-[20px] border p-2.5 sm:mt-4 sm:p-4" style={{ background: 'linear-gradient(180deg,#302518,#15120e 10%,#08080a 26%,#0a0909 84%,#24190e)', borderColor: `${theme.accent}70`, boxShadow: 'inset 0 3px 14px rgba(0,0,0,0.8),0 2px 15px rgba(0,0,0,0.6)' }}>
                <div className="mb-2 flex items-center justify-between px-1 font-mono text-[7px] tracking-[0.18em] text-white/45 sm:text-[9px]">
                  <span>SPIN WINDOW</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: theme.accent, boxShadow: `0 0 7px ${theme.accent}` }} /> CENTER LINE ACTIVE</span>
                </div>
                <div className="relative rounded-[14px] border p-1.5 sm:p-2" style={{ background: 'linear-gradient(180deg,#030304,#14100a 50%,#030304)', borderColor: `${theme.accent}55`, boxShadow: `inset 0 0 22px ${theme.accent}14` }}>
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${reelCount}, minmax(0, 1fr))`, gap: 'clamp(3px, 0.9vw, 9px)' }}>
                    {grid.map((column, reelIndex) => {
                      const mode = reelModes[reelIndex] || 'idle';
                      const animated = mode === 'rolling' || mode === 'slowing';
                      const tape = mode === 'slowing' ? stopTapes[reelIndex] : spinTapes[reelIndex];
                      return (
                        <div key={reelIndex} className="slot-reel-window relative overflow-hidden rounded-lg sm:rounded-xl"
                          style={{ background: 'linear-gradient(180deg,#09090b,#211d18 50%,#09090b)', boxShadow: 'inset 0 0 12px rgba(0,0,0,0.9)', border: `1px solid ${animated ? `${theme.accent}75` : 'rgba(255,255,255,0.12)'}` }}>
                          {animated && tape ? (
                            <div key={`${mode}-${reelIndex}`} onAnimationEnd={() => mode === 'slowing' && onReelAnimationEnd(reelIndex)}
                              className="slot-reel-strip"
                              style={{
                                gridTemplateRows: 'repeat(12, clamp(52px, 10vw, 90px))',
                                animation: mode === 'slowing'
                                  ? 'slot-reel-brake 920ms cubic-bezier(0.06, 0.68, 0.14, 1) 1 both'
                                  : 'slot-reel-spin 220ms linear infinite',
                                animationDelay: mode === 'rolling' ? `${-reelIndex * 0.075}s` : '0s',
                                borderColor: theme.accent,
                              }}>
                              {tape.map((symbol, rowIndex) => (
                                <div key={`${reelIndex}-tape-${rowIndex}`} className="relative flex min-w-0 items-center justify-center overflow-hidden border-b border-white/[0.06]"
                                  style={{ background: 'linear-gradient(180deg,#29241d,#161310)', opacity: rowIndex % 6 === 1 ? 0.95 : 0.78 }}>
                                  <SlotSymbol symbol={symbol} accent={theme.accent} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="grid" style={{ gridTemplateRows: 'repeat(3, clamp(52px, 10vw, 90px))' }}>
                              {column.map((symbol, rowIndex) => (
                                <div key={`${reelIndex}-${rowIndex}`} className="relative flex min-w-0 items-center justify-center overflow-hidden"
                                  style={{
                                    background: rowIndex === 1 ? 'linear-gradient(180deg,#363027,#211c16)' : 'linear-gradient(180deg,rgba(255,255,255,0.015),rgba(0,0,0,0.22))',
                                    borderTop: rowIndex === 1 ? `1px solid ${theme.accent}95` : '1px solid rgba(255,255,255,0.035)',
                                    borderBottom: rowIndex === 1 ? `1px solid ${theme.accent}95` : '1px solid rgba(255,255,255,0.035)',
                                    opacity: rowIndex === 1 ? 1 : 0.48,
                                  }}>
                                  <SlotSymbol symbol={symbol} accent={theme.accent} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pointer-events-none absolute left-1 right-1 top-1/2 z-10 flex -translate-y-1/2 items-center justify-between text-[10px]" style={{ color: theme.accent, textShadow: `0 0 8px ${theme.accent}` }} aria-hidden="true">
                    <span>▶</span><span>◀</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between px-1 font-mono text-[7px] tracking-[0.16em] text-white/35 sm:text-[8px]">
                  <span>{cfg.reelCount || 3} PRECISION REELS</span><span>1 PAYLINE</span><span>PROVABLY FAIR</span>
                </div>
              </div>

              {/* Result display */}
              <div className="mx-auto mt-3 flex min-h-[62px] max-w-5xl items-center justify-between gap-3 rounded-xl border px-3 py-2 sm:mt-4 sm:px-5" style={{ background: 'linear-gradient(90deg,rgba(0,0,0,0.82),rgba(25,18,9,0.72),rgba(0,0,0,0.82))', borderColor: result?.payout > 0 ? `${theme.accent}9c` : 'rgba(255,255,255,0.1)', boxShadow: result?.payout > 0 ? `0 0 22px ${theme.accent}20` : 'none' }}>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ color: result?.payout > 0 ? theme.accent : 'rgba(255,255,255,0.35)', borderColor: result?.payout > 0 ? `${theme.accent}77` : 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)' }}>
                    {result?.payout > 0 ? <Trophy size={15} /> : <Zap size={14} />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-[7px] tracking-[0.22em] text-white/45 sm:text-[8px]">{spinning ? 'OUTCOME LOCKED · REELS STOPPING' : result ? (result.payout > 0 ? 'WINNING SPIN' : 'SPIN COMPLETE') : 'READY TO PLAY'}</p>
                    <p className="truncate font-display text-xs font-bold tracking-wider sm:text-sm" style={{ color: result?.payout > 0 ? theme.accent : 'rgba(255,255,255,0.82)' }}>
                      {spinning ? 'GOOD LUCK' : result?.feature || (result?.payout > 0 ? 'NICE HIT' : result ? 'NO WIN THIS SPIN' : 'PLACE YOUR BET')}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {result && !spinning ? <>
                    <p className="font-mono text-[7px] tracking-[0.2em] text-white/40">{result.payout > 0 ? `${Number(result.pay || 0).toLocaleString()}× · RETURN` : 'RETURN'}</p>
                    <p className="font-display text-base font-black sm:text-xl" style={{ color: result.payout > 0 ? theme.accent : 'rgba(255,255,255,0.62)' }}>{fmt(result.payout, cfg.currency)}</p>
                  </> : <p className="font-mono text-[9px] tracking-widest text-white/35">— — —</p>}
                </div>
              </div>

              <div className="mx-auto mt-3 grid max-w-5xl grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                {/* Stake controls */}
                <div className="rounded-2xl border p-3 sm:p-4" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.055),rgba(0,0,0,0.34))', borderColor: 'rgba(255,255,255,0.1)' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-mono text-[8px] tracking-[0.2em] text-white/50 sm:text-[9px]">BET PER SPIN</p>
                    <p className="font-mono text-[8px] text-white/35">MIN {fmt(cfg.min, cfg.currency)} <span className="mx-1">·</span> MAX {fmt(cfg.max, cfg.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={spinning || bet <= cfg.min} onClick={() => setBet(v => Math.max(cfg.min, v - cfg.min))}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-white/75 transition hover:bg-white/10 disabled:opacity-30" style={{ borderColor: 'rgba(255,255,255,0.14)' }} aria-label="Decrease bet"><Minus size={15} /></button>
                    <div className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border bg-black/40 px-3 font-display text-lg font-black tracking-wider sm:text-xl" style={{ borderColor: `${theme.accent}50`, color: theme.accent }}>{fmt(bet, cfg.currency)}</div>
                    <button disabled={spinning || bet >= cfg.max} onClick={() => setBet(v => Math.min(cfg.max, v + cfg.min))}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-white/75 transition hover:bg-white/10 disabled:opacity-30" style={{ borderColor: 'rgba(255,255,255,0.14)' }} aria-label="Increase bet"><Plus size={15} /></button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {chipDenoms.map((v, i) => (
                      <button key={v} disabled={spinning} onClick={() => setBet(v)}
                        className="rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold transition disabled:opacity-40"
                        style={{ color: bet === v ? '#101010' : 'rgba(255,255,255,0.66)', background: bet === v ? theme.accent : 'linear-gradient(180deg,#373737,#171719)', borderColor: bet === v ? '#fff8' : 'rgba(255,255,255,0.19)', boxShadow: bet === v ? `0 0 12px ${theme.accent}55` : 'inset 0 1px rgba(255,255,255,0.12)' }}>
                        {i === 0 ? 'MIN ' : ''}{fmt(v, cfg.currency)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Large physical spin button */}
                <button onClick={spin} disabled={spinning}
                  className="group relative flex min-h-[74px] items-center justify-center gap-3 overflow-hidden rounded-2xl border px-8 font-display text-sm font-black tracking-[0.18em] transition enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 disabled:cursor-wait sm:min-w-[205px]"
                  style={{ background: spinning ? 'linear-gradient(180deg,#51432e,#20190f)' : `linear-gradient(180deg,${theme.accent},#9a4f0a)`, color: spinning ? 'rgba(255,255,255,0.55)' : '#140d05', borderColor: spinning ? 'rgba(255,255,255,0.16)' : '#ffedbd', boxShadow: spinning ? 'inset 0 2px 10px rgba(0,0,0,0.5)' : `inset 0 2px rgba(255,255,255,0.42),0 5px 0 #5e330a,0 10px 26px ${theme.accent}38` }}>
                  <span className="absolute inset-x-5 top-1 h-px bg-white/40" />
                  {spinning ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" /> : <Play size={18} fill="currentColor" />}
                  <span>{spinning ? 'SPINNING' : 'SPIN'}</span>
                  {!spinning && <span className="text-[10px] tracking-[0.08em] opacity-70">· {fmt(bet, cfg.currency)}</span>}
                </button>
              </div>
            </div>
          </motion.section>

          {/* Cabinet side panel / recent rounds */}
          <aside className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <section className="rounded-2xl border p-4 backdrop-blur-xl" style={{ background: 'linear-gradient(145deg,rgba(28,25,22,0.94),rgba(9,9,12,0.94))', borderColor: `${theme.accent}45`, boxShadow: '0 12px 34px rgba(0,0,0,0.34)' }}>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border" style={{ color: theme.accent, borderColor: `${theme.accent}45`, background: `${theme.accent}12` }}><Gauge size={16} /></div>
                <div><p className="font-display text-[11px] font-bold tracking-[0.16em]">MACHINE INFO</p><p className="font-mono text-[8px] text-white/40">HOUSE GAME SPECIFICATIONS</p></div>
              </div>
              <div className="space-y-2.5">
                {[
                  ['Return to player', `${rtp}%`],
                  ['Reels', `${cfg.reelCount || 3} vertical`],
                  ['Active lines', '1 center line'],
                  ['Game currency', cfg.currency === 'btc' ? 'Bitcoin' : 'Play chips'],
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2 last:border-0 last:pb-0"><span className="font-mono text-[9px] text-white/45">{label}</span><span className="text-right font-mono text-[9px] font-bold" style={{ color: label === 'Return to player' ? theme.accent : 'rgba(255,255,255,0.8)' }}>{value}</span></div>)}
              </div>
              <p className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 p-2.5 font-mono text-[8px] leading-relaxed text-white/45">
                Each spin is resolved by the casino server. The displayed reel symbols are the recorded outcome for this round.
              </p>
            </section>

            <section className="rounded-2xl border p-4 backdrop-blur-xl" style={{ background: 'linear-gradient(145deg,rgba(28,25,22,0.94),rgba(9,9,12,0.94))', borderColor: 'rgba(255,255,255,0.09)', boxShadow: '0 12px 34px rgba(0,0,0,0.34)' }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><History size={15} style={{ color: theme.accent }} /><p className="font-display text-[11px] font-bold tracking-[0.16em]">RECENT SPINS</p></div>
                <span className="font-mono text-[8px] text-white/35">{history.length} / 8</span>
              </div>
              {history.length ? <div className="space-y-1.5">
                {history.map((spinResult, i) => (
                  <div key={`${spinResult.roundId || i}-${i}`} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-2">
                    <span className="font-mono text-[8px] tracking-wider text-white/35">#{history.length - i} <span className="mx-1">·</span>{spinResult.reels?.map(symbol => symbolLabel(symbol).slice(0, 2)).join(' ')}</span>
                    <span className="font-mono text-[9px] font-bold" style={{ color: spinResult.payout > spinResult.bet ? theme.accent : 'rgba(255,255,255,0.42)' }}>
                      {spinResult.payout > spinResult.bet ? `+${fmt(spinResult.net, cfg.currency)}` : '—'}
                    </span>
                  </div>
                ))}
              </div> : <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/15 text-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-white/30"><History size={14} /></div>
                <p className="font-mono text-[8px] tracking-widest text-white/35">YOUR SPINS WILL APPEAR HERE</p>
              </div>}
            </section>

                {cfg.currency === 'play' && <div className="flex items-center gap-2 rounded-2xl border border-heisenberg-gold/20 bg-black/40 p-3 text-heisenberg-gold/70 sm:col-span-2 lg:col-span-1">
              <Sparkles size={14} className="shrink-0" /><p className="font-mono text-[8px] leading-relaxed">Eligible play-chip wagers contribute to the progressive jackpot pools.</p>
            </div>}
          </aside>
        </main>
      </div>
    </div>
  );
}
