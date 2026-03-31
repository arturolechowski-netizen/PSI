const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticate, requireRole, signToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await query(
      'SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role });
});

// PUT /api/auth/me/password
router.put('/me/password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Valid current and new password (min 6 chars) required' });
    }

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/users - admin only
router.get('/users', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/users - admin create user
router.post('/users', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const validRoles = ['admin', 'planner', 'kam', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, is_active, created_at',
      [email.toLowerCase().trim(), hash, name.trim(), role || 'viewer']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/users/:id - admin update user
router.put('/users/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role, is_active, password } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name.trim()); }
    if (role !== undefined) { sets.push(`role = $${idx++}`); values.push(role); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, is_active, created_at, updated_at`,
      values
    );

    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/users/:id - admin deactivate user
router.delete('/users/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    await query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
