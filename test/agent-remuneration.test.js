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

test('typologie : tarif selon T1…T7+ (studio = T1), colonne sortant + entrant, pré-état à part', () => {
  const ref = normaliserReference({
    mode: 'typologie',
    parTypo: { T1: { simple: '35', double: '60' }, T2: { simple: '40', double: '70' }, T3: { simple: '45', double: '80' }, 'T7+': { simple: '90' } },
    typoAutre: '30',
  });
  assert.equal(ref.configuree, true);
  assert.equal(montantMission({ type: 'EDL entrant', bienTypo: 'Studio' }, ref), 35);
  assert.equal(montantMission({ type: 'EDL sortant', bienTypo: 'F3' }, ref), 45);
  assert.equal(montantMission({ type: 'EDL Sortant / Entrant', bienTypo: 'T2' }, ref), 70);
  assert.equal(montantMission({ type: 'EDL entrant', bienTypo: 'T9' }, ref), 90, 'T8, T9… rattachés au T7+');
  assert.equal(montantMission({ type: 'Pré-état des lieux', bienTypo: 'T4' }, ref), 30);
  assert.equal(montantMission({ type: 'EDL entrant', bienTypo: 'T4' }, ref), null, 'T4 sans tarif');
  assert.equal(montantMission({ type: 'EDL entrant', bienTypo: '' }, ref), null, 'typologie absente de la mission');
});

test('typologie : totaux et typologie renvoyée sur chaque ligne', () => {
  const r = calculerRemuneration([
    { id: 'a', type: 'EDL entrant', bienTypo: 'T2', statut: 'terminée', date: '2026-10-03T09:00:00' },
    { id: 'b', type: 'EDL Sortant / Entrant', bienTypo: 'T3', statut: 'terminée', date: '2026-10-04T09:00:00' },
    { id: 'c', type: 'EDL sortant', bienTypo: '', statut: 'terminée', date: '2026-10-05T09:00:00' },
  ], { mode: 'typologie', parTypo: { T2: { simple: 40 }, T3: { double: 80 } } }, MAINTENANT);
  assert.equal(r.moisCourant.acquis, 120);
  assert.equal(r.nonCouvertes, 1);
  assert.equal(r.lignes.find(l => l.id === 'a').typologie, 'T2');
  assert.equal(r.reference.parType, null, 'en mode typologie, la grille par type n’est pas renvoyée');
});

test('grille libre : lignes personnalisées, critères combinés, première ligne qui correspond', () => {
  const ref = normaliserReference({
    mode: 'typologie',
    lignes: [
      { label: 'Maison', bien: 'Maison', simple: '90', double: '160' },
      { label: 'T2 meublé', typo: 'T2', meuble: 'meuble', simple: '50' },
      { label: 'T2', typo: 'T2', simple: '40', double: '70' },
      { label: 'Parking', bien: 'Parking', simple: '15' },
      { label: '', typo: '', simple: '' }, // ligne vide : ignorée
    ],
  });
  assert.equal(ref.lignes.length, 4);
  assert.equal(montantMission({ type: 'EDL entrant', bienType: 'Maison', bienTypo: 'T2' }, ref), 90, 'la ligne Maison passe avant T2');
  assert.equal(montantMission({ type: 'EDL Sortant / Entrant', bienType: 'Maison', bienTypo: 'T5' }, ref), 160);
  assert.equal(montantMission({ type: 'EDL entrant', bienType: 'Appartement', bienTypo: 'T2', bienMeuble: 'Meublé' }, ref), 50);
  assert.equal(montantMission({ type: 'EDL entrant', bienType: 'Appartement', bienTypo: 'T2', bienMeuble: 'Nu' }, ref), 40);
  assert.equal(montantMission({ type: 'EDL Sortant / Entrant', bienTypo: 'T2', bienMeuble: 'Meublé' }, ref), null, 'T2 meublé sans colonne sortant + entrant');
  assert.equal(montantMission({ type: 'EDL sortant', bienType: 'Parking' }, ref), 15);
  assert.equal(montantMission({ type: 'EDL sortant', bienTypo: 'T4' }, ref), null, 'aucune ligne pour un T4');
  assert.equal(ref.lignes[1].criteres, 'T2 · meublé');
});

test('grille libre : le libellé de la ligne appliquée est renvoyé pour chaque mission', () => {
  const r = calculerRemuneration(
    [{ id: 'x', type: 'EDL entrant', bienType: 'Maison', statut: 'terminée', date: '2026-10-03T09:00:00' }],
    { mode: 'typologie', lignes: [{ label: 'Maison', bien: 'Maison', simple: 90 }] }, MAINTENANT);
  assert.equal(r.lignes[0].ligneGrille, 'Maison');
  assert.equal(r.lignes[0].montant, 90);
});
