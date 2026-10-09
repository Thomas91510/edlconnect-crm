import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identiteAbonne } from '../api/_lib/identite.js';

const NEUTRE_EMAIL = 'contact@lokentia.fr';
const SUPA_URL = 'https://fake.supabase.co';
const SERVICE_KEY = 'fake-key';

function mockFetchOnce(t, rows) {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => rows
  }));
}

test('sans userId/supaUrl/serviceKey : repli neutre', async () => {
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, '');
  assert.equal(ident.email, NEUTRE_EMAIL);
  assert.equal(ident.nom, 'Lokentia');
});

function mockSettingsEtCompte(t, rows, emailCompte) {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/auth/v1/admin/users/')) return { ok: true, json: async () => ({ email: emailCompte }) };
    return { ok: true, json: async () => rows };
  });
}

test('domaine vérifié + compte admin : expédie sous sa propre adresse, pas de reply-to', async (t) => {
  mockSettingsEtCompte(t, [{ data: { expediteurNom: 'Agence Test', expediteurEmail: 'contact@lokentia.fr' } }], 'contact@edl-idf.com');
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-1');
  assert.equal(ident.nom, 'Agence Test');
  assert.equal(ident.email, 'contact@lokentia.fr');
  assert.equal(ident.replyTo, '');
});

test('domaine vérifié saisi par un autre abonné : expéditeur neutre, pas de reply-to usurpé', async (t) => {
  mockSettingsEtCompte(t, [{ data: { expediteurNom: 'Pirate', expediteurEmail: 'contact@edl-idf.com' } }], 'pirate@gmail.com');
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-9');
  assert.equal(ident.email, NEUTRE_EMAIL);
  assert.equal(ident.replyTo, '');
});

test('domaine vérifié, compte illisible : expéditeur neutre', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => String(url).includes('/auth/v1/admin/users/')
    ? { ok: false, json: async () => ({}) }
    : { ok: true, json: async () => [{ data: { expediteurEmail: 'contact@edl-idf.com' } }] });
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-8');
  assert.equal(ident.email, NEUTRE_EMAIL);
});

test('domaine non vérifié : repli neutre + reply-to vers l\'abonné', async (t) => {
  mockFetchOnce(t, [{ data: { expediteurNom: 'Agence Test', expediteurEmail: 'agence@exemple-non-verifie.fr' } }]);
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-2');
  assert.equal(ident.nom, 'Agence Test');
  assert.equal(ident.email, NEUTRE_EMAIL);
  assert.equal(ident.replyTo, 'agence@exemple-non-verifie.fr');
});

test('aucune ligne settings : repli neutre', async (t) => {
  mockFetchOnce(t, []);
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-3');
  assert.equal(ident.email, NEUTRE_EMAIL);
  assert.equal(ident.nom, 'Lokentia');
});

test('réponse Supabase en erreur : repli neutre, ne lance pas', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-4');
  assert.equal(ident.email, NEUTRE_EMAIL);
});

test('fetch qui lève une exception réseau : repli neutre, ne lance pas', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('réseau coupé'); });
  await assert.doesNotReject(identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-5'));
  const ident = await identiteAbonne(SUPA_URL, SERVICE_KEY, 'user-5');
  assert.equal(ident.email, NEUTRE_EMAIL);
});
