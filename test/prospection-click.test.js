// prospection-click.js : webhook Brevo (clic) pour la séquence de
// prospection — remplace le scénario Make "Séquence prospection — Capture
// clics". Un clic ignoré à tort ferait relancer inutilement un prospect déjà
// intéressé ; un clic mal enregistré (data écrasée) perdrait sa progression
// (stage/sentAt1...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/prospection-click.js';

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return { method: 'POST', json: async () => body };
}

test('prospection-click : refuse les méthodes autres que POST', async () => {
  const res = await handler({ method: 'GET' });
  assert.equal(res.status, 405);
});

test('prospection-click : répond 200 sans rien écrire si aucun email dans le payload', async () => {
  let ecritureAppelee = false;
  global.fetch = async () => { ecritureAppelee = true; return { ok: true, json: async () => [] }; };
  const res = await handler(requete({ event: 'click' }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ignore, true);
  assert.equal(ecritureAppelee, false);
});

test('prospection-click : enregistre clickedAt en fusionnant avec les données existantes', async () => {
  let ecriture = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospection') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => [{ id: 'prospect@agence.fr', data: { email: 'prospect@agence.fr', stage: 1, sentAt1: '2026-09-10T10:00:00.000Z' } }] };
    }
    if (u.includes('/rest/v1/prospection') && opts && opts.method === 'POST') {
      ecriture = JSON.parse(opts.body);
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };

  const res = await handler(requete({ event: 'click', email: 'prospect@agence.fr' }));
  assert.equal(res.status, 200);

  const ligne = ecriture[0];
  assert.equal(ligne.id, 'prospect@agence.fr');
  assert.equal(ligne.data.stage, 1, 'ne doit pas perdre le stage existant');
  assert.equal(ligne.data.sentAt1, '2026-09-10T10:00:00.000Z', 'ne doit pas perdre sentAt1 existant');
  assert.ok(ligne.data.clickedAt, 'doit ajouter clickedAt');
});

test('prospection-click : crée un enregistrement minimal si le contact était inconnu', async () => {
  let ecriture = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospection') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('/rest/v1/prospection') && opts && opts.method === 'POST') {
      ecriture = JSON.parse(opts.body);
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };

  const res = await handler(requete({ event: 'click', email: 'inconnu@agence.fr' }));
  assert.equal(res.status, 200);
  assert.equal(ecriture[0].id, 'inconnu@agence.fr');
  assert.ok(ecriture[0].data.clickedAt);
});

test('prospection-click : renvoie 500 si l\'écriture Supabase échoue', async () => {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospection') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('/rest/v1/prospection') && opts && opts.method === 'POST') {
      return { ok: false, text: async () => 'erreur' };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete({ event: 'click', email: 'x@agence.fr' }));
  assert.equal(res.status, 500);
});
