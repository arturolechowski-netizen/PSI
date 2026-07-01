/**
 * PostgreSQL connection pool for the trading platform.
 *
 * Usage:
 *   const { pool, query, getClient } = require('./db');
 *   const result = await query('SELECT * FROM tp_users WHERE id = $1', [id]);
 */

require('dotenv').config();
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Pool Configuration
// ---------------------------------------------------------------------------
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'psi_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

poolConfig.max = parseInt(process.env.DB_POOL_MAX || '10', 10);
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 5000;

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[TP-DB] Unexpected pool client error:', err.message);
});

// ---------------------------------------------------------------------------
// Helper: run a parameterised query
// ---------------------------------------------------------------------------
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DB_QUERY_LOG === 'true') {
      console.log('[TP-DB]', { text: text.substring(0, 80), duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('[TP-DB] Query error:', { text: text.substring(0, 120), error: err.message });
    throw err;
  }
}

/**
 * Acquire a dedicated client for multi-statement transactions.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
