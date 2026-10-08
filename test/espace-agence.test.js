// Accès extranet seulement si l'espace de l'agence est activé
// (api/_lib/espace-agence.js) ; les agences qui l'utilisaient déjà restent
// activées ; l'administrateur n'est jamais bloqué.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
import { decisionEspace, emailsHistoriques, DATE_ACTIVATION } from '../api/_lib/espace-agence.js';
const { default: clientOrders } = await import('../api/client-orders.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const ANCIEN = { created_at: '2026-03-01T00:00:00Z', last_sign_in_at: '2026-09-09T00:00:00Z' };
const NOUVEAU = { created_at: '2026-10-20T00:00:00Z', last_sign_in_at: '2026-10-20T00:00:00Z' };

test('décision : activé / désactivé / historique / non activé', () => {
  assert.equal(decisionEspace([{ data: { espaceActif: true } }], NOUVEAU).actif, true);
  assert.equal(decisionEspace([{ data: { espaceActif: false } }], ANCIEN).actif, false, 'désactivé l’emporte sur l’historique');
  assert.deepEqual(decisionEspace([{ data: {} }], ANCIEN), { actif: true, raison: 'historique' });
  assert.deepEqual(decisionEspace([{ data: {} }], NOUVEAU), { actif: false, raison: 'non_active' });
  assert.equal(decisionEspace([], { created_at: '2026-01-01', last_sign_in_at: null }).actif, false, 'compte jamais utilisé');
  assert.ok(DATE_ACTIVATION >= '2026-10-08');
  assert.deepEqual(emailsHistoriques([{ email: 'A@x.fr', ...ANCIEN }, { email: 'b@x.fr', ...NOUVEAU }]), ['a@x.fr']);
});

function mock(user, contacts) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => user };
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => contacts };
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
  mock({ email: 'immo@x.fr', ...ANCIEN }, [{ data: { email: 'immo@x.fr' } }]);
  assert.equal((await clientOrders(req())).status, 200, 'agence historique (déjà utilisatrice) toujours active');
  mock({ email: 'immo@x.fr', ...ANCIEN }, [{ data: { email: 'immo@x.fr', espaceActif: false } }]);
  assert.equal((await clientOrders(req())).status, 403, 'désactivée depuis le CRM');
  mock({ email: 'contact@edl-idf.com', ...NOUVEAU }, []);
  assert.equal((await clientOrders(req())).status, 200, 'administrateur jamais bloqué');
});
