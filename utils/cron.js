/**
 * cron.js
 * All jobs run on Africa/Nairobi time (EAT = UTC+3).
 *
 * Jobs:
 *   00:01 EAT  — expire stale plans in DB
 *   00:02 EAT  — refresh games from API (slot ready, API plugged in later)
 *   21:00 EAT  — send expiry reminder emails (3hrs before midnight)
 *   06:00 EAT  — daily admin summary
 */

const cron    = require('node-cron');
const User    = require('../models/User');
const Payment = require('../models/Payment');
const { sendExpiryReminder } = require('./email');

// node-cron uses server local time; we run the server in EAT (set TZ=Africa/Nairobi)
// All cron expressions below are EAT.

function startCron() {

  // ----------------------------------------------------------------
  // 00:01 EAT — expire stale subscriptions
  // ----------------------------------------------------------------
  cron.schedule('1 0 * * *', async () => {
    console.log('[CRON] Running plan expiry sweep...');
    try {
      const now    = new Date();
      const result = await User.updateMany(
        { plan: { $ne: 'none' }, planExpiry: { $lt: now } },
        { $set: { plan: 'none', planExpiry: null } }
      );
      console.log(`[CRON] Expired ${result.modifiedCount} plan(s).`);
    } catch (err) {
      console.error('[CRON] Plan expiry error:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });


  // ----------------------------------------------------------------
  // 00:02 EAT — refresh games from API
  // Slot is ready. When you plug in the games API:
  //   1. npm install your API client
  //   2. Write utils/gamesApi.js with fetchFootball() and fetchBasketball()
  //   3. Uncomment the block below
  // ----------------------------------------------------------------
  cron.schedule('2 0 * * *', async () => {
    console.log('[CRON] Games refresh slot running...');
    try {
      // ---- UNCOMMENT WHEN GAMES API IS READY ----
      //
      // const { fetchFootball, fetchBasketball } = require('./gamesApi');
      //
      // const [football, basketball] = await Promise.all([
      //   fetchFootball(),
      //   fetchBasketball(),
      // ]);
      //
      // // Write to DB (Game model — add when ready)
      // await Game.deleteMany({ date: today() });
      // await Game.insertMany([...football, ...basketball]);
      //
      // console.log(`[CRON] Games refreshed: ${football.length} football, ${basketball.length} basketball`);
      //
      // Optionally broadcast via WebSocket / SSE so open browser tabs update live:
      // global.io?.emit('games:refreshed', { date: today() });

      console.log('[CRON] Games API not yet connected — skipping refresh.');
    } catch (err) {
      console.error('[CRON] Games refresh error:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });


  // ----------------------------------------------------------------
  // 21:00 EAT — send expiry reminder to plans expiring tonight
  // ----------------------------------------------------------------
  cron.schedule('0 21 * * *', async () => {
    console.log('[CRON] Sending expiry reminders...');
    try {
      const now         = new Date();
      // "expiring tonight" = planExpiry is between now and next midnight EAT
      const midnightEAT = new Date(now);
      midnightEAT.setUTCHours(21, 0, 0, 0); // 00:00 EAT = 21:00 UTC previous day
      // Simpler: just find plans that expire within the next 4 hours
      const cutoff = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      const users = await User.find({
        plan:       { $ne: 'none' },
        planExpiry: { $gt: now, $lt: cutoff },
      });

      console.log(`[CRON] Found ${users.length} expiring plan(s).`);
      for (const user of users) {
        sendExpiryReminder({
          name:   user.firstName,
          email:  user.email,
          plan:   user.plan,
          expiry: user.planExpiry?.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
        }).catch(e => console.error(`[CRON] Reminder failed for ${user.email}:`, e.message));
      }
    } catch (err) {
      console.error('[CRON] Reminder sweep error:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });


  // ----------------------------------------------------------------
  // 06:00 EAT — daily admin summary log
  // ----------------------------------------------------------------
  cron.schedule('0 6 * * *', async () => {
    try {
      const now       = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [newUsers, payments, activeUsers] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: yesterday } }),
        Payment.find({ status: 'completed', completedAt: { $gte: yesterday } }),
        User.countDocuments({ plan: { $ne: 'none' }, planExpiry: { $gt: now } }),
      ]);
      const revenue = payments.reduce((s, p) => s + p.amount, 0);
      console.log(`[ADMIN] Daily summary — New users: ${newUsers} | Payments: ${payments.length} | Revenue: KSh ${revenue} | Active subs: ${activeUsers}`);
    } catch (err) {
      console.error('[CRON] Admin summary error:', err.message);
    }
  }, { timezone: 'Africa/Nairobi' });


  console.log('✅ Cron jobs scheduled (timezone: Africa/Nairobi)');
}

module.exports = { startCron };
