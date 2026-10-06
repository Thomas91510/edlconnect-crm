// Rémunération des agents (api/_lib/agent-remuneration.js) : calcul à
// partir de la référence financière de la fiche agent, et exposition par
// /api/agent-missions sans jamais révéler le montant facturé au client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerRemuneration, normaliserReference, montantMission, zoneMission, GRILLE_CONTRAT_2026 } from '../api/_lib/agent-remuneration.js';
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

test('suivi des paiements : reste à payer, payé ce mois, totaux payés par mois', () => {
  const r = calculerRemuneration([
    { id: 'p1', type: 'EDL entrant', statut: 'terminée', date: '2026-09-10T09:00:00', remuPayee: true, remuPayeeLe: '2026-10-10T08:00:00' },
    { id: 'p2', type: 'EDL sortant', statut: 'terminée', date: '2026-09-20T09:00:00' },
    { id: 'p3', type: 'EDL entrant', statut: 'terminée', date: '2026-10-03T09:00:00' },
    { id: 'p4', type: 'EDL sortant', statut: 'planifiée', date: '2026-10-25T09:00:00', remuPayee: true },
  ], FORFAIT, MAINTENANT);
  assert.equal(r.paiements.resteAPayer, 90, 'p2 + p3 non payées');
  assert.equal(r.paiements.nbAPayer, 2);
  assert.equal(r.moisCourant.paye, 45, 'p1 payée en octobre');
  assert.deepEqual(r.parMois.map(m => [m.mois, m.total, m.paye]), [['2026-10', 45, 0], ['2026-09', 90, 45]]);
  const p4 = r.lignes.find(l => l.id === 'p4');
  assert.equal(p4.payee, false, 'une mission non terminée n’est jamais « payée »');
  assert.equal(r.lignes.find(l => l.id === 'p1').payeeLe, '2026-10-10T08:00:00');
});

// ─── Grille par bien (modèle de l'annexe 2 du contrat) ───────────────
const CONTRAT = normaliserReference(GRILLE_CONTRAT_2026);
const m = (o) => ({ type: 'EDL entrant', ...o });

test('grille du contrat 2026 : appartements, maisons, nu / meublé', () => {
  assert.equal(montantMission(m({ bienType: 'Appartement', bienTypo: 'Studio' }), CONTRAT), 42);
  assert.equal(montantMission(m({ bienType: 'Appartement', bienTypo: 'T2' }), CONTRAT), 47);
  assert.equal(montantMission(m({ bienType: 'Appartement', bienTypo: 'T2', bienMeuble: 'Meublé' }), CONTRAT), 57);
  assert.equal(montantMission(m({ bienType: 'Appartement', bienTypo: 'T9' }), CONTRAT), 90, 'T7 et +');
  assert.equal(montantMission(m({ bienType: 'Maison', bienTypo: 'T4' }), CONTRAT), 75);
  assert.equal(montantMission(m({ bienType: 'Maison', bienTypo: 'T4', bienMeuble: 'Meublé' }), CONTRAT), 95);
  assert.equal(montantMission(m({ bienType: '', bienTypo: 'T3' }), CONTRAT), 53, 'type non renseigné = appartement');
  assert.equal(montantMission(m({ bienType: 'Maison', bienTypo: 'T1' }), CONTRAT), null, 'pas de maison T1 au contrat');
});

test('grille du contrat 2026 : garage et locaux commerciaux selon la surface', () => {
  assert.equal(montantMission(m({ bienType: 'Parking' }), CONTRAT), 20);
  assert.equal(montantMission(m({ bienType: 'Local commercial', superficie: '35' }), CONTRAT), 80);
  assert.equal(montantMission(m({ bienType: 'Local commercial', superficie: '50' }), CONTRAT), 160);
  assert.equal(montantMission(m({ bienType: 'Local commercial', superficie: '150' }), CONTRAT), 180);
  assert.equal(montantMission(m({ bienType: 'Local commercial', superficie: '250' }), CONTRAT), null, 'au-delà de la grille');
  assert.equal(montantMission(m({ bienType: 'Local commercial' }), CONTRAT), null, 'surface inconnue');
});

