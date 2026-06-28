# Heisenberg Rooms — Architecture & Stack

## Live URL
**https://poker.btcpay.exchange**

---

## Tech Stack

### Backend
| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | v22 |
| HTTP Server | Express.js | v4.19 |
| Real-time | Socket.IO | v4.7 |
| Database | PostgreSQL | v18 |
| DB Client | node-postgres (pg) | v8.12 |
| Auth | JWT (jsonwebtoken) + bcryptjs | v9 / v2.4 |
| Process Manager | PM2 | latest |
| Web Server | Nginx | v1.28 |
| SSL | Let's Encrypt (certbot) | auto-renew |

### Frontend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | v18.3 |
| Build Tool | Vite | v5.3 |
| Styling | Tailwind CSS | v3.4 |
| Routing | React Router v6 | v6.24 |
| Animations | Framer Motion | v11 |
| Icons | Lucide React | v0.400 |
| Toasts | react-hot-toast | v2.4 |
| QR Codes | qrcode.react | v3.1 |
| State (auth) | React Context API | built-in |
| HTTP client | Axios | v1.7 |

### Payments
| Component | Technology |
|-----------|-----------|
| Bitcoin processor | BTCPay Server at node.btcpay.exchange |
| Webhook security | HMAC-SHA256 signature verification |
| Invoice flow | BTCPay API v1 (invoices + payouts) |

---

## Project Structure

```
/home/sven/poker/
├── server/
│   ├── src/
│   │   ├── index.js            ← Express + Socket.IO entry point
│   │   ├── db.js               ← PostgreSQL connection pool
│   │   ├── schema.sql          ← Database schema (auto-applied on boot)
│   │   ├── game/
│   │   │   ├── deck.js         ← 52-card deck, shuffle, deal
│   │   │   ├── evaluator.js    ← Hand evaluation (best 5 of 7)
│   │   │   ├── blinds.js       ← Blind level schedule
│   │   │   └── engine.js       ← Full game state machine
│   │   ├── routes/
│   │   │   ├── auth.js         ← POST /register, /login, /logout, GET /me
│   │   │   ├── tournament.js   ← GET /lobbies, POST /join, GET /:id, POST /:id/leave
│   │   │   ├── wallet.js       ← POST /deposit, /withdraw, GET /balance
│   │   │   ├── admin.js        ← GET /stats, /users, /tournaments, /transactions
│   │   │   └── btcpay.js       ← POST /webhook (payment confirmations)
│   │   ├── socket/
│   │   │   └── index.js        ← All Socket.IO event handlers
│   │   └── middleware/
│   │       └── auth.js         ← JWT authentication (HTTP + WebSocket)
│   ├── .env                    ← Secrets (DB, JWT, BTCPay keys)
│   └── package.json
├── client/
│   ├── src/
│   │   ├── main.jsx            ← React entry point
│   │   ├── App.jsx             ← Routes + auth guards
│   │   ├── context/
│   │   │   └── AuthContext.jsx ← Global auth state
│   │   ├── pages/
│   │   │   ├── Login.jsx       ← Login page (matrix rain + lobby BG)
│   │   │   ├── Register.jsx    ← Registration page
│   │   │   ├── Lobby.jsx       ← Main lobby, tier selection
│   │   │   ├── Game.jsx        ← Full poker table
│   │   │   ├── Wallet.jsx      ← Deposit/withdraw + transaction history
│   │   │   └── Admin.jsx       ← Admin dashboard
│   │   └── components/
│   │       ├── PlayingCard.jsx ← Animated card component
│   │       ├── ActionPanel.jsx ← Fold/Check/Call/Raise controls
│   │       ├── Chat.jsx        ← In-game chat
│   │       ├── BlindTimer.jsx  ← Blind level countdown
│   │       ├── MatrixRain.jsx  ← Canvas matrix effect
│   │       └── Navbar.jsx      ← Top navigation bar
│   ├── public/
│   │   ├── heisenberg-lobby.png
│   │   └── heisenberg-table.png
│   └── dist/                   ← Built frontend (served by Express)
├── logs/
│   ├── out-0.log
│   └── error-0.log
├── ecosystem.config.js         ← PM2 config
└── ARCHITECTURE.md             ← This file
```

---

## Database Schema

### Tables
| Table | Purpose |
|-------|---------|
| `users` | Accounts, BTC balance, play money balance |
| `tournaments` | Each heads-up match (waiting → active → completed) |
| `game_state` | Live game state: cards, chips, pot, phase, action |
| `hand_history` | Completed hand records for audit/replay |
| `transactions` | All BTC movements (deposit, withdrawal, winnings, rake) |
| `chat_messages` | In-game chat log per tournament |

### Database
- **Name:** `heisenberg_poker`
- **User:** `heisenberg`
- **Password:** `HeisenbergPoker2026!`

---

## Game Logic

