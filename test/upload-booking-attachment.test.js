// Vérifie /api/upload-booking-attachment : endpoint public (pas d'auth),
// aucune restriction de format, mais taille et nombre de fichiers plafonnés,
// et le chemin de stockage est bien regroupé sous le jeton fourni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/upload-booking-attachment.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function fichier(nom = 'plan.dwg', taille = 1000, type = 'application/octet-stream') {
  return new File([new Uint8Array(taille)], nom, { type });
}

function requeteAvecForm(form) {
  return { method: 'POST', formData: async () => form };
}

function mockFetch({ storageOk = true, existants = [] } = {}) {
  const appels = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    appels.push({ url: u, opts });
    if (u.includes('/storage/v1/object/list/reservations')) {
      return { ok: true, json: async () => existants };
    }
    if (u.includes('/storage/v1/object/reservations/')) {
      return { ok: storageOk, text: async () => storageOk ? '' : 'bucket introuvable' };
    }
    return { ok: true, json: async () => ({}) };
  };
  return appels;
}

test('upload-booking-attachment : refuse sans fichier', async () => {
  mockFetch();
  const form = new FormData();
  form.set('token', 'sub_1');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 400);
});

test('upload-booking-attachment : refuse sans jeton', async () => {
  mockFetch();
  const form = new FormData();
  form.set('file', fichier());
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 400);
});

test('upload-booking-attachment : refuse un fichier trop volumineux', async () => {
  mockFetch();
  const form = new FormData();
  form.set('file', fichier('gros.zip', 26 * 1024 * 1024));
  form.set('token', 'sub_1');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 400);
});

test('upload-booking-attachment : refuse au-delà de 10 fichiers pour un même jeton', async () => {
  const existants = Array.from({ length: 10 }, (_, i) => ({ name: 'sub_1/' + i }));
  mockFetch({ existants });
  const form = new FormData();
  form.set('file', fichier());
  form.set('token', 'sub_1');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 400);
});

test('upload-booking-attachment : accepte tout type de fichier et renvoie un chemin sous le jeton', async () => {
  const appels = mockFetch();
  const form = new FormData();
  form.set('file', fichier('plan.dwg', 500, 'application/acad'));
  form.set('token', 'sub_abc');
  const resp = await handler(requeteAvecForm(form));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.path.startsWith('sub_abc/'));
  assert.ok(body.path.endsWith('.dwg'));

  const uploadCall = appels.find(a => a.url.includes('/storage/v1/object/reservations/'));
  assert.ok(uploadCall);
  assert.equal(uploadCall.opts.headers['Content-Type'], 'application/acad');
});

test('upload-booking-attachment : échec propre si le bucket n\'existe pas encore', async () => {
  mockFetch({ storageOk: false });
  const form = new FormData();
  form.set('file', fichier());
  form.set('token', 'sub_1');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 500);
});
