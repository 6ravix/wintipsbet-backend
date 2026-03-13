const nodemailer = require('nodemailer');

let _transporter = null;

function transporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

// ---- Shared header/footer for HTML emails ----
function wrap(body) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#0a0e1a;color:#e2e8f0;margin:0;padding:0;}
  .container{max-width:560px;margin:32px auto;background:#111827;border:1px solid #1e2d45;border-radius:10px;overflow:hidden;}
  .hdr{background:linear-gradient(135deg,#0d2818,#16a34a);padding:28px 32px;text-align:center;}
  .logo{font-size:28px;font-weight:900;color:#22c55e;letter-spacing:1px;text-transform:uppercase;}
  .logo em{color:#f97316;font-style:normal;}
  .body{padding:28px 32px;}
  h2{color:#22c55e;margin:0 0 16px;font-size:20px;}
  p{color:#94a3b8;line-height:1.7;margin:0 0 14px;font-size:14px;}
  .btn{display:inline-block;background:#16a34a;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;margin:12px 0;}
  .box{background:#1a2235;border:1px solid #1e2d45;border-radius:8px;padding:16px;margin:16px 0;}
  .box-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e2d45;font-size:13px;}
  .box-row:last-child{border-bottom:none;}
  .lbl{color:#64748b;}
  .val{color:#e2e8f0;font-weight:600;}
  .val-g{color:#22c55e;font-weight:700;}
  .ftr{padding:16px 32px;border-top:1px solid #1e2d45;text-align:center;font-size:11px;color:#475569;}
  .ftr a{color:#22c55e;}
  .warn{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:12px;font-size:12px;color:#94a3b8;margin-top:16px;}
</style>
</head>
<body>
<div class="container">
  <div class="hdr"><div class="logo">WinTips<em>Bet</em></div></div>
  <div class="body">${body}</div>
  <div class="ftr">
    &copy; 2026 WinTipsBet by RezOdds &bull; <a href="https://www.wintipsbet.com">wintipsbet.com</a><br>
    Follow us: <a href="https://x.com/Rezodds">Twitter</a> &bull;
    <a href="https://t.me/RezOdds">Telegram</a> &bull;
    <a href="https://whatsapp.com/channel/0029VaNMebW2v1J1c06cyU0J">WhatsApp</a><br><br>
    <span style="color:#334155">&#x26A0; Gambling can be addictive. 18+ only. BeGambleAware.org</span>
  </div>
</div>
</body>
</html>`;
}

// ---- 1. Welcome email on registration ----
async function sendWelcome({ name, email }) {
  await transporter().sendMail({
    from:    process.env.EMAIL_FROM,
    to:      email,
    subject: '🎉 Welcome to WinTipsBet!',
    html: wrap(`
      <h2>Welcome, ${name}! 🎉</h2>
      <p>Your WinTipsBet account has been created successfully.
         You now have access to <strong>15 free football predictions</strong>
         and <strong>15 free basketball predictions</strong> every day.</p>
      <p>Ready to unlock premium picks with a 76%+ win rate?</p>
      <a class="btn" href="https://www.wintipsbet.com">View Today's Picks →</a>
      <div class="box">
        <div class="box-row"><span class="lbl">Account</span><span class="val">${email}</span></div>
        <div class="box-row"><span class="lbl">Free picks</span><span class="val-g">15 football + 15 basketball / day</span></div>
        <div class="box-row"><span class="lbl">Premium from</span><span class="val">KSh 120/day</span></div>
      </div>
      <p>Follow us for live tips:</p>
      <p>
        <a href="https://t.me/RezOdds" style="color:#22c55e">📨 Telegram @RezOdds</a> &bull;
        <a href="https://x.com/Rezodds" style="color:#22c55e">🐦 Twitter @Rezodds</a>
      </p>
      <div class="warn">⚠️ Gambling involves risk. Only bet what you can afford to lose. 18+ only.</div>
    `),
  });
}

// ---- 2. Payment confirmation ----
async function sendPaymentConfirm({ name, email, plan, amount, expiry, receipt }) {
  await transporter().sendMail({
    from:    process.env.EMAIL_FROM,
    to:      email,
    subject: '✅ WinTipsBet — Payment Confirmed',
    html: wrap(`
      <h2>Payment Confirmed! ✅</h2>
      <p>Your <strong>${plan}</strong> subscription is now active.
         All premium picks are unlocked until midnight at the end of your plan.</p>
      <a class="btn" href="https://www.wintipsbet.com">View Premium Picks →</a>
      <div class="box">
        <div class="box-row"><span class="lbl">Plan</span><span class="val-g">${plan}</span></div>
        <div class="box-row"><span class="lbl">Amount Paid</span><span class="val">KSh ${amount}</span></div>
        <div class="box-row"><span class="lbl">M-Pesa Receipt</span><span class="val">${receipt || 'N/A'}</span></div>
        <div class="box-row"><span class="lbl">Access Until</span><span class="val-g">${expiry}</span></div>
      </div>
      <p>Join our VIP Telegram for live alerts:
         <a href="https://t.me/RezOdds" style="color:#22c55e">t.me/RezOdds</a></p>
      <div class="warn">⚠️ Past performance does not guarantee future results. Gamble responsibly. 18+ only.</div>
    `),
  });
}

// ---- 3. Subscription expiry reminder (called by cron) ----
async function sendExpiryReminder({ name, email, plan, expiry }) {
  await transporter().sendMail({
    from:    process.env.EMAIL_FROM,
    to:      email,
    subject: '⏰ WinTipsBet — Your plan expires tonight',
    html: wrap(`
      <h2>Your plan expires tonight ⏰</h2>
      <p>Your <strong>${plan}</strong> plan expires at midnight tonight (${expiry}).</p>
      <p>Renew now to keep access to all premium picks.</p>
      <a class="btn" href="https://www.wintipsbet.com">Renew Subscription →</a>
      <div class="warn">⚠️ Gamble responsibly. 18+ only.</div>
    `),
  });
}

module.exports = { sendWelcome, sendPaymentConfirm, sendExpiryReminder };
