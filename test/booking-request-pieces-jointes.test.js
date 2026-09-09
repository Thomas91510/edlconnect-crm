// Vérifie que api/booking-request.js valide et plafonne les pièces jointes
// (déposées au préalable par api/upload-booking-attachment.js) avant de les
// stocker sur la réservation — jamais plus de 10, jamais un champ hors gabarit.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
const { default: handler } = await import('../api/booking-request.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return { method: 'POST', headers: new Headers(), json: async () => body };
}

function mockFetch(capturerBooking) {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/bookings') && opts && opts.method === 'POST') {
      capturerBooking(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ([]) };
  };
}

const BASE = {
  agence: 'Immo Gestion Era',
  contact: 'Jean Dupont',
  email: 'agence@exemple.fr',
  typeEdl: 'EDL entrant',
  adresse: '10 Résidence du Parc',
  dateSouhaitee: '2026-09-08',
  locataire: { nom: 'Bardel', tel: '0695104367' }
};

test('booking-request : stocke les pièces jointes valides', async () => {
  let booking = null;
  mockFetch(b => { booking = b; });
  await handler(requete({ ...BASE, pieceJointes: [{ nom: 'photo.jpg', path: 'sub_1/a.jpg' }] }));
  assert.ok(booking);
  assert.deepEqual(booking.data.piecesJointes, [{ nom: 'photo.jpg', path: 'sub_1/a.jpg' }]);
});

test('booking-request : ignore une entrée sans chemin de stockage', async () => {
  let booking = null;
  mockFetch(b => { booking = b; });
  await handler(requete({ ...BASE, pieceJointes: [{ nom: 'photo.jpg' }] }));
  assert.deepEqual(booking.data.piecesJointes, []);
});

test('booking-request : plafonne à 10 pièces jointes', async () => {
  let booking = null;
  mockFetch(b => { booking = b; });
  const pieceJointes = Array.from({ length: 15 }, (_, i) => ({ nom: 'f' + i, path: 'sub_1/' + i }));
  await handler(requete({ ...BASE, pieceJointes }));
  assert.equal(booking.data.piecesJointes.length, 10);
});

test('booking-request : absence de pièces jointes ne casse rien (compatibilité)', async () => {
  let booking = null;
  mockFetch(b => { booking = b; });
  await handler(requete({ ...BASE }));
  assert.deepEqual(booking.data.piecesJointes, []);
});
