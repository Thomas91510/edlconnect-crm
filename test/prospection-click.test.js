// prospection-click.js : webhook Brevo (clic) pour la séquence de
// prospection — remplace le scénario Make "Séquence prospection — Capture
// clics". Un clic ignoré à tort ferait relancer inutilement un prospect déjà
// intéressé ; un clic mal enregistré (data écrasée) perdrait sa progression
// (stage/sentAt1...). Protégé par un secret partagé dans l'URL (?secret=)
// — sans lui, n'importe qui pourrait polluer la table de prospection avec
// un email arbitraire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/prospection-click.js';

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const SECRET = 'secret-test-123';
const envSecretOriginal = process.env.PROSPECTION_WEBHOOK_SECRET;
const fetchOriginal = global.fetch;
test.before(() => { process.env.PROSPECTION_WEBHOOK_SECRET = SECRET; });
test.after(() => {
  global.fetch = fetchOriginal;
  if (envSecretOriginal === undefined) delete process.env.PROSPECTION_WEBHOOK_SECRET;
  else process.env.PROSPECTION_WEBHOOK_SECRET = envSecretOriginal;
});

function requete(body, { secret = SECRET } = {}) {
  const qs = secret ? '?secret=' + encodeURIComponent(secret) : '';
  return { method: 'POST', url: 'https://x.test/api/prospection-click' + qs, json: async () => body };
}

test('prospection-click : refuse les méthodes autres que POST', async () => {
  const res = await handler({ method: 'GET' });
  assert.equal(res.status, 405);
});

test('prospection-click : refuse sans le secret attendu dans l\'URL', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; return { ok: true, json: async () => [] }; };
  const res = await handler(requete({ event: 'click', email: 'x@agence.fr' }, { secret: '' }));
  assert.equal(res.status, 401);
  assert.equal(appele, false);
});

test('prospection-click : refuse avec un secret incorrect', async () => {
  const res = await handler(requete({ event: 'click', email: 'x@agence.fr' }, { secret: 'mauvais-secret' }));
  assert.equal(res.status, 401);
});

test('prospection-click : refuse tout le monde si PROSPECTION_WEBHOOK_SECRET n\'est pas configuré (fail closed)', async () => {
  delete process.env.PROSPECTION_WEBHOOK_SECRET;
  try {
    const res = await handler(requete({ event: 'click', email: 'x@agence.fr' }));
    assert.equal(res.status, 401);
  } finally {
    process.env.PROSPECTION_WEBHOOK_SECRET = SECRET;
  }
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

test('prospection-click : fait aussi avancer la carte du prospect dans le pipeline commercial', async () => {
  let patchProspects = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/prospection') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => [{ id: 'prospect@agence.fr', data: { email: 'prospect@agence.fr', stage: 1, sentAt1: '2026-09-10T10:00:00.000Z' } }] };
    }
    if (u.includes('/rest/v1/prospection') && opts && opts.method === 'POST') {
      return { ok: true };
    }
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ user_id: 'u1' }] };
    if (u.includes('/rest/v1/prospects') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => [{ id: 'p1', data: { agence: 'Agence Prospect', email: 'prospect@agence.fr', etape: 'email_envoye' } }] };
    }
    if (u.includes('/rest/v1/prospects') && opts && opts.method === 'PATCH') {
      patchProspects = JSON.parse(opts.body);
      return { ok: true };
    }
    return { ok: true, json: async () => [] };
  };

  const res = await handler(requete({ event: 'click', email: 'prospect@agence.fr' }));
  assert.equal(res.status, 200);
  assert.ok(patchProspects, 'la carte du pipeline doit être mise à jour');
  assert.equal(patchProspects.data.etape, 'email_ouvert');
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
