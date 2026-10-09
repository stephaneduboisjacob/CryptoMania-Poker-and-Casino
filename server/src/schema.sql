-- Heisenberg Rooms - Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  balance_btc NUMERIC(16, 8) DEFAULT 0,
  balance_play NUMERIC(16, 2) DEFAULT 10000.00,
  is_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier VARCHAR(20) NOT NULL,
  entry_fee NUMERIC(16, 8) DEFAULT 0,
  rake NUMERIC(16, 8) DEFAULT 0,
  prize_pool NUMERIC(16, 8) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
  player1_id INTEGER REFERENCES users(id),
  player2_id INTEGER REFERENCES users(id),
  winner_id INTEGER REFERENCES users(id),
  is_ai BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_state (
  tournament_id UUID PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
  hand_number INTEGER DEFAULT 0,
  dealer_pos INTEGER DEFAULT 0,
  blind_level INTEGER DEFAULT 1,
  blind_start_time TIMESTAMPTZ DEFAULT NOW(),
  small_blind INTEGER DEFAULT 50,
  big_blind INTEGER DEFAULT 100,
  p1_chips INTEGER DEFAULT 10000,
  p2_chips INTEGER DEFAULT 10000,
  phase VARCHAR(20) DEFAULT 'preflop' CHECK (phase IN ('preflop','flop','turn','river','showdown')),
  deck JSONB,
  hole_cards JSONB DEFAULT '{}',
  community_cards JSONB DEFAULT '[]',
  pot INTEGER DEFAULT 0,
  side_pots JSONB DEFAULT '[]',
  current_bet INTEGER DEFAULT 0,
  p1_bet INTEGER DEFAULT 0,
  p2_bet INTEGER DEFAULT 0,
  action_on INTEGER DEFAULT 1,
  last_aggressor INTEGER DEFAULT NULL,
  p1_acted BOOLEAN DEFAULT FALSE,
  p2_acted BOOLEAN DEFAULT FALSE,
  hand_log JSONB DEFAULT '[]',
  stats JSONB DEFAULT '{}',
  p1_timebank INTEGER DEFAULT 30,
  p2_timebank INTEGER DEFAULT 30,
  p1_sitout BOOLEAN DEFAULT FALSE,
  p2_sitout BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hand_history (
  id SERIAL PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id),
  hand_number INTEGER,
  winner_id INTEGER REFERENCES users(id),
  pot INTEGER,
  community_cards JSONB,
  hand_log JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id INTEGER REFERENCES users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'entry_fee', 'winnings', 'rake', 'refund', 'play_money_reset')),
  amount NUMERIC(16, 8) NOT NULL,
  currency VARCHAR(10) DEFAULT 'BTC',
  btcpay_invoice_id VARCHAR(255),
  btcpay_payment_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'expired')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  tournament_id UUID REFERENCES tournaments(id),
  user_id INTEGER REFERENCES users(id),
  username VARCHAR(30),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences (avatar, deck color, sounds, limits)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar VARCHAR(10) DEFAULT '🃏',
  four_color_deck BOOLEAN DEFAULT FALSE,
  sound_enabled BOOLEAN DEFAULT TRUE,
  sound_volume INTEGER DEFAULT 80,
  deposit_limit_btc NUMERIC(16,8) DEFAULT NULL,
  session_limit_minutes INTEGER DEFAULT NULL,
  push_subscription JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social: friends
