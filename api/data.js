// Private data API. GET ?c=plan lists a collection (or ?all=1 for everything).
// POST {c, id?, data, merge?} writes one doc; POST {c, docs:[...]} writes many. DELETE ?c=plan&id=x removes one.
const S = require('../lib/store');

module.exports = async function handler(req, res) {
  if (!S.isAuthed(req)) return S.send(res, 401, { error: 'Sign in first.' });
  try {
    const q = req.query || {};
    if (req.method === 'GET') {
      if (q.all) {
        const out = {};
        await Promise.all(S.COLLECTIONS.map(async (c) => { out[c] = await S.listDocs(c); }));
        return S.send(res, 200, { collections: out });
      }
      if (!S.COLLECTIONS.includes(q.c)) return S.send(res, 400, { error: 'Unknown collection.' });
      return S.send(res, 200, { docs: await S.listDocs(q.c) });
    }
    if (req.method === 'POST') {
      const b = await S.readBody(req);
      if (!S.COLLECTIONS.includes(b.c)) return S.send(res, 400, { error: 'Unknown collection.' });
      if (Array.isArray(b.docs)) {
        const docs = b.docs.filter((d) => d && d.id).slice(0, 500);
        await S.setMany(b.c, docs);
        return S.send(res, 200, { written: docs.length });
      }
      if (!b.data || typeof b.data !== 'object') return S.send(res, 400, { error: 'Nothing to save.' });
      const id = String(b.id || S.newId()).slice(0, 200);
      let data = b.data;
      if (b.merge) data = Object.assign({}, (await S.getDoc(b.c, id)) || {}, b.data);
      const saved = await S.setDoc(b.c, id, data);
      return S.send(res, 200, { id, data: saved });
    }
    if (req.method === 'DELETE') {
      if (!S.COLLECTIONS.includes(q.c) || !q.id) return S.send(res, 400, { error: 'Say which item to delete.' });
      await S.deleteDoc(q.c, String(q.id));
      return S.send(res, 200, { deleted: q.id });
    }
    return S.send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return S.send(res, e.status || 500, { error: e.message || 'Something went wrong.' });
  }
};
