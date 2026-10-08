// /api/client-orders : réservations reliées à leur mission même sans
// missionId (même adresse + même jour), rapports Edouard renvoyés, et
// missions saisies dans le CRM (sans réservation) visibles dans l'espace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/client-orders.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('rapports et missions CRM visibles par l’agence', async () => {
  let urlMissions = '';
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'agence@x.fr' }) };
    if (u.includes('/rest/v1/bookings')) return { ok: true, json: async () => [
      { id: 'b1', created_at: '2026-07-01', data: { email: 'agence@x.fr', adresse: '4 rue de l’Ancienne Gare, 91120 Palaiseau', dateSouhaitee: '2026-07-22', typeEdl: 'EDL entrant', statut: 'confirmee' } },
    ] };
    if (u.includes('/rest/v1/missions')) { urlMissions = decodeURIComponent(u); return { ok: true, json: async () => [
      { id: 'm1', data: { adresse: '4 rue de l’ancienne gare, 91120 PALAISEAU', date: '2026-07-22T10:00:00', statut: 'terminée', rapports: [{ nom: 'R', url: 'https://s/r1.pdf', type: 1 }] } },
      { id: 'm2', data: { adresse: '8 résidence du Parc', date: '2026-07-23T09:00:00', type: 'EDL sortant', statut: 'terminée', rapportUrl: 'https://s/r2.pdf' } },
    ] }; }
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => [] };
    throw new Error('URL inattendue ' + u);
  };
  const resp = await handler({ method: 'POST', headers: new Headers({ authorization: 'Bearer t' }), json: async () => ({}) });
  const orders = await resp.json();
  assert.match(urlMissions, /emailClient=ilike\.agence@x\.fr/, 'recherche insensible à la casse');
  const b1 = orders.find(o => o.id === 'b1');
  assert.equal(b1.statut, 'rapport_dispo', 'reliée par adresse + jour malgré l’absence de missionId');
  assert.equal(b1.rapportUrl, 'https://s/r1.pdf');
  assert.equal(b1.rapports[0].type, 1);
  const m2 = orders.find(o => o.id === 'm_m2');
  assert.ok(m2, 'mission CRM sans réservation présente');
  assert.equal(m2.statut, 'rapport_dispo');
  assert.equal(m2.rapportUrl, 'https://s/r2.pdf');
  assert.equal(orders.filter(o => o.id === 'm_m1').length, 0, 'mission déjà reliée non dupliquée');
});
