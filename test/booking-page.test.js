// booking-page.js : page publique de réservation (807 lignes), zone
// identifiée comme non testée dans l'audit du 12/09. Couvre la résolution
// d'identité (contact → agence → repli neutre) et non-régression du
// correctif XSS du même audit (agency/name mal échappés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/booking-page.js';

const fetchOriginal = global.fetch;
const envOriginal = process.env.SUPABASE_SERVICE_KEY;
test.after(() => { global.fetch = fetchOriginal; process.env.SUPABASE_SERVICE_KEY = envOriginal; });

function req(query) {
  return new Request('https://app.lokentia.fr/booking' + (query ? '?' + query : ''));
}

test('booking-page : répond 200 en HTML même sans aucun paramètre', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  const res = await handler(req());
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
});

test('booking-page : neutralise une tentative XSS via "name" (échappement HTML)', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  const res = await handler(req('name=' + encodeURIComponent('x"><script>alert(1)</script>')));
  const html = await res.text();
  assert.ok(!html.includes('<script>alert(1)</script>'), 'le script ne doit jamais apparaître en clair');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'doit apparaître échappé');
});

test('booking-page : neutralise une tentative d\'évasion du littéral JS via "agency"', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  const res = await handler(req('agency=' + encodeURIComponent("x'; alert(1); //")));
  const html = await res.text();
  const ligne = html.split('\n').find(l => l.includes('AGENCY_ID ='));
  assert.ok(ligne, 'la ligne AGENCY_ID doit exister');
  // Le littéral JS ne doit contenir QUE des caractères alphanumériques/_/- :
  // un caractère de citation injecté briserait ce format et casserait le
  // littéral, ouvrant la voie à l'exécution du reste du payload.
  assert.match(ligne, /^const AGENCY_ID = '[a-zA-Z0-9_-]*';$/);
});

test('booking-page : un nom d\'agence légitime avec accents et apostrophes s\'affiche correctement échappé', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  const res = await handler(req('name=' + encodeURIComponent("L'Agence de l'Essonne")));
  const html = await res.text();
  const m = html.match(/id="agence"[^>]*value="([^"]*)"/);
  assert.ok(m, 'le champ agence doit être présent');
  assert.equal(m[1], 'L&#39;Agence de l&#39;Essonne');
});

test('booking-page : sans clé Supabase configurée, retombe sur l\'identité neutre sans planter', async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  global.fetch = async () => { throw new Error('ne doit jamais être appelé sans clé service'); };
  const res = await handler(req('c=contact123'));
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes('contact@lokentia.fr'));
});

test('booking-page : résout l\'identité via le contact (paramètre "c") en priorité', async () => {
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/rest/v1/contacts') && u.includes('id=eq.contact123')) {
      return { ok: true, json: async () => [{ user_id: 'owner1' }] };
    }
    if (u.includes('/rest/v1/settings') && u.includes('user_id=eq.owner1')) {
      return { ok: true, json: async () => [{ data: { expediteurNom: 'EDL IDF', expediteurEmail: 'contact@edl-idf.com', expediteurTel: '0601020304' } }] };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(req('c=contact123&name=Agence+Ignoree'));
  const html = await res.text();
  assert.ok(html.includes('contact@edl-idf.com'));
  assert.ok(!calls.some(u => u.includes('entreprise=ilike')), 'ne doit pas chercher par nom d\'agence si le contact a déjà été trouvé');
});

test('booking-page : se rabat sur le nom d\'agence si le contact ("c") est introuvable', async () => {
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('id=eq.inconnu')) return { ok: true, json: async () => [] };
    if (u.includes('entreprise=ilike')) return { ok: true, json: async () => [{ user_id: 'owner2' }] };
    if (u.includes('/rest/v1/settings') && u.includes('user_id=eq.owner2')) {
      return { ok: true, json: async () => [{ data: { companyName: 'Century21 Evry', userEmail: 'century21@x.fr' } }] };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(req('c=inconnu&name=' + encodeURIComponent('Century21 Evry')));
  const html = await res.text();
  assert.ok(html.includes('century21@x.fr'));
});

test('booking-page : identité neutre si ni le contact ni le nom d\'agence ne correspondent à personne', async () => {
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => [] });
  const res = await handler(req('name=' + encodeURIComponent('Agence Inconnue')));
  const html = await res.text();
  assert.ok(html.includes('contact@lokentia.fr'));
});

test('booking-page : une panne Supabase pendant la résolution d\'identité retombe sur le neutre sans faire échouer la page', async () => {
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  global.fetch = async () => { throw new Error('Supabase indisponible'); };
  const res = await handler(req('c=contact123'));
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes('contact@lokentia.fr'));
});

test('booking-page : contact trouvé mais sans ligne "settings" associée retombe aussi sur le neutre', async () => {
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/contacts')) return { ok: true, json: async () => [{ user_id: 'owner3' }] };
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  };
  const res = await handler(req('c=contact123'));
  const html = await res.text();
  assert.ok(html.includes('contact@lokentia.fr'));
});
