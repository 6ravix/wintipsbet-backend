const express  = require('express');
const router   = express.Router();
const { stkPush, stkQuery } = require('../utils/mpesa');
const { planExpiry, expiryLabel } = require('../utils/expiry');
const { sendPaymentConfirm }      = require('../utils/email');
const { protect }   = require('../middleware/auth');
const Payment       = require('../models/Payment');
const User          = require('../models/User');

// ================================================================
// POST /mpesa/stkpush
// Initiates STK push. Requires JWT (logged-in user).
// Body: { phone, amount, plan }
// plan: 'daily' | 'weekly' | 'monthly'
// ================================================================
router.post('/stkpush', protect, async (req, res) => {
  try {
    let { phone, amount, plan } = req.body;

    // --- Validate ---
    if (!phone || !amount || !plan)
      return res.status(400).json({ error: 'phone, amount and plan are required.' });

    const validPlans = { daily: 120, weekly: 800, monthly: 2500 };
    if (!validPlans[plan])
      return res.status(400).json({ error: 'Invalid plan. Must be daily, weekly or monthly.' });

    // Enforce correct amounts server-side — client cannot lie about price
    amount = validPlans[plan];

    // Normalise phone → 2547XXXXXXXX
    phone = phone.replace(/\s+/g, '').replace(/^\+/, '');
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (!/^254[17]\d{8}$/.test(phone))
      return res.status(400).json({ error: 'Invalid Safaricom number.' });

    const accountRef = ('WTB-' + req.user.email.split('@')[0]).toUpperCase().slice(0, 12);
    const desc       = ('WTB ' + plan).slice(0, 13);

    // --- Call Daraja ---
    const darajaRes = await stkPush({ phone, amount, accountRef, desc });

    if (darajaRes.ResponseCode !== '0')
      return res.status(502).json({ error: darajaRes.ResponseDescription || 'STK push failed.' });

    // --- Persist pending payment record ---
    const payment = await Payment.create({
      userId:            req.user._id,
      email:             req.user.email,
      phone,
      plan,
      amount,
      checkoutRequestId: darajaRes.CheckoutRequestID,
      merchantRequestId: darajaRes.MerchantRequestID,
      status:            'pending',
    });

    res.json({
      success:           true,
      checkoutRequestId: darajaRes.CheckoutRequestID,
      message:           'STK push sent. Enter your M-Pesa PIN.',
    });
  } catch (err) {
    console.error('STK push error FULL:', JSON.stringify(err.response?.data || err.message);
    res.status(500).json({ error: 'Could not initiate payment. Please try again.' });
  }
});

// ================================================================
// POST /mpesa/query
// Frontend polls this every 5s to check payment status.
// Body: { checkoutRequestId }
// ================================================================
router.post('/query', protect, async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;
    if (!checkoutRequestId)
      return res.status(400).json({ error: 'checkoutRequestId required.' });

    // Look up our own record first
    const payment = await Payment.findOne({
      checkoutRequestId,
      userId: req.user._id,       // user can only query their own payments
    });
    if (!payment)
      return res.status(404).json({ error: 'Payment record not found.' });

    // Already confirmed or failed — return cached status
    if (payment.status === 'completed')
      return res.json({ paid: true,  status: 'completed', plan: payment.plan, accessUntil: payment.accessUntil });
    if (['failed','cancelled','timeout'].includes(payment.status))
      return res.json({ paid: false, status: payment.status });

    // --- Still pending: query Daraja ---
    let darajaRes;
    try {
      darajaRes = await stkQuery(checkoutRequestId);
    } catch (err) {
      // Daraja returns a 400-level error if the request is still processing
      const code = err.response?.data?.errorCode;
      if (code === '500.001.1001') {
        // "The transaction is being processed" — still pending
        return res.json({ paid: false, status: 'pending' });
      }
      throw err;
    }

    const rc = String(darajaRes.ResultCode);

    if (rc === '0') {
      // ---- PAYMENT SUCCESSFUL ----
      const expiry = planExpiry(payment.plan);

      await Payment.findByIdAndUpdate(payment._id, {
        status:            'completed',
        mpesaReceiptNumber: darajaRes.MpesaReceiptNumber || null,
        mpesaPhone:         darajaRes.PhoneNumber        || null,
        accessFrom:         new Date(),
        accessUntil:        expiry,
        rawCallback:        darajaRes,
        completedAt:        new Date(),
      });

      // Update user plan
      await User.findByIdAndUpdate(req.user._id, {
        plan:       payment.plan,
        planExpiry: expiry,
      });

      // Send payment confirmation email (non-blocking)
      sendPaymentConfirm({
        name:    req.user.firstName,
        email:   req.user.email,
        plan:    payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1),
        amount:  payment.amount,
        expiry:  expiryLabel(expiry),
        receipt: darajaRes.MpesaReceiptNumber,
      }).catch(e => console.error('Payment email failed:', e.message));

      return res.json({
        paid:        true,
        status:      'completed',
        plan:        payment.plan,
        accessUntil: expiry,
        expiryLabel: expiryLabel(expiry),
      });

    } else if (rc === '1032') {
      // User cancelled
      await Payment.findByIdAndUpdate(payment._id, { status: 'cancelled' });
      return res.json({ paid: false, status: 'cancelled' });

    } else {
      // Any other failure
      await Payment.findByIdAndUpdate(payment._id, { status: 'failed' });
      return res.json({ paid: false, status: 'failed', reason: darajaRes.ResultDesc });
    }

  } catch (err) {
    console.error('STK query error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Query failed. Please try again.' });
  }
});

// ================================================================
// POST /mpesa/callback
// Safaricom posts here automatically after payment completes.
// This is a backup to polling — handles cases where user closes app.
// No auth required (Safaricom calls this, not the user).
// ================================================================
router.post('/callback', async (req, res) => {
  try {
    const body   = req.body?.Body?.stkCallback;
    if (!body) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const checkoutRequestId = body.CheckoutRequestID;
    const rc                = String(body.ResultCode);

    const payment = await Payment.findOne({ checkoutRequestId });
    if (!payment || payment.status === 'completed') {
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (rc === '0') {
      // Extract M-Pesa receipt from CallbackMetadata
      const items   = body.CallbackMetadata?.Item || [];
      const get     = name => items.find(i => i.Name === name)?.Value;
      const receipt = get('MpesaReceiptNumber');
      const phone   = String(get('PhoneNumber') || '');

      const expiry  = planExpiry(payment.plan);

      await Payment.findByIdAndUpdate(payment._id, {
        status:             'completed',
        mpesaReceiptNumber: receipt,
        mpesaPhone:         phone,
        accessFrom:         new Date(),
        accessUntil:        expiry,
        rawCallback:        body,
        completedAt:        new Date(),
      });

      await User.findByIdAndUpdate(payment.userId, {
        plan:       payment.plan,
        planExpiry: expiry,
      });

      const user = await User.findById(payment.userId);
      if (user) {
        sendPaymentConfirm({
          name:    user.firstName,
          email:   user.email,
          plan:    payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1),
          amount:  payment.amount,
          expiry:  expiryLabel(expiry),
          receipt,
        }).catch(e => console.error('Callback email failed:', e.message));
      }
    } else {
      const statusMap = { '1032': 'cancelled' };
      await Payment.findByIdAndUpdate(payment._id, {
        status:      statusMap[rc] || 'failed',
        rawCallback: body,
      });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('Callback error:', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // always 200 to Safaricom
  }
});

module.exports = router;