test('sortant + entrant = deux interventions (coefficient modifiable)', () => {
  assert.equal(montantMission(m({ type: 'EDL Sortant / Entrant', bienTypo: 'T2' }), CONTRAT), 94);
  const ref = normaliserReference({ ...GRILLE_CONTRAT_2026, coefSortantEntrant: '1,5' });
  assert.equal(montantMission(m({ type: 'EDL Sortant / Entrant', bienTypo: 'T2' }), ref), 70.5);
});

test('tarif meublé vide : le tarif location nue s\u2019applique', () => {
  const ref = normaliserReference({ mode: 'typologie', lignes: [{ label: 'Tout', nue: 40 }] });
  assert.equal(montantMission(m({ bienMeuble: 'Meublé' }), ref), 40);
});

test('anciens formats bêta (simple / typo / meuble) toujours lus', () => {
  const ref = normaliserReference({ mode: 'typologie', lignes: [
    { label: 'T2 meublé', typo: 'T2', meuble: 'meuble', simple: '50' },
    { label: 'T2', typos: ['T2'], simple: '40' },
  ] });
  assert.equal(ref.lignes[0].meublee, 50);
  assert.equal(ref.lignes[1].nue, 40);
});

test('frais de déplacement par zone (secteurs validés uniquement)', () => {
  const ref = { ...GRILLE_CONTRAT_2026, fraisZone: { primaire: 0, secondaire: 10, hors: 25 } };
  const zones = { primaire: ['94300'], secondaire: ['94160'], statut: 'valide' };
  const missions = [
    { id: 'a', type: 'EDL entrant', bienTypo: 'T2', adresse: '1 rue A, 94300 Vincennes', statut: 'terminée', date: '2026-10-02T09:00:00' },
    { id: 'b', type: 'EDL entrant', bienTypo: 'T2', adresse: '1 rue B, 94160 Saint-Mandé', statut: 'terminée', date: '2026-10-03T09:00:00' },
    { id: 'c', type: 'EDL entrant', bienTypo: 'T2', adresse: '1 rue C, 75011 Paris', statut: 'terminée', date: '2026-10-04T09:00:00' },
  ];
  const r = calculerRemuneration(missions, ref, MAINTENANT, zones);
  const l = id => r.lignes.find(x => x.id === id);
  assert.deepEqual([l('a').zone, l('a').frais, l('a').montant], ['primaire', 0, 47]);
  assert.deepEqual([l('b').zone, l('b').frais, l('b').montant], ['secondaire', 10, 57]);
  assert.deepEqual([l('c').zone, l('c').frais, l('c').montant], ['hors', 25, 72]);
  assert.equal(r.moisCourant.acquis, 176);
  assert.equal(zoneMission(missions[0], { ...zones, statut: 'attente' }), '', 'zones non validées : pas de frais');
});

test('déplacement infructueux : mission annulée cochée comme telle = 50 €, acquise', () => {
  const r = calculerRemuneration([
    { id: 'x', type: 'EDL sortant', bienTypo: 'T3', statut: 'annulée', deplacementInfructueux: true, date: '2026-10-05T09:00:00', adresse: '1 rue, 75011 Paris' },
    { id: 'y', type: 'EDL sortant', bienTypo: 'T3', statut: 'annulée', date: '2026-10-06T09:00:00' },
  ], GRILLE_CONTRAT_2026, MAINTENANT, { primaire: ['94300'], statut: 'valide' });
  assert.equal(r.lignes.length, 1, 'une annulation simple ne compte pas');
  assert.equal(r.lignes[0].montant, 50, 'pas de frais de zone en plus');
  assert.equal(r.lignes[0].ligneGrille, 'Déplacement infructueux');
  assert.equal(r.paiements.resteAPayer, 50);
});
