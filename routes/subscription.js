const express  = require('express');
const router   = express.Router();
const { protect } = require('../middleware/auth');
const { expiryLabel } = require('../utils/expiry');
const Payment  = require('../models/Payment');
const User     = require('../models/User');

// GET /subscription/status
// Frontend calls this on load to hydrate plan state from DB.
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Auto-expire stale plan
    let plan       = user.plan;
    let planExpiry = user.planExpiry;
    if (plan !== 'none' && planExpiry && new Date() >= planExpiry) {
      plan       = 'none';
      planExpiry = null;
      await User.findByIdAndUpdate(user._id, { plan: 'none', planExpiry: null });
    }

    const isPremium = plan !== 'none' && planExpiry && new Date() < planExpiry;

    res.json({
      isPremium,
      plan:        isPremium ? plan : null,
      planExpiry:  isPremium ? planExpiry : null,
      expiryLabel: isPremium ? expiryLabel(planExpiry) : null,
    });
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: 'Could not fetch subscription status.' });
  }
});

// GET /subscription/history
// Returns last 10 payments for the user.
router.get('/history', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('plan amount status mpesaReceiptNumber accessFrom accessUntil createdAt');

    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch payment history.' });
  }
});

module.exports = router;
