// Vérifie /api/reservation-attachment-download : chaque abonné peut
// télécharger les pièces jointes de SES PROPRES réservations (même
// cloisonnement que delete-reservation.js), un admin peut télécharger celles
// de n'importe quelle agence — mint une URL signée de courte durée, mais
// UNIQUEMENT pour un chemin qui correspond réellement à une pièce jointe
// rattachée à une réservation existante ET appartenant à l'appelant
// (piecesJointes[].path + data.ownerId côté bookings), jamais un chemin
// arbitraire fourni par l'appelant (défense en profondeur, même pour un
// admin). Régression cible : ce endpoint gate autrefois sur ADMIN_EMAILS
// uniquement, ce qui cassait le téléchargement pour tout abonné non-admin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/reservation-attachment-download.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const CHEMIN = 'sub_abc/1699999999-xyz.pdf';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetch(callerId, callerEmail, { reservations = [{ path: CHEMIN, ownerId: 'owner1' }] } = {}) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: callerId, email: callerEmail }) };
    if (u.includes('/rest/v1/bookings')) {
      // Reproduit la sémantique de containment JSONB de PostgREST (cs.) et
      // le filtre d'appartenance (data->>ownerId=eq....) simulés ici.
      const m = u.match(/data->piecesJointes=cs\.(.+?)(&|$)/);
      const demande = m ? JSON.parse(decodeURIComponent(m[1]))[0].path : null;
      const ownerMatch = u.match(/data->>ownerId=eq\.([^&]+)/);
      const ownerFiltre = ownerMatch ? decodeURIComponent(ownerMatch[1]) : null;
      const trouve = reservations.find(r => r.path === demande && (!ownerFiltre || r.ownerId === ownerFiltre));
      return { ok: true, json: async () => (trouve ? [{ id: 'booking_1' }] : []) };
    }
    if (u.includes('/storage/v1/object/sign/reservations/')) {
      return { ok: true, json: async () => ({ signedURL: '/object/sign/reservations/' + CHEMIN + '?token=abc' }) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

test('reservation-attachment-download : refuse sans jeton d\'authentification', async () => {
  mockFetch('owner1', 'agence@exemple.fr');
  const res = { method: 'POST', headers: new Headers({}), json: async () => ({ path: CHEMIN }) };
  const resp = await handler(res);
  assert.equal(resp.status, 401);
});

test('reservation-attachment-download : refuse sans chemin', async () => {
  mockFetch('owner1', ADMIN_EMAIL);
  const resp = await handler(requete({}));
  assert.equal(resp.status, 400);
});

test('reservation-attachment-download : un abonné normal télécharge la pièce jointe de SA PROPRE réservation', async () => {
  mockFetch('owner1', 'agence@exemple.fr', { reservations: [{ path: CHEMIN, ownerId: 'owner1' }] });
  const resp = await handler(requete({ path: CHEMIN }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.ok(body.url.includes('token=abc'));
});

test('reservation-attachment-download : un abonné normal ne peut PAS télécharger la pièce jointe d\'une réservation d\'une autre agence', async () => {
  mockFetch('owner1', 'agence@exemple.fr', { reservations: [{ path: CHEMIN, ownerId: 'owner2' }] });
  const resp = await handler(requete({ path: CHEMIN }));
  assert.equal(resp.status, 404);
});

test('reservation-attachment-download : un administrateur télécharge la pièce jointe de N\'IMPORTE QUELLE agence', async () => {
  mockFetch('admin1', ADMIN_EMAIL, { reservations: [{ path: CHEMIN, ownerId: 'owner2' }] });
  const resp = await handler(requete({ path: CHEMIN }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.ok(body.url.includes('token=abc'));
});

test('reservation-attachment-download : refuse un chemin qui ne correspond à AUCUNE réservation (même en tant qu\'admin)', async () => {
  mockFetch('admin1', ADMIN_EMAIL, { reservations: [{ path: CHEMIN, ownerId: 'owner1' }] });
  const resp = await handler(requete({ path: 'autre-dossier/fichier-invente.pdf' }));
  assert.equal(resp.status, 404);
});

test('reservation-attachment-download : la vérification d\'appartenance échoue proprement (403), jamais de signature en aveugle', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'owner1', email: ADMIN_EMAIL }) };
    if (u.includes('/rest/v1/bookings')) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({}) };
  };
  const resp = await handler(requete({ path: CHEMIN }));
  assert.equal(resp.status, 403);
});
