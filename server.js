/**
 * WinTipsBet Backend — server.js
 * Run:  node server.js  (or: npm run dev  with nodemon)
 * Env:  copy .env.example → .env and fill in values
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const connectDB  = require('./config/db');
const { startCron } = require('./utils/cron');

// ---- Routes ----
const authRoutes         = require('./routes/auth');
const mpesaRoutes        = require('./routes/mpesa');
const subscriptionRoutes = require('./routes/subscription');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS — only allow your frontend
const allowedOrigins = [
  'https://www.wintipsbet.com',
  'https://wintipsbet.com',
  process.env.FRONTEND_URL,
  // Allow localhost for dev
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, mobile apps, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));

// ----------------------------------------------------------------
// Rate limiting
// ----------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      200,
  message:  { error: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { error: 'Too many auth attempts. Please wait 15 minutes.' },
});
const stkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      5,
  message:  { error: 'Too many payment requests. Please wait a minute.' },
});

app.use(globalLimiter);

// ================================================================
// HEALTH CHECK
// ================================================================
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'WinTipsBet API',
    time:    new Date().toISOString(),
    env:     process.env.NODE_ENV,
  });
});

// ================================================================
// ROUTES
// ================================================================
app.use('/auth',         authLimiter, authRoutes);
app.use('/mpesa',        stkLimiter,  mpesaRoutes);
app.use('/subscription', subscriptionRoutes);

// ================================================================
// 404
// ================================================================
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ================================================================
// GLOBAL ERROR HANDLER
// ================================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again.'
      : err.message,
  });
});

// ================================================================
// START
// ================================================================
async function start() {
  await connectDB();
  startCron();
  app.listen(PORT, () => {
    console.log(`\n🚀 WinTipsBet API running on port ${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV}`);
    console.log(`   Frontend    : ${process.env.FRONTEND_URL}`);
    console.log(`   Health      : http://localhost:${PORT}/health\n`);
  });
}

start();
