// Liste des comptes de l'onglet Plateforme : réservée à l'admin, construite
// depuis Supabase Auth (comptes sans plan compris), agences classées à part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
const { default: handler, classerCompte } = await import('../api/admin-comptes.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const req = () => ({ method: 'GET', headers: new Headers({ authorization: 'Bearer t' }) });
const futur = new Date(Date.now() + 86400000).toISOString();

function mock(appelant = 'contact@edl-idf.com') {
  global.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'a1', email: appelant }) };
    if (u.includes('/auth/v1/admin/users?')) return { ok: true, json: async () => ({ users: [
      { id: 'abo', email: 'abo@x.fr', created_at: '2026-07-01' },
      { id: 'agm', email: 'marquee@agence.fr', created_at: '2026-07-02' },
      { id: 'agn', email: 'Client@Agence.fr', created_at: '2026-07-03', last_sign_in_at: '2026-09-30' },
      { id: 'inc', email: 'inconnu@x.fr', created_at: '2026-07-04', banned_until: futur },
    ] }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [
      { user_id: 'abo', email: 'abo@x.fr', plan: 'pro', status: 'active', role: 'expert' },
      { user_id: 'agm', email: 'marquee@agence.fr', plan: 'free', status: 'active', role: 'agence' },
    ] };
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ user_id: 'abo' }] };
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => (u.includes('client@agence.fr') ? [{ id: 1 }] : []) };
    throw new Error('URL inattendue ' + u);
  };
}

test('refusé à un compte non admin', async () => {
  mock('abo@x.fr');
  assert.equal((await handler(req())).status, 403);
});

test('classement : abonné, agence marquée, agence client, compte sans plan inconnu', async () => {
  mock();
  const r = await handler(req());
  assert.equal(r.status, 200);
  const { comptes } = await r.json();
  const par = Object.fromEntries(comptes.map(c => [c.user_id, c]));
  assert.equal(par.abo.type, 'abonne');
  assert.equal(par.agm.type, 'agence');
  assert.equal(par.agn.type, 'agence');
  assert.equal(par.agn.email, 'client@agence.fr');
  assert.equal(par.agn.derniere_connexion, '2026-09-30');
  assert.equal(par.inc.type, 'abonne');
  assert.equal(par.inc.sans_plan, true);
  assert.equal(par.inc.status, 'disabled');
});

test('classerCompte : un compte avec réglages CRM reste un abonné même s\'il est client', () => {
  assert.equal(classerCompte({ plan: null, aReglages: true, estClient: true }), 'abonne');
});
