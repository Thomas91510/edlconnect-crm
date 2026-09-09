// Vérifie /api/upload-facture : réservé aux administrateurs, valide le
// fichier (PDF, taille), téléverse dans le bucket Storage "factures", et
// rattache un document {type:'facture'} au(x) contact(s) de cet email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/upload-facture.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const AUTRE_EMAIL = 'agence@exemple.fr';
const CLIENT_EMAIL = 'client@exemple.fr';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function pdfFile(nom = 'facture.pdf', taille = 1000) {
  return new File([new Uint8Array(taille)], nom, { type: 'application/pdf' });
}

function requeteAvecForm(callerEmailPourAuth, form) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    formData: async () => form,
  };
}

function mockFetch({ callerEmail, contactsRows, storageOk = true } = {}) {
  const appels = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    appels.push({ url: u, opts });
    if (u.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ email: callerEmail }) };
    }
    if (u.includes('/storage/v1/object/factures/')) {
      return { ok: storageOk, text: async () => storageOk ? '' : 'bucket introuvable' };
    }
    if (u.includes('/rest/v1/contacts') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => contactsRows ?? [{ id: 'c1', data: { email: CLIENT_EMAIL, documents: [] } }] };
    }
    if (opts && opts.method === 'PATCH') {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [] };
  };
  return appels;
}

test('upload-facture : refuse un appelant non-admin', async () => {
  mockFetch({ callerEmail: AUTRE_EMAIL });
  const form = new FormData();
  form.set('file', pdfFile());
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(AUTRE_EMAIL, form));
  assert.equal(resp.status, 403);
});

test('upload-facture : refuse un fichier non-PDF', async () => {
  mockFetch({ callerEmail: ADMIN_EMAIL });
  const form = new FormData();
  form.set('file', new File(['x'], 'facture.txt', { type: 'text/plain' }));
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(ADMIN_EMAIL, form));
  assert.equal(resp.status, 400);
});

test('upload-facture : refuse sans email client', async () => {
  mockFetch({ callerEmail: ADMIN_EMAIL });
  const form = new FormData();
  form.set('file', pdfFile());
  const resp = await handler(requeteAvecForm(ADMIN_EMAIL, form));
  assert.equal(resp.status, 400);
});

test('upload-facture : un admin dépose une facture avec succès et le document est taggé "facture"', async () => {
  const appels = mockFetch({ callerEmail: ADMIN_EMAIL, contactsRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, documents: [] } }] });
  const form = new FormData();
  form.set('file', pdfFile('juin.pdf'));
  form.set('clientEmail', CLIENT_EMAIL);
  form.set('nom', 'Facture juin 2026');
  const resp = await handler(requeteAvecForm(ADMIN_EMAIL, form));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.path, 'la réponse doit renvoyer le chemin de stockage (pour que le CRM garde son état local synchronisé)');
  assert.equal(body.nom, 'Facture juin 2026');

  const uploadCall = appels.find(a => a.url.includes('/storage/v1/object/factures/'));
  assert.ok(uploadCall, 'doit téléverser vers le bucket factures');
  assert.ok(uploadCall.url.includes(encodeURIComponent(CLIENT_EMAIL)), 'chemin scopé par email client');

  const patchCall = appels.find(a => a.opts && a.opts.method === 'PATCH');
  assert.ok(patchCall, 'doit patcher le contact');
  const patchBody = JSON.parse(patchCall.opts.body);
  const doc = patchBody.data.documents.find(d => d.type === 'facture');
  assert.ok(doc, 'le document facture doit être présent');
  assert.equal(doc.nom, 'Facture juin 2026');
});

test('upload-facture : échec propre si le bucket n\'existe pas encore', async () => {
  mockFetch({ callerEmail: ADMIN_EMAIL, storageOk: false });
  const form = new FormData();
  form.set('file', pdfFile());
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(ADMIN_EMAIL, form));
  assert.equal(resp.status, 500);
});
