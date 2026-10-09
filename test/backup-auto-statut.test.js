// /api/backup-auto?statut=1 : date de la dernière sauvegarde (Réglages ›
// Sauvegarde), sans lancer de nouvelle sauvegarde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.CRON_SECRET = 'secret-test';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
const { default: handler } = await import('../api/backup-auto.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('statut : renvoie la dernière sauvegarde sans exporter les tables', async () => {
  const appels = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    appels.push(u);
    if (u.includes('/storage/v1/object/list/sauvegardes')) {
      return { ok: true, json: async () => [{ name: 'lokentia-2026-10-09.json', created_at: '2026-10-09T08:38:09Z', metadata: { size: 3770485 } }] };
    }
    throw new Error('URL inattendue ' + u);
  };
  const r = await handler({ url: 'https://app.lokentia.fr/api/backup-auto?statut=1', headers: new Headers({ authorization: 'Bearer secret-test' }) });
  const d = await r.json();
  assert.deepEqual(d.derniere, { nom: 'lokentia-2026-10-09.json', date: '2026-10-09T08:38:09Z', poidsKo: 3682 });
  assert.ok(!appels.some(u => u.includes('/rest/v1/')), 'aucune table exportée');
});

test('statut : refusé sans autorisation', async () => {
  global.fetch = async () => ({ ok: false, json: async () => ({}) });
  const r = await handler({ url: 'https://app.lokentia.fr/api/backup-auto?statut=1', headers: new Headers() });
  assert.equal(r.status, 401);
});
