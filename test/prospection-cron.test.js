// prospection-cron.js : remplace le scénario Make "Séquence prospection —
// Envoi quotidien", tombé en panne le 14/09 quand le compte Make entier a
// dépassé son quota d'opérations (voir prospection-cron.js pour le contexte
// complet). Zone à haut risque : envoie de vrais emails à de vrais prospects
// avec un plafond quotidien et une logique anti-doublon — une régression ici
// peut spammer des prospects déjà contactés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/prospection-cron.js';

process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(secret) {
  return { headers: new Headers(secret !== undefined ? { authorization: `Bearer ${secret}` } : {}) };
}

function ilYA(jours) { const d = new Date(); d.setDate(d.getDate() - jours); return d.toISOString(); }

// Construit un mock fetch complet : état "prospection" existant, listes
// Brevo, capture des envois et des écritures. Chaque envoi réussi déclenche
// désormais son propre upsert immédiat (contact + compteur du jour) plutôt
// qu'un unique upsert accumulé en fin de run (voir prospection-cron.js) :
// `ecritures` empile donc les lignes de CHAQUE appel, et `derniereLigne`
// retrouve l'état le plus à jour d'un id donné, comme le ferait Supabase.
function mockComplet({ prospectionRows = [], listes = {}, brevoOk = true, contacts = [], contactsOk = true, stock = [] } = {}) {
  const envois = [];
  const ecritures = [];
  const patchsPipeline = [];
  const fetchMock = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/contacts')) {
      if (!contactsOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => (u.includes('offset=0') ? contacts : []) };
    }
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ user_id: 'admin-1' }] };
    if (u.includes('/rest/v1/prospects') && u.includes('etape=eq.a_contacter')) {
      return { ok: true, json: async () => (u.includes('offset=0') ? stock.map(data => ({ data })) : []) };
    }
    if (u.includes('/rest/v1/prospects') && opts && opts.method === 'PATCH') {
      patchsPipeline.push(JSON.parse(opts.body));
      return { ok: true };
    }
    if (u.includes('/rest/v1/prospection') && (!opts || opts.method !== 'POST')) {
      return { ok: true, json: async () => prospectionRows };
    }
    if (u.includes('/rest/v1/prospection') && opts && opts.method === 'POST') {
      ecritures.push(...JSON.parse(opts.body));
      return { ok: true };
    }
    if (u.includes('/v3/contacts/lists/')) {
      const m = u.match(/\/lists\/(\d+)\/contacts/);
      const listId = m[1];
      return { ok: true, json: async () => ({ contacts: (listes[listId] || []).map(email => ({ email })) }) };
    }
    if (u.includes('/v3/smtp/email')) {
      envois.push(JSON.parse(opts.body));
      return { ok: brevoOk };
    }
    return { ok: true, json: async () => [] };
  };
  return {
    fetchMock,
    envois,
    ecritures,
    patchsPipeline,
    derniereLigne(id) { return ecritures.filter(l => l.id === id).pop(); }
  };
}

test('prospection-cron : refuse sans le bon secret', async () => {
  const res = await handler(requete('mauvais-secret'));
  assert.equal(res.status, 401);
});

test('prospection-cron : refuse sans jeton du tout', async () => {
  const res = await handler(requete(undefined));
  assert.equal(res.status, 401);
});

test('prospection-cron : envoie le premier email aux nouveaux prospects des listes Brevo', async () => {
  const mock = mockComplet({
    prospectionRows: [],
    listes: { '45': ['nouveau@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.envoyes.nouveauxProspects, 1);
  assert.equal(mock.envois.length, 1);
  assert.equal(mock.envois[0].templateId, 53);
  assert.equal(mock.envois[0].to[0].email, 'nouveau@agence.fr');

  const ligneProspect = mock.derniereLigne('nouveau@agence.fr');
  assert.equal(ligneProspect.data.stage, 1);
  assert.ok(ligneProspect.data.sentAt1);
});

test('prospection-cron : le premier envoi à un nouveau prospect fait aussi avancer sa carte dans le pipeline commercial', async () => {
  const mock = mockComplet({
    prospectionRows: [],
    listes: { '45': ['nouveau@agence.fr'] }
  });
  let ecritureProspects = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ user_id: 'u1' }] };
    if (u.includes('/rest/v1/prospects') && (!opts || opts.method !== 'POST')) return { ok: true, json: async () => [] };
    if (u.includes('/rest/v1/prospects') && opts && opts.method === 'POST') {
      ecritureProspects = JSON.parse(opts.body)[0];
      return { ok: true };
    }
    return mock.fetchMock(url, opts);
  };

  await handler(requete('test-cron-secret'));

  assert.ok(ecritureProspects, 'une carte doit être créée dans le pipeline commercial');
  assert.equal(ecritureProspects.data.email, 'nouveau@agence.fr');
  assert.equal(ecritureProspects.data.etape, 'email_envoye');
  assert.equal(ecritureProspects.user_id, 'u1');
});

