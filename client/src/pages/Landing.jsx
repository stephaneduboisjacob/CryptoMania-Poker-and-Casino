import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown, ArrowLeft, ArrowRight, BadgeCheck, Bitcoin, Check,
  ChevronRight, Club, Dice5, Gem, Menu, ShieldCheck, Spade, Sparkles, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Landing.css';

const slots = [
  { title: 'Heisenberg Special', category: 'Signature', image: '/slot-heisenberg-special.webp' },
  { title: 'Bitcoin Bonanza', category: 'Crypto classic', image: '/slot-bitcoin-bonanza.webp' },
  { title: 'Money Train Express', category: 'High energy', image: '/slot-money-train-express.webp' },
  { title: 'Book of Anubis', category: 'Adventure', image: '/slot-book-of-anubis.webp' },
  { title: 'Crypto Queen', category: 'Royal reels', image: '/slot-crypto-queen.webp' },
  { title: 'Sweet Satoshi', category: 'Cluster pays', image: '/slot-sweet-satoshi.webp' },
];

const features = [
  { icon: Bitcoin, title: 'Crypto, in the flow', text: 'Fund your play through the available BTCPay checkout methods. Choose from supported cryptocurrencies at checkout.' },
  { icon: ShieldCheck, title: 'Fair play, made verifiable', text: 'Instant games use committed server and client seeds. Reveal a seed and replay a past round with the built-in verifier.' },
  { icon: BadgeCheck, title: 'A clear game record', text: 'Review your rounds, track your play, and follow the leaderboard from your account.' },
];

const stories = [
  { category: 'POKER NOTES', title: 'Pot odds, without the math anxiety', text: 'A quick way to compare the price of a call with the pot you could win.' },
  { category: 'TABLE GUIDE', title: 'Blackjack: the first decisions', text: 'A friendly introduction to hit, stand, double down, and split.' },
  { category: 'FAIR PLAY', title: 'What “provably fair” actually means', text: 'Learn how a published seed hash can help you verify an instant-game result.' },
];

const rules = [
  { label: 'Hit', copy: 'Take one more card and move closer to 21. Go over 21 and the hand busts.' },
  { label: 'Stand', copy: 'Keep your total and let the dealer play out their hand.' },
  { label: 'Double', copy: 'Double your stake, take one final card, then stand.' },
  { label: 'Split', copy: 'When your first two cards match in value, separate them into two hands.' },
];

const handSteps = [
  { street: 'Pre-flop', note: 'Two private cards. Start reading the table and choose whether to enter the pot.' },
  { street: 'The flop', note: 'Three shared cards arrive. Reassess your hand and the possible draws.' },
  { street: 'The turn', note: 'A fourth community card changes the odds. Choose your next action.' },
  { street: 'The river', note: 'The final card is dealt. The best five-card hand takes the pot at showdown.' },
];

const pokerCards = [
  { icon: Spade, name: 'Poker room', description: 'Heads-up tournaments put one opponent across the felt. Pick a tier, take your seat, and play the hand in front of you.', image: '/banner-poker.webp', link: '#poker' },
  { icon: Dice5, name: 'Table games', description: 'Blackjack, roulette, baccarat, and fast rounds of crash bring a different kind of rhythm to the floor.', image: '/banner-tables.webp', link: '#tables' },
  { icon: Sparkles, name: 'Slots gallery', description: 'Browse 25 themed machines, from clean classic reels to wild crypto adventures.', image: '/banner-slots.webp', link: '#slots' },
];

function SectionIntro({ overline, title, copy, align = 'left' }) {
  return (
    <div className={`lobby-intro ${align === 'center' ? 'lobby-intro--center' : ''}`}>
      <p className="lobby-overline"><span />{overline}</p>
      <h2>{title}</h2>
      <p className="lobby-intro__copy">{copy}</p>
    </div>
  );
}

