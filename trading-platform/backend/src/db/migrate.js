/**
 * Database migration runner for the trading platform.
 *
 * Reads and executes SQL migration files from the migrations/ directory.
 * Tracks applied migrations in a _tp_migrations table to avoid re-running.
 *
 * Usage:
 *   npm run migrate
 *   node src/db/migrate.js
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { pool } = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function run() {
  const client = await pool.connect();

  try {
    // Use a separate migrations table (prefixed) to avoid collisions with PSI
    await client.query(`
      CREATE TABLE IF NOT EXISTS _tp_migrations (
        id         SERIAL PRIMARY KEY,
        file_name  VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT file_name FROM _tp_migrations');
    const appliedSet = new Set(applied.map((r) => r.file_name));

    const files = getMigrationFiles();

    if (files.length === 0) {
      console.log('No migration files found in', MIGRATIONS_DIR);
      return;
    }

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  SKIP  ${file} (already applied)`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`  RUN   ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _tp_migrations (file_name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  OK    ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAIL  ${file}: ${err.message}`);
        throw err;
      }
    }

    console.log('Trading platform migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
