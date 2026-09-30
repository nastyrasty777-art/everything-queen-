// Daily feeds, run by Vercel Cron or the "Refresh now" buttons.
// Each uses the Claude API with web search. Needs ANTHROPIC_API_KEY in the Vercel project.
const S = require('./store');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function askClaude(prompt, maxSearches) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error('Add ANTHROPIC_API_KEY in Vercel to turn on automatic headlines and event search.'), { status: 503 });
  let messages = [{ role: 'user', content: prompt }];
  let text = '';
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8000, messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Claude API error ' + r.status);
    text += (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (j.stop_reason !== 'pause_turn') break;
    messages = messages.concat([{ role: 'assistant', content: j.content }]);
  }
  return text;
}
function parseArray(text) {
  const t = String(text).replace(/```json|```/g, '');
  const start = t.lastIndexOf('[{') >= 0 ? t.lastIndexOf('[{') : t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try { const a = JSON.parse(t.slice(start, end + 1)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120); }
function httpUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
function todayUTC() { return new Date().toISOString().slice(0, 10); }

const TEA_CATS = ['reality','beef','influencer','cancel','relationship','money','culture','career','excellence','community'];

async function refreshTea() {
  const today = todayUTC();
  const prompt = `You are filling the "Trending" feed for Queen E, host of The Reality Recap podcast (celebrity gossip, reality TV and social media drama for a young Black women audience).
Find today's (${today}) real headlines from The Shade Room (theshaderoom.com), Page Six (pagesix.com), Bossip (bossip.com), Baller Alert (balleralert.com) and ET Online (etonline.com). Favor stories about Black celebrities and culture where relevant, without forcing it.
Never invent a headline or URL. Only include items you actually found, each with its real article URL. Aim for 15-25 items total.
Return ONLY a JSON array, no prose, like:
[{"title":"headline, lightly tidied but faithful","summary":"one short sentence in your own words","category":"one of ${TEA_CATS.join(', ')}","sourceName":"The Shade Room","sourceUrl":"https://..."}]`;
  const items = parseArray(await askClaude(prompt, 12));
  const now = new Date().toISOString();
  const day = today.replace(/-/g, '');
  const existing = await S.listDocs('trending');
  const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  await Promise.all(existing.filter((d) => (d.dateKey || '') < cutoff).map((d) => S.deleteDoc('trending', d.id)));
  const taken = new Set(existing.map((d) => d.id));
  let n = 1;
  const docs = [];
  items.filter((i) => i && i.title).forEach((i) => {
    while (taken.has(day + '-' + String(n).padStart(2, '0'))) n++;
    const id = day + '-' + String(n).padStart(2, '0'); taken.add(id);
    docs.push({ id, title: String(i.title).slice(0, 300), summary: String(i.summary || '').slice(0, 400), category: TEA_CATS.includes(i.category) ? i.category : 'community', sourceName: String(i.sourceName || '').slice(0, 60), sourceUrl: httpUrl(i.sourceUrl), dateKey: today, pulledAt: now });
  });
  await S.setMany('trending', docs);
  await S.setDoc('meta', 'teaRun', { at: now, added: docs.length });
  return { added: docs.length };
}

const EV_CATS = {
  influencer: 'influencer and content creator events, creator meetups, brand activations, pop-ups and launch parties',
  networking: 'entertainment industry networking mixers, panels and professional events',
  reality: 'reality TV networking events, reality star appearances, casting mixers, unscripted TV industry panels and parties',
  film: 'movie premieres, red carpet screenings and film festival events',
  tv: 'TV and streaming series premieres, screenings and FYC events',
  black: 'Black LA socialite events, galas, brunches, day parties, Black Hollywood industry events and Black-owned business social events',
  sources: '',
};

function monthsToCover() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 3; i++) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)); out.push({ key: d.toISOString().slice(0, 7), name: MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() }); }
  if (now < new Date(Date.UTC(2026, 11, 1)) && !out.some((m) => m.key === '2026-11')) out.push({ key: '2026-11', name: 'November 2026' });
  return out;
}

async function searchCategory(cat, months, handles) {
  const what = cat === 'sources'
    ? `events hosted or promoted by these Los Angeles organizers: ${handles.map((h) => '@' + h).join(', ')}. Instagram can't be read, so search each handle and brand name on Eventbrite, Posh, Partiful, Linktree, their own websites and local listings`
    : EV_CATS[cat];
  const prompt = `Search the web for ${what} in Los Angeles (Hollywood, West Hollywood, Beverly Hills, Downtown LA, Culver City, Inglewood, Santa Monica and nearby) during ${months.map((m) => m.name).join(', ')}.
Prefer pages a person can act on: ticket or RSVP pages, Eventbrite, Partiful, Posh, organizer or studio sites. Invite-only events are fine but mark them.
Only include events you found real evidence for. Never invent an event, date, venue or link. Up to 6 per month; fewer is fine.
Return ONLY a JSON array, no prose:
[{"title":"","date":"YYYY-MM-DD or empty","dateText":"how the date was described","time":"","venue":"","area":"neighborhood","access":"Tickets|RSVP|Invite-only|Public|Unknown","price":"","url":"https://...","why":"one short sentence in your own words","organizer":"IG handle without @ if from the organizer list, else empty","month":"YYYY-MM"}]`;
  return parseArray(await askClaude(prompt, 8)).map((e) => Object.assign(e, { category: cat }));
}

async function refreshEvents() {
  const months = monthsToCover();
  const handles = (await S.listDocs('igPages')).map((p) => p.handle).filter(Boolean);
  const cats = Object.keys(EV_CATS).filter((c) => c !== 'sources' || handles.length);
  const results = await Promise.allSettled(cats.map((c) => searchCategory(c, months, handles)));
  const now = new Date().toISOString();
  const valid = new Set(months.map((m) => m.key));
  const docs = [];
  results.forEach((r) => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach((e) => {
      if (!e || !e.title) return;
      const month = /^\d{4}-\d{2}$/.test(e.month || '') ? e.month : String(e.date || '').slice(0, 7);
      if (!valid.has(month)) return;
      docs.push({
        id: slug(month + '-' + e.category + '-' + e.title),
        title: String(e.title).slice(0, 200), date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : '', dateText: String(e.dateText || '').slice(0, 80),
        time: String(e.time || '').slice(0, 40), venue: String(e.venue || '').slice(0, 120), area: String(e.area || '').slice(0, 60),
        access: String(e.access || 'Unknown').slice(0, 20), price: String(e.price || '').slice(0, 40), url: httpUrl(e.url),
        why: String(e.why || '').slice(0, 300), category: e.category, organizer: String(e.organizer || '').replace(/^@/, '').slice(0, 60), month, pulledAt: now,
      });
    });
  });
  const thisMonth = months[0].key;
  const old = (await S.listDocs('eventsFound')).filter((d) => (d.month || '') < thisMonth);
  await Promise.all(old.map((d) => S.deleteDoc('eventsFound', d.id)));
  await S.setMany('eventsFound', docs);
  const failed = results.filter((r) => r.status === 'rejected').length;
  await S.setDoc('meta', 'eventsRun', { at: now, added: docs.length, failedCategories: failed });
  return { added: docs.length, failedCategories: failed };
}

module.exports = { refreshTea, refreshEvents };
