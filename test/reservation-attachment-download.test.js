// Vérifie /api/reservation-attachment-download : réservé aux administrateurs
// (aucun client ne "possède" une pièce jointe de réservation), mint une URL
// signée de courte durée — mais UNIQUEMENT pour un chemin qui correspond
// réellement à une pièce jointe rattachée à une réservation existante
// (piecesJointes[].path côté bookings), jamais un chemin arbitraire fourni
// par l'appelant (défense en profondeur, même si l'appelant est admin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/reservation-attachment-download.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const AUTRE_EMAIL = 'agence@exemple.fr';
const CHEMIN = 'sub_abc/1699999999-xyz.pdf';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(callerEmail, body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetch(callerEmail, { cheminsExistants = [CHEMIN] } = {}) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: callerEmail }) };
    if (u.includes('/rest/v1/bookings')) {
      // Reproduit la sémantique de containment JSONB de PostgREST (cs.) :
      // trouvé seulement si le chemin demandé est parmi les pièces jointes
      // existantes simulées ici.
      const m = u.match(/data->piecesJointes=cs\.(.+?)(&|$)/);
      const demande = m ? JSON.parse(decodeURIComponent(m[1]))[0].path : null;
      const trouve = cheminsExistants.includes(demande);
      return { ok: true, json: async () => (trouve ? [{ id: 'booking_1' }] : []) };
    }
    if (u.includes('/storage/v1/object/sign/reservations/')) {
      return { ok: true, json: async () => ({ signedURL: '/object/sign/reservations/' + CHEMIN + '?token=abc' }) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

test('reservation-attachment-download : refuse un non-administrateur', async () => {
  mockFetch(AUTRE_EMAIL);
  const resp = await handler(requete(AUTRE_EMAIL, { path: CHEMIN }));
  assert.equal(resp.status, 403);
});

test('reservation-attachment-download : refuse sans chemin', async () => {
  mockFetch(ADMIN_EMAIL);
  const resp = await handler(requete(ADMIN_EMAIL, {}));
  assert.equal(resp.status, 400);
});

test('reservation-attachment-download : mint une URL signée pour un chemin réellement rattaché à une réservation', async () => {
  mockFetch(ADMIN_EMAIL);
  const resp = await handler(requete(ADMIN_EMAIL, { path: CHEMIN }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.ok(body.url.includes('token=abc'));
});

test('reservation-attachment-download : refuse un chemin qui ne correspond à AUCUNE réservation (même en tant qu\'admin)', async () => {
  mockFetch(ADMIN_EMAIL, { cheminsExistants: [CHEMIN] });
  const resp = await handler(requete(ADMIN_EMAIL, { path: 'autre-dossier/fichier-invente.pdf' }));
  assert.equal(resp.status, 404);
});

test('reservation-attachment-download : la vérification d\'appartenance échoue proprement (403), jamais de signature en aveugle', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
    if (u.includes('/rest/v1/bookings')) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({}) };
  };
  const resp = await handler(requete(ADMIN_EMAIL, { path: CHEMIN }));
  assert.equal(resp.status, 403);
});
