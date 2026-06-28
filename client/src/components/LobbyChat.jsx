import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Send, MessageSquare } from 'lucide-react';

export default function LobbyChat({ socket, username }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    axios.get('/api/social/lobby-chat').then(r => setMessages(r.data.messages || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      setMessages(prev => [...prev.slice(-99), msg]);
      if (!open) setUnread(u => u + 1);
    };
    socket.on('lobbyChatMessage', handler);
    return () => socket.off('lobbyChatMessage', handler);
  }, [socket, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [open, messages.length]);

  const send = () => {
    const msg = input.trim();
    if (!msg || !socket) return;
    socket.emit('lobbyChatMessage', { message: msg });
    setInput('');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-sm font-display tracking-widest uppercase"
        style={{
          background: open ? 'rgba(0,212,255,0.12)' : 'rgba(17,17,32,0.6)',
          border: `1px solid ${open ? '#00d4ff44' : '#1e1e3a'}`,
          color: open ? '#00d4ff' : '#6b6b9a',
        }}>
        <MessageSquare size={14} />
        <span className="hidden sm:block">Lobby Chat</span>
        {unread > 0 && (
          <span className="w-5 h-5 rounded-full bg-heisenberg-red text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full right-0 mb-2 w-80 glass-card rounded-2xl overflow-hidden shadow-2xl z-50"
            style={{ border: '1px solid #00d4ff22' }}>
            <div className="p-3 border-b border-heisenberg-border/30">
              <p className="font-display text-xs tracking-widest uppercase text-heisenberg-neon">Lobby Chat</p>
            </div>
            <div className="h-64 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-heisenberg-muted text-xs font-mono text-center py-4">No messages yet — say hi!</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.username === username ? 'justify-end' : ''}`}>
                  {msg.username !== username && (
                    <span className="text-base leading-none mt-0.5">{msg.avatar || '🃏'}</span>
                  )}
                  <div className={`max-w-[75%] ${msg.username === username ? 'items-end' : 'items-start'} flex flex-col`}>
                    {msg.username !== username && (
                      <span className="text-[10px] text-heisenberg-muted font-mono mb-0.5">{msg.username}</span>
                    )}
                    <div className="px-3 py-1.5 rounded-xl text-xs font-mono"
                      style={{
                        background: msg.username === username ? 'rgba(0,212,255,0.18)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${msg.username === username ? '#00d4ff33' : '#1e1e3a'}`,
                        color: msg.username === username ? '#00d4ff' : '#e0e0ff',
                      }}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-heisenberg-border/30 flex gap-2">
              <input
                className="flex-1 input-field text-sm py-1.5"
                placeholder="Message everyone..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                maxLength={200}
              />
              <button onClick={send} className="btn-neon p-2 rounded-xl" disabled={!input.trim()}>
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
