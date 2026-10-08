// Factures des agents : nettoyage des infos juridiques et de la facture,
// envoi (api/agent-facture-envoyer.js) et téléchargement par l'agence
// (api/agent-facture-download.js). Sans réseau réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'cle-test';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'brevo-test';
import {
  nettoyerInfosLegales, champsLegauxManquants, nettoyerFacture, nomFichierFacture, ajouterFactureHistorique,
} from '../api/_lib/agent-facture.js';
const { default: envoyer } = await import('../api/agent-facture-envoyer.js');
const { default: telecharger } = await import('../api/agent-facture-download.js');
const { default: infosLegales } = await import('../api/agent-infos-legales.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const INFOS = { raisonSociale: 'Jean Dupont EI', statut: 'Micro-entrepreneur', adresse: '1 rue A, 91000 Évry', siret: '123 456 789 00012', regimeTva: 'franchise', iban: 'fr76 1234' };

test('infos juridiques : valeurs bornées, statut et régime connus seulement', () => {
  const i = nettoyerInfosLegales({ ...INFOS, statut: 'Pirate', regimeTva: 'xx', siret: '123-456 789<script>', champInconnu: 'x' });
  assert.equal(i.statut, '');
  assert.equal(i.regimeTva, 'franchise');
  assert.equal(i.tauxTva, 0);
  assert.equal(i.siret, '123456 789');
  assert.equal(i.iban, 'FR76 1234');
  assert.equal('champInconnu' in i, false);
  assert.equal(nettoyerInfosLegales({ regimeTva: 'assujetti' }).tauxTva, 20);
  assert.deepEqual(champsLegauxManquants({}), ['raison sociale', 'adresse', 'SIRET']);
  assert.deepEqual(champsLegauxManquants(nettoyerInfosLegales(INFOS)), []);
});

test('facture : totaux recalculés (jamais ceux du navigateur), TVA selon le régime', () => {
  const brut = { numero: 'F2026-001', date: '2026-10-01', mois: '2026-09', totalHT: 999999,
    lignes: [{ date: '2026-09-02', adresse: 'A', typologie: 'T2', prestation: 'EDL entrant', locataire: 'M. Martin', montant: 47 },
      { prestation: 'Formation', montant: -150 }, { montant: '53.5' }] };
  const f = nettoyerFacture(brut, nettoyerInfosLegales(INFOS));
  assert.equal(f.totalHT, -49.5);
  assert.equal(f.tva, 0);
  assert.equal(f.lignes[0].locataire, 'M. Martin');
  const avecTva = nettoyerFacture(brut, nettoyerInfosLegales({ ...INFOS, regimeTva: 'assujetti', tauxTva: 20 }));
  assert.equal(avecTva.tva, -9.9);
  assert.equal(avecTva.totalTTC, -59.4);
  assert.equal(nettoyerFacture({ date: 'hier', mois: '09/2026' }).date, '');
});

test('nom de fichier sûr et historique sans doublon de numéro', () => {
  assert.equal(nomFichierFacture('F/2026 °001'), 'Facture-F-2026-001.pdf');
  const f = nettoyerFacture({ numero: 'F1', lignes: [{ montant: 10 }] }, {});
  const h = ajouterFactureHistorique([{ numero: 'F1', totalHT: 1 }, { numero: 'F0' }], f, { envoyeeLe: 'x' });
  assert.deepEqual(h.map(x => x.numero), ['F1', 'F0']);
  assert.equal(h[0].totalHT, 10);
});

function requete(corps, token = 'jeton') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('authorization', 'Bearer ' + token);
  return { url: 'https://x.test/api', method: 'POST', headers, json: async () => corps };
}

function mock({ agent = { id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr', infosLegales: INFOS }, brevoOk = true, userId = 'agent-user', email = 'jean@exemple.fr' } = {}) {
  const appels = { brevo: null, upload: null, patch: null, sign: null };
  const rows = [{ user_id: 'owner-1', data: { expediteurEmail: 'contact@edl-idf.com', companyName: 'EDL IDF', agents: [agent] } }];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: userId, email }) };
    if (u.includes('/rest/v1/settings') && opts.method === 'PATCH') { appels.patch = JSON.parse(opts.body); return { ok: true, json: async () => ({}) }; }
    if (u.includes('/rest/v1/settings')) {
      const filtre = /user_id=eq\.([^&]+)/.exec(u);
      return { ok: true, json: async () => filtre ? rows.filter(r => r.user_id === decodeURIComponent(filtre[1])) : rows };
    }
    if (u.includes('/storage/v1/object/sign/')) { appels.sign = u; return { ok: true, json: async () => ({ signedURL: '/object/sign/x?token=t' }) }; }
    if (u.includes('/storage/v1/object/')) { appels.upload = u; return { ok: true, json: async () => ({}) }; }
    if (u.includes('api.brevo.com')) { appels.brevo = JSON.parse(opts.body); return { ok: brevoOk, status: brevoOk ? 201 : 400, json: async () => ({}) }; }
    throw new Error('URL inattendue : ' + u);
  };
  return appels;
}

