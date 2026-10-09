require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const pool = require('./db');
const { cancelWaitingTournaments } = require('./game/finance');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost',
  'capacitor://localhost',
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});
app.set('io', io);

// Trust proxy (nginx)
app.set('trust proxy', 1);

// Security
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Raw body for webhook signature verification (exact bytes, HMAC must match BTCPay's payload)
app.use((req, res, next) => {
  if (req.path === '/api/btcpay/webhook') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

// Skip express.json for webhook (already parsed above)
app.use((req, res, next) => {
  if (req.path === '/api/btcpay/webhook') return next();
  express.json({ limit: '1mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Rate limiting — strict where it matters (credential brute force),
// generous everywhere else so normal play and session checks never trip it.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true,
  message: { error: 'Too many requests — slow down a moment' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true,
  message: { error: 'Too many login attempts — try again in a few minutes' },
});
app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', loginLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/btcpay', require('./routes/btcpay'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/social', require('./routes/social'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/support', require('./routes/support'));

// Tournament routes (need io instance)
const tournamentRouter = require('./routes/tournament');
app.use('/api/tournament', tournamentRouter(io));

// Casino (multi-table poker) — manager boots on first use
const { GameManager } = require('./poker/manager');
const casinoManager = new GameManager(io);
casinoManager.init().catch(e => console.error('[casino] init failed:', e));
app.use('/api/poker', require('./routes/poker')(io, casinoManager));

// Casino sockets (table rooms, actions, chat)
require('./socket/casino')(io, casinoManager);

// House games (blackjack + roulette) — dealer is the casino
const { HouseManager } = require('./house/manager');
const houseManager = new HouseManager(io);
houseManager.init().catch(e => console.error('[house] init failed:', e));
app.use('/api/house', require('./house/routes')(houseManager));
require('./socket/house')(io, houseManager);

// Online players (needs io, wired after socket setup below)
app.get('/api/online', (req, res) => {
  res.json({ players: io.getOnlinePlayers ? io.getOnlinePlayers() : [] });
});

// Health check (must be before the SPA wildcard)
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Serve React frontend in production
const clientBuild = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Setup sockets
const setupSockets = require('./socket');
setupSockets(io);

// Initialize DB schema then start
async function init() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema initialized');
  } catch (err) {
    console.error('Schema init error:', err.message);
  }

  // Clean up any stale waiting rooms left from a prior server restart
  try {
    const stale = await pool.query(
      `SELECT id,player1_id FROM tournaments
       WHERE status='waiting' AND created_at < NOW() - INTERVAL '15 minutes'`
    );
    for (const table of stale.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await cancelWaitingTournaments(client, table.player1_id, { tournamentId: table.id });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    if (stale.rowCount > 0) console.log(`Startup: refunded and cancelled ${stale.rowCount} stale waiting rooms`);
  } catch (err) {
    console.error('Startup cleanup error:', err.message);
  }

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Heisenberg Rooms server running on port ${PORT}`);
  });
}

init();