CREATE TABLE IF NOT EXISTS friends (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

-- Social: player notes (notes you write about opponents)
CREATE TABLE IF NOT EXISTS player_notes (
  id SERIAL PRIMARY KEY,
  author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(author_id, target_id)
);

-- Lobby-wide chat (not tied to a tournament)
CREATE TABLE IF NOT EXISTS lobby_chat (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  username VARCHAR(30),
  avatar VARCHAR(10) DEFAULT '🃏',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_tier ON tournaments(tier);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(btcpay_invoice_id);
CREATE INDEX IF NOT EXISTS idx_chat_tournament ON chat_messages(tournament_id);
CREATE INDEX IF NOT EXISTS idx_lobby_chat_created ON lobby_chat(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_player_notes_author ON player_notes(author_id);

-- Alter existing tables to add missing columns safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='p1_acted') THEN
    ALTER TABLE game_state ADD COLUMN p1_acted BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='p2_acted') THEN
    ALTER TABLE game_state ADD COLUMN p2_acted BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='stats') THEN
    ALTER TABLE game_state ADD COLUMN stats JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='p1_timebank') THEN
    ALTER TABLE game_state ADD COLUMN p1_timebank INTEGER DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='p2_timebank') THEN
    ALTER TABLE game_state ADD COLUMN p2_timebank INTEGER DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='p1_sitout') THEN
    ALTER TABLE game_state ADD COLUMN p1_sitout BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='game_state' AND column_name='p2_sitout') THEN
    ALTER TABLE game_state ADD COLUMN p2_sitout BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='is_ai') THEN
    ALTER TABLE tournaments ADD COLUMN is_ai BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

ALTER TABLE game_state ALTER COLUMN hand_number SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='transactions_type_check'
      AND pg_get_constraintdef(oid) LIKE '%refund%'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
      CHECK (type IN ('deposit','withdrawal','entry_fee','winnings','rake','refund','play_money_reset'));
  END IF;
END $$;

-- Default admin account (password: Admin2026!)
INSERT INTO users (username, password_hash, is_admin, balance_btc)
VALUES ('admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFj/NfNKj5f.jvO', TRUE, 0)
ON CONFLICT (username) DO NOTHING;

-- Default AI user
INSERT INTO users (username, password_hash)
VALUES ('_ai_', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFj/NfNKj5f.jvO')
ON CONFLICT (username) DO NOTHING;

-- AI settings singleton
CREATE TABLE IF NOT EXISTS ai_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name VARCHAR(50) DEFAULT 'Heisenberg',
  emoji VARCHAR(10) DEFAULT '🤖',
  difficulty VARCHAR(20) DEFAULT 'medium',
  action_delay VARCHAR(20) DEFAULT 'normal',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ai_settings (id, name, emoji, difficulty, action_delay)
VALUES (1, 'Heisenberg', '🤖', 'medium', 'normal')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- POKER CASINO (multi-table, multi-player) — games, seating, scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_type VARCHAR(10) NOT NULL CHECK (game_type IN ('cash','sng','mtt')),
  name VARCHAR(80) NOT NULL,
  max_seats INTEGER NOT NULL DEFAULT 9 CHECK (max_seats IN (2,3,6,8,9)),
  speed VARCHAR(12) NOT NULL DEFAULT 'regular' CHECK (speed IN ('regular','turbo','hyper','deepstack')),
  currency VARCHAR(6) NOT NULL DEFAULT 'play' CHECK (currency IN ('play','btc')),
  -- cash
  small_blind BIGINT DEFAULT 0,
  big_blind BIGINT DEFAULT 0,
  buy_in_min BIGINT DEFAULT 0,
  buy_in_max BIGINT DEFAULT 0,
  -- tournaments
  entry_fee NUMERIC(16,8) DEFAULT 0,
  entry_usd NUMERIC(12,2) DEFAULT NULL,
  stake_key VARCHAR(40) DEFAULT NULL,
  starting_stack BIGINT DEFAULT 15000,
  level_minutes INTEGER DEFAULT 10,
  late_reg_levels INTEGER DEFAULT 0,
  guarantee NUMERIC(16,8) DEFAULT 0,
  prize_pool NUMERIC(16,8) DEFAULT 0,
  rake_collected NUMERIC(16,8) DEFAULT 0,
  payout_schedule JSONB DEFAULT '[]',
  min_players INTEGER DEFAULT 2,
  start_at TIMESTAMPTZ,
  -- state
  status VARCHAR(20) DEFAULT 'registering' CHECK (status IN ('registering','running','completed','cancelled')),
  ai_fill BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(20) DEFAULT 'system',
  current_level INTEGER DEFAULT 1,
  blind_start_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_players (
  id SERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  seat INTEGER,
  chips BIGINT DEFAULT 0,
  status VARCHAR(12) DEFAULT 'registered' CHECK (status IN ('registered','seated','eliminated','finished','left')),
  place INTEGER,
  prize NUMERIC(16,8) DEFAULT 0,
  bought_in NUMERIC(16,8) DEFAULT 0,
  cashed_out NUMERIC(16,8) DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(game_id, user_id)
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS entry_usd NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS stake_key VARCHAR(40) DEFAULT NULL;
-- Extend the original seat-format constraint for short-handed and 8-max tables.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_seats_check;
ALTER TABLE games ADD CONSTRAINT games_max_seats_check CHECK (max_seats IN (2,3,6,8,9)) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_start ON games(start_at);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_game ON hand_history(game_id);

-- Chat for casino games (chat_messages.tournament_id has FK to tournaments)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id) ON DELETE CASCADE;
ALTER TABLE hand_history ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id);

