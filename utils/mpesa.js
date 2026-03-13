/**
 * mpesa.js — Safaricom Daraja API v2
 * Handles: OAuth token, STK Push initiation, STK Query
 */

const axios = require('axios');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const LIVE_BASE    = 'https://api.safaricom.co.ke';

function base() {
  return process.env.MPESA_ENV === 'production' ? LIVE_BASE : SANDBOX_BASE;
}

// ---- Cache token to avoid re-fetching every request ----
let _token = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64');

  const { data } = await axios.get(
    `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` } }
  );

  _token       = data.access_token;
  _tokenExpiry = Date.now() + (Number(data.expires_in) - 30) * 1000;
  return _token;
}

// ---- Build Lipa Na M-Pesa password (base64 of shortcode+passkey+timestamp) ----
function buildPassword(timestamp) {
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);          // YYYYMMDDHHmmss
}

/**
 * Initiate STK Push (Lipa Na M-Pesa Online)
 * @param {string} phone      - Safaricom number in 2547XXXXXXXX format
 * @param {number} amount     - Amount in KES (integer)
 * @param {string} accountRef - e.g. "WTB-USERNAME"
 * @param {string} desc       - Transaction description
 * @returns {object}          - Daraja response {MerchantRequestID, CheckoutRequestID, ...}
 */
async function stkPush({ phone, amount, accountRef, desc }) {
  const token = await getAccessToken();
  const ts    = timestamp();
  const pwd   = buildPassword(ts);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          pwd,
    Timestamp:         ts,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),   // must be integer
    PartyA:            phone,
    PartyB:            process.env.MPESA_SHORTCODE,
    PhoneNumber:       phone,
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  accountRef.slice(0, 12), // Daraja max 12 chars
    TransactionDesc:   desc.slice(0, 13),        // Daraja max 13 chars
  };

  const { data } = await axios.post(
    `${base()}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

/**
 * Query STK Push status
 * @param {string} checkoutRequestId
 * @returns {object} Daraja query response
 */
async function stkQuery(checkoutRequestId) {
  const token = await getAccessToken();
  const ts    = timestamp();
  const pwd   = buildPassword(ts);

  const { data } = await axios.post(
    `${base()}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password:          pwd,
      Timestamp:         ts,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

module.exports = { stkPush, stkQuery };
