// Vérifie resoudreOwnerId (api/_lib/resoudre-owner.js) : retrouve l'agence
// propriétaire d'un lien public à partir de agencyId/contactId/email/agence
// — même ordre de fiabilité que booking-request.js — avec repli sur un
// compte par défaut. Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resoudreOwnerId } from '../api/_lib/resoudre-owner.js';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const BASE = { supabaseUrl: 'https://x.test', serviceKey: 'cle-test', ownerParDefaut: 'owner-defaut' };

test('agencyId trouvé : utilisé en priorité, aucun autre critère consulté', async () => {
  let appels = 0;
  global.fetch = async (url) => {
    appels++;
    assert.ok(String(url).includes('id=eq.agence-42'));
    return { ok: true, json: async () => [{ user_id: 'owner-agence-42' }] };
  };
  const id = await resoudreOwnerId({ ...BASE, agencyId: 'agence-42', contactId: 'c1', email: 'x@exemple.fr', agence: 'Nom' });
  assert.equal(id, 'owner-agence-42');
  assert.equal(appels, 1, 'un seul lookup, agencyId a suffi');
});

test('agencyId introuvable : repli sur contactId', async () => {
  const appelsUrls = [];
  global.fetch = async (url) => {
    appelsUrls.push(String(url));
    if (String(url).includes('id=eq.agence-inconnue')) return { ok: true, json: async () => [] };
    if (String(url).includes('id=eq.contact-7')) return { ok: true, json: async () => [{ user_id: 'owner-contact-7' }] };
    throw new Error('URL inattendue : ' + url);
  };
  const id = await resoudreOwnerId({ ...BASE, agencyId: 'agence-inconnue', contactId: 'contact-7' });
  assert.equal(id, 'owner-contact-7');
  assert.equal(appelsUrls.length, 2);
});

test('agencyId et contactId absents/introuvables : repli sur email', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('data-%3E%3Eemail')) return { ok: true, json: async () => [{ user_id: 'owner-email' }] };
    return { ok: true, json: async () => [] };
  };
  const id = await resoudreOwnerId({ ...BASE, email: 'jean@exemple.fr' });
  assert.equal(id, 'owner-email');
});

test('seul le nom d\'agence est fourni : repli sur agence (correspondance nom)', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('data-%3E%3Eentreprise')) return { ok: true, json: async () => [{ user_id: 'owner-nom' }] };
    return { ok: true, json: async () => [] };
  };
  const id = await resoudreOwnerId({ ...BASE, agence: 'Agence Dupont' });
  assert.equal(id, 'owner-nom');
});

test('aucun identifiant ne résout : repli sur le compte par défaut', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });
  const id = await resoudreOwnerId({ ...BASE, agencyId: 'inconnu', contactId: 'inconnu', email: 'x@exemple.fr', agence: 'Inconnue' });
  assert.equal(id, 'owner-defaut');
});

test('aucun identifiant fourni du tout : repli direct, aucun appel réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };
  const id = await resoudreOwnerId({ ...BASE });
  assert.equal(id, 'owner-defaut');
  assert.equal(appele, false);
});

test('clé de service ou URL Supabase absente : repli direct sans exception', async () => {
  const id1 = await resoudreOwnerId({ supabaseUrl: '', serviceKey: 'x', agencyId: 'a', ownerParDefaut: 'owner-defaut' });
  const id2 = await resoudreOwnerId({ supabaseUrl: 'https://x.test', serviceKey: '', agencyId: 'a', ownerParDefaut: 'owner-defaut' });
  assert.equal(id1, 'owner-defaut');
  assert.equal(id2, 'owner-defaut');
});

test('panne réseau Supabase : dégrade vers le compte par défaut, pas d\'exception', async () => {
  global.fetch = async () => { throw new Error('panne réseau'); };
  const id = await resoudreOwnerId({ ...BASE, agencyId: 'agence-42' });
  assert.equal(id, 'owner-defaut');
});

test('deux abonnés avec un contact du même nom d\'agence : email (plus fiable) départage avant le nom', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('data-%3E%3Eemail')) return { ok: true, json: async () => [{ user_id: 'owner-vrai' }] };
    if (String(url).includes('data-%3E%3Eentreprise')) return { ok: true, json: async () => [{ user_id: 'owner-homonyme' }] };
    return { ok: true, json: async () => [] };
  };
  const id = await resoudreOwnerId({ ...BASE, email: 'vrai@exemple.fr', agence: 'Agence Homonyme' });
  assert.equal(id, 'owner-vrai');
});

test('aucun repli configuré et rien ne résout : chaîne vide (jamais undefined/null)', async () => {
  global.fetch = async () => ({ ok: true, json: async () => [] });
  const id = await resoudreOwnerId({ supabaseUrl: 'https://x.test', serviceKey: 'cle', agencyId: 'inconnu', ownerParDefaut: '' });
  assert.equal(id, '');
});
