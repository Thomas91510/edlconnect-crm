// Vérifie /api/upload-booking-attachment : endpoint public (pas d'auth),
// aucune restriction de format (choix produit assumé), mais taille et
// nombre de fichiers plafonnés PAR JETON, plus une limite GLOBALE (tous
// jetons confondus) contre un script qui générerait des jetons en boucle
// pour contourner la limite par jeton, et le chemin de stockage est bien
// regroupé sous le jeton fourni.
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

// Deux appels distincts frappent /storage/v1/object/list/reservations : le
// garde-fou global (body.sortBy, sans prefix) et le garde-fou par jeton
// (body.prefix) — le mock les distingue pour pouvoir les tester séparément.
function mockFetch({ storageOk = true, existantsParJeton = [], recentsGlobal = [] } = {}) {
  const appels = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    appels.push({ url: u, opts });
    if (u.includes('/storage/v1/object/list/reservations')) {
      const corps = opts && opts.body ? JSON.parse(opts.body) : {};
      if (corps.prefix) return { ok: true, json: async () => existantsParJeton };
      return { ok: true, json: async () => recentsGlobal };
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
  const existantsParJeton = Array.from({ length: 10 }, (_, i) => ({ name: 'sub_1/' + i }));
  mockFetch({ existantsParJeton });
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

// ─── Garde-fou global (tous jetons confondus) ───────────────────────────
test('upload-booking-attachment : refuse au-delà de la limite globale d\'uploads récents (tous jetons confondus)', async () => {
  const recentsGlobal = Array.from({ length: 200 }, (_, i) => ({ created_at: new Date(Date.now() - i * 1000).toISOString() }));
  mockFetch({ recentsGlobal });
  const form = new FormData();
  form.set('file', fichier());
  form.set('token', 'jeton-tout-neuf');
  const resp = await handler(requeteAvecForm(form));
  const body = await resp.json();
  assert.equal(resp.status, 429);
  assert.match(body.error, /Trop de dépôts/);
});

test('upload-booking-attachment : des objets anciens (hors fenêtre d\'une heure) ne comptent pas dans la limite globale', async () => {
  const recentsGlobal = Array.from({ length: 200 }, () => ({ created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }));
  const appels = mockFetch({ recentsGlobal });
  const form = new FormData();
  form.set('file', fichier());
  form.set('token', 'jeton-legitime');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 200);
  assert.ok(appels.some(a => a.url.includes('/storage/v1/object/reservations/')), 'le dépôt doit bien avoir lieu');
});

test('upload-booking-attachment : en dessous de la limite globale, le dépôt est accepté normalement', async () => {
  const recentsGlobal = Array.from({ length: 5 }, () => ({ created_at: new Date().toISOString() }));
  mockFetch({ recentsGlobal });
  const form = new FormData();
  form.set('file', fichier());
  form.set('token', 'jeton-normal');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 200);
});

test('upload-booking-attachment : une panne de la vérification de débit global ne bloque jamais un dépôt légitime', async () => {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/storage/v1/object/list/reservations')) {
      const corps = opts && opts.body ? JSON.parse(opts.body) : {};
      if (!corps.prefix) throw new Error('panne réseau');
      return { ok: true, json: async () => [] };
    }
    if (u.includes('/storage/v1/object/reservations/')) {
      return { ok: true, text: async () => '' };
    }
    return { ok: true, json: async () => ({}) };
  };
  const form = new FormData();
  form.set('file', fichier());
  form.set('token', 'jeton-normal');
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 200);
});
