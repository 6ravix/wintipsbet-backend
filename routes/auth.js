const express      = require('express');
const router       = express.Router();
const User         = require('../models/User');
const { signToken, protect } = require('../middleware/auth');
const { sendWelcome }        = require('../utils/email');

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password)
      return res.status(400).json({ error: 'All fields are required.' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be 8+ characters.' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered.' });

    const user  = await User.create({ firstName, lastName, email, password });
    const token = signToken(user._id);

    // Send welcome email (non-blocking — don't fail registration if email fails)
    sendWelcome({ name: firstName, email }).catch(err =>
      console.error('Welcome email failed:', err.message)
    );

    res.status(201).json({
      token,
      user: {
        id:         user._id,
        firstName:  user.firstName,
        lastName:   user.lastName,
        email:      user.email,
        plan:       user.plan,
        planExpiry: user.planExpiry,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required.' });

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken(user._id);

    res.json({
      token,
      user: {
        id:         user._id,
        firstName:  user.firstName,
        lastName:   user.lastName,
        email:      user.email,
        plan:       user.plan,
        planExpiry: user.planExpiry,
        isPremium:  user.isPremium,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /auth/me — return current user + active plan
router.get('/me', protect, async (req, res) => {
  const u = req.user;
  // Auto-expire stale plans
  if (u.plan !== 'none' && u.planExpiry && new Date() >= u.planExpiry) {
    u.plan       = 'none';
    u.planExpiry = null;
    await u.save();
  }
  res.json({
    id:         u._id,
    firstName:  u.firstName,
    lastName:   u.lastName,
    email:      u.email,
    plan:       u.plan,
    planExpiry: u.planExpiry,
    isPremium:  u.isPremium,
  });
});

module.exports = router;
