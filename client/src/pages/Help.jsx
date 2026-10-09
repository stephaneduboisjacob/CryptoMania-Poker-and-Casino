import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';

const SECTIONS = [
  {
    title: '🃏 How to Play',
    items: [
      {
        q: 'What type of poker is this?',
        a: 'Heisenberg Rooms is exclusively Heads-Up No Limit Texas Hold\'em. That means 1-on-1, no community table, just you and one opponent.',
      },
      {
        q: 'How does a hand work?',
        a: 'Each hand: both players are dealt 2 private cards (hole cards). 5 community cards are dealt in rounds — Flop (3 cards), Turn (1 card), River (1 card). The best 5-card hand wins the pot.',
      },
      {
        q: 'What are the betting rounds?',
        a: 'Pre-flop → Flop → Turn → River. In Heads-Up, the dealer is the Small Blind and acts first pre-flop, but second on all other streets.',
      },
      {
        q: 'What does "No Limit" mean?',
        a: 'You can bet any amount up to your entire chip stack at any time. There is no maximum bet.',
      },
      {
        q: 'How are blinds determined?',
        a: 'Before each hand, a high-card draw determines who gets the button (dealer). The button rotates every hand.',
      },
    ],
  },
  {
    title: '⏱ Blinds & Timer',
    items: [
      {
        q: 'How do blinds work?',
        a: 'Small blind and big blind are posted automatically at the start of each hand. The dealer posts the small blind; the opponent posts the big blind.',
      },
      {
        q: 'Do blinds increase?',
        a: 'Yes — blinds double every 5 minutes. Starting at 50/100, they increase to 100/200, 200/400, and so on. This prevents games from lasting forever.',
      },
      {
        q: 'What is the action timer?',
        a: 'You have 30 seconds to act each turn. If time runs out, you auto-fold. Use your Time Bank (extra 15 seconds) for tough decisions.',
      },
      {
        q: 'What is the Time Bank?',
        a: 'Each player starts with 30 seconds of Time Bank per session. Click "Time Bank" during your turn to add 15 extra seconds. Once depleted, you\'re back to the regular timer.',
      },
    ],
  },
  {
    title: '₿ Crypto Deposits & Withdrawals',
    items: [
      {
        q: 'How do I deposit?',
        a: 'Go to Wallet → Deposit and choose a USD amount. The secure BTCPay checkout supports deposits in 2,000+ cryptocurrencies; available methods are shown on the invoice page. Your balance credits after the payment is confirmed.',
      },
      {
        q: 'How long do deposits take?',
        a: 'Confirmation time depends on the cryptocurrency and network you choose. Follow the payment status and instructions shown on the BTCPay invoice.',
      },
      {
        q: 'How do I withdraw?',
        a: 'Go to Wallet → Withdraw. Enter an amount and your Bitcoin address. Withdrawals are currently paid out in BTC and processed manually — allow up to 24 hours.',
      },
      {
        q: 'What is the rake?',
        a: '5% rake on all real-money games, taken from the prize pool before payout. Play-money games have no rake.',
      },
      {
        q: 'What is the minimum deposit?',
        a: 'The minimum deposit is $5 USD equivalent. Select your payment currency and review the final amount in BTCPay checkout.',
      },
    ],
  },
  {
    title: '🎮 Game Features',
    items: [
      {
        q: 'What is the 4-color deck?',
        a: 'Enable 4-color deck in Settings → Preferences to show clubs in green and diamonds in blue (instead of both black/red). Reduces suit-confusion.',
      },
      {
        q: 'What is the Hand Strength Meter?',
        a: 'The bar under your cards shows an estimated hand strength (0–100%). Pre-flop it uses a strength table; post-flop it shows your current hand rank.',
      },
      {
        q: 'What are Pre-Action Buttons?',
        a: 'While waiting for your opponent to act, you can queue a pre-action (Pre-Fold or Pre-Check/Call). When your turn arrives, the action fires instantly.',
      },
      {
        q: 'What is Sit Out?',
        a: 'Click "Sit Out" to pause without forfeiting. Your hand will auto-fold. Great for short breaks. Return anytime using "I\'m Back".',
      },
      {
        q: 'When does the AI show its cards?',
        a: 'Folded hands stay mucked. When a bet is called through showdown, both hands are always revealed. The AI may occasionally show one card after winning an uncalled pot.',
      },
    ],
  },
  {
    title: '👥 Social Features',
    items: [
      {
        q: 'How do I add friends?',
        a: 'Visit any player\'s profile page and click "Add Friend". They\'ll receive a request. Once accepted, you can see when they\'re online and challenge them.',
      },
      {
        q: 'What are Player Notes?',
        a: 'During a game, click the 📝 icon next to the opponent\'s name to write private notes about their playing style. Notes are only visible to you.',
      },
      {
        q: 'What is Lobby Chat?',
        a: 'A global chat visible to everyone online. Click the chat bubble in the lobby to join the conversation.',
      },
      {
        q: 'Can I challenge a friend directly?',
        a: 'Yes — go to your friend\'s profile or the friends list and click "Challenge". This creates a free play-money table and invites them.',
      },
    ],
  },
  {
    title: '🔒 Responsible Gambling',
    items: [
      {
        q: 'Can I set deposit limits?',
        a: 'Yes — go to Settings → Responsible Gambling. You can set a maximum deposit amount per day/week or a session time limit.',
      },
      {
        q: 'How do I self-exclude?',
        a: 'Contact support at jacobstephane@outlook.com to request a self-exclusion period.',
      },
      {
        q: 'Is there a cool-down period?',
        a: 'Yes — deposit limit changes take effect immediately but can only be increased after a 24-hour waiting period.',
      },
    ],
  },
];

