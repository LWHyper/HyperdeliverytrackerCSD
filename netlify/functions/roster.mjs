/**
 * Shared spreadsheet storage for the CSD Delivery Tracker.
 *
 * GET  /api/roster  → { books: { lindsay: {rows, uploadedAt, uploadedBy, filename}, dowd: {...} } }
 * POST /api/roster  → { book, rows, filename, uploadedBy }   rows:null clears the book
 *
 * Uses Netlify Blobs, so an upload by anyone on the delivery team is what
 * everyone else sees. Requires a Git-connected deploy (npm install runs).
 */
import { getStore } from '@netlify/blobs';

const BOOKS = ['lindsay', 'dowd'];
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export default async (req) => {
  let store;
  try {
    store = getStore({ name: 'delivery-books', consistency: 'strong' });
  } catch (e) {
    return json({ error: 'shared storage unavailable: ' + e.message }, 500);
  }

  if (req.method === 'GET') {
    const books = {};
    for (const key of BOOKS) {
      try {
        const rec = await store.get(key, { type: 'json' });
        if (rec) books[key] = rec;
      } catch { /* missing key */ }
    }
    return json({ books });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad JSON body' }, 400); }
    const { book, rows, filename, uploadedBy } = body || {};
    if (!BOOKS.includes(book)) return json({ error: 'unknown book: ' + book }, 400);

    if (rows == null) {
      await store.delete(book);
      return json({ ok: true, cleared: book });
    }
    if (!Array.isArray(rows) || !rows.length) return json({ error: 'rows must be a non-empty array' }, 400);
    if (rows.length > 20000) return json({ error: 'too many rows (limit 20000)' }, 413);

    await store.setJSON(book, {
      rows,
      count: rows.length,
      filename: filename || '',
      uploadedBy: uploadedBy || '',
      uploadedAt: new Date().toISOString(),
    });
    return json({ ok: true, book, count: rows.length });
  }

  return json({ error: 'method not allowed' }, 405);
};

export const config = { path: '/api/roster' };
