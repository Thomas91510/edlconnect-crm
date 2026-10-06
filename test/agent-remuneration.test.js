// Rémunération des agents (api/_lib/agent-remuneration.js) : calcul à
// partir de la référence financière de la fiche agent, et exposition par
// /api/agent-missions sans jamais révéler le montant facturé au client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerRemuneration, normaliserReference, montantMission } from '../api/_lib/agent-remuneration.js';
import handler from '../api/agent-missions.js';

const MAINTENANT = new Date('2026-10-15T12:00:00Z');
const FORFAIT = { mode: 'forfait', parType: { entrant: '45', sortant: '45', simultane: '80', autre: '' }, unite: 'HT' };

const MISSIONS = [
  { id: 'm1', type: 'EDL entrant', statut: 'terminée', date: '2026-10-02T09:00:00', montant: 120 },
  { id: 'm2', type: 'EDL Sortant / Entrant', statut: 'terminée', date: '2026-10-05T09:00:00', montant: 200 },
  { id: 'm3', type: 'EDL sortant', statut: 'planifiée', date: '2026-10-20T09:00:00', montant: 150 },
  { id: 'm4', type: 'EDL sortant', statut: 'annulée', date: '2026-10-21T09:00:00', montant: 150 },
  { id: 'm5', type: 'EDL entrant', statut: 'terminée', date: '2026-09-12T09:00:00', montant: 120 },
  { id: 'm6', type: 'Pré-état des lieux', statut: 'terminée', date: '2026-10-08T09:00:00', montant: 90 },
];

test('forfait : acquis = missions terminées du mois, prévu = planifiées, annulées ignorées', () => {
  const r = calculerRemuneration(MISSIONS, FORFAIT, MAINTENANT);
  assert.equal(r.reference.configuree, true);
  assert.equal(r.moisCourant.acquis, 125, '45 (entrant) + 80 (sortant+entrant)');
  assert.equal(r.moisCourant.nbAcquises, 2);
  assert.equal(r.moisCourant.prevu, 45);
  assert.equal(r.nonCouvertes, 1, 'le pré-état des lieux n’a pas de tarif dans la référence');
  assert.ok(!r.lignes.some(l => l.id === 'm4'), 'une mission annulée n’apparaît pas');
  assert.deepEqual(r.parMois.map(m => [m.mois, m.total]), [['2026-10', 125], ['2026-09', 45]]);
});

test('pourcentage : part de l’agent arrondie au centime', () => {
  const ref = normaliserReference({ mode: 'pourcentage', pourcentage: '37,5' });
  assert.equal(montantMission({ type: 'EDL entrant', montant: 99.99 }, ref), 37.5);
  const r = calculerRemuneration(MISSIONS, { mode: 'pourcentage', pourcentage: 40 }, MAINTENANT);
  assert.equal(r.moisCourant.acquis, 164, '40 % de 120 + 200 + 90');
});

test('référence absente ou vide : non configurée, aucun montant', () => {
  const r = calculerRemuneration(MISSIONS, undefined, MAINTENANT);
  assert.equal(r.reference.configuree, false);
  assert.ok(r.lignes.every(l => l.montant === null));
  assert.equal(r.moisCourant.acquis, 0);
});

test('valeurs invalides ou négatives ignorées', () => {
  const ref = normaliserReference({ mode: 'forfait', parType: { entrant: '-5', sortant: 'abc' }, unite: 'bidon' });
  assert.equal(ref.parType.entrant, null);
  assert.equal(ref.parType.sortant, null);
  assert.equal(ref.unite, 'HT');
  assert.equal(ref.configuree, false);
});

test('/api/agent-missions : renvoie la rémunération sans le montant facturé au client', async () => {
  const fetchOriginal = global.fetch;
  const envOriginal = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_SERVICE_KEY = 'cle-test';
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: 'jean@exemple.fr' }) };
    if (String(url).includes('/rest/v1/settings')) return { ok: true, json: async () => [{ user_id: 'owner-1', data: { agents: [{ id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr', remuneration: FORFAIT }] } }] };
    if (String(url).includes('/rest/v1/missions')) return { ok: true, json: async () => [{ id: 'm1', data: { expertId: 'agent-1', type: 'EDL entrant', statut: 'terminée', date: '2026-10-02T09:00:00', montant: 120 } }] };
    throw new Error('URL inattendue : ' + url);
  };
  try {
    const headers = new Headers({ authorization: 'Bearer jeton' });
    const resp = await handler({ url: 'https://x.test/api/agent-missions', method: 'GET', headers });
    const data = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(data.remuneration.reference.parType.entrant, 45);
    assert.equal(data.remuneration.lignes[0].montant, 45);
    assert.ok(!JSON.stringify(data).includes('120'), 'le montant facturé (120) ne doit jamais être renvoyé');
  } finally {
    global.fetch = fetchOriginal;
    process.env.SUPABASE_SERVICE_KEY = envOriginal;
  }
});
