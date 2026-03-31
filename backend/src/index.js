/**
 * PSI Backend - Main Express Application Entry Point
 *
 * Sets up middleware, routes, and starts the HTTP server.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

// Route handlers
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const psiRoutes = require('./routes/psi');
const importRoutes = require('./routes/imports');
const dashboardRoutes = require('./routes/dashboard');
const exportRoutes = require('./routes/exports');
const snapshotRoutes = require('./routes/snapshots');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------

// CORS – allow all origins in development; tighten via env in production
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));

// Parse JSON and URL-encoded bodies (generous limit for bulk imports)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------------------------------------------------------
// Request Logging (lightweight – replace with morgan/winston in production)
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/psi', psiRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/audit', auditRoutes);

// ---------------------------------------------------------------------------
// 404 – Unknown Route
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------------------------------------------------------------------------
// Global Error Handling Middleware
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);

  // Multer file-size / unexpected field errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field' });
  }

  // JWT errors bubbled up from middleware
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  // PostgreSQL unique-constraint violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry', detail: err.detail });
  }

  // PostgreSQL foreign-key violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist', detail: err.detail });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`PSI backend listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app; // exported for testing
