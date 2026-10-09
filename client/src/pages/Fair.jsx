import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { ShieldCheck, RefreshCw, KeyRound, ArrowLeft } from 'lucide-react';

export default function Fair() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [seeds, setSeeds] = useState(null);
  const [customSeed, setCustomSeed] = useState('');
  const [rotateResult, setRotateResult] = useState(null);
  const [verifyId, setVerifyId] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await axios.get('/api/house/fair/current');
      setSeeds(r.data);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const rotate = async () => {
    setBusy(true);
    try {
      const r = await axios.post('/api/house/fair/rotate', customSeed ? { clientSeed } : {});
      setRotateResult(r.data);
      setCustomSeed('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Rotate failed');
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true);
    setVerifyResult(null);
    try {
      const r = await axios.get(`/api/house/fair/verify/${verifyId.trim()}`);
      setVerifyResult(r.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Not found');
    } finally { setBusy(false); }
  };

  return (
    <div className="page-root" style={{ backgroundImage: 'url(/lobby-floor.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.88), rgba(9,9,11,0.95))' }} />
      <div className="relative z-10 flex flex-col h-full">
        <Navbar btcPrice={null} />
        <div className="page-scroll">
          <main className="container mx-auto px-4 py-6 max-w-3xl">
            <button onClick={() => navigate('/casino')} className="btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 mb-5">
              <ArrowLeft size={13} /> Casino
            </button>

            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck size={26} className="text-heisenberg-green" />
              <h1 className="font-display text-xl font-bold tracking-widest">Provably Fair</h1>
            </div>
            <p className="text-heisenberg-muted text-xs font-mono leading-relaxed mb-6">
              Every instant-game bet derives its outcome from<br />
              <span className="text-heisenberg-neon">HMAC_SHA256(serverSeed, clientSeed:nonce:cursor)</span><br />
              The server seed hash is published <i>before</i> you bet. Rotate your seeds to reveal the old
              server seed, then replay any bet below and compare. If we ever tampered with an outcome,
              the SHA-256 hash wouldn't match.
            </p>

            {/* Current seeds */}
            <div className="glass-card p-5 rounded-2xl mb-4">
              <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-3 flex items-center gap-2">
                <KeyRound size={13} /> Active seeds
              </p>
              {seeds ? (
                <div className="space-y-2 text-[11px] font-mono">
                  <div className="flex justify-between gap-3"><span className="text-heisenberg-muted shrink-0">Server seed hash</span><span className="truncate" title={seeds.serverSeedHash}>{seeds.serverSeedHash}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-heisenberg-muted shrink-0">Your client seed</span><span className="text-white">{seeds.clientSeed}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-heisenberg-muted shrink-0">Bets placed (nonce)</span><span className="text-white">{seeds.nonce}</span></div>
                </div>
              ) : <p className="empty-note">…</p>}
              <div className="flex gap-2 mt-4">
                <input value={customSeed} onChange={e => setCustomSeed(e.target.value)} placeholder="New client seed (optional)"
                  className="input-field flex-1 text-xs font-mono" />
                <button onClick={rotate} disabled={busy} className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shrink-0">
                  <RefreshCw size={12} /> Rotate & Reveal
                </button>
              </div>
              <p className="text-heisenberg-muted text-[10px] font-mono mt-2">
                Rotating reveals the old server seed (so you can verify past bets) and starts a fresh committed pair.
              </p>
            </div>

            {/* Rotation result */}
            {rotateResult && (
              <div className="glass-card p-5 rounded-2xl mb-4" style={{ borderColor: 'rgba(16,185,129,0.35)' }}>
                <p className="font-display text-xs tracking-widest uppercase text-heisenberg-green mb-3">Seeds revealed — verify past bets now</p>
                <div className="space-y-2 text-[11px] font-mono break-all">
                  <div><span className="text-heisenberg-muted">Old server seed:</span> <span className="text-heisenberg-gold">{rotateResult.revealed.serverSeed}</span></div>
                  <div><span className="text-heisenberg-muted">Its SHA-256 (must match the hash you saw):</span> <span className="text-white">{rotateResult.revealed.serverSeedHash}</span></div>
                </div>
              </div>
            )}

            {/* Verify a bet */}
            <div className="glass-card p-5 rounded-2xl">
              <p className="font-display text-xs tracking-widest uppercase text-heisenberg-muted mb-3">Verify a bet</p>
              <p className="text-heisenberg-muted text-[10px] font-mono mb-3">
                Paste a round id from any slots / dice / plinko bet (found in My Bets or the game's response).
              </p>
              <div className="flex gap-2">
                <input value={verifyId} onChange={e => setVerifyId(e.target.value)} placeholder="Round id (uuid)"
                  className="input-field flex-1 text-xs font-mono" />
                <button onClick={verify} disabled={busy || !verifyId.trim()} className="btn-primary text-xs py-2 px-4 shrink-0 disabled:opacity-40">Verify</button>
              </div>
              {verifyResult && (
                <div className="mt-4 text-[11px] font-mono space-y-2">
                  {verifyResult.verifiable ? (
                    <>
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className="text-heisenberg-green" />
                        <span className={verifyResult.matches ? 'text-heisenberg-green font-bold' : 'text-heisenberg-red font-bold'}>
                          {verifyResult.matches ? 'MATCHES — outcome verified' : 'MISMATCH — outcome does not derive from seeds'}
                        </span>
                      </div>
                      <div className="text-heisenberg-muted">server seed: <span className="text-heisenberg-gold break-all">{verifyResult.serverSeed}</span></div>
                      <div className="text-heisenberg-muted">client seed: <span className="text-white">{verifyResult.clientSeed}</span> · nonce: <span className="text-white">{verifyResult.nonce}</span></div>
                      <div className="text-heisenberg-muted">recomputed outcome: <span className="text-white">{JSON.stringify(verifyResult.derived?.reels || verifyResult.derived?.roll || verifyResult.derived?.path)}</span></div>
                    </>
                  ) : (
                    <p className="text-heisenberg-muted">{verifyResult.note}</p>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
