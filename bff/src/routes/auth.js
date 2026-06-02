const router      = require('express').Router();
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const rateLimit   = require('express-rate-limit');
const User        = require('../models/User');
const requireAuth = require('../middleware/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again later' },
});

router.use(authLimiter);

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    const normalizedEmail = email.toLowerCase();
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: normalizedEmail, password: hash });
    const token = jwt.sign(
      { sub: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.status(201).json({ token });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { sub: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — returns current user's notification preferences
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub)
      .select('email notifications_enabled notifications_email');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      email:                  user.email,
      notifications_enabled:  user.notifications_enabled ?? false,
      notifications_email:    user.notifications_email  || '',
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /auth/preferences — update notification email + enabled flag
router.patch('/preferences', requireAuth, async (req, res, next) => {
  try {
    const { notifications_enabled, notifications_email } = req.body;
    const update = {};
    if (typeof notifications_enabled === 'boolean') {
      update.notifications_enabled = notifications_enabled;
    }
    if (typeof notifications_email === 'string') {
      const trimmed = notifications_email.toLowerCase().trim();
      if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }
      update.notifications_email = trimmed;
    }
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      { $set: update },
      { new: true },
    ).select('email notifications_enabled notifications_email');
    res.json({
      email:                  user.email,
      notifications_enabled:  user.notifications_enabled ?? false,
      notifications_email:    user.notifications_email  || '',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
