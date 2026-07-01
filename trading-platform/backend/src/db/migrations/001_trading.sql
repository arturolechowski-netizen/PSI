-- Trading platform schema (all tables prefixed with tp_ to avoid collisions with PSI tables)

CREATE TABLE IF NOT EXISTS tp_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'trader',  -- admin, trader, analyst, viewer
  company VARCHAR(255),
  initial_balance DECIMAL(15,2) DEFAULT 1000000.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tp_instruments (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) UNIQUE NOT NULL,           -- e.g. 'BASE_PL_2026Q3', 'PEAK_PL_2026M07'
  name VARCHAR(255) NOT NULL,                   -- e.g. 'Polish Baseload Q3 2026'
  market VARCHAR(50) NOT NULL,                  -- DAM, IDM, FUTURES, CERTIFICATES
  product_type VARCHAR(50) NOT NULL,            -- BASE, PEAK, OFFPEAK, GAS, GREEN_CERT, WHITE_CERT, CO2
  delivery_start DATE,
  delivery_end DATE,
  tick_size DECIMAL(10,4) DEFAULT 0.01,
  lot_size DECIMAL(10,2) DEFAULT 1.0,           -- MWh per lot
  currency VARCHAR(10) DEFAULT 'PLN',
  reference_price DECIMAL(15,4),                -- last settlement / reference
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tp_market_data (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER REFERENCES tp_instruments(id),
  timestamp TIMESTAMPTZ NOT NULL,
  bid_price DECIMAL(15,4),
  ask_price DECIMAL(15,4),
  last_price DECIMAL(15,4),
  volume DECIMAL(15,2) DEFAULT 0,
  open_price DECIMAL(15,4),
  high_price DECIMAL(15,4),
  low_price DECIMAL(15,4),
  settlement_price DECIMAL(15,4)
);
CREATE INDEX IF NOT EXISTS idx_tp_market_data_instrument ON tp_market_data(instrument_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS tp_price_history (
  id SERIAL PRIMARY KEY,
  instrument_id INTEGER REFERENCES tp_instruments(id),
  date DATE NOT NULL,
  open_price DECIMAL(15,4),
  high_price DECIMAL(15,4),
  low_price DECIMAL(15,4),
  close_price DECIMAL(15,4),
  settlement_price DECIMAL(15,4),
  volume DECIMAL(15,2) DEFAULT 0,
  UNIQUE(instrument_id, date)
);

CREATE TABLE IF NOT EXISTS tp_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tp_users(id),
  instrument_id INTEGER REFERENCES tp_instruments(id),
  side VARCHAR(10) NOT NULL,                    -- BUY, SELL
  order_type VARCHAR(20) NOT NULL,              -- MARKET, LIMIT, STOP
  quantity DECIMAL(15,2) NOT NULL,              -- MWh
  price DECIMAL(15,4),                          -- limit price (NULL for market orders)
  stop_price DECIMAL(15,4),                     -- for stop orders
  filled_quantity DECIMAL(15,2) DEFAULT 0,
  avg_fill_price DECIMAL(15,4),
  status VARCHAR(20) DEFAULT 'PENDING',         -- PENDING, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED
  time_in_force VARCHAR(10) DEFAULT 'GTC',      -- GTC, DAY, IOC, FOK
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tp_orders_user ON tp_orders(user_id, status);

CREATE TABLE IF NOT EXISTS tp_trades (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES tp_orders(id),
  user_id INTEGER REFERENCES tp_users(id),
  instrument_id INTEGER REFERENCES tp_instruments(id),
  side VARCHAR(10) NOT NULL,
  quantity DECIMAL(15,2) NOT NULL,
  price DECIMAL(15,4) NOT NULL,
  trade_value DECIMAL(15,2) NOT NULL,           -- quantity * price
  fee DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tp_trades_user ON tp_trades(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tp_positions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tp_users(id),
  instrument_id INTEGER REFERENCES tp_instruments(id),
  net_quantity DECIMAL(15,2) DEFAULT 0,         -- positive = long, negative = short
  avg_entry_price DECIMAL(15,4) DEFAULT 0,
  realized_pnl DECIMAL(15,2) DEFAULT 0,
  unrealized_pnl DECIMAL(15,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_tp_positions_user ON tp_positions(user_id);

CREATE TABLE IF NOT EXISTS tp_portfolio_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tp_users(id),
  date DATE NOT NULL,
  total_equity DECIMAL(15,2),
  cash_balance DECIMAL(15,2),
  unrealized_pnl DECIMAL(15,2),
  realized_pnl DECIMAL(15,2),
  total_exposure DECIMAL(15,2),
  num_positions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS tp_risk_limits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tp_users(id),
  max_position_size DECIMAL(15,2) DEFAULT 10000,   -- max MWh per instrument
  max_total_exposure DECIMAL(15,2) DEFAULT 5000000, -- max total PLN exposure
  max_daily_loss DECIMAL(15,2) DEFAULT 100000,      -- max daily loss PLN
  max_order_size DECIMAL(15,2) DEFAULT 1000,        -- max MWh per order
  stop_loss_pct DECIMAL(5,2) DEFAULT 5.0,           -- auto stop-loss at % of equity
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS tp_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tp_users(id),
  instrument_id INTEGER REFERENCES tp_instruments(id),
  alert_type VARCHAR(50) NOT NULL,              -- PRICE_ABOVE, PRICE_BELOW, POSITION_LIMIT, LOSS_LIMIT
  threshold DECIMAL(15,4),
  is_triggered BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  message TEXT,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tp_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES tp_users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default admin (password: admin123)
INSERT INTO tp_users (email, password_hash, name, role, initial_balance)
VALUES ('admin@trading.local', '$2b$10$ujhRm2FHfJgm8S1G6AmyU.06aPPG/ecWoJdTbnYf0p0jtSQ3Jj.5i', 'Admin Trader', 'admin', 1000000.00)
ON CONFLICT (email) DO NOTHING;
