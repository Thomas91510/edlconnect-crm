// Rémunération d'un agent EDL, calculée côté serveur à partir de la
// référence financière saisie par l'agence dans sa fiche (CRM › Réglages ›
// Agents EDL › « Rémunération »). L'agent ne peut que la consulter.
//
// Deux modes :
//   * forfait     : un montant par type d'état des lieux (entrant, sortant,
//                   sortant + entrant, autre) ;
//   * pourcentage : un pourcentage du montant HT facturé pour la mission.
//
// Seules les missions TERMINÉES sont « acquises » ; les missions planifiées
// ou en cours sont « prévues » ; les annulées ne comptent jamais. Le montant
// facturé au client n'est jamais renvoyé, seulement la part de l'agent.
import { categorieEdl } from './agent-kpi.js';

export const LIBELLES_TYPE = {
  entrant: 'EDL entrant',
  sortant: 'EDL sortant',
  simultane: 'Sortant + entrant',
  autre: 'Autre (pré-état des lieux…)',
};
const UNITES = ['HT', 'TTC', 'net'];

function nombre(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const arrondi = (n) => Math.round(n * 100) / 100;

// Référence nettoyée (valeurs numériques ou null), sûre à renvoyer à l'agent.
export function normaliserReference(ref) {
  const r = ref && typeof ref === 'object' ? ref : {};
  const mode = r.mode === 'pourcentage' ? 'pourcentage' : 'forfait';
  const parType = {};
  for (const cle of Object.keys(LIBELLES_TYPE)) parType[cle] = nombre(r.parType && r.parType[cle]);
  const pourcentage = nombre(r.pourcentage);
  const unite = UNITES.includes(r.unite) ? r.unite : 'HT';
  const configuree = mode === 'pourcentage'
    ? pourcentage !== null && pourcentage > 0
    : Object.values(parType).some((v) => v !== null);
  return {
    mode, parType,
    pourcentage: mode === 'pourcentage' ? pourcentage : null,
    unite,
    note: String(r.note || '').slice(0, 300),
    configuree,
  };
}

// Part de l'agent pour une mission (null si la référence ne la couvre pas).
export function montantMission(mission, ref) {
  if (!ref.configuree) return null;
  if (ref.mode === 'pourcentage') {
    const base = nombre(mission.montant);
    return base === null ? null : arrondi(base * ref.pourcentage / 100);
  }
  const v = ref.parType[categorieEdl(mission.type)];
  return v === null || v === undefined ? null : v;
}

function cleMois(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function etatMission(statut) {
  const s = String(statut || '').toLowerCase();
  if (s.includes('annul')) return 'annulee';
  if (s.includes('termin')) return 'acquise';
  return 'prevue';
}

// maintenant : injectable pour les tests.
export function calculerRemuneration(missions, refBrute, maintenant = new Date()) {
  const ref = normaliserReference(refBrute);
  const moisCourant = cleMois(maintenant.toISOString());
  const lignes = [];
  const parMois = {};
  let acquisMois = 0, prevuMois = 0, nbAcquisMois = 0, nonCouvertes = 0;

  for (const m of (missions || [])) {
    const etat = etatMission(m.statut);
    if (etat === 'annulee') continue;
    const montant = montantMission(m, ref);
    if (montant === null && ref.configuree) nonCouvertes++;
    const mois = cleMois(m.date);
    lignes.push({ id: m.id, date: m.date || '', adresse: m.adresse || '', type: m.type || '', etat, montant });
    if (montant === null) continue;
    if (etat === 'acquise' && mois) {
      if (!parMois[mois]) parMois[mois] = { mois, nb: 0, total: 0 };
      parMois[mois].nb++;
      parMois[mois].total = arrondi(parMois[mois].total + montant);
    }
    if (mois === moisCourant) {
      if (etat === 'acquise') { acquisMois = arrondi(acquisMois + montant); nbAcquisMois++; }
      else prevuMois = arrondi(prevuMois + montant);
    }
  }

  lignes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    reference: ref,
    moisCourant: { mois: moisCourant, acquis: acquisMois, prevu: prevuMois, nbAcquises: nbAcquisMois },
    parMois: Object.values(parMois).sort((a, b) => b.mois.localeCompare(a.mois)).slice(0, 12),
    lignes,
    nonCouvertes,
  };
}
