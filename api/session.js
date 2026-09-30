// GET: am I signed in? POST {password}: sign in. DELETE: sign out.
const S = require('../lib/store');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  const status = { kv: S.hasKV(), ai: !!process.env.ANTHROPIC_API_KEY, passwordSet: !!process.env.APP_PASSWORD };
  if (req.method === 'GET') return S.send(res, 200, Object.assign({ authed: S.isAuthed(req) }, status));
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', S.sessionCookie('', 0)); return S.send(res, 200, { authed: false }); }
  if (req.method !== 'POST') return S.send(res, 405, { error: 'Method not allowed' });
  const want = process.env.APP_PASSWORD || '';
  if (!want) return S.send(res, 503, Object.assign({ error: 'No password is set yet. Add APP_PASSWORD in the Vercel project settings.' }, status));
  const { password } = await S.readBody(req);
  const a = crypto.createHash('sha256').update(String(password || '')).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  if (!crypto.timingSafeEqual(a, b)) { await new Promise((r) => setTimeout(r, 600)); return S.send(res, 401, { error: 'That password is not right.' }); }
  res.setHeader('Set-Cookie', S.sessionCookie(S.makeSession(), 60 * 60 * 24 * 120));
  return S.send(res, 200, Object.assign({ authed: true }, status));
};
