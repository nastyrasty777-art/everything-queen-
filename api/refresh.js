// Runs a feed. Vercel Cron calls GET /api/refresh?what=tea|events with the CRON_SECRET;
// the page's "Refresh now" buttons call POST with a signed-in session.
const S = require('../lib/store');
const F = require('../lib/feeds');

module.exports = async function handler(req, res) {
  if (!S.isCron(req) && !S.isAuthed(req)) return S.send(res, 401, { error: 'Sign in first.' });
  const what = (req.query && req.query.what) || '';
  try {
    if (what === 'tea') return S.send(res, 200, await F.refreshTea());
    if (what === 'events') return S.send(res, 200, await F.refreshEvents());
    return S.send(res, 400, { error: 'Say what to refresh: tea or events.' });
  } catch (e) {
    return S.send(res, e.status || 500, { error: e.message || 'Refresh failed.' });
  }
};
