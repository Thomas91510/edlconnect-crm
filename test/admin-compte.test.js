// Gestion des comptes par l'admin (onglet Plateforme) : réservé à l'admin,
// comptes admin protégés, désactivation = bannissement Supabase Auth +
// statut « disabled », réactivation, suppression avec confirmation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
const { default: handler } = await import('../api/admin-compte.js');
const { TABLES_ABONNE } = await import('../api/_lib/suppression-compte.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const req = (body) => ({ method: 'POST', headers: new Headers({ authorization: 'Bearer t' }), json: async () => body });

function mock({ appelant = 'contact@edl-idf.com', cible = 'presta@x.fr', banOk = true } = {}) {
  const a = { ban: null, patch: null, deletes: [], authDelete: null };
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const m = opts.method || 'GET';
    if (u.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin1', email: appelant }) };
    if (u.includes('/auth/v1/admin/users/')) {
      if (m === 'GET') return { ok: !!cible, json: async () => ({ id: 'u42', email: cible }) };
      if (m === 'PUT') { a.ban = JSON.parse(opts.body); return { ok: banOk }; }
      if (m === 'DELETE') { a.authDelete = u; return { ok: true }; }
    }
    if (u.includes('/rest/v1/user_plans?user_id=eq.u42') && m === 'PATCH') { a.patch = JSON.parse(opts.body); return { ok: true }; }
    if (u.includes('/rest/v1/settings?select=data')) return { ok: true, json: async () => [] };
    if (u.includes('/rest/v1/bookings?select=')) return { ok: true, json: async () => [] };
    if (u.includes('/storage/v1/object/list/')) return { ok: true, json: async () => [] };
    if (u.includes('/storage/v1/object/') && m === 'DELETE') return { ok: true };
    if (u.includes('/rest/v1/') && m === 'DELETE') { a.deletes.push(u.split('/rest/v1/')[1]); return { ok: true }; }
    throw new Error('URL inattendue ' + m + ' ' + u);
  };
  return a;
}

test('refusé à un compte non admin', async () => {
  const a = mock({ appelant: 'presta@x.fr' });
  const r = await handler(req({ action: 'desactiver', userId: 'u42' }));
  assert.equal(r.status, 403);
  assert.equal(a.ban, null);
});

test('un compte admin ne peut être ni désactivé ni supprimé', async () => {
  const a = mock({ cible: 'Contact@EDL-IDF.com' });
  assert.equal((await handler(req({ action: 'desactiver', userId: 'u42' }))).status, 403);
  assert.equal((await handler(req({ action: 'supprimer', userId: 'u42', confirmation: 'SUPPRIMER' }))).status, 403);
  assert.equal(a.ban, null);
  assert.equal(a.deletes.length, 0);
});

test('action inconnue ou compte manquant : refus', async () => {
  mock();
  assert.equal((await handler(req({ action: 'effacer', userId: 'u42' }))).status, 400);
  assert.equal((await handler(req({ action: 'activer' }))).status, 400);
});

test('désactiver : bannissement + statut disabled', async () => {
  const a = mock();
  const r = await handler(req({ action: 'desactiver', userId: 'u42' }));
  assert.equal(r.status, 200);
  assert.equal(a.ban.ban_duration, '876000h');
  assert.deepEqual(a.patch, { status: 'disabled' });
});

test('activer : bannissement levé + statut active', async () => {
  const a = mock();
  const r = await handler(req({ action: 'activer', userId: 'u42' }));
  assert.equal(r.status, 200);
  assert.equal(a.ban.ban_duration, 'none');
  assert.deepEqual(a.patch, { status: 'active' });
});

test('échec du bannissement : erreur, statut inchangé', async () => {
  const a = mock({ banOk: false });
  assert.equal((await handler(req({ action: 'desactiver', userId: 'u42' }))).status, 502);
  assert.equal(a.patch, null);
});

test('supprimer sans SUPPRIMER : refus, rien effacé', async () => {
  const a = mock();
  assert.equal((await handler(req({ action: 'supprimer', userId: 'u42', confirmation: 'oui' }))).status, 400);
  assert.equal(a.deletes.length, 0);
  assert.equal(a.authDelete, null);
});

test('supprimer : toutes les tables du compte puis son compte de connexion', async () => {
  const a = mock();
  const r = await handler(req({ action: 'supprimer', userId: 'u42', confirmation: 'SUPPRIMER' }));
  assert.equal(r.status, 200);
  for (const t of TABLES_ABONNE) assert.ok(a.deletes.includes(`${t}?user_id=eq.u42`), t);
  assert.ok(a.deletes.includes('bookings?data->>ownerId=eq.u42'));
  assert.ok(a.authDelete.endsWith('/auth/v1/admin/users/u42'));
});
