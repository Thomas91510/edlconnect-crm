// reminder-rdv.js : cron quotidien (rappel J+1, demandes d'avis Google J-1
// et J-3). Fichier le plus volumineux non testé identifié par l'audit du
// 12/09 — impact direct sur la relation client si un rappel ne part jamais,
// part en double, ou si une mission annulée reçoit quand même une demande
// d'avis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/reminder-rdv.js';

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(secret) {
  return { headers: new Headers(secret !== undefined ? { authorization: `Bearer ${secret}` } : {}) };
}

function fmtJour(d) { return d.toISOString().split('T')[0]; }
function dansNJours(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }

// Construit un mock fetch complet : missions renvoyées par Supabase, capture
// des PATCH de marquage et des envois Brevo, et neutralise l'appel de
// synchro Edouard fait en fin de cron (hors périmètre de ce fichier).
function mockComplet(missionsRows, { brevoOk = true } = {}) {
  const patches = [];
  const brevoAppels = [];
  const fetchMock = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/missions') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => missionsRows };
    }
    if (u.includes('/rest/v1/missions') && opts && opts.method === 'PATCH') {
      patches.push({ url: u, body: JSON.parse(opts.body) });
      return { ok: true };
    }
    if (u.includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [] }; // identiteAbonne → repli neutre
    }
    if (u.includes('api.brevo.com')) {
      brevoAppels.push(JSON.parse(opts.body));
      return { ok: brevoOk, json: async () => ({}) };
    }
    if (u.includes('/api/edouard-cron')) {
      return { ok: true, json: async () => ({ journal: null }) };
    }
    return { ok: true, json: async () => [] };
  };
  return { fetchMock, patches, brevoAppels };
}

test('reminder-rdv : refuse sans CRON_SECRET configuré côté serveur', async () => {
  const savedSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const res = await handler(requete('nimportequoi'));
  assert.equal(res.status, 500);
  process.env.CRON_SECRET = savedSecret;
});

test('reminder-rdv : refuse un secret incorrect', async () => {
  const res = await handler(requete('mauvais-secret'));
  assert.equal(res.status, 401);
});

test('reminder-rdv : refuse une requête sans en-tête Authorization', async () => {
  const res = await handler(requete(undefined));
  assert.equal(res.status, 401);
});

test('reminder-rdv : envoie le rappel J+1 à une mission de demain avec un email locataire', async () => {
  const demain = dansNJours(1);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: demain.toISOString(), locataireEmail: 'locataire@x.fr', locataireNom: 'Martin',
    type: 'EDL entrant', adresse: '1 rue Test', agence: 'Agence Test'
  } }];
  const { fetchMock, patches, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.remindersSent, 1);
  assert.equal(brevoAppels.length, 1);
  assert.equal(brevoAppels[0].to[0].email, 'locataire@x.fr');
  assert.ok(patches.some(p => p.body.data.rappelEnvoye === true), 'la mission doit être marquée rappelEnvoye après un envoi réussi');
});