### Tournament Flow
1. Player A joins a tier → creates `tournament` row (status: `waiting`), entry fee deducted
2. Player B joins same tier → tournament set to `active`, game state initialized
3. Socket.IO starts first hand automatically
4. Hands play until one player has all 20,000 chips
5. Winner gets 95% of prize pool, 5% goes to house (rake)
6. Winner's BTC balance is credited, `transactions` row inserted

### Blind Structure (doubles every 5 minutes)
| Level | Small | Big |
|-------|-------|-----|
| 1 | 50 | 100 |
| 2 | 100 | 200 |
| 3 | 200 | 400 |
| 4 | 400 | 800 |
| 5 | 800 | 1,600 |
| 6 | 1,600 | 3,200 |
| 7 | 3,200 | 6,400 |
| 8 | 6,400 | 12,800 |

### Tournament Tiers
| Tier | Entry | House Rake | Prize |
|------|-------|-----------|-------|
| Play Money | Free | 0% | Play Chips |
| Micro | 0.001 BTC | 5% | 0.00095 BTC |
| Low | 0.01 BTC | 5% | 0.0095 BTC |
| High | 0.1 BTC | 5% | 0.095 BTC |

### Poker Rules (Heads-Up Specifics)
- Dealer = Small Blind (per heads-up convention)
- Pre-flop: Dealer (SB) acts first
- Post-flop: Non-dealer acts first
- Action timeout: 30 seconds → auto-fold

---

## BTCPay Integration

### Flow
1. Player clicks "Deposit" → POST `/api/wallet/deposit` → creates BTCPay invoice
2. Player pays invoice in their BTC wallet
3. BTCPay sends webhook to `POST /api/btcpay/webhook`
4. Webhook verifies HMAC-SHA256 signature, credits user balance
5. Player's `balance_btc` updated, `transactions` row confirmed

### Config
- **Host:** https://node.btcpay.exchange
- **Store ID:** `GcFH61hp7DZtxoCn5oqYbrXfCJGvbJapBJww5vb5BRHK`
- **Webhook URL:** `https://poker.btcpay.exchange/api/btcpay/webhook`
- **Webhook Secret:** configured in `.env`

---

## Real-time Architecture (Socket.IO)

### Events (Client → Server)
| Event | Payload | Purpose |
|-------|---------|---------|
| `joinTournament` | `{ tournamentId }` | Join a game room |
| `startGame` | `{ tournamentId }` | Trigger first hand |
| `action` | `{ tournamentId, action, amount }` | fold/check/call/raise/bet |
| `chatMessage` | `{ tournamentId, message }` | Send chat |
| `getBlindTimer` | `{ tournamentId }` | Request blind level info |

### Events (Server → Client)
| Event | Purpose |
|-------|---------|
| `gameState` | Full game state (with private hole cards for each player) |
| `handResult` | Showdown result, pot awarded |
| `tournamentEnd` | Tournament winner declared |
| `tournamentInfo` | Tournament metadata |
| `chatMessage` | Broadcast chat |
| `playerJoined` | Opponent joined |
| `playerDisconnected` | Opponent dropped |

---

## Admin Panel
Access at: **https://poker.btcpay.exchange/admin** (admin account only)

**Default credentials:**
- Username: `admin`
- Password: `Admin2026!`  
  ⚠️ **Change this immediately after first login**

### Features
- Live stats: total users, tournaments, revenue, active games
- User management: search, ban/unban, edit balances
- Tournament history: filter by status and tier
- Transaction log: all deposits, withdrawals, winnings, rake

---

## Process Management

```bash
# View server status
pm2 status

# View live logs
pm2 logs heisenberg-poker

# Restart server
pm2 restart heisenberg-poker

# Server auto-starts on reboot via systemd (pm2-sven.service)
```

---

## Nginx Config
Located at: `/etc/nginx/sites-enabled/heisenberg-poker`
- HTTP → HTTPS redirect
- HTTP/2 enabled
- WebSocket proxy for Socket.IO (86400s timeout)
- SSL via Let's Encrypt (auto-renews)

---

## Security
- JWT tokens in `httpOnly` + `secure` + `sameSite=strict` cookies
- bcrypt password hashing (cost factor 12)
- Rate limiting: 200 req/15min global, 20 req/15min on auth routes
- BTCPay webhook HMAC-SHA256 signature verification
- Helmet.js security headers
- PostgreSQL uses dedicated non-superuser account
- Input validation on all user-facing routes

---

## Fonts (Cyberpunk Aesthetic)
- **Orbitron** — Display headings, labels, buttons
- **Exo 2** — Body text
- **Share Tech Mono** — Chip counts, balances, code

---

## How to Deploy Updates

```bash
# Frontend change:
cd /home/sven/poker/client && npm run build
pm2 restart heisenberg-poker

# Backend change:
pm2 restart heisenberg-poker

# Schema change:
# Edit server/src/schema.sql (use CREATE TABLE IF NOT EXISTS)
pm2 restart heisenberg-poker  # schema auto-applies on boot
```
