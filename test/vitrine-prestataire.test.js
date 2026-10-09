// Identité du prestataire affichée à ses agences (extranet), à ses agents
// et sur sa page de réservation — jamais « EDL IDF » / « Thomas » en dur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
import { vitrineDepuisReglages } from '../api/_lib/identite.js';
const { default: clientExpert } = await import('../api/client-expert.js');
const { default: bookingPage } = await import('../api/booking-page.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const REGLAGES = {
  companyName: 'ImmoCheck EDL', slogan: 'États des lieux à Lyon', userName: 'Julie Martin',
  expediteurTel: '04 72 00 00 00', expediteurEmail: 'julie@immocheck.fr', couleurPrimaire: '#aa3300',
  companyIban: 'FR76 secret',
};

test('vitrine : seulement les champs publics', () => {
  const v = vitrineDepuisReglages(REGLAGES, 'https://s.co');
  assert.deepEqual(v, {
    nom: 'ImmoCheck EDL', accroche: 'États des lieux à Lyon', contact: 'Julie Martin',
    tel: '04 72 00 00 00', telLien: '0472000000', email: 'julie@immocheck.fr', logoUrl: '', couleur: '#aa3300',
  });
  assert.ok(!JSON.stringify(v).includes('secret'));
});

test('client-expert : identité du prestataire retenu pour l’agence, pas d’un autre', async () => {
  const urls = [];
  global.fetch = async (url) => {
    const u = String(url); urls.push(u);
    if (u.includes('/auth/v1/admin/users')) return { ok: true, json: async () => ({ users: [{ id: 'adm', email: 'contact@edl-idf.com' }] }) };
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: 'agence@x.fr' }) };
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => [{ user_id: 'presta2', data: { email: 'agence@x.fr', espaceActif: true } }] };
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => (u.includes('user_id=eq.presta2') ? [{ data: REGLAGES }] : [{ data: { companyName: 'EDL IDF' } }]) };
    return { ok: true, json: async () => [] };
  };
  const r = await clientExpert({ method: 'POST', headers: new Headers({ authorization: 'Bearer t' }), json: async () => ({}) });
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.nom, 'ImmoCheck EDL');
  assert.equal(v.contact, 'Julie Martin');
});

test('client-expert : espace non activé → 403', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/admin/users')) return { ok: true, json: async () => ({ users: [] }) };
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: 'agence@x.fr' }) };
    return { ok: true, json: async () => [{ user_id: 'presta2', data: { email: 'agence@x.fr' } }] };
  };
  const r = await clientExpert({ method: 'POST', headers: new Headers({ authorization: 'Bearer t' }), json: async () => ({}) });
  assert.equal(r.status, 403);
});

test('page de réservation : nom du prestataire, jamais « Thomas »', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => [{ user_id: 'presta2' }] };
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ data: { expediteurNom: 'ImmoCheck EDL' } }] };
    return { ok: true, json: async () => [] };
  };
  const html = await (await bookingPage(new Request('https://app.lokentia.fr/booking?c=abc'))).text();
  assert.ok(!html.includes('Thomas'));
  assert.ok(html.includes('ImmoCheck EDL vous contactera'));
});