test('prospection-cron : ne recontacte jamais un prospect déjà connu, même présent dans plusieurs listes', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'connu@agence.fr', data: { email: 'connu@agence.fr', stage: 1, sentAt1: new Date().toISOString() } }],
    listes: { '45': ['connu@agence.fr'], '43': ['connu@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.envoyes.nouveauxProspects, 0);
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : relance en J+4 un prospect stage 1 non cliqué, envoyé il y a plus de 4 jours', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'ancien@agence.fr', data: { email: 'ancien@agence.fr', stage: 1, sentAt1: ilYA(5) } }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.relanceJ4, 1);
  assert.equal(mock.envois[0].templateId, 54);
  const ligne = mock.derniereLigne('ancien@agence.fr');
  assert.equal(ligne.data.stage, 2);
  assert.ok(ligne.data.sentAt2);
});

test('prospection-cron : ne relance pas un prospect stage 1 envoyé il y a moins de 4 jours', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'recent@agence.fr', data: { email: 'recent@agence.fr', stage: 1, sentAt1: ilYA(1) } }]
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : ne relance jamais un prospect ayant déjà cliqué', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'a-clique@agence.fr', data: { email: 'a-clique@agence.fr', stage: 1, sentAt1: ilYA(10), clickedAt: ilYA(2) } }],
    listes: { '45': ['a-clique@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : ne relance jamais un prospect dont la séquence a été stoppée (réponse ou désinscription)', async () => {
  const mock = mockComplet({
    prospectionRows: [
      { id: 'desinscrit@agence.fr', data: { email: 'desinscrit@agence.fr', stage: 1, sentAt1: ilYA(10), stoppedAt: ilYA(1), stopReason: 'desinscription' } },
      { id: 'a-repondu@agence.fr', data: { email: 'a-repondu@agence.fr', stage: 2, sentAt1: ilYA(12), sentAt2: ilYA(8), stoppedAt: ilYA(1), stopReason: 'reponse' } }
    ],
    listes: { '45': ['desinscrit@agence.fr', 'a-repondu@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : relance en J+6 un prospect stage 2 non cliqué, envoyé il y a plus de 6 jours', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'stage2@agence.fr', data: { email: 'stage2@agence.fr', stage: 2, sentAt1: ilYA(10), sentAt2: ilYA(7) } }]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.relanceJ6, 1);
  assert.equal(mock.envois[0].templateId, 55);
  const ligne = mock.derniereLigne('stage2@agence.fr');
  assert.equal(ligne.data.stage, 3);
});

test('prospection-cron : ne dépasse jamais le plafond de 250 envois/jour', async () => {
  const emails = Array.from({ length: 10 }, (_, i) => `prospect${i}@agence.fr`);
  const mock = mockComplet({
    prospectionRows: [{ id: `quota:${new Date().toISOString().split('T')[0]}`, data: { quotaCount: 248 } }],
    listes: { '45': emails }
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(mock.envois.length, 2, 'seulement 2 envois pour atteindre le plafond de 250');
  assert.equal(body.quotaUtilise, 250);
  const ligneQuota = mock.derniereLigne(`quota:${new Date().toISOString().split('T')[0]}`);
  assert.equal(ligneQuota.data.quotaCount, 250);
});

test('prospection-cron : plafonne les envois par run pour ne jamais risquer un timeout sur un gros arriéré', async () => {
  // Reproduit l'incident du 19-20/09 : ~200 contacts migrés le même jour
  // franchissent tous le seuil J+4 en même temps. Sans plafond par run, la
  // fonction tente ~200 envois séquentiels d'affilée et peut se faire tuer
  // par le temps d'exécution avant d'avoir rien écrit.
  const rows = Array.from({ length: 90 }, (_, i) => ({
    id: `ancien${i}@agence.fr`,
    data: { email: `ancien${i}@agence.fr`, stage: 1, sentAt1: ilYA(5) }
  }));
  const mock = mockComplet({ prospectionRows: rows });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(mock.envois.length, 60, 'un seul run ne traite jamais plus de 60 envois, quel que soit l\'arriéré');
  assert.equal(body.envoyes.relanceJ4, 60);
  assert.equal(body.quotaUtilise, 60, 'bien en dessous du plafond quotidien de 250 : c\'est le plafond par run qui a arrêté la boucle');
});

test('prospection-cron : chaque envoi réussi est persisté immédiatement (pas seulement à la fin du run)', async () => {
  const mock = mockComplet({
    prospectionRows: [],
    listes: { '45': ['premier@agence.fr', 'second@agence.fr'] }
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));

  // Une écriture Supabase par envoi (contact + compteur du jour à chaque
  // fois), et non un unique upsert groupé écrit tout à la fin : si le run
  // est interrompu juste après le premier envoi, celui-ci reste acquis.
  const idsEcrits = mock.ecritures.map(l => l.id);
  assert.equal(idsEcrits.filter(id => id === 'premier@agence.fr').length, 1);
  assert.ok(idsEcrits.filter(id => id.startsWith('quota:')).length >= 2, 'le compteur du jour est réécrit à chaque envoi, pas une seule fois à la fin');
});

test('prospection-cron : un échec Brevo sur un envoi est rapporté sans bloquer les suivants', async () => {
  const mock = mockComplet({
    prospectionRows: [],
    listes: { '45': ['echoue@agence.fr', 'reussi@agence.fr'] },
    brevoOk: false
  });
  let premierAppel = true;
  const fetchOriginal2 = mock.fetchMock;
  global.fetch = async (url, opts) => {
    if (String(url).includes('/v3/smtp/email')) {
      const ok = premierAppel ? false : true;
      premierAppel = false;
      return fetchOriginal2(url, opts).then(() => ({ ok }));
    }
    return fetchOriginal2(url, opts);
  };

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.nouveauxProspects, 1, 'le 2e envoi réussi doit être compté');
  assert.equal(body.erreurs.length, 1);
  assert.equal(body.erreurs[0].email, 'echoue@agence.fr');
});

// ── Fiches "À contacter" du pipeline, exclusions, clics robots ──

function fiche(email, extra = {}) {
  return { id: 'p_' + email, email, agence: 'Agence ' + email.split('@')[0].toUpperCase() + ' Immobilier', dept: '94', etape: 'a_contacter', ...extra };
}

function avecPipelineActif(fn) {
  return async () => {
    process.env.PROSPECTION_PIPELINE_ACTIF = 'true';
    try { await fn(); } finally { delete process.env.PROSPECTION_PIPELINE_ACTIF; }
  };
}

test('prospection-cron : sans PROSPECTION_PIPELINE_ACTIF=true, aucune fiche du pipeline n\'est contactée', async () => {
  const mock = mockComplet({ stock: [fiche('vitry@agence-test.fr')] });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.envoyes.dontPipeline, 0);
  assert.equal(mock.envois.length, 0);
});

test('prospection-cron : contacte les vraies agences "À contacter" du pipeline une fois les listes Brevo épuisées', avecPipelineActif(async () => {
  const mock = mockComplet({ stock: [fiche('vitry@agence-test.fr')] });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();

  assert.equal(body.envoyes.dontPipeline, 1);
  assert.equal(mock.envois.length, 1);
  assert.equal(mock.envois[0].to[0].email, 'vitry@agence-test.fr');
  assert.equal(mock.envois[0].templateId, 53);
  assert.equal(mock.derniereLigne('vitry@agence-test.fr').data.stage, 1);
}));

test('prospection-cron : ne contacte pas les fiches du pipeline hors cible (mandataire, nom auto, sans département, interne)', avecPipelineActif(async () => {
  const mock = mockComplet({
    stock: [
      fiche('jean.dupont@efficity.com'),
      { id: 'p2', email: 'bernard@agence-x.fr', agence: 'bernard', dept: '94', etape: 'a_contacter' },
      fiche('sansdept@agence-y.fr', { dept: '' }),
      fiche('test@edl-idf.com')
    ]
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
}));

test('prospection-cron : ne prospecte jamais un client, un partenaire ou une adresse blacklistée (listes Brevo comme pipeline)', avecPipelineActif(async () => {
  const mock = mockComplet({
    listes: { '45': ['client@agence.fr', 'blacklist@agence.fr'] },
    stock: [fiche('partenaire@agence.fr'), fiche('Client@Agence.fr')],
    contacts: [
      { email: 'client@agence.fr', bl: null, statut: 'Client actif' },
      { email: 'blacklist@agence.fr', bl: 'true', statut: null },
      { email: 'partenaire@agence.fr', bl: null, statut: 'Partenaire' }
    ]
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.equal(mock.envois.length, 0);
}));

test('prospection-cron : si la liste d\'exclusion est illisible, aucun nouveau prospect n\'est contacté mais les relances continuent', avecPipelineActif(async () => {
  const mock = mockComplet({
    contactsOk: false,
    prospectionRows: [{ id: 'stage1@agence.fr', data: { email: 'stage1@agence.fr', stage: 1, sentAt1: ilYA(5) } }],
    listes: { '45': ['nouveau@agence.fr'] },
    stock: [fiche('stock@agence.fr')]
  });
  global.fetch = mock.fetchMock;

  const res = await handler(requete('test-cron-secret'));
  const body = await res.json();
  assert.equal(body.envoyes.nouveauxProspects, 0);
  assert.equal(body.envoyes.relanceJ4, 1);
  assert.deepEqual(mock.envois.map(e => e.to[0].email), ['stage1@agence.fr']);
}));

test('prospection-cron : la relance J+6 enregistre sa date d\'envoi (sentAt3), pour reconnaître les clics de robots qui suivent', async () => {
  const mock = mockComplet({
    prospectionRows: [{ id: 'stage2@agence.fr', data: { email: 'stage2@agence.fr', stage: 2, sentAt1: ilYA(10), sentAt2: ilYA(7) } }]
  });
  global.fetch = mock.fetchMock;

  await handler(requete('test-cron-secret'));
  assert.ok(mock.derniereLigne('stage2@agence.fr').data.sentAt3);
});