function FAQ({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-heisenberg-border/20 last:border-none">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-4 py-4 text-left">
        <span className="font-mono text-sm text-heisenberg-text font-medium">{item.q}</span>
        {open ? <ChevronUp size={16} className="text-heisenberg-muted shrink-0 mt-0.5" /> : <ChevronDown size={16} className="text-heisenberg-muted shrink-0 mt-0.5" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <p className="pb-4 text-sm text-heisenberg-muted font-mono leading-relaxed">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Help() {
  const [activeSection, setActiveSection] = useState(0);
  const navigate = useNavigate();

  return (
    <div className="page-root">
      <Navbar />
      <div className="page-scroll">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/play')} className="text-heisenberg-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-heisenberg-card/60">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-2xl font-black tracking-widest text-heisenberg-neon">HELP & FAQ</h1>
            <p className="text-heisenberg-muted font-mono text-xs">Everything you need to know about Heisenberg Rooms</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Section nav */}
          <div className="lg:col-span-1">
            <div className="glass-card p-3 rounded-xl space-y-1 sticky top-4">
              {SECTIONS.map((s, i) => (
                <button key={i} onClick={() => setActiveSection(i)}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all"
                  style={{
                    background: activeSection === i ? 'rgba(247,147,26,0.12)' : 'transparent',
                    color: activeSection === i ? '#f7931a' : '#96897a',
                  }}>
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div key={activeSection}
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                className="glass-card p-6 rounded-xl">
                <h2 className="font-display font-bold text-base tracking-widest mb-4 text-white">
                  {SECTIONS[activeSection].title}
                </h2>
                {SECTIONS[activeSection].items.map((item, i) => (
                  <FAQ key={i} item={item} />
                ))}
              </motion.div>
            </AnimatePresence>

            <div className="mt-4 glass-card p-4 rounded-xl text-center">
              <p className="text-heisenberg-muted text-sm font-mono">
                Still have questions?{' '}
                <a href="mailto:jacobstephane@outlook.com" className="text-heisenberg-neon hover:underline">
                  Contact support
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
