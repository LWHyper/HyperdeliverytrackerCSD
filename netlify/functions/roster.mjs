/**
 * Shared spreadsheet storage for the CSD Delivery Tracker (Netlify Blobs).
 *
 * GET  /.netlify/functions/roster -> { books: { lindsay: {rows, uploadedAt, uploadedBy, filename}, dowd: {...} } }
 *      any signed in user
 * POST /.netlify/functions/roster -> { book, rows, filename }   rows:null clears the book
 *      admin / connectivity only; uploadedBy comes from the login
 */
import { getStore, connectLambda } from '@netlify/blobs';
import { requireUser, json } from '../lib/auth.mjs';

const BOOKS = ['lindsay', 'dowd'];

export const handler = async (event, context) => {
  const auth = requireUser(event, context, { edit: event.httpMethod !== 'GET' });
  if (auth.response) return auth.response;

  let store;
  try {
    connectLambda(event);
    store = getStore({ name: 'delivery-books', consistency: 'strong' });
  } catch (e) {
    return json(500, { error: 'shared storage unavailable: ' + e.message });
  }

  if (event.httpMethod === 'GET') {
    const books = {};
    for (const key of BOOKS) {
      try {
        const rec = await store.get(key, { type: 'json' });
        if (rec) books[key] = rec;
      } catch { /* missing key */ }
    }
    return json(200, { books });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad JSON body' }); }
    const { book, rows, filename } = body || {};
    if (!BOOKS.includes(book)) return json(400, { error: 'unknown book: ' + book });

    if (rows == null) {
      await store.delete(book);
      return json(200, { ok: true, cleared: book });
    }
    if (!Array.isArray(rows) || !rows.length) return json(400, { error: 'rows must be a non-empty array' });
    if (rows.length > 20000) return json(413, { error: 'too many rows (limit 20000)' });

    await store.setJSON(book, {
      rows,
      count: rows.length,
      filename: filename || '',
      uploadedBy: auth.bypassed ? (body.uploadedBy || '') : (auth.user.name || auth.user.email || ''),
      uploadedAt: new Date().toISOString(),
    });
    return json(200, { ok: true, book, count: rows.length });
  }

  return json(405, { error: 'method not allowed' });
};
