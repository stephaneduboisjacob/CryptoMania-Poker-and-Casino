// Casino socket layer: table rooms, actions, chat — with per-socket flood control.
const pool = require('../db');

// Token bucket per socket: refill 5 tokens/sec, bucket 25. Table actions are
// naturally slow (turn-based) but chat/spam needs a tight leash.
const buckets = new Map(); // socket.id -> { tokens, last }

function takeToken(socket, cost = 1) {
  const now = Date.now();
  let b = buckets.get(socket.id);
  if (!b) { b = { tokens: 25, last: now }; buckets.set(socket.id, b); }
  b.tokens = Math.min(25, b.tokens + ((now - b.last) / 1000) * 5);
  b.last = now;
  if (b.tokens < cost) return false;
  b.tokens -= cost;
  return true;
}

module.exports = function setupCasinoSockets(io, manager) {
  io.on('connection', (socket) => {
    if (!socket.userId) return; // not authenticated (legacy middleware handles reject)

    socket.on('joinTable', async ({ tableId }) => {
      try {
        if (!takeToken(socket, 2)) return;
        const table = manager.tables.get(tableId);
        if (!table) return socket.emit('casinoError', { message: 'Table not found' });

        // Leave previous table room (one table per socket view)
        if (socket.casinoTableId && socket.casinoTableId !== tableId) {
          socket.leave(`t:${socket.casinoTableId}`);
          manager.handleDisconnect(socket.casinoTableId, socket.userId);
        }
        socket.casinoTableId = tableId;
        socket.join(`t:${tableId}`);
        manager.handleConnect(tableId, socket.userId);

        const seat = table.seatOf(socket.userId);
        if (seat !== -1) {
          socket.join(`t:${tableId}:s${seat}`);
          socket.emit('tableInit', {
            state: manager.playerView(tableId, socket.userId),
            game: { id: table.gameId, gameType: table.gameType, currency: table.currency, name: table.name, speed: table.speed, level: table.level, levelEndsAt: table.levelStartTime + table.levelMinutes * 60 * 1000 },
            mySeat: seat,
          });
        } else {
          socket.emit('tableInit', {
            state: manager.playerView(tableId, socket.userId),
            game: { id: table.gameId, gameType: table.gameType, currency: table.currency, name: table.name, speed: table.speed, level: table.level, levelEndsAt: table.levelStartTime + table.levelMinutes * 60 * 1000 },
            mySeat: -1,
          });
        }
        socket.to(`t:${tableId}`).emit('spectatorJoined', { username: socket.username });
      } catch (err) {
        console.error('joinTable error:', err);
      }
    });

    socket.on('leaveTable', ({ tableId }) => {
      if (socket.casinoTableId === tableId) {
        socket.leave(`t:${tableId}`);
        manager.handleDisconnect(tableId, socket.userId);
        socket.casinoTableId = null;
      }
    });

    socket.on('casinoAction', ({ tableId, action, amount }) => {
      if (!takeToken(socket)) return;
      if (socket.casinoTableId !== tableId) return socket.emit('casinoError', { message: 'Not at this table' });
      const result = manager.casinoAction(socket.userId, tableId, action, amount);
      if (result?.error) socket.emit('actionError', { message: result.error });
    });

    socket.on('sitToggle', ({ tableId, sitOut }) => {
      if (!takeToken(socket)) return;
      manager.sitToggle(socket.userId, tableId, sitOut);
    });

    socket.on('casinoTimebank', ({ tableId }) => {
      if (!takeToken(socket)) return;
      const result = manager.useTimebank(socket.userId, tableId);
      if (result?.error) socket.emit('actionError', { message: result.error });
    });

    socket.on('tableChat', async ({ tableId, message }) => {
      if (!takeToken(socket, 2)) return;
      if (!message?.trim() || message.length > 200) return;
      const clean = message.trim().replace(/<[^>]*>/g, '');
      const table = manager.tables.get(tableId);
      if (!table) return;
      try {
        await pool.query(
          'INSERT INTO chat_messages(game_id, user_id, username, message) VALUES($1,$2,$3,$4)',
          [table.gameId, socket.userId, socket.username, clean]
        );
      } catch {}
      io.to(`t:${tableId}`).emit('tableChat', {
        username: socket.username, message: clean, time: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      if (socket.casinoTableId) manager.handleDisconnect(socket.casinoTableId, socket.userId);
      buckets.delete(socket.id);
    });
  });
};
