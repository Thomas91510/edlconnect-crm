// backup-auto : une sauvegarde incomplète déclenche un email d'alerte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.CRON_SECRET = 'secret-test';
process.env.BREVO_API_KEY = 'brevo-test';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
const { default: handler } = await import('../api/backup-auto.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('table illisible : sauvegarde écrite quand même + alerte envoyée', async () => {
  let alerte = null;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/contacts')) return { ok: false, status: 500, text: async () => 'panne' };
    if (u.includes('/rest/v1/')) return { ok: true, json: async () => [] };
    if (u.includes('/storage/v1/object/list/')) return { ok: true, json: async () => [] };
    if (u.includes('/storage/v1/object/')) return { ok: true };
    if (u.includes('api.brevo.com')) { alerte = JSON.parse(opts.body); return { ok: true }; }
    return { ok: true, json: async () => ({}) };
  };
  const r = await handler(new Request('https://app.lokentia.fr/api/backup-auto', { headers: { authorization: 'Bearer secret-test' } }));
  assert.equal(r.status, 200);
  assert.ok(alerte, 'alerte envoyée');
  assert.match(alerte.subject, /incomplète/);
  assert.match(alerte.htmlContent, /contacts/);
});
