// Vérifie /api/agent-photo-upload : dépôt par l'AGENT LUI-MÊME de sa propre
// photo de profil (authentifié par jeton Supabase, résolu vers sa fiche via
// resolverAgentParEmail — jamais par l'agence, à l'inverse de
// upload-agent-document.js). Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/agent-photo-upload.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function fichierImage({ type = 'image/jpeg', taille = 100 } = {}) {
  const f = new File([new Uint8Array(10)], 'photo.jpg', { type });
  Object.defineProperty(f, 'size', { value: taille });
  return f;
}

function requete({ token = 'jeton-valide', file = fichierImage() } = {}) {
  const form = new FormData();
  if (file !== null) form.set('file', file);
  const headers = new Headers();
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/agent-photo-upload', method: 'POST', headers, formData: async () => form };
}

function fabriquerFetchMock({ userOk = true, email = 'jean@exemple.fr', uploadOk = true, settingsRows } = {}) {
  const appels = { upload: null, patch: null };
  const rows = settingsRows || [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr' }] } }];
  const fn = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) {
      return userOk ? { ok: true, json: async () => ({ email }) } : { ok: false, status: 401 };
    }
    if (String(url).includes('/storage/v1/object/agent-photos/')) {
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

test('email sans fiche agent correspondante : 403', async () => {
  global.fetch = fabriquerFetchMock({ email: 'inconnu@exemple.fr' }).fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 403);
});

test('format de fichier invalide (ni JPG, ni PNG, ni WebP) : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({ file: fichierImage({ type: 'application/pdf' }) }));
  assert.equal(resp.status, 400);
});

test('fichier trop volumineux (> 5 Mo) : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({ file: fichierImage({ taille: 6 * 1024 * 1024 }) }));
  assert.equal(resp.status, 400);
});

test('dépôt réussi : upload dans le bucket agent-photos, chemin scopé par agence, URL publique renvoyée', async () => {
  const { fn, appels } = fabriquerFetchMock();
  global.fetch = fn;

  const resp = await handler(requete());
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.ok(appels.upload, 'le fichier aurait dû être envoyé au bucket');
  assert.ok(String(appels.upload.url).includes('owner-1/agent-1.jpg'), 'le chemin doit être scopé par agence puis par agent');
  assert.ok(body.url.includes('/storage/v1/object/public/agent-photos/'));

  assert.ok(appels.patch, 'la fiche agent aurait dû être mise à jour');
  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.equal(agentMaj.photoPath, body.path);
  assert.equal(agentMaj.nom, 'Jean', 'le reste de la fiche agent doit être préservé');
});

test('un agent ne peut modifier que SA PROPRE fiche (jamais celle d\'un autre agent de la même agence)', async () => {
  const rows = [{ user_id: 'owner-1', data: { agents: [
    { id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr' },
    { id: 'agent-2', nom: 'Marie', email: 'marie@exemple.fr' },
  ] } }];
  const { fn, appels } = fabriquerFetchMock({ settingsRows: rows });
  global.fetch = fn;

  await handler(requete());

  const agent1 = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  const agent2 = appels.patch.corps.data.agents.find(a => a.id === 'agent-2');
  assert.ok(agent1.photoPath);
  assert.equal(agent2.photoPath, undefined, 'un autre agent de la même agence ne doit jamais être modifié');
});

test('échec de l\'upload storage : 500 propre', async () => {
  global.fetch = fabriquerFetchMock({ uploadOk: false }).fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 500);
});
