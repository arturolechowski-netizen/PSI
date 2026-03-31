-- =============================================================================
-- PSI Application – Initial Database Schema
-- Migration: 001_initial.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  role           VARCHAR(50)  NOT NULL DEFAULT 'viewer',  -- admin | planner | viewer
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Products (master data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  item_number     BIGINT UNIQUE NOT NULL,
  model           VARCHAR(255) NOT NULL,
  ean             VARCHAR(100),
  brand           VARCHAR(10)  NOT NULL,
  manufacturer    VARCHAR(255),
  description     VARCHAR(100),
  status          VARCHAR(100),
  category_1      VARCHAR(255),
  category_2      VARCHAR(255),
  category_3      VARCHAR(255),
  category_4      VARCHAR(255),
  category_5      VARCHAR(255),
  moq             INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PSI Data (core time-series table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS psi_data (
  id           SERIAL PRIMARY KEY,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  metric_type  VARCHAR(50) NOT NULL,
  year         INTEGER NOT NULL,
  week         INTEGER NOT NULL,
  value        DECIMAL(15, 4),
  is_manual    BOOLEAN DEFAULT FALSE,
  updated_by   INTEGER REFERENCES users(id),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, metric_type, year, week)
);

CREATE INDEX IF NOT EXISTS idx_psi_data_lookup ON psi_data(product_id, metric_type, year, week);
CREATE INDEX IF NOT EXISTS idx_psi_data_week   ON psi_data(year, week);

-- ---------------------------------------------------------------------------
-- Import Logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_logs (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id),
  source_type      VARCHAR(50)  NOT NULL,  -- container_table | production_plan | sell_out | stock | moq | fp_ibp
  file_name        VARCHAR(255),
  records_affected INTEGER DEFAULT 0,
  status           VARCHAR(50)  DEFAULT 'pending',  -- pending | confirmed | failed
  error_message    TEXT,
  preview_data     JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Audit Log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id),
  product_id   INTEGER REFERENCES products(id),
  metric_type  VARCHAR(50),
  year         INTEGER,
  week         INTEGER,
  old_value    DECIMAL(15, 4),
  new_value    DECIMAL(15, 4),
  action       VARCHAR(50) NOT NULL,  -- update | import | recalculate | delete
  ip_address   VARCHAR(50),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_product ON audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- ---------------------------------------------------------------------------
-- Snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS snapshots (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255),
  description TEXT,
  created_by  INTEGER REFERENCES users(id),
  is_auto     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snapshot_data (
  snapshot_id  INTEGER REFERENCES snapshots(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL,
  metric_type  VARCHAR(50) NOT NULL,
  year         INTEGER NOT NULL,
  week         INTEGER NOT NULL,
  value        DECIMAL(15, 4)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_data ON snapshot_data(snapshot_id, product_id);

-- ---------------------------------------------------------------------------
-- Seed: default admin user
-- Password: admin123  (bcrypt hash, cost factor 10)
-- ---------------------------------------------------------------------------
INSERT INTO users (email, password_hash, name, role)
VALUES (
  'admin@psi.local',
  '$2a$10$mkrK25s0VbS3hQTQT3xuRurwO1fQMuoBDvB0F9aMKUW4xcgzYEjaC',
  'Admin User',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
