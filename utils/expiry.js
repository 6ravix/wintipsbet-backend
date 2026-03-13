/**
 * expiry.js
 * All plan expiries expire at MIDNIGHT (00:00:00.000) at the end of
 * the respective timeline — not 24/48/720 hours from now.
 *
 * Timezone: Africa/Nairobi (EAT = UTC+3)
 */

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3

/**
 * Return midnight EAT as a UTC Date object, N days from today.
 * "midnight at the end of day N" means the start of day N+1 in Nairobi.
 *
 * e.g. planExpiry('daily')   → midnight tonight Nairobi
 *      planExpiry('weekly')  → midnight 7 days from now Nairobi
 *      planExpiry('monthly') → midnight last day of the month Nairobi
 */
function planExpiry(plan) {
  const nowUTC   = Date.now();
  const nowEAT   = new Date(nowUTC + NAIROBI_OFFSET_MS);

  // Midnight EAT = start of next day in Nairobi expressed as UTC
  function midnightEAT(daysFromNow) {
    const d = new Date(nowEAT);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(0, 0, 0, 0);            // midnight in "fake local" (EAT)
    return new Date(d.getTime() - NAIROBI_OFFSET_MS); // back to real UTC
  }

  switch (plan) {
    case 'daily':
      // Expires at midnight tonight (end of today EAT)
      return midnightEAT(1);

    case 'weekly':
      // Expires at midnight 7 days from now
      return midnightEAT(7);

    case 'monthly': {
      // Expires at midnight on the last day of the calendar month
      const eatNow  = new Date(nowEAT);
      const year    = eatNow.getFullYear();
      const month   = eatNow.getMonth();          // 0-indexed
      // First day of NEXT month = last midnight of this month
      const lastDay = new Date(year, month + 1, 1, 0, 0, 0, 0);
      return new Date(lastDay.getTime() - NAIROBI_OFFSET_MS);
    }

    default:
      return midnightEAT(1);
  }
}

/**
 * Human-readable label for plan expiry (used in emails & API responses).
 */
function expiryLabel(expiryDate) {
  if (!expiryDate) return 'N/A';
  // Convert UTC → EAT for display
  const eat = new Date(expiryDate.getTime() + NAIROBI_OFFSET_MS);
  return eat.toLocaleString('en-KE', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' EAT';
}

module.exports = { planExpiry, expiryLabel };
