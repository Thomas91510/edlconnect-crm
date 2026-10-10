// cron-trial : chien de garde de la sauvegarde quotidienne (qui a son propre
// cron). Sauvegarde récente → rien à faire ; trop ancienne ou absente → il
// la relance ; relance en échec → email d'alerte à l'exploitant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.CRON_SECRET = 'secret-test';
process.env.BREVO_API_KEY = 'brevo-test';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
const { default: handler, verifierSauvegarde } = await import('../api/cron-trial.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const req = (jeton) => ({ headers: new Headers(jeton ? { authorization: 'Bearer ' + jeton } : {}) });
const MAINTENANT = new Date('2026-10-10T08:00:00Z').getTime();

function mock({ derniere, relance, relanceErreur }) {
  const appels = { relance: 0, alerte: null };
  const fn = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/api/backup-auto?statut=1')) return { ok: true, json: async () => ({ derniere }) };
    if (u.includes('/api/backup-auto')) {
      appels.relance++;
      if (relanceErreur) throw new Error(relanceErreur);
      return { ok: true, status: 200, json: async () => ({ journal: relance }) };
    }
    if (u.includes('api.brevo.com')) { appels.alerte = JSON.parse(opts.body); return { ok: true }; }
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [] };
    throw new Error('URL inattendue ' + u);
  };
  return { fn, appels };
}

test('sauvegarde de la nuit présente : pas de relance ni d’alerte', async () => {
  const { fn, appels } = mock({ derniere: { nom: 'lokentia-2026-10-10.json', date: '2026-10-10T02:03:00Z' } });
  const r = await verifierSauvegarde(fn, MAINTENANT);
  assert.equal(r.aJour, true);
  assert.equal(appels.relance, 0);
  assert.equal(appels.alerte, null);
});

test('sauvegarde trop ancienne : relancée, sans alerte si la relance réussit', async () => {
  const { fn, appels } = mock({ derniere: { nom: 'lokentia-2026-10-08.json', date: '2026-10-08T02:00:00Z' }, relance: { fichier: 'lokentia-2026-10-10.json', erreurs: [] } });
  const r = await verifierSauvegarde(fn, MAINTENANT);
  assert.equal(r.aJour, false);
  assert.equal(appels.relance, 1);
  assert.equal(appels.alerte, null);
});

test('aucune sauvegarde et relance en panne : email d’alerte à l’exploitant', async () => {
  const { fn, appels } = mock({ derniere: null, relanceErreur: 'délai dépassé' });
  await verifierSauvegarde(fn, MAINTENANT);
  assert.equal(appels.alerte.to[0].email, 'contact@edl-idf.com');
  assert.match(appels.alerte.htmlContent, /délai dépassé/);
});

test('le cron continue malgré tout ; sans jeton : 401 sans rien appeler', async () => {
  global.fetch = mock({ derniere: { nom: 'x', date: new Date().toISOString() } }).fn;
  const r = await handler(req('secret-test'));
  assert.notEqual(r.status, 401);
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };
  assert.equal((await handler(req(null))).status, 401);
  assert.equal(appele, false);
});
