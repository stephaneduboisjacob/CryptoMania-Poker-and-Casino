const { authenticateSocket } = require('../middleware/auth');
const { startNewHand, processAction, getGameState, emitGameState, getAiUserId, triggerAiAction } = require('../game/engine');
const { getTimeToNextLevel } = require('../game/blinds');
const { loadAiSettings } = require('../game/ai');
const { sendPushToUser } = require('../routes/preferences');
const pool = require('../db');

// Online player tracking
const onlinePlayers = new Map(); // userId -> { username, since, avatar }
const startingGames = new Set();

function broadcastOnline(io) {
  const list = [...onlinePlayers.values()].map(p => ({ username: p.username, avatar: p.avatar || '🃏' }));
  io.emit('onlinePlayers', list);
}

// Simple card value for draw
const DRAW_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
function drawValue(card) { return DRAW_VALUES[card?.[0]] ?? 0; }

module.exports = function setupSockets(io) {
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    console.log(`Socket connected: ${socket.username} (${socket.id})`);

    // Load avatar
    let avatar = '🃏';
    try {
      const p = await pool.query(`SELECT avatar FROM user_preferences WHERE user_id=$1`, [socket.userId]);
      avatar = p.rows[0]?.avatar || '🃏';
    } catch {}

    onlinePlayers.set(socket.userId, { username: socket.username, since: Date.now(), avatar });
    broadcastOnline(io);

    // Notify friends that this user came online
    try {
      const friends = await pool.query(
        `SELECT CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END AS friend_id
         FROM friends f WHERE (f.user_id=$1 OR f.friend_id=$1) AND f.status='accepted'`,
        [socket.userId]
      );
      friends.rows.forEach(({ friend_id }) => {
        const friendSocket = [...io.sockets.sockets.values()].find(s => s.userId === friend_id);
        if (friendSocket) {
          friendSocket.emit('friendOnline', { username: socket.username, avatar });
        }
      });
    } catch {}

    socket.on('joinTournament', async ({ tournamentId }) => {
      try {
        const tRes = await pool.query('SELECT * FROM tournaments WHERE id=$1', [tournamentId]);
        const tournament = tRes.rows[0];
        if (!tournament) return socket.emit('error', { message: 'Tournament not found' });

        const [aiId, aiSettings] = await Promise.all([getAiUserId(), loadAiSettings()]);
        const aiLabel = `${aiSettings.emoji || '🤖'} ${aiSettings.name || 'Heisenberg'}`;
        let pos = 0;
        if (tournament.player1_id === socket.userId) pos = 1;
        else if (tournament.player2_id === socket.userId) pos = 2;

        socket.tournamentId = tournamentId;
        socket.playerPos = pos;

        socket.join(tournamentId);
        const roomName = pos === 1 ? 'p1' : pos === 2 ? 'p2' : 'spectator';
        socket.join(`${tournamentId}:${roomName}`);

        const [p1Res, p2Res, p1Prefs, p2Prefs] = await Promise.all([
          tournament.player1_id ? pool.query('SELECT username FROM users WHERE id=$1', [tournament.player1_id]) : null,
          tournament.player2_id ? pool.query('SELECT username FROM users WHERE id=$1', [tournament.player2_id]) : null,
          tournament.player1_id ? pool.query('SELECT avatar FROM user_preferences WHERE user_id=$1', [tournament.player1_id]) : null,
          tournament.player2_id ? pool.query('SELECT avatar FROM user_preferences WHERE user_id=$1', [tournament.player2_id]) : null,
        ]);

        const p1Name = tournament.player1_id === aiId ? aiLabel : p1Res?.rows[0]?.username;
        const p2Name = tournament.player2_id === aiId ? aiLabel : p2Res?.rows[0]?.username;
        const p1Avatar = tournament.player1_id === aiId ? (aiSettings.emoji || '🤖') : (p1Prefs?.rows[0]?.avatar || '🃏');
        const p2Avatar = tournament.player2_id === aiId ? (aiSettings.emoji || '🤖') : (p2Prefs?.rows[0]?.avatar || '🃏');

        socket.emit('tournamentInfo', {
          id: tournament.id,
          tier: tournament.tier,
          status: tournament.status,
          prizePool: parseFloat(tournament.prize_pool),
          player1: p1Name,
          player2: p2Name,
          player1Avatar: p1Avatar,
          player2Avatar: p2Avatar,
          myPos: pos,
          isAi: tournament.is_ai,
          aiName: aiLabel,
        });

        const state = await getGameState(tournamentId);
        if (state) {
          const holeCards = state.hole_cards || {};
          socket.emit('gameState', {
            tournamentId,
            handNumber: state.hand_number,
            phase: state.phase,
            communityCards: state.community_cards || [],
            pot: state.pot,
            currentBet: state.current_bet,
            actionOn: state.action_on,
            smallBlind: state.small_blind,
            bigBlind: state.big_blind,
            p1Chips: state.p1_chips,
            p2Chips: state.p2_chips,
            p1Bet: state.p1_bet,
            p2Bet: state.p2_bet,
            dealerPos: state.dealer_pos,
            blindStartTime: state.blind_start_time,
            p1Timebank: state.p1_timebank || 30,
            p2Timebank: state.p2_timebank || 30,
            p1Sitout: state.p1_sitout || false,
            p2Sitout: state.p2_sitout || false,
            myCards: pos === 1 ? (holeCards.p1 || []) : pos === 2 ? (holeCards.p2 || []) : [],
            myPos: pos,
          });
        }

        if (pos > 0) {
          socket.to(tournamentId).emit('playerJoined', { pos, username: socket.username, avatar });
          // Push notification to other player
          if (pos === 2 && tournament.player1_id && !tournament.is_ai) {
            sendPushToUser(tournament.player1_id, {
              title: 'Heisenberg Rooms',
              body: `${socket.username} joined your table!`,
              data: { url: `/game/${tournamentId}` },
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('joinTournament error:', err);
        socket.emit('error', { message: 'Failed to join tournament' });
      }
    });

    socket.on('startGame', async ({ tournamentId }) => {
      const gameKey = String(tournamentId);
      if (startingGames.has(gameKey)) return;
      startingGames.add(gameKey);
      try {
        const tRes = await pool.query('SELECT * FROM tournaments WHERE id=$1', [tournamentId]);
        const t = tRes.rows[0];
        if (!t || t.status !== 'active') return;

        const isPlayer = t.player1_id === socket.userId || t.player2_id === socket.userId;
        if (!isPlayer) return;

        const state = await getGameState(tournamentId);
        if (!state || (state.deck && Array.isArray(state.deck) && state.deck.length > 0)) return;

        const holeCards = state.hole_cards || {};
        const isUnstarted = (!state.deck || state.deck.length === 0)
          && (!holeCards.p1 || holeCards.p1.length === 0)
          && (!holeCards.p2 || holeCards.p2.length === 0)
          && Number(state.pot || 0) === 0;

        if (isUnstarted) {
          const allCards = [];
          const suits = ['s','h','d','c'];
          const vals  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
          for (const v of vals) for (const s of suits) allCards.push(v+s);
          for (let i = allCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i+1));
            [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
          }
          const p1Card = allCards[0], p2Card = allCards[1];
          const p1Val = drawValue(p1Card), p2Val = drawValue(p2Card);
          let dealerPos = p1Val >= p2Val ? 0 : 1;
          if (p1Val === p2Val) dealerPos = Math.random() < 0.5 ? 0 : 1;

          await pool.query('UPDATE game_state SET dealer_pos=$1,hand_number=0 WHERE tournament_id=$2', [dealerPos, tournamentId]);
          io.to(tournamentId).emit('buttonDraw', {
            p1Card, p2Card,
            winner: dealerPos + 1,
            dealerPos,
          });
          await new Promise(r => setTimeout(r, 4000));
        }

        await startNewHand(tournamentId, io);
      } catch (err) {
        console.error('startGame error:', err);
      } finally {
        startingGames.delete(gameKey);
      }
    });

    socket.on('action', async ({ tournamentId, action, amount }) => {
      try {
        if (!socket.playerPos || socket.playerPos === 0) {
          return socket.emit('actionError', { message: 'Spectators cannot act' });
        }
        if (String(socket.tournamentId) !== String(tournamentId)) {
          return socket.emit('actionError', { message: 'You are not seated at this table' });
        }
        const result = await processAction(tournamentId, socket.playerPos, action, amount, io);
        if (result?.error) socket.emit('actionError', { message: result.error });
      } catch (err) {
        console.error('action error:', err);
        socket.emit('actionError', { message: 'Server error processing action' });
      }
    });

    // Sit-out toggle
    socket.on('sitOut', async ({ tournamentId, sitOut }) => {
      try {
        if (!socket.playerPos) return;
        const col = socket.playerPos === 1 ? 'p1_sitout' : 'p2_sitout';
        await pool.query(`UPDATE game_state SET ${col}=$1 WHERE tournament_id=$2`, [!!sitOut, tournamentId]);
        io.to(tournamentId).emit('sitOutChanged', { pos: socket.playerPos, sitOut: !!sitOut });
      } catch {}
    });

    // Time bank request (use extra time)
    socket.on('useTimebank', async ({ tournamentId }) => {
      try {
        if (!socket.playerPos) return;
        const state = await getGameState(tournamentId);
        if (!state || state.action_on !== socket.playerPos) return;
        const col = socket.playerPos === 1 ? 'p1_timebank' : 'p2_timebank';
        const currentBank = socket.playerPos === 1 ? (state.p1_timebank || 0) : (state.p2_timebank || 0);
        if (currentBank <= 0) return socket.emit('actionError', { message: 'No time bank remaining' });
        // Give 15 extra seconds, deduct from bank
        const deduct = Math.min(15, currentBank);
        await pool.query(`UPDATE game_state SET ${col}=${col}-$1 WHERE tournament_id=$2`, [deduct, tournamentId]);
        io.to(tournamentId).emit('timebankUsed', { pos: socket.playerPos, secondsAdded: deduct, remaining: currentBank - deduct });
      } catch {}
    });

    // Table chat
    socket.on('chatMessage', async ({ tournamentId, message }) => {
      if (!message?.trim() || message.length > 200) return;
      const clean = message.trim().replace(/<[^>]*>/g, '');
      try {
        await pool.query(
          'INSERT INTO chat_messages(tournament_id,user_id,username,message) VALUES($1,$2,$3,$4)',
          [tournamentId, socket.userId, socket.username, clean]
        );
        io.to(tournamentId).emit('chatMessage', {
          username: socket.username,
          avatar,
          message: clean,
          time: new Date().toISOString(),
          pos: socket.playerPos,
        });
      } catch {}
    });

    // Lobby-wide chat
    socket.on('lobbyChatMessage', async ({ message }) => {
      if (!message?.trim() || message.length > 200) return;
      const clean = message.trim().replace(/<[^>]*>/g, '');
      try {
        await pool.query(
          'INSERT INTO lobby_chat(user_id, username, avatar, message) VALUES($1,$2,$3,$4)',
          [socket.userId, socket.username, avatar, clean]
        );
        io.emit('lobbyChatMessage', {
          username: socket.username,
          avatar,
          message: clean,
          time: new Date().toISOString(),
        });
      } catch {}
    });

    // Challenge a friend (relay socket event)
    socket.on('challengeFriend', ({ username, tournamentId }) => {
      const targetSocket = [...io.sockets.sockets.values()].find(s => s.username === username);
      if (targetSocket) {
        targetSocket.emit('friendChallenge', {
          from: socket.username,
          fromAvatar: avatar,
          tournamentId,
        });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.username}`);
      onlinePlayers.delete(socket.userId);
      broadcastOnline(io);

      if (socket.tournamentId) {
        socket.to(socket.tournamentId).emit('playerDisconnected', {
          pos: socket.playerPos,
          username: socket.username,
        });
      }

      // Waiting tables stay reserved across brief network drops. The explicit
      // leave endpoint handles cancellation and refunds transactionally.
    });
  });

  io.getOnlinePlayers = () => [...onlinePlayers.values()].map(p => ({ username: p.username, avatar: p.avatar || '🃏' }));
};
