/**
 * JWT Authentication Middleware
 *
 * Exports:
 *   authenticate      – verifies Bearer token, attaches req.user
 *   requireRole(...roles) – factory that returns a role-check middleware
 */

const jwt = require('jsonwebtoken');
const { query } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'psi-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ---------------------------------------------------------------------------
// Token utilities (used by auth routes)
// ---------------------------------------------------------------------------

/**
 * Sign a JWT for the given user object.
 * @param {{ id: number, email: string, role: string }} user
 * @returns {string} signed JWT
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ---------------------------------------------------------------------------
// authenticate middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that:
 *  1. Reads the `Authorization: Bearer <token>` header
 *  2. Verifies the JWT
 *  3. Loads the user record from the database
 *  4. Attaches the user to `req.user`
 *  5. Calls next() – or returns 401 on any failure
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Load fresh user data (catches deactivated users)
    const { rows } = await query(
      'SELECT id, email, name, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// requireRole middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns an Express middleware that restricts access to the listed roles.
 *
 * Usage:
 *   router.post('/admin-only', authenticate, requireRole('admin'), handler);
 *   router.put('/planners',    authenticate, requireRole('admin', 'planner'), handler);
 *
 * @param {...string} roles – allowed roles
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, signToken };
