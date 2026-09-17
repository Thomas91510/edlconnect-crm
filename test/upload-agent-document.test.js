// Vérifie /api/upload-agent-document : réservé à l'administrateur (l'agent
// ne dépose jamais lui-même son contrat), validations, et rattachement du
// chemin de stockage à la bonne fiche agent — sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
// SUPABASE_SERVICE_KEY est lue dans une constante au chargement du module
// (comme dans upload-facture.js) : il faut la fixer AVANT l'import, donc un
// import dynamique plutôt qu'un import statique (hissé avant tout le reste).
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
const { default: handler } = await import('../api/upload-agent-document.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function fichierPdf(taille = 100) {
  return new File([new Uint8Array(taille)], 'contrat.pdf', { type: 'application/pdf' });
}

function requete({ token = 'jeton-valide', agentId = 'agent-1', type = 'contrat', file = fichierPdf() } = {}) {
  const form = new FormData();
  if (file !== null) form.set('file', file);
  form.set('agentId', agentId);
  form.set('type', type);
  const headers = new Headers();
  if (token !== null) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/upload-agent-document', method: 'POST', headers, formData: async () => form };
}

function fabriquerFetchMock({ userOk = true, email = 'contact@edl-idf.com', uploadOk = true, agentsExistants = [{ id: 'agent-1', nom: 'Jean' }] } = {}) {
  const appels = { upload: null, patch: null };
  const fn = async (url, opts) => {
    if (String(url).includes('/auth/v1/user')) {
      return userOk ? { ok: true, json: async () => ({ id: 'owner-1', email }) } : { ok: false, status: 401 };
    }
    if (String(url).includes('/storage/v1/object/agent-documents/')) {
      appels.upload = { url, opts };
      return uploadOk ? { ok: true } : { ok: false, status: 500 };
    }
    if (String(url).includes('/rest/v1/settings') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => [{ data: { agents: agentsExistants } }] };
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

test('réservé aux administrateurs : un compte non-admin authentifié reçoit 403', async () => {
  global.fetch = fabriquerFetchMock({ email: 'autre@exemple.fr' }).fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 403);
});

test('type invalide (autre que contrat/avenant) : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const resp = await handler(requete({ type: 'facture' }));
  assert.equal(resp.status, 400);
});

test('fichier non-PDF : 400', async () => {
  global.fetch = fabriquerFetchMock().fn;
  const fichierTexte = new File(['x'], 'contrat.txt', { type: 'text/plain' });
  const resp = await handler(requete({ file: fichierTexte }));
  assert.equal(resp.status, 400);
});

test('dépôt réussi : upload dans le bucket et chemin rattaché à la bonne fiche agent', async () => {
  const { fn, appels } = fabriquerFetchMock({ agentsExistants: [{ id: 'agent-1', nom: 'Jean' }, { id: 'agent-2', nom: 'Marie' }] });
  global.fetch = fn;

  const resp = await handler(requete({ agentId: 'agent-2', type: 'avenant' }));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.ok(appels.upload, 'le fichier aurait dû être envoyé au bucket');
  assert.ok(String(appels.upload.url).includes('agent-2/avenant-'));

  assert.ok(appels.patch, 'la fiche agent aurait dû être mise à jour');
  const agentMaj = appels.patch.corps.data.agents.find(a => a.id === 'agent-2');
  assert.ok(agentMaj.avenantPath, 'avenantPath aurait dû être renseigné');
  assert.equal(agentMaj.nom, 'Marie', 'le reste de la fiche agent doit être préservé');
  // L'autre agent ne doit pas être touché.
  const autreAgent = appels.patch.corps.data.agents.find(a => a.id === 'agent-1');
  assert.equal(autreAgent.avenantPath, undefined);
});

test('agent introuvable dans les settings de l\'appelant : 404 après l\'upload', async () => {
  global.fetch = fabriquerFetchMock({ agentsExistants: [{ id: 'autre-agent', nom: 'X' }] }).fn;
  const resp = await handler(requete({ agentId: 'agent-inconnu' }));
  assert.equal(resp.status, 404);
});

test('échec de l\'upload storage : 500 propre', async () => {
  global.fetch = fabriquerFetchMock({ uploadOk: false }).fn;
  const resp = await handler(requete());
  assert.equal(resp.status, 500);
});
