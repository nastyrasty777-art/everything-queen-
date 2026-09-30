// Shared helpers: Upstash Redis over REST, session cookies, JSON bodies.
const crypto = require('crypto');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const COLLECTIONS = ['meta', 'eventsFound', 'plan', 'igPages', 'trending', 'topics', 'log', 'habits'];
const COOKIE = 'eq_session';

function hasKV() { return !!(KV_URL && KV_TOKEN); }

async function redis(cmd) {
  if (!hasKV()) throw Object.assign(new Error('Storage is not connected. Add Upstash Redis to the Vercel project.'), { status: 503 });
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function key(c) { return 'eq:c:' + c; }

async function listDocs(c) {
  const flat = (await redis(['HGETALL', key(c)])) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    try { out.push(Object.assign({ id: flat[i] }, JSON.parse(flat[i + 1]))); } catch (e) {}
  }
  return out;
}
async function getDoc(c, id) {
  const v = await redis(['HGET', key(c), id]);
  return v ? JSON.parse(v) : null;
}
async function setDoc(c, id, data) {
  const clean = Object.assign({}, data); delete clean.id;
  await redis(['HSET', key(c), id, JSON.stringify(clean)]);
  return clean;
}
async function deleteDoc(c, id) { await redis(['HDEL', key(c), id]); }
async function setMany(c, docs) {
  if (!docs.length) return;
  const cmd = ['HSET', key(c)];
  docs.forEach((d) => { const x = Object.assign({}, d); const id = x.id; delete x.id; cmd.push(id, JSON.stringify(x)); });
  await redis(cmd);
}
function newId() { return crypto.randomBytes(10).toString('hex'); }

function secret() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('eq|' + (process.env.APP_PASSWORD || '') + '|' + KV_TOKEN).digest('hex');
}
function sign(v) { return crypto.createHmac('sha256', secret()).update(v).digest('hex'); }
function makeSession() {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 120);
  return exp + '.' + sign(exp);
}
function readCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.split(/;\s*/).find((p) => p.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}
function isAuthed(req) {
  const v = readCookie(req, COOKIE);
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function sessionCookie(value, maxAgeSec) {
  return COOKIE + '=' + encodeURIComponent(value) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAgeSec;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function isCron(req) {
  const s = process.env.CRON_SECRET;
  return !!s && (req.headers.authorization || '') === 'Bearer ' + s;
}

module.exports = { COLLECTIONS, hasKV, redis, listDocs, getDoc, setDoc, deleteDoc, setMany, newId, makeSession, isAuthed, sessionCookie, readBody, send, isCron };
