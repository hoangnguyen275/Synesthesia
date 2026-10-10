
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const SALT_ROUNDS = 12;

function createAccessToken(userId) {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET is not configured.');
  }

  return jwt.sign(
    { userId: userId.toString() },
    process.env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      expiresIn:
        process.env.JWT_ACCESS_EXPIRES_IN || '30m',
    }
  );
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
  };
}

// ========================================
// SIGN UP
// ========================================

router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9_]{3,30}$/.test(username) ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      typeof password !== 'string' ||
      password.length < 8 ||
      Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Invalid details. Username must have 3–30 letters, numbers, or underscores; password must have at least 8 characters and at most 72 UTF-8 bytes.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({
      email: normalizedEmail,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(
      password,
      SALT_ROUNDS
    );

    const user = await User.create({
      username,
      email: normalizedEmail,
      passwordHash,
    });

    const accessToken = createAccessToken(user._id);

    return res.status(201).json({
      success: true,
      user: publicUser(user),
      accessToken,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }

    console.error('Sign up error:', error);

    return res.status(500).json({
      success: false,
      error: 'Unable to create account.',
    });
  }
});

// ========================================
// SIGN IN
// ========================================

router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const accessToken = createAccessToken(user._id);

    return res.json({
      success: true,
      user: publicUser(user),
      accessToken,
    });
  } catch (error) {
    console.error('Sign in error:', error);

    return res.status(500).json({
      success: false,
      error: 'Unable to sign in.',
    });
  }
});

// ========================================
// CURRENT USER
// ========================================

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.',
      });
    }

    return res.json({
      success: true,
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Current user error:', error);

    return res.status(500).json({
      success: false,
      error: 'Unable to retrieve account.',
    });
  }
});

module.exports = router;
