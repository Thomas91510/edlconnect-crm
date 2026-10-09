// Contrat de sous-traitance RGPD : texte, preuve de signature horodatée
// (bucket privé), refus si la version a changé, admin dispensé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
process.env.BREVO_API_KEY = 'cle-brevo';
process.env.EDITEUR_RAISON_SOCIALE = 'Éditeur Test SAS';
process.env.EDITEUR_SIRET = '12345678900011';
const lib = await import('../api/_lib/contrat-rgpd.js');
const { default: handler, derniereSignature } = await import('../api/contrat-rgpd.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function req(method, { token = 't', body } = {}) {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'TestUA' });
  if (token) headers.set('authorization', 'Bearer ' + token);
  return { method, headers, json: async () => body };
}

function mock({ email = 'presta@x.fr', fichiers = [], upload } = {}) {
  const appels = { upload: null, brevo: null };
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u42', email }) };
    if (u.includes('/storage/v1/object/list/sauvegardes')) {
      assert.equal(JSON.parse(opts.body).prefix, 'contrats-rgpd/u42/');
      return { ok: true, json: async () => fichiers.map(name => ({ name })) };
    }
    if (u.includes('/storage/v1/object/sauvegardes/')) { appels.upload = { u, corps: JSON.parse(opts.body) }; return { ok: upload !== false }; }
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ data: { companyName: 'Presta SARL' } }] };
    if (u.includes('api.brevo.com')) { appels.brevo = JSON.parse(opts.body); return { ok: true }; }
    throw new Error('URL inattendue ' + u);
  };
  return appels;
}

test('texte : identité de l’éditeur, sous-traitants, 48 h, version', () => {
  const html = lib.contratHtml();
  assert.ok(html.includes('Éditeur Test SAS'));
  assert.ok(html.includes('SIRET 12345678900011'));
  for (const s of lib.SOUS_TRAITANTS) assert.ok(html.includes(s.nom.replace('&', '&amp;')), s.nom);
  assert.ok(html.includes('48 heures'));
  assert.ok(lib.contratActif());
});

test('GET sans session : texte lisible avant inscription', async () => {
  global.fetch = async () => { throw new Error('aucun appel attendu'); };
  const r = await handler(req('GET', { token: null }));
  const d = await r.json();
  assert.equal(d.version, lib.VERSION);
  assert.equal(d.empreinte, await lib.empreinte(lib.contratHtml()));
  assert.equal(d.signature, undefined);
});

test('GET : non signé, puis signé pour la version en cours seulement', async () => {
  mock({ fichiers: ['2020-01-01__2020-01-02T10-00-00.000Z.json'] });
  let d = await (await handler(req('GET'))).json();
  assert.equal(d.signature, null, 'une ancienne version ne vaut pas signature');
  mock({ fichiers: [`${lib.VERSION}__2026-10-09T12-30-05.123Z.json`] });
  d = await (await handler(req('GET'))).json();
  assert.deepEqual(d.signature, { version: lib.VERSION, date: '2026-10-09T12:30:05.123Z' });
});

test('POST : preuve horodatée écrite côté serveur + copie email', async () => {
  const appels = mock();
  const empreinte = await lib.empreinte(lib.contratHtml());
  const r = await handler(req('POST', { body: { accepte: true, version: lib.VERSION, empreinte } }));
  assert.equal(r.status, 200);
  const p = appels.upload.corps;
  assert.match(appels.upload.u, new RegExp(`/contrats-rgpd/u42/${lib.VERSION}__`));
  assert.equal(p.email, 'presta@x.fr');
  assert.equal(p.societe, 'Presta SARL');
  assert.equal(p.ip, '203.0.113.7');
  assert.equal(p.empreinte, empreinte);
  assert.equal(appels.brevo.to[0].email, 'presta@x.fr');
  assert.ok(appels.brevo.htmlContent.includes(empreinte));
});

test('POST : refus sans case cochée ou si le texte a changé', async () => {
  const appels = mock();
  let r = await handler(req('POST', { body: { accepte: false } }));
  assert.equal(r.status, 400);
  r = await handler(req('POST', { body: { accepte: true, version: lib.VERSION, empreinte: 'ancienne' } }));
  assert.equal(r.status, 409);
  assert.equal(appels.upload, null);
});

test('admin (éditeur) dispensé', async () => {
  mock({ email: 'contact@edl-idf.com' });
  const d = await (await handler(req('GET'))).json();
  assert.equal(d.exempt, true);
});

test('derniereSignature : date ISO reconstituée', () => {
  assert.equal(derniereSignature(['v1__2026-01-02T03-04-05.678Z.json', 'v1__2026-02-02T03-04-05.678Z.json'], 'v1').date, '2026-02-02T03:04:05.678Z');
  assert.equal(derniereSignature([], 'v1'), null);
});