-- transactions: house-funded guarantee top-ups / freeroll prizes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='transactions_type_check'
      AND pg_get_constraintdef(oid) LIKE '%casino_prize%'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
      CHECK (type IN ('deposit','withdrawal','entry_fee','winnings','rake','refund','play_money_reset','casino_prize','cash_out'));
  END IF;
END $$;

-- ============================================================================
-- HOUSE GAMES (blackjack, roulette) — crash-safe round ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS house_rounds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game VARCHAR(20) NOT NULL CHECK (game IN ('blackjack','roulette','baccarat','slots','dice','plinko','videopoker','crash','mines')),
  table_id VARCHAR(64) NOT NULL,
  currency VARCHAR(6) NOT NULL DEFAULT 'play' CHECK (currency IN ('play','btc')),
  bets JSONB DEFAULT '[]',
  results JSONB DEFAULT '{}',
  status VARCHAR(12) DEFAULT 'open' CHECK (status IN ('open','settled','refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_house_rounds_status ON house_rounds(status);
CREATE INDEX IF NOT EXISTS idx_house_rounds_created ON house_rounds(created_at DESC);

-- ============================================================================
-- CASINO PLATFORM: provably fair seeds + daily bonus
-- ============================================================================

CREATE TABLE IF NOT EXISTS fair_seeds (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  server_seed VARCHAR(64) NOT NULL,
  server_seed_hash VARCHAR(64) NOT NULL,
  client_seed VARCHAR(64) NOT NULL,
  nonce BIGINT DEFAULT 0,
  prev_server_seed VARCHAR(64),
  prev_server_seed_hash VARCHAR(64),
  prev_nonce BIGINT,
  rotated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS daily_bonus (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  streak INTEGER DEFAULT 1,
  last_claimed TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- JACKPOTS / RAKEBACK / RACE
-- ============================================================================

CREATE TABLE IF NOT EXISTS jackpots (
  tier VARCHAR(10) PRIMARY KEY CHECK (tier IN ('mini','major','mega')),
  pool NUMERIC(18,2) DEFAULT 0,
  seed NUMERIC(18,2) DEFAULT 0,
  last_winner_user_id INTEGER,
  last_winner_username VARCHAR(30),
  last_win_amount NUMERIC(18,2),
  last_won_at TIMESTAMPTZ
);

INSERT INTO jackpots(tier, pool, seed) VALUES
  ('mini', 25000, 25000),
  ('major', 150000, 150000),
  ('mega', 1000000, 1000000)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS rakeback (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available NUMERIC(18,2) DEFAULT 0,
  lifetime NUMERIC(18,2) DEFAULT 0,
  last_claimed TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS race_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_settled DATE
);
INSERT INTO race_state(id, last_settled) VALUES (1, CURRENT_DATE - 1) ON CONFLICT DO NOTHING;
