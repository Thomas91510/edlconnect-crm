// Vérifie /api/upload-facture : tout abonné authentifié peut déposer une
// facture pour SES PROPRES contacts (un admin conserve le comportement
// historique, cross-agence) — valide le fichier (PDF, taille), téléverse
// dans le bucket Storage "factures", et rattache un document
// {type:'facture'} au(x) contact(s) de cet email. Régression cible : ce
// endpoint gate autrefois sur ADMIN_EMAILS uniquement, alors que le bouton
// "Déposer une facture" de la fiche contact est visible pour tout abonné —
// cassant la fonctionnalité pour tout le monde sauf l'admin.
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

function requeteAvecForm(form) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    formData: async () => form,
  };
}

function mockFetch({ callerId, callerEmail, contactsRows, storageOk = true } = {}) {
  const appels = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    appels.push({ url: u, opts });
    if (u.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ id: callerId, email: callerEmail }) };
    }
    if (u.includes('/storage/v1/object/factures/')) {
      return { ok: storageOk, text: async () => storageOk ? '' : 'bucket introuvable' };
    }
    if (u.includes('/rest/v1/contacts') && (!opts || opts.method !== 'PATCH')) {
      // Reproduit le filtre data->>ownerId=eq.<id> quand présent : ne
      // renvoie que les lignes du jeu de données simulé dont l'ownerId
      // correspond, sinon toutes (simule le comportement admin).
      const ownerMatch = u.match(/data->>ownerId=eq\.([^&]+)/);
      const ownerFiltre = ownerMatch ? decodeURIComponent(ownerMatch[1]) : null;
      const toutes = contactsRows ?? [{ id: 'c1', data: { email: CLIENT_EMAIL, ownerId: 'owner1', documents: [] } }];
      const filtrees = ownerFiltre ? toutes.filter(r => r.data.ownerId === ownerFiltre) : toutes;
      return { ok: true, json: async () => filtrees };
    }
    if (opts && opts.method === 'PATCH') {
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [] };
  };
  return appels;
}

test('upload-facture : refuse sans utilisateur authentifiable', async () => {
  mockFetch({ callerId: null, callerEmail: AUTRE_EMAIL });
  const form = new FormData();
  form.set('file', pdfFile());
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 401);
});

test('upload-facture : refuse un fichier non-PDF', async () => {
  mockFetch({ callerId: 'admin1', callerEmail: ADMIN_EMAIL });
  const form = new FormData();
  form.set('file', new File(['x'], 'facture.txt', { type: 'text/plain' }));
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 400);
});

test('upload-facture : refuse sans email client', async () => {
  mockFetch({ callerId: 'admin1', callerEmail: ADMIN_EMAIL });
  const form = new FormData();
  form.set('file', pdfFile());
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 400);
});

test('upload-facture : un abonné normal dépose une facture pour SON PROPRE contact avec succès', async () => {
  const appels = mockFetch({
    callerId: 'owner1',
    callerEmail: AUTRE_EMAIL,
    contactsRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, ownerId: 'owner1', documents: [] } }],
  });
  const form = new FormData();
  form.set('file', pdfFile('juin.pdf'));
  form.set('clientEmail', CLIENT_EMAIL);
  form.set('nom', 'Facture juin 2026');
  const resp = await handler(requeteAvecForm(form));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.success, true);

  const patchCall = appels.find(a => a.opts && a.opts.method === 'PATCH');
  assert.ok(patchCall, 'doit patcher le contact du propriétaire');
  const patchBody = JSON.parse(patchCall.opts.body);
  const doc = patchBody.data.documents.find(d => d.type === 'facture');
  assert.ok(doc, 'le document facture doit être présent');
});

test('upload-facture : un abonné normal ne peut PAS déposer de facture sur le contact d\'une autre agence', async () => {
  mockFetch({
    callerId: 'owner1',
    callerEmail: AUTRE_EMAIL,
    contactsRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, ownerId: 'owner2', documents: [] } }],
  });
  const form = new FormData();
  form.set('file', pdfFile());
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 404);
});

test('upload-facture : un admin dépose une facture avec succès et le document est taggé "facture"', async () => {
  const appels = mockFetch({
    callerId: 'admin1',
    callerEmail: ADMIN_EMAIL,
    contactsRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, ownerId: 'owner1', documents: [] } }],
  });
  const form = new FormData();
  form.set('file', pdfFile('juin.pdf'));
  form.set('clientEmail', CLIENT_EMAIL);
  form.set('nom', 'Facture juin 2026');
  const resp = await handler(requeteAvecForm(form));
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

test('upload-facture : un admin dépose une facture sur des contacts de PLUSIEURS agences (comportement historique)', async () => {
  const appels = mockFetch({
    callerId: 'admin1',
    callerEmail: ADMIN_EMAIL,
    contactsRows: [
      { id: 'c1', data: { email: CLIENT_EMAIL, ownerId: 'owner1', documents: [] } },
      { id: 'c2', data: { email: CLIENT_EMAIL, ownerId: 'owner2', documents: [] } },
    ],
  });
  const form = new FormData();
  form.set('file', pdfFile());
  form.set('clientEmail', CLIENT_EMAIL);
  await handler(requeteAvecForm(form));

  const patchCalls = appels.filter(a => a.opts && a.opts.method === 'PATCH');
  assert.equal(patchCalls.length, 2, 'les deux contacts (deux agences) doivent recevoir le document');
});

test('upload-facture : échec propre si le bucket n\'existe pas encore', async () => {
  mockFetch({ callerId: 'admin1', callerEmail: ADMIN_EMAIL, storageOk: false });
  const form = new FormData();
  form.set('file', pdfFile());
  form.set('clientEmail', CLIENT_EMAIL);
  const resp = await handler(requeteAvecForm(form));
  assert.equal(resp.status, 500);
});
