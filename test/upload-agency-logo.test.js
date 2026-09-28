// Vérifie /api/upload-agency-logo : dépôt du logo de l'agence (Paramètres →
// Identité visuelle), réservé aux comptes avec un abonnement payant
// (contrôlé ici côté serveur, pas seulement côté client) — l'admin Lokentia
// passe toujours. Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/upload-agency-logo.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function fichierImage({ type = 'image/png', taille = 100 } = {}) {
  const f = new File([new Uint8Array(10)], 'logo.png', { type });
  Object.defineProperty(f, 'size', { value: taille });
  return f;
}

function requete({ token = 'jeton-valide', file = fichierImage(), method = 'POST' } = {}) {
  const form = new FormData();
  if (file !== null) form.set('file', file);
  const headers = new Headers();
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/upload-agency-logo', method, headers, formData: async () => form };
}

function fabriquerFetchMock({ userOk = true, email = 'jean@exemple.fr', uploadOk = true, plan = 'pro', settingsRows } = {}) {
  const appels = { upload: null, patch: null };
  const rows = settingsRows || [{ data: { companyName: 'Cabinet Jean' } }];
  const fn = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) {
      return userOk ? { ok: true, json: async () => ({ id: 'owner-1', email }) } : { ok: false, status: 401 };
    }
    if (String(url).includes('/rest/v1/user_plans')) {
      return { ok: true, json: async () => [{ plan, status: 'active' }] };
    }
    if (String(url).includes('/storage/v1/object/agency-logos/')) {
      appels.upload = { url, opts };
      return uploadOk ? { ok: true } : { ok: false, status: 500 };
    }
    if (String(url).includes('/rest/v1/settings') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => rows };
    }
    if (String(url).includes('/rest/v1/settings') && opts && opts.method === 'PATCH') {
      appels.patch = { url, corps: JSON.parse(opts.body) };
      return { ok: true, json: async () => ({}) };
    }
    throw new Error('URL inattendue : ' + url);
  };
  return { fn, appels };
}

test('sans jeton : 401 sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; };
  const resp = await handler(requete({ token: null }));
  assert.equal(resp.status, 401);
  assert.equal(appele, false);
});

test('plan gratuit : 403, aucun envoi au bucket', async () => {
  const { fn, appels } = fabriquerFetchMock({ plan: 'free' });
  global.fetch = fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 403);
  assert.equal(appels.upload, null);
});

test('plan payant (starter ou pro) : dépôt accepté', async () => {
  const { fn } = fabriquerFetchMock({ plan: 'starter' });
  global.fetch = fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 200);
});

test('compte admin Lokentia : jamais bloqué même sans ligne user_plans', async () => {
  global.fetch = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'admin-1', email: 'contact@edl-idf.com' }) };
    if (String(url).includes('/storage/v1/object/agency-logos/')) return { ok: true };
    if (String(url).includes('/rest/v1/settings') && (!opts || opts.method !== 'PATCH')) return { ok: true, json: async () => [{ data: {} }] };
    if (String(url).includes('/rest/v1/settings') && opts && opts.method === 'PATCH') return { ok: true, json: async () => ({}) };
    throw new Error('URL inattendue (l\'admin ne doit jamais interroger user_plans) : ' + url);
  };
  const resp = await handler(requete());
  assert.equal(resp.status, 200);
});

test('format de fichier invalide : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({ file: fichierImage({ type: 'application/pdf' }) }));
  assert.equal(resp.status, 400);
});

test('fichier trop volumineux (> 2 Mo) : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({ file: fichierImage({ taille: 3 * 1024 * 1024 }) }));
  assert.equal(resp.status, 400);
});

test('dépôt réussi : upload dans le bucket, chemin scopé par compte, settings.data.logoPath mis à jour', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  const resp = await handler(requete());
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.ok(String(appels.upload.url).includes('owner-1.png'));
  assert.ok(body.url.includes('/storage/v1/object/public/agency-logos/'));
  assert.equal(appels.patch.corps.data.logoPath, body.path);
  assert.equal(appels.patch.corps.data.companyName, 'Cabinet Jean', 'le reste de settings.data doit être préservé');
});

test('échec de l\'upload storage : 500 propre', async () => {
  global.fetch = fabriquerFetchMock({ uploadOk: false }).fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 500);
});

test('DELETE : efface logoPath sans vérification de plan (retirer son propre logo reste toujours possible)', async () => {
  const { fn, appels } = fabriquerFetchMock({ plan: 'free' });
  global.fetch = fn;
  const resp = await handler(requete({ method: 'DELETE' }));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.equal(appels.patch.corps.data.logoPath, '');
});

test('refuse les méthodes autres que POST/DELETE/OPTIONS', async () => {
  const resp = await handler({ url: 'https://x.test/api/upload-agency-logo', method: 'GET', headers: new Headers() });
  assert.equal(resp.status, 405);
});
