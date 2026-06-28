import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageCircle, X } from 'lucide-react';

export default function Chat({ socket, tournamentId, username }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (msg) => {
      setMessages(prev => [...prev.slice(-99), msg]);
    };
    socket.on('chatMessage', handler);
    return () => socket.off('chatMessage', handler);
  }, [socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;
    socket.emit('chatMessage', { tournamentId, message: input.trim() });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-heisenberg-border/40">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-heisenberg-neon" />
          <span className="font-display text-xs tracking-widest uppercase text-heisenberg-muted">Chat</span>
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-heisenberg-muted hover:text-white transition-colors">
          {open ? <X size={14} /> : <span className="text-xs font-mono">{messages.length}</span>}
        </button>
      </div>

      {open && (
        <>
          <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-heisenberg-muted text-xs text-center py-4 font-mono">No messages yet...</p>
            )}
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm"
                >
                  <span
                    className="font-semibold mr-1"
                    style={{ color: msg.username === username ? '#00d4ff' : '#ff6b00' }}
                  >
                    {msg.username}:
                  </span>
                  <span className="text-heisenberg-text">{msg.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="p-2 border-t border-heisenberg-border/40 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message..."
              maxLength={200}
              className="flex-1 bg-heisenberg-dark rounded-lg px-3 py-1.5 text-sm text-heisenberg-text border border-heisenberg-border focus:border-heisenberg-neon/40 outline-none transition-colors"
            />
            <button type="submit" className="text-heisenberg-neon hover:text-white transition-colors p-1.5">
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