const PDF = Buffer.from('%PDF-1.3 test').toString('base64');
const FACTURE = { numero: 'F2026-001', date: '2026-10-01', mois: '2026-09', lignes: [{ date: '2026-09-02', adresse: '3 rue B', typologie: 'T2', prestation: 'EDL entrant', locataire: 'M. Martin', montant: 47 }] };

test('envoi : PDF stocké, email à l\'agence (copie agent, PJ), historique sur la fiche', async () => {
  const appels = mock();
  const resp = await envoyer(requete({ facture: FACTURE, pdfBase64: PDF }));
  assert.equal(resp.status, 200);
  assert.match(appels.upload, /agent-documents\/agent-1\/factures\/\d+-Facture-F2026-001\.pdf$/);
  assert.equal(appels.brevo.to[0].email, 'contact@edl-idf.com');
  assert.equal(appels.brevo.cc[0].email, 'jean@exemple.fr');
  assert.equal(appels.brevo.attachment[0].name, 'Facture-F2026-001.pdf');
  assert.equal(appels.brevo.attachment[0].content, PDF);
  const fiche = appels.patch.data.agents[0];
  assert.equal(fiche.factures[0].numero, 'F2026-001');
  assert.equal(fiche.factures[0].totalHT, 47);
  assert.ok(fiche.factures[0].chemin);
  const body = await resp.json();
  assert.equal('chemin' in body.factures[0], false, 'chemin de stockage jamais renvoyé');
});

test('envoi refusé : infos juridiques incomplètes, PDF invalide, Brevo en échec', async () => {
  mock({ agent: { id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr', infosLegales: { raisonSociale: 'X' } } });
  assert.equal((await envoyer(requete({ facture: FACTURE, pdfBase64: PDF }))).status, 400);
  mock();
  assert.equal((await envoyer(requete({ facture: FACTURE, pdfBase64: 'PHNjcmlwdD4=' }))).status, 400);
  assert.equal((await envoyer(requete({ facture: { ...FACTURE, numero: '' }, pdfBase64: PDF }))).status, 400);
  const appels = mock({ brevoOk: false });
  assert.equal((await envoyer(requete({ facture: FACTURE, pdfBase64: PDF }))).status, 502);
  assert.equal(appels.patch, null, 'rien n\'est enregistré si l\'email n\'est pas parti');
  assert.equal((await envoyer(requete({ facture: FACTURE, pdfBase64: PDF }, null))).status, 401);
});

test('téléchargement : l\'agence pour son agent, l\'agent pour lui-même, personne d\'autre', async () => {
  const agent = { id: 'agent-1', nom: 'Jean', email: 'jean@exemple.fr', factures: [{ numero: 'F1', chemin: 'agent-1/factures/1-F.pdf' }] };
  let appels = mock({ agent, userId: 'owner-1', email: 'contact@edl-idf.com' });
  let resp = await telecharger(requete({ agentId: 'agent-1', numero: 'F1' }));
  assert.equal(resp.status, 200);
  assert.match(appels.sign, /agent-documents\/agent-1\/factures\/1-F\.pdf/);
  mock({ agent, userId: 'autre-agence', email: 'autre@x.fr' });
  assert.equal((await telecharger(requete({ agentId: 'agent-1', numero: 'F1' }))).status, 403);
  mock({ agent });
  assert.equal((await telecharger(requete({ numero: 'F1' }))).status, 200);
  assert.equal((await telecharger(requete({ numero: 'F9' }))).status, 404);
});

test('infos juridiques : l\'agent enregistre les siennes (nettoyées) sur sa fiche', async () => {
  const appels = mock();
  const resp = await infosLegales(requete({ infosLegales: { ...INFOS, statut: 'SASU', regimeTva: 'assujetti', tauxTva: 20 } }));
  assert.equal(resp.status, 200);
  const i = appels.patch.data.agents[0].infosLegales;
  assert.equal(i.statut, 'SASU');
  assert.equal(i.tauxTva, 20);
});
