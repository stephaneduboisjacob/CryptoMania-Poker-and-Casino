// House games socket layer (blackjack + roulette) with flood control.
const buckets = new Map();

function takeToken(socket, cost = 1) {
  const now = Date.now();
  let b = buckets.get(socket.id);
  if (!b) { b = { tokens: 20, last: now }; buckets.set(socket.id, b); }
  b.tokens = Math.min(20, b.tokens + ((now - b.last) / 1000) * 4);
  b.last = now;
  if (b.tokens < cost) return false;
  b.tokens -= cost;
  return true;
}

module.exports = function setupHouseSockets(io, houseManager) {
  io.on('connection', (socket) => {
    if (!socket.userId) return;

    socket.on('joinHouse', ({ tableId }) => {
      const t = houseManager.tables.get(tableId);
      if (!t) return socket.emit('casinoError', { message: 'Table not found' });
      if (socket.houseTableId && socket.houseTableId !== tableId) {
        socket.leave(`h:${socket.houseTableId}`);
      }
      socket.houseTableId = tableId;
      socket.join(`h:${tableId}`);
      socket.emit('houseInit', { state: houseManager.stateFor(tableId, socket.userId), tableId });
    });

    socket.on('leaveHouse', ({ tableId }) => {
      if (socket.houseTableId === tableId) {
        socket.leave(`h:${tableId}`);
        socket.houseTableId = null;
      }
    });

    socket.on('bjBet', ({ tableId, amount, seat }) => {
      if (!takeToken(socket, 2)) { console.log('[house-sock] bjBet flood-blocked'); return; }
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'blackjack') { console.log('[house-sock] bjBet bad table:', tableId); return; }
      const r = t.placeBet(socket.userId, socket.username, seat ?? null, amount);
      console.log('[house-sock] bjBet user=' + socket.userId + ' amount=' + amount + ' phase=' + t.phase + ' -> ' + (r?.ok ? 'seat ' + r.seat : r?.error));
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('bjAction', async ({ tableId, action }) => {
      if (!takeToken(socket)) return;
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'blackjack') return;
      const r = await t.applyAction(socket.userId, action, 0);
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('rlBet', ({ tableId, type, num, amount }) => {
      if (!takeToken(socket, 2)) { console.log('[house-sock] rlBet flood-blocked'); return; }
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'roulette') { console.log('[house-sock] rlBet bad table:', tableId); return; }
      const r = t.placeBet(socket.userId, socket.username, { type, num, amount });
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('rlClear', ({ tableId }) => {
      if (!takeToken(socket)) return;
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'roulette') return;
      const r = t.clearBets(socket.userId);
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('bcBet', ({ tableId, side, amount }) => {
      if (!takeToken(socket, 2)) return;
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'baccarat') return;
      const r = t.placeBet(socket.userId, socket.username, side, amount);
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('bcClear', ({ tableId }) => {
      if (!takeToken(socket)) return;
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'baccarat') return;
      const r = t.clearBets(socket.userId);
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('crashBet', ({ tableId, amount, autoCashout }) => {
      if (!takeToken(socket, 2)) return;
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'crash') return;
      const r = t.placeBet(socket.userId, socket.username, amount, autoCashout);
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('crashCashout', async ({ tableId }) => {
      if (!takeToken(socket)) return;
      const t = houseManager.tables.get(tableId);
      if (!t || t.game !== 'crash') return;
      const r = await t.cashout(socket.userId);
      if (r?.error) socket.emit('actionError', { message: r.error });
    });

    socket.on('disconnect', () => {
      buckets.delete(socket.id);
    });
  });
};
