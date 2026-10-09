// Accès extranet seulement si l'espace de l'agence est activé
// (api/_lib/espace-agence.js) ; les agences qui l'utilisaient déjà restent
// activées ; l'administrateur n'est jamais bloqué.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
import { decisionEspace, choisirExpert, estHistorique, DATE_ACTIVATION } from '../api/_lib/espace-agence.js';
const { default: clientOrders } = await import('../api/client-orders.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const ANCIEN = { created_at: '2026-03-01T00:00:00Z', last_sign_in_at: '2026-09-09T00:00:00Z' };
const NOUVEAU = { created_at: '2026-10-20T00:00:00Z', last_sign_in_at: '2026-10-20T00:00:00Z' };

test('décision : activé / désactivé / historique / non activé', () => {
  assert.equal(decisionEspace([{ data: { espaceActif: true } }], 'nouvelle@x.fr').actif, true);
  assert.equal(decisionEspace([{ data: { espaceActif: false } }], 'immogestionlocative@gmail.com').actif, false, 'désactivé l’emporte sur l’historique');
  assert.equal(decisionEspace([{ data: { espaceActif: true } }, { data: { espaceActif: false } }], 'x@x.fr').actif, false, 'fiches en double : désactivé l’emporte');
  assert.deepEqual(decisionEspace([{ data: {} }], 'LGC13Asnieres@arthurimmo.com'), { actif: true, raison: 'historique' });
  assert.deepEqual(decisionEspace([{ data: {} }], 'nouvelle@x.fr'), { actif: false, raison: 'non_active' });
  assert.ok(estHistorique(' immogestionlocative@gmail.com '));
  assert.ok(!estHistorique('nouvelle@x.fr'), 'une nouvelle agence n’est jamais historique, même après connexion');
  assert.ok(DATE_ACTIVATION >= '2026-10-08');
});

function mock(user, contacts, urls = []) {
  global.fetch = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/auth/v1/admin/users')) return { ok: true, json: async () => ({ users: [{ id: 'adm', email: 'contact@edl-idf.com' }] }) };
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => user };
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => contacts.map(c => ({ user_id: 'adm', ...c })) };
    return { ok: true, json: async () => [] };
  };
}
const req = () => ({ method: 'POST', headers: new Headers({ authorization: 'Bearer t' }), json: async () => ({}) });

test('extranet : agence non activée → 403 espace_inactif ; activée ou historique → accès', async () => {
  mock({ email: 'nouvelle@x.fr', ...NOUVEAU }, [{ data: { email: 'nouvelle@x.fr' } }]);
  let r = await clientOrders(req());
  assert.equal(r.status, 403);
  assert.equal((await r.json()).code, 'espace_inactif');
  mock({ email: 'nouvelle@x.fr', ...NOUVEAU }, [{ data: { email: 'nouvelle@x.fr', espaceActif: true } }]);
  assert.equal((await clientOrders(req())).status, 200);
  mock({ email: 'immogestionlocative@gmail.com', ...ANCIEN }, [{ data: { email: 'immogestionlocative@gmail.com' } }]);
  assert.equal((await clientOrders(req())).status, 200, 'agence historique (déjà utilisatrice) toujours active');
  mock({ email: 'immogestionlocative@gmail.com', ...ANCIEN }, [{ data: { email: 'immogestionlocative@gmail.com', espaceActif: false } }]);
  assert.equal((await clientOrders(req())).status, 403, 'désactivée depuis le CRM');
  mock({ email: 'contact@edl-idf.com', ...NOUVEAU }, []);
  assert.equal((await clientOrders(req())).status, 200, 'administrateur jamais bloqué');
});

test('cloisonnement : chaque prestataire décide seul, l’historique ne vaut que pour l’admin', () => {
  const email = 'immogestionlocative@gmail.com';
  // Un autre abonné crée une fiche avec l'email d'une agence de l'admin
  const fiches = [{ user_id: 'adm', data: {} }, { user_id: 'pirate', data: {} }];
  const ctx = choisirExpert(fiches, email, { adminId: 'adm' });
  assert.equal(ctx.expertId, 'adm');
  assert.deepEqual(ctx.experts, ['adm'], 'l’historique n’ouvre pas d’espace chez l’autre abonné');
  assert.equal(ctx.contacts.length, 1);
  // Le désactivé d'un autre abonné ne coupe plus l'agence chez l'admin
  const ctx2 = choisirExpert([{ user_id: 'adm', data: {} }, { user_id: 'pirate', data: { espaceActif: false } }], email, { adminId: 'adm' });
  assert.equal(ctx2.actif, true);
  assert.equal(ctx2.expertId, 'adm');
  // Même activé chez lui, l'autre abonné ne passe pas devant l'admin par défaut
  const ctx3 = choisirExpert([{ user_id: 'pirate', data: { espaceActif: true } }, { user_id: 'adm', data: {} }], email, { adminId: 'adm' });
  assert.equal(ctx3.expertId, 'adm');
  assert.equal(choisirExpert([{ user_id: 'pirate', data: { espaceActif: true } }, { user_id: 'adm', data: {} }], email, { adminId: 'adm', expertDemande: 'pirate' }).expertId, 'pirate');
  // Prestataire demandé mais non activé : ignoré
  assert.equal(choisirExpert(fiches, email, { adminId: 'adm', expertDemande: 'pirate' }).expertId, 'adm');
});

test('extranet : réservations et missions limitées au prestataire retenu', async () => {
  const urls = [];
  mock({ email: 'immogestionlocative@gmail.com', ...ANCIEN }, [{ data: { email: 'immogestionlocative@gmail.com' } }, { user_id: 'pirate', data: { email: 'immogestionlocative@gmail.com' } }], urls);
  assert.equal((await clientOrders(req())).status, 200);
  assert.ok(urls.find(u => u.includes('/rest/v1/bookings')).includes('ownerId=eq.adm'));
  assert.ok(urls.find(u => u.includes('/rest/v1/missions')).includes('user_id=eq.adm'));
});
