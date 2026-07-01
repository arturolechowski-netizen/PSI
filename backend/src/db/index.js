/**
 * PostgreSQL connection pool.
 *
 * Usage:
 *   const { pool, query } = require('./db');
 *   const result = await query('SELECT * FROM users WHERE id = $1', [id]);
 */

require('dotenv').config();
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Pool Configuration
// ---------------------------------------------------------------------------
// Prefer DATABASE_URL (Heroku / Render style) but fall back to individual vars.
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // Required for Heroku Postgres SSL in production
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

// Connection pool settings
poolConfig.max = parseInt(process.env.DB_POOL_MAX || '10', 10);
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 5000;

const pool = new Pool(poolConfig);

// Log connection errors so they don't silently crash the process
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool client error:', err.message);
});

// ---------------------------------------------------------------------------
// Helper: run a parameterised query and return the pg Result object
// ---------------------------------------------------------------------------
/**
 * Execute a SQL query using a pooled connection.
 *
 * @param {string} text   - SQL string with $1, $2 … placeholders
 * @param {Array}  [params] - Bound parameter values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DB_QUERY_LOG === 'true') {
      console.log('[DB]', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', { text, params, error: err.message });
    throw err;
  }
}

/**
 * Acquire a dedicated client for multi-statement transactions.
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     …
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 *
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
