// cron-trial : la sauvegarde quotidienne (api/backup-auto.js) part à chaque
// passage, même les jours sans essai gratuit à J+13 — auparavant elle était
// placée après un « return » anticipé et ne tournait jamais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.CRON_SECRET = 'secret-test';
process.env.BREVO_API_KEY = 'brevo-test';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
const { default: handler } = await import('../api/cron-trial.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const req = (jeton) => ({ headers: new Headers(jeton ? { authorization: 'Bearer ' + jeton } : {}) });

test('jour sans essai à J+13 : la sauvegarde est quand même lancée', async () => {
  const appels = [];
  global.fetch = async (url) => {
    const u = String(url);
    appels.push(u);
    if (u.includes('/api/backup-auto')) return { ok: true, status: 200, json: async () => ({ journal: { fichier: 'lokentia-2026-10-09.json' } }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [] };
    throw new Error('URL inattendue ' + u);
  };
  const r = await handler(req('secret-test'));
  const corps = await r.json();
  assert.ok(appels.some(u => u.includes('/api/backup-auto')), 'backup-auto appelée');
  assert.equal(corps.sauvegarde.fichier, 'lokentia-2026-10-09.json');
});

test('sauvegarde en panne : le cron continue ; sans jeton : 401 sans sauvegarde', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/api/backup-auto')) throw new Error('réseau');
    return { ok: true, json: async () => [] };
  };
  const corps = await (await handler(req('secret-test'))).json();
  assert.match(corps.sauvegarde.erreur, /réseau/);
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };
  assert.equal((await handler(req(null))).status, 401);
  assert.equal(appele, false);
});
