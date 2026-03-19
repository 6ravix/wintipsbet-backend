const axios = require('axios');
const https = require('https');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const LIVE_BASE    = 'https://api.safaricom.co.ke';

function base() {
  return process.env.MPESA_ENV === 'production' ? LIVE_BASE : SANDBOX_BASE;
}

let _token = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64');

  const response = await axios.get(
    `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization:   `Basic ${creds}`,
        'Cache-Control': 'no-cache',
        'Pragma':        'no-cache',
      },
      httpsAgent: new https.Agent({ keepAlive: false }),
    }
  );

  console.log('Token response status:', response.status);
  console.log('Token response data:', JSON.stringify(response.data));

  _token       = response.data.access_token;
  _tokenExpiry = Date.now() + (Number(response.data.expires_in) - 30) * 1000;
  return _token;
}

function buildPassword(timestamp) {
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
}

async function stkPush({ phone, amount, accountRef, desc }) {
  const token = await getAccessToken();
  const ts    = timestamp();
  const pwd   = buildPassword(ts);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          pwd,
    Timestamp:         ts,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),
    PartyA:            phone,
    PartyB:            process.env.MPESA_SHORTCODE,
    PhoneNumber:       phone,
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  accountRef.slice(0, 12),
    TransactionDesc:   desc.slice(0, 13),
  };

  const { data } = await axios.post(
    `${base()}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

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

module.exports = { getAccessToken, stkPush, stkQuery };