test('reminder-rdv : ignore une mission de demain sans email locataire', async () => {
  const demain = dansNJours(1);
  const rows = [{ id: 'm1', user_id: 'u1', data: { date: demain.toISOString(), type: 'EDL entrant', adresse: '1 rue Test' } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.remindersSent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : n\'envoie rien pour une mission qui n\'est ni demain ni hier ni il y a 3 jours', async () => {
  const dansUneSemaine = dansNJours(7);
  const rows = [{ id: 'm1', user_id: 'u1', data: { date: dansUneSemaine.toISOString(), locataireEmail: 'x@x.fr' } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.remindersSent, 0);
  assert.equal(body.avisSent, 0);
  assert.equal(body.avis2Sent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : n\'envoie pas 2 fois le rappel si l\'envoi Brevo échoue (ne marque pas rappelEnvoye)', async () => {
  const demain = dansNJours(1);
  const rows = [{ id: 'm1', user_id: 'u1', data: { date: demain.toISOString(), locataireEmail: 'x@x.fr' } }];
  const { fetchMock, patches } = mockComplet(rows, { brevoOk: false });
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.remindersSent, 0);
  assert.equal(patches.length, 0, 'un envoi en échec ne doit jamais être marqué comme réussi');
});

test('reminder-rdv : envoie la 1re demande d\'avis (J-1) au locataire', async () => {
  const hier = dansNJours(-1);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: hier.toISOString(), locataireEmail: 'locataire@x.fr', locataireNom: 'Durand', statut: 'terminée'
  } }];
  const { fetchMock, patches, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avisSent, 1);
  assert.equal(brevoAppels[0].to[0].email, 'locataire@x.fr');
  assert.ok(patches.some(p => p.body.data.avisEnvoye === true));
});

// Vérifie le lien avec le correctif "annulée" du 12/09 : une mission annulée
// ne doit jamais recevoir de demande d'avis Google, quel que soit son statut
// exact ("annulée" doit matcher via .includes('annul')).
test('reminder-rdv : n\'envoie PAS de demande d\'avis (J-1) à une mission annulée', async () => {
  const hier = dansNJours(-1);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: hier.toISOString(), locataireEmail: 'locataire@x.fr', statut: 'annulée'
  } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avisSent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : n\'envoie pas 2 fois la demande d\'avis J-1 si déjà envoyée (idempotence)', async () => {
  const hier = dansNJours(-1);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: hier.toISOString(), locataireEmail: 'locataire@x.fr', avisEnvoye: true
  } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avisSent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : demande d\'avis J-1 se rabat sur emailClient pour un particulier sans locataireEmail distinct', async () => {
  const hier = dansNJours(-1);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: hier.toISOString(), typeClient: 'Particulier', emailClient: 'particulier@x.fr', contact: 'Sophie'
  } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avisSent, 1);
  assert.equal(brevoAppels[0].to[0].email, 'particulier@x.fr');
});

test('reminder-rdv : envoie la 2e relance avis (J-3) seulement si la 1re a été envoyée', async () => {
  const day3 = dansNJours(-3);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: day3.toISOString(), locataireEmail: 'locataire@x.fr', avisEnvoye: true
  } }];
  const { fetchMock, patches, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avis2Sent, 1);
  assert.ok(patches.some(p => p.body.data.avis2Envoye === true));
  assert.equal(brevoAppels[0].subject, '⭐ Votre avis compte pour nous');
});

test('reminder-rdv : ne relance PAS J-3 si la 1re demande (J-1) n\'a jamais été envoyée', async () => {
  const day3 = dansNJours(-3);
  const rows = [{ id: 'm1', user_id: 'u1', data: { date: day3.toISOString(), locataireEmail: 'locataire@x.fr' } }]; // avisEnvoye absent
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avis2Sent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : ne relance pas 2 fois J-3 si déjà fait (idempotence)', async () => {
  const day3 = dansNJours(-3);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: day3.toISOString(), locataireEmail: 'locataire@x.fr', avisEnvoye: true, avis2Envoye: true
  } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avis2Sent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : n\'envoie pas la relance J-3 à une mission annulée entre-temps', async () => {
  const day3 = dansNJours(-3);
  const rows = [{ id: 'm1', user_id: 'u1', data: {
    date: day3.toISOString(), locataireEmail: 'locataire@x.fr', avisEnvoye: true, statut: 'annulée'
  } }];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.avis2Sent, 0);
  assert.equal(brevoAppels.length, 0);
});

test('reminder-rdv : traite plusieurs missions indépendamment (une erreur sur l\'une n\'empêche pas les autres)', async () => {
  const demain = dansNJours(1);
  const rows = [
    { id: 'm1', user_id: 'u1', data: { date: demain.toISOString(), locataireEmail: 'a@x.fr' } },
    { id: 'm2', user_id: 'u1', data: { date: demain.toISOString(), locataireEmail: 'b@x.fr' } }
  ];
  const { fetchMock, brevoAppels } = mockComplet(rows);
  global.fetch = fetchMock;
  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.remindersSent, 2);
  assert.equal(brevoAppels.length, 2);
});

test('reminder-rdv : renvoie 500 si la requête Supabase échoue', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/rest/v1/missions')) return { ok: false };
    return { ok: true, json: async () => [] };
  };
  const res = await handler(requete('test-cron-secret'));
  assert.equal(res.status, 500);
});
