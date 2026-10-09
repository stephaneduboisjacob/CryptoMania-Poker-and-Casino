import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import './SupportChat.css';

const WELCOME = {
  role: 'assistant',
  content: 'Welcome to Cryptomania. I can help you find a game, understand the rules, or navigate your account and wallet.',
};

const QUICK_QUESTIONS = [
  'What games can I play?',
  'How do deposits work?',
  'How does provably fair work?',
];

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const feedRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (Capacitor.isNativePlatform()) return null;

  const startNewChat = () => {
    if (busy) return;
    setMessages([WELCOME]);
    setDraft('');
    inputRef.current?.focus();
  };

  const sendMessage = async (value = draft) => {
    const content = value.trim();
    if (!content || busy || content.length > 1200) return;

    const userMessage = { role: 'user', content };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setDraft('');
    setBusy(true);

    try {
      const response = await axios.post('/api/support/chat', {
        messages: conversation.slice(-12).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
      }, { timeout: 125_000 });
      const reply = String(response.data?.reply || '').trim();
      setMessages(current => [...current, {
        role: 'assistant',
        content: reply || 'I could not prepare a reply just now. Please try again.',
      }]);
    } catch (error) {
      const responseError = typeof error.response?.data === 'object'
        ? error.response.data.error
        : undefined;
      const status = error.response?.status;
      const note = responseError
        || (status === 404
          ? 'The support chat service is not active on this server yet. Please refresh the page; if the issue continues, email jacobstephane@outlook.com.'
          : status === 504 || error.code === 'ECONNABORTED'
            ? 'The local AI is taking longer than expected to respond. Please try again in a moment or email jacobstephane@outlook.com.'
            : !error.response
              ? 'The website could not connect to its support service. Please refresh and try again, or email jacobstephane@outlook.com.'
              : 'AI support could not complete that reply. Please try again or email jacobstephane@outlook.com.');
      setMessages(current => [...current, { role: 'assistant', content: note, isError: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="support-chat">
      <AnimatePresence>
        {open && (
          <motion.section
            className="support-chat__panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby="support-chat-title"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <header className="support-chat__header">
              <div className="support-chat__brand-icon"><Sparkles size={19} /></div>
              <div className="support-chat__heading">
                <div className="support-chat__eyebrow"><span /> LOCAL AI SUPPORT</div>
                <h2 id="support-chat-title">Ask Cryptomania</h2>
                <p>Games, wallet, and account help</p>
              </div>
              <div className="support-chat__header-actions">
                <button type="button" onClick={startNewChat} className="support-chat__icon-button" aria-label="Start a new chat" title="New chat">
                  <RotateCcw size={16} />
                </button>
                <button type="button" onClick={() => setOpen(false)} className="support-chat__icon-button" aria-label="Close support chat">
                  <X size={19} />
                </button>
              </div>
            </header>

            <div className="support-chat__privacy"><span className="support-chat__privacy-dot" /> Powered by local Ollama · Don’t share passwords or wallet secrets</div>

            <div className="support-chat__feed" ref={feedRef} aria-live="polite" aria-label="Conversation">
              {messages.map((message, index) => (
                <div className={`support-chat__message support-chat__message--${message.role}`} key={`${index}-${message.role}`}>
                  {message.role === 'assistant' && <div className="support-chat__message-avatar"><Bot size={15} /></div>}
                  <div className={`support-chat__bubble ${message.isError ? 'support-chat__bubble--error' : ''}`}>
                    <span className="support-chat__sender">{message.role === 'assistant' ? 'CRYPTOMANIA AI' : 'YOU'}</span>
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}

              {messages.length === 1 && (
                <div className="support-chat__quick-prompts">
                  <span>POPULAR QUESTIONS</span>
                  {QUICK_QUESTIONS.map(question => (
                    <button type="button" key={question} onClick={() => sendMessage(question)} disabled={busy}>
                      {question}<span>↗</span>
                    </button>
                  ))}
                </div>
              )}

              {busy && (
                <div className="support-chat__message support-chat__message--assistant" aria-label="Assistant is responding">
                  <div className="support-chat__message-avatar"><Bot size={15} /></div>
                  <div className="support-chat__bubble support-chat__bubble--typing"><span /><span /><span /></div>
                </div>
              )}
            </div>

            <form className="support-chat__composer" onSubmit={event => { event.preventDefault(); sendMessage(); }}>
              <textarea
                ref={inputRef}
                rows={1}
                maxLength={1200}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask about the casino…"
                aria-label="Message Cryptomania support"
                disabled={busy}
              />
              <button type="submit" className="support-chat__send" disabled={busy || !draft.trim()} aria-label="Send message">
                {busy ? <LoaderCircle size={17} className="support-chat__spinner" /> : <Send size={16} />}
              </button>
            </form>
            <div className="support-chat__footnote">AI answers can be mistaken. Check account and payment details in your account.</div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        className={`support-chat__launcher ${open ? 'support-chat__launcher--open' : ''}`}
        onClick={() => setOpen(value => !value)}
        whileHover={{ y: -2, scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        aria-label={open ? 'Close Cryptomania support chat' : 'Chat with Cryptomania AI support'}
        aria-expanded={open}
      >
        <span className="support-chat__launcher-icon">{open ? <X size={20} /> : <MessageCircle size={20} />}</span>
        <span className="support-chat__launcher-copy"><b>{open ? 'Close chat' : 'Need a hand?'}</b><small>{open ? 'Cryptomania AI' : 'Ask our AI concierge'}</small></span>
        {!open && <span className="support-chat__launcher-spark"><Sparkles size={14} /></span>}
      </motion.button>
    </div>
  );
}
