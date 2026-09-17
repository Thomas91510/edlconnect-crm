// Vérifie /api/agent-missions : authentification par jeton Supabase,
// résolution de l'agent, filtrage strict des missions (jamais celles d'un
// autre agent ni d'une autre agence), et calcul des KPI. Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/agent-missions.js';

const fetchOriginal = global.fetch;
const envOriginal = process.env.SUPABASE_SERVICE_KEY;
test.after(() => { global.fetch = fetchOriginal; process.env.SUPABASE_SERVICE_KEY = envOriginal; });
test.beforeEach(() => { process.env.SUPABASE_SERVICE_KEY = 'cle-test'; });

function requete(token) {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api/agent-missions', method: 'GET', headers };
}

function fabriquerFetchMock({ userOk = true, email = 'jean@exemple.fr', settingsRows, missionsRows }) {
  return async (url) => {
    if (String(url).includes('/auth/v1/user')) {
      if (!userOk) return { ok: false, status: 401 };
      return { ok: true, json: async () => ({ email }) };
    }
    if (String(url).includes('/rest/v1/settings')) {
      return { ok: true, json: async () => settingsRows };
    }
    if (String(url).includes('/rest/v1/missions')) {
      return { ok: true, json: async () => missionsRows };
    }
    throw new Error('URL inattendue : ' + url);
  };
}

const AGENTS_OWNER1 = [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', nom: 'Jean Dupont', email: 'jean@exemple.fr' }] } }];

test('sans jeton : 401 sans appeler le réseau', async () => {
  let appele = false;
  global.fetch = async () => { appele = true; };

  const resp = await handler(requete(undefined));
  assert.equal(resp.status, 401);
  assert.equal(appele, false);
});

test('session invalide : 401', async () => {
  global.fetch = fabriquerFetchMock({ userOk: false, settingsRows: [], missionsRows: [] });
  const resp = await handler(requete('jeton-invalide'));
  assert.equal(resp.status, 401);
});

test('email authentifié sans fiche agent correspondante : 403', async () => {
  global.fetch = fabriquerFetchMock({ email: 'inconnu@exemple.fr', settingsRows: AGENTS_OWNER1, missionsRows: [] });
  const resp = await handler(requete('jeton-valide'));
  assert.equal(resp.status, 403);
});

test('ne renvoie que les missions de cet agent (jamais celles d\'un autre agent)', async () => {
  const missionsRows = [
    { id: 'm1', data: { expertId: 'agent-1', type: 'EDL entrant', adresse: '1 rue A', bienTypo: 'T2', bienMeuble: 'Meublé', date: '2026-09-20T09:00:00' } },
    { id: 'm2', data: { expertId: 'agent-2', type: 'EDL sortant', adresse: '2 rue B' } }, // autre agent
    { id: 'm3', data: { expertId: '', type: 'EDL entrant', adresse: '3 rue C' } }, // pas assignée
  ];
  global.fetch = fabriquerFetchMock({ settingsRows: AGENTS_OWNER1, missionsRows });

  const resp = await handler(requete('jeton-valide'));
  const body = await resp.json();

  assert.equal(resp.status, 200);
  assert.equal(body.missions.length, 1);
  assert.equal(body.missions[0].id, 'm1');
  assert.equal(body.missions[0].adresse, '1 rue A');
  assert.equal(body.agent.nom, 'Jean Dupont');
  assert.equal(body.kpi.total, 1);
});

test('trie les missions par date croissante', async () => {
  const missionsRows = [
    { id: 'm-tard', data: { expertId: 'agent-1', date: '2026-09-25T09:00:00' } },
    { id: 'm-tot', data: { expertId: 'agent-1', date: '2026-09-18T09:00:00' } },
  ];
  global.fetch = fabriquerFetchMock({ settingsRows: AGENTS_OWNER1, missionsRows });

  const resp = await handler(requete('jeton-valide'));
  const body = await resp.json();

  assert.deepEqual(body.missions.map(m => m.id), ['m-tot', 'm-tard']);
});

test('exclut les champs financiers/internes non listés (contrôle par liste blanche)', async () => {
  const missionsRows = [
    { id: 'm1', data: { expertId: 'agent-1', type: 'EDL entrant', prixHT: 250, agence: 'Orpi Test', emailClient: 'agence@exemple.fr' } },
  ];
  global.fetch = fabriquerFetchMock({ settingsRows: AGENTS_OWNER1, missionsRows });

  const resp = await handler(requete('jeton-valide'));
  const body = await resp.json();

  const champs = Object.keys(body.missions[0]);
  assert.ok(!champs.includes('prixHT'));
  assert.ok(!champs.includes('agence'));
  assert.ok(!champs.includes('emailClient'));
});

test('missions : n\'expose jamais rapportUrl (les documents agent sont contrat/avenant, pas les EDL)', async () => {
  const missionsRows = [
    { id: 'm1', data: { expertId: 'agent-1', type: 'EDL entrant', rapportUrl: 'https://exemple.supabase.co/rapport.pdf' } },
  ];
  global.fetch = fabriquerFetchMock({ settingsRows: AGENTS_OWNER1, missionsRows });

  const resp = await handler(requete('jeton-valide'));
  const body = await resp.json();

  assert.ok(!Object.keys(body.missions[0]).includes('rapportUrl'));
});

test('agent.documents indique la présence du contrat/avenant sans exposer le chemin de stockage', async () => {
  const agentsAvecDocs = [{ user_id: 'owner-1', data: { agents: [
    { id: 'agent-1', nom: 'Jean Dupont', email: 'jean@exemple.fr', contratPath: 'agent-1/contrat-123.pdf' },
  ] } }];
  global.fetch = fabriquerFetchMock({ settingsRows: agentsAvecDocs, missionsRows: [] });

  const resp = await handler(requete('jeton-valide'));
  const body = await resp.json();

  assert.deepEqual(body.agent.documents, { contrat: true, avenant: false });
  assert.ok(!JSON.stringify(body).includes('agent-1/contrat-123.pdf'), 'le chemin de stockage ne doit jamais être renvoyé au client');
});

test('panne réseau sur les missions : 500 propre (pas de fuite d\'exception)', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: 'jean@exemple.fr' }) };
    if (String(url).includes('/rest/v1/settings')) return { ok: true, json: async () => AGENTS_OWNER1 };
    if (String(url).includes('/rest/v1/missions')) return { ok: false, status: 500 };
  };

  const resp = await handler(requete('jeton-valide'));
  assert.equal(resp.status, 500);
});

test('refuse les méthodes autres que GET/OPTIONS', async () => {
  const resp = await handler({ url: 'https://x.test/api/agent-missions', method: 'POST', headers: new Headers() });
  assert.equal(resp.status, 405);
});