function EntranceModal({ open, close, proceed }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="entrance-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && close()}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section className="entrance-modal" role="dialog" aria-modal="true" aria-labelledby="entrance-title"
            initial={{ opacity: 0, y: 22, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: .98 }}>
            <button className="entrance-modal__close" onClick={close} aria-label="Close"><X size={18} /></button>
            <div className="entrance-modal__crest"><span>₿</span></div>
            <p className="lobby-overline lobby-overline--center"><span />THE PRIVATE ENTRANCE<span /></p>
            <h2 id="entrance-title">The floor is yours.</h2>
            <p>Welcome to Cryptomania. Step into your account and find your next table.</p>
            <button className="lobby-button lobby-button--gold entrance-modal__proceed" onClick={proceed}>
              Proceed to casino <ArrowRight size={16} />
            </button>
            <span className="entrance-modal__foot"><ShieldCheck size={13} /> Secure account sign in</span>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Landing() {
  const [entranceOpen, setEntranceOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rule, setRule] = useState(0);
  const [handStep, setHandStep] = useState(0);
  const [roulette, setRoulette] = useState('European');
  const [baccaratBet, setBaccaratBet] = useState('Player');
  const [crapsStep, setCrapsStep] = useState(0);
  const [slotCategory, setSlotCategory] = useState('Featured');
  const [story, setStory] = useState(null);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const slotsRef = useRef(null);

  const enter = () => {
    setEntranceOpen(false);
    navigate(user ? '/play' : '/login');
  };

  useEffect(() => {
    if (!entranceOpen) return undefined;
    const onKey = e => { if (e.key === 'Escape') setEntranceOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entranceOpen]);

  const visibleSlots = slotCategory === 'Featured' ? slots : slots.filter(s => s.category === slotCategory);
  const scrollSlots = amount => slotsRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  const scrollTo = id => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div className="lobby-page">
      <div className="lobby-scroll" id="top">
        <header className="lobby-header">
          <a className="lobby-brand" href="#top" aria-label="Cryptomania home" onClick={e => { e.preventDefault(); scrollTo('top'); }}>
            <span className="lobby-brand__mark">₿</span><span className="lobby-brand__word">CRYPTOMANIA<span>THE PRIVATE CLUB</span></span>
          </a>
          <nav className={`lobby-nav ${menuOpen ? 'lobby-nav--open' : ''}`} aria-label="Main navigation">
            <button onClick={() => scrollTo('floor')}>The floor</button>
            <button onClick={() => scrollTo('poker')}>Poker</button>
            <button onClick={() => scrollTo('slots')}>Slots</button>
            <button onClick={() => scrollTo('advantage')}>The advantage</button>
          </nav>
          <div className="lobby-header__actions">
            <button className="lobby-header__signin" onClick={() => setEntranceOpen(true)}>{loading ? 'Welcome' : user ? 'My account' : 'Login'}</button>
            <button className="lobby-button lobby-button--gold lobby-header__enter" onClick={() => setEntranceOpen(true)}>Enter casino <ArrowRight size={14} /></button>
            <button className="lobby-menu-toggle" onClick={() => setMenuOpen(v => !v)} aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        <main>
          <section className="lobby-hero" aria-labelledby="hero-title">
            <div className="lobby-hero__art" />
            <div className="lobby-hero__grid" />
            <div className="lobby-hero__content">
              <div className="lobby-hero__kicker"><span className="lobby-live-dot" /> THE TABLE IS SET <span className="lobby-hero__rule" /> CRYPTOMANIA CASINO</div>
              <h1 id="hero-title">Where crypto<br />meets <em>the casino.</em></h1>
              <p className="lobby-hero__copy">A new kind of gaming room. The focus of the felt, the glow of the reels, and the freedom to play on your terms.</p>
              <div className="lobby-hero__actions">
                <button className="lobby-button lobby-button--gold lobby-button--large" onClick={() => setEntranceOpen(true)}>Login / Enter casino <ArrowRight size={17} /></button>
                <button className="lobby-button lobby-button--outline lobby-button--large" onClick={() => scrollTo('floor')}>Explore the floor <ArrowDown size={16} /></button>
              </div>
              <div className="lobby-hero__trust"><span><ShieldCheck size={14} /> Verifiable instant games</span><i /><span><Bitcoin size={14} /> Crypto checkout</span><i /><span>Designed for the bold</span></div>
            </div>
            <div className="lobby-hero__coin" aria-hidden="true"><div className="hero-coin"><span>₿</span></div><div className="hero-orbit hero-orbit--one" /><div className="hero-orbit hero-orbit--two" /></div>
            <div className="lobby-hero__bottom"><span>EST. FOR THE NEXT MOVE</span><span>01 <b>/</b> 05</span></div>
            <button className="lobby-scroll-cue" onClick={() => scrollTo('floor')} aria-label="Scroll to casino floor"><span />SCROLL TO EXPLORE</button>
          </section>

          <section className="lobby-floor section-shell" id="floor">
            <div className="lobby-section-heading">
              <SectionIntro overline="A PRIVATE TOUR" title={<>A world of play,<br /><em>at your own pace.</em></>} copy="From the first shuffle to the final spin, choose the room that feels like yours." />
              <div className="lobby-section-heading__stamp"><span>CM</span><i />A CURATED<br />CASINO FLOOR</div>
            </div>
            <div className="lobby-floor-grid">
              {pokerCards.map((card, index) => {
                const Icon = card.icon;
                return <motion.a key={card.name} href={card.link} className={`lobby-floor-card lobby-floor-card--${index + 1}`} whileHover={{ y: -6 }} onClick={e => { e.preventDefault(); scrollTo(card.link.slice(1)); }}>
                  <img src={card.image} alt="" loading="lazy" />
                  <div className="lobby-floor-card__shade" />
                  <span className="lobby-floor-card__number">0{index + 1}</span>
                  <div className="lobby-floor-card__copy"><span className="lobby-floor-card__icon"><Icon size={18} /></span><h3>{card.name}</h3><p>{card.description}</p><span className="lobby-text-link">Explore room <ArrowRight size={14} /></span></div>
                </motion.a>;
              })}
            </div>
          </section>

          <section className="lobby-poker section-shell" id="poker">
            <div className="lobby-poker__visual"><img src="/banner-poker.webp" alt="Cards and chips on a dramatic poker table" loading="lazy" />
              <div className="lobby-poker__visual-shade" /><div className="lobby-poker__chip"><span>♠</span><small>NO LIMIT</small></div>
              <div className="lobby-poker__caption"><span>THE GAME OF READS</span><i /> STRATEGY · NERVE · TIMING</div>
            </div>
            <div className="lobby-poker__content">
              <SectionIntro overline="THE POKER ROOM" title={<>Read the room.<br /><em>Own the moment.</em></>} copy="Take a seat in a focused heads-up room. Every hand is a duel, every decision yours to make." />
              <div className="lobby-tier-list">
                <div><span className="lobby-tier-list__dot" /><span><b>Micro</b><small>A measured first step at the felt.</small></span><strong>0.001 BTC</strong></div>
                <div><span className="lobby-tier-list__dot" /><span><b>Low</b><small>Find your rhythm and build a read.</small></span><strong>0.01 BTC</strong></div>
                <div><span className="lobby-tier-list__dot" /><span><b>High</b><small>For players ready to raise the stakes.</small></span><strong>0.1 BTC</strong></div>
              </div>
              <p className="lobby-fine-print">Tournament prize pools reflect entries, less the applicable house fee. Review the terms in the game before you join.</p>
              <button className="lobby-button lobby-button--gold" onClick={() => setEntranceOpen(true)}>Find your table <ArrowRight size={15} /></button>
            </div>
          </section>

          <section className="lobby-learn section-shell" aria-label="Texas Hold’em guide">
            <div className="lobby-learn__intro"><p className="lobby-overline"><span />THE QUICK READ</p><h3>Texas Hold’em,<br /><em>hand by hand.</em></h3><p>New to the table? Follow the four beats of a hand. Tap through at your own pace.</p></div>
            <div className="lobby-learn__board">
              <div className="lobby-learn__cards" aria-hidden="true"><span className="lobby-playing-card">A<small>♠</small></span><span className="lobby-playing-card lobby-playing-card--red">K<small>♦</small></span><span className="lobby-playing-card lobby-playing-card--back">₿</span></div>
              <div className="lobby-learn__progress">{handSteps.map((step, i) => <button key={step.street} onClick={() => setHandStep(i)} className={handStep === i ? 'is-active' : ''}><span>{String(i + 1).padStart(2, '0')}</span><i /></button>)}</div>
              <div className="lobby-learn__step"><span>{handSteps[handStep].street.toUpperCase()}</span><p>{handSteps[handStep].note}</p></div>
              <button className="lobby-learn__next" onClick={() => setHandStep(v => (v + 1) % handSteps.length)} aria-label="Next hand step"><ArrowRight size={17} /></button>
            </div>
          </section>

          <section className="lobby-tables section-shell" id="tables">
            <div className="lobby-tables__heading"><SectionIntro overline="THE GRAND SALON" title={<>Classic games.<br /><em>Beautifully played.</em></>} copy="Familiar favorites, with a little more atmosphere. Take a moment to learn the rhythm before you sit down." />
              <div className="lobby-table-tabs"><span><i /> TABLE GAMES</span><span>EUROPEAN FEEL</span></div>
            </div>
            <div className="lobby-table-features">
              <article className="lobby-table-feature lobby-table-feature--roulette"><div className="lobby-table-feature__image"><img src="/table-roulette.png" alt="Roulette wheel and table" loading="lazy" /><div className="lobby-table-feature__wheel"><img src="/wheel.png" alt="" /></div></div>
                <div className="lobby-table-feature__body"><div className="lobby-table-feature__eyebrow"><span>01</span> THE WHEEL</div><h3>Roulette</h3><p>Pick a number, a color, or a group. European roulette has one zero; American adds a second. In French roulette, La Partage can return half of an even-money bet when the ball lands on zero.</p>
                  <div className="lobby-roulette-picker" role="group" aria-label="Roulette variant"><span>Explore</span>{['European', 'American', 'French'].map(option => <button key={option} className={roulette === option ? 'is-active' : ''} onClick={() => setRoulette(option)}>{option}</button>)}</div>
                  <div className="lobby-roulette-note"><span>0{roulette === 'American' ? '0' : ''}</span><p>{roulette === 'European' ? 'A single zero pocket gives the wheel its classic European layout.' : roulette === 'American' ? 'Two green pockets: zero and double zero.' : 'Single zero, with La Partage on even-money bets.'}</p></div>
                  <button className="lobby-inline-cta" onClick={() => setEntranceOpen(true)}>Enter the casino <ArrowRight size={14} /></button>
                </div>
              </article>
              <article className="lobby-table-feature lobby-table-feature--blackjack"><div className="lobby-table-feature__image"><img src="/table-blackjack.png" alt="Blackjack table ready for the next hand" loading="lazy" /><div className="lobby-table-feature__badge"><Club size={14} /> 21</div></div>
                <div className="lobby-table-feature__body"><div className="lobby-table-feature__eyebrow"><span>02</span> THE CLASSIC</div><h3>Blackjack</h3><p>Make a hand closer to 21 than the dealer, without going over. Number cards keep their value, face cards count as ten, and aces count as one or eleven.</p>
                  <div className="lobby-rule-picker" role="tablist" aria-label="Blackjack actions">{rules.map((item, i) => <button key={item.label} role="tab" aria-selected={rule === i} className={rule === i ? 'is-active' : ''} onClick={() => setRule(i)}>{item.label}</button>)}</div>
                  <p className="lobby-rule-copy" aria-live="polite">{rules[rule].copy}</p>
                  <button className="lobby-inline-cta" onClick={() => setEntranceOpen(true)}>Take a seat <ArrowRight size={14} /></button>
                </div>
              </article>
            </div>
            <div className="lobby-table-strip"><div className="lobby-baccarat-quick"><span className="lobby-table-strip__icon">♦</span><div><b>Baccarat</b><small>{baccaratBet === 'Player' ? 'Back the Player hand to finish closest to nine.' : baccaratBet === 'Banker' ? 'Back the Banker hand. The drawing rules are handled for you.' : 'Choose Tie if both hands finish on the same total.'}</small><div className="lobby-baccarat-picks">{['Player', 'Banker', 'Tie'].map(option => <button key={option} onClick={() => setBaccaratBet(option)} className={baccaratBet === option ? 'is-active' : ''}>{option}</button>)}</div><span className="lobby-baccarat-note">Two cards each; third cards follow fixed rules. Best total to nine wins.</span></div></div><div><span className="lobby-table-strip__icon">⚄</span><span><b>Crash</b><small>Watch the multiplier climb. Choose when to cash out.</small></span></div><button onClick={() => setEntranceOpen(true)}>Discover table games <ArrowRight size={14} /></button></div>
            <div className="lobby-craps-guide"><div><p className="lobby-overline"><span />A QUICK DICE LESSON</p><h3>One roll at a time.</h3></div><div className="lobby-craps-guide__steps">{['Come out', 'Find the point', 'Roll again'].map((label, i) => <button key={label} className={crapsStep === i ? 'is-active' : ''} onClick={() => setCrapsStep(i)}><span>0{i + 1}</span><b>{label}</b><i /></button>)}</div><p className="lobby-craps-guide__copy">{['Start with a come-out roll. A 7 or 11 wins the pass line; 2, 3, or 12 loses.', 'A 4, 5, 6, 8, 9, or 10 becomes the point. The shooter aims to roll it again.', 'Roll the point before a 7 to win the pass line. A 7 first ends the round.'][crapsStep]}</p></div>
          </section>

          <section className="lobby-slots section-shell" id="slots">
            <div className="lobby-slots__banner"><img src="/banner-slots.webp" alt="A brilliant arcade of glowing slot machines" loading="lazy" /><div className="lobby-slots__banner-shade" />
              <div><p className="lobby-overline"><span />THE SLOTS GALLERY</p><h2>A little color.<br /><em>A lot of character.</em></h2><p>Twenty-five themed machines, collected into one vivid gallery. Pick a story and see where the reels take you.</p></div>
              <div className="lobby-slots__reel" aria-hidden="true"><span>₿</span><span>7</span><span>♦</span></div>
            </div>
            <div className="lobby-slots__gallery-head"><div><p className="lobby-overline"><span />HAND-PICKED FOR YOU</p><h3>Featured machines</h3></div><div className="lobby-slot-filters">{['Featured', 'Crypto classic', 'Adventure', 'High energy'].map(category => <button key={category} className={slotCategory === category ? 'is-active' : ''} onClick={() => setSlotCategory(category)}>{category}</button>)}</div></div>
            <div className="lobby-slot-row-wrap"><button className="lobby-carousel-arrow lobby-carousel-arrow--left" onClick={() => scrollSlots(-330)} aria-label="Scroll games left"><ArrowLeft size={16} /></button>
              <div className="lobby-slot-row" ref={slotsRef}>
                {visibleSlots.map((slot, i) => <motion.article key={slot.title} className="lobby-slot-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .04 }}>
                  <div className="lobby-slot-card__art"><img src={slot.image} alt={`${slot.title} slot artwork`} loading="lazy" /><span>{slot.category}</span><button onClick={() => setEntranceOpen(true)} aria-label={`Play ${slot.title}`}><ArrowRight size={15} /></button></div>
                  <div className="lobby-slot-card__title"><h4>{slot.title}</h4><Sparkles size={13} /></div>
                </motion.article>)}
              </div><button className="lobby-carousel-arrow lobby-carousel-arrow--right" onClick={() => scrollSlots(330)} aria-label="Scroll games right"><ArrowRight size={16} /></button>
            </div>
            <div className="lobby-slots__footer"><span><Gem size={15} /> Game details, limits, and payout information are shown in the casino.</span><button onClick={() => setEntranceOpen(true)}>Explore all games <ArrowRight size={14} /></button></div>
          </section>

          <section className="lobby-advantage section-shell" id="advantage">
            <div className="lobby-advantage__visual"><div className="lobby-vault"><div className="lobby-vault__outer"><div className="lobby-vault__inner"><div className="lobby-vault__hub">₿</div><i /><i /><i /><i /></div></div></div>
              <span className="lobby-advantage__label">DESIGNED FOR A NEW ERA</span><span className="lobby-advantage__hash">SHA-256 · HMAC · VERIFIED</span>
            </div>
            <div className="lobby-advantage__copy"><SectionIntro overline="THE CRYPTOMANIA EDGE" title={<>The thrill of the game.<br /><em>The clarity behind it.</em></>} copy="Crypto-native play should feel as considered as it is exciting. Here are a few details that make the experience easier to trust." />
              <div className="lobby-benefit-list">{features.map(({ icon: Icon, title, text }, i) => <article key={title}><span className="lobby-benefit-list__icon"><Icon size={17} /></span><div><h3>{title}</h3><p>{text}</p></div><span className="lobby-benefit-list__number">0{i + 1}</span></article>)}</div>
              <button className="lobby-button lobby-button--outline" onClick={() => setEntranceOpen(true)}>Explore the experience <ArrowRight size={14} /></button>
            </div>
          </section>

          <section className="lobby-stories section-shell" id="journal">
            <div className="lobby-stories__heading"><SectionIntro overline="THE HOUSE NOTES" title={<>A sharper read.<br /><em>A better game.</em></>} copy="A few useful ideas for your next visit to the floor." />
              <button className="lobby-stories__all" onClick={() => setStory(stories[2])}>Explore the fair play guide <ArrowRight size={14} /></button>
            </div>
            <div className="lobby-story-grid">{stories.map((item, i) => <button className={`lobby-story-card lobby-story-card--${i + 1}`} key={item.title} onClick={() => setStory(item)}><span className="lobby-story-card__index">0{i + 1}</span><span className="lobby-story-card__category">{item.category}</span><h3>{item.title}</h3><p>{item.text}</p><span className="lobby-story-card__read">Read the note <ArrowRight size={14} /></span></button>)}</div>
          </section>

          <section className="lobby-final-cta">
            <div className="lobby-final-cta__art" />
            <div className="lobby-final-cta__content"><span className="lobby-overline lobby-overline--center"><span />YOUR SEAT IS WAITING<span /></span><h2>The night is young.<br /><em>Make your move.</em></h2><p>Step through the private entrance and find the game that feels like yours.</p><button className="lobby-button lobby-button--gold lobby-button--large" onClick={() => setEntranceOpen(true)}>Login / Enter casino <ArrowRight size={17} /></button></div>
          </section>
        </main>

        <footer className="lobby-footer"><div className="lobby-footer__top"><a className="lobby-brand" href="#top" onClick={e => { e.preventDefault(); scrollTo('top'); }}><span className="lobby-brand__mark">₿</span><span className="lobby-brand__word">CRYPTOMANIA<span>THE PRIVATE CLUB</span></span></a><p>A considered gaming experience for players who think ahead.</p><button onClick={() => setEntranceOpen(true)}>Enter the casino <ChevronRight size={15} /></button></div><div className="lobby-footer__bottom"><span>© {new Date().getFullYear()} Cryptomania Casino</span><span><ShieldCheck size={13} /> Play with intention. Set your own limits.</span><div><button onClick={() => scrollTo('advantage')}>Fair play</button><button onClick={() => scrollTo('journal')}>House notes</button><button onClick={() => setEntranceOpen(true)}>Account login</button></div></div></footer>
      </div>
      <EntranceModal open={entranceOpen} close={() => setEntranceOpen(false)} proceed={enter} />
      <AnimatePresence>{story && <motion.div className="lobby-story-modal" onMouseDown={e => e.target === e.currentTarget && setStory(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.article initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><button className="entrance-modal__close" onClick={() => setStory(null)} aria-label="Close article"><X size={18} /></button><p className="lobby-overline"><span />{story.category}</p><h2>{story.title}</h2><p>{story.text}</p><div className="lobby-story-modal__detail">{story.category === 'POKER NOTES' ? 'Pot odds compare the amount you must call with the total pot you can win. If the call is small compared with the pot, it may be worth considering — but the cards you can improve with and your opponent’s likely hand still matter.' : story.category === 'TABLE GUIDE' ? 'When you hit, you take another card. Stand means you keep your total. Doubling doubles your original bet in exchange for one final card. Splitting turns a matching pair into two separate hands. House rules can vary, so check the table rules before play.' : 'Instant game results are derived from a committed server seed and your client seed. The casino publishes a hash of the server seed before play. After rotating seeds reveals the original seed, use the verifier to recompute a round and compare the result.'}</div><button className="lobby-button lobby-button--outline" onClick={() => { setStory(null); if (story.category === 'FAIR PLAY') setEntranceOpen(true); }}>Got it <Check size={14} /></button></motion.article>
      </motion.div>}</AnimatePresence>
    </div>
  );
}
