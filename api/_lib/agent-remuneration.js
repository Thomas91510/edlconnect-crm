// Rémunération d'un agent EDL, calculée côté serveur à partir de la
// référence financière saisie par l'agence dans sa fiche (CRM › Réglages ›
// Agents EDL › « Rémunération »). L'agent ne peut que la consulter.
//
// Trois modes :
//   * forfait     : un montant par type d'état des lieux (entrant, sortant,
//                   sortant + entrant, autre) ;
//   * typologie   : un montant par typologie du bien (T1 à T7+, studio = T1),
//                   avec une colonne « entrant ou sortant » et une colonne
//                   « sortant + entrant », plus un montant pour les autres
//                   prestations (pré-état des lieux…) ;
//   * pourcentage : un pourcentage du montant HT facturé pour la mission.
//
// Seules les missions TERMINÉES sont « acquises » ; les missions planifiées
// ou en cours sont « prévues » ; les annulées ne comptent jamais. Le montant
// facturé au client n'est jamais renvoyé, seulement la part de l'agent.
import { categorieEdl, statTypologie } from './agent-kpi.js';

export const LIBELLES_TYPE = {
  entrant: 'EDL entrant',
  sortant: 'EDL sortant',
  simultane: 'Sortant + entrant',
  autre: 'Autre (pré-état des lieux…)',
};
export const TYPOLOGIES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7+'];
const MODES = ['forfait', 'typologie', 'pourcentage'];
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
  const mode = MODES.includes(r.mode) ? r.mode : 'forfait';
  const parType = {};
  for (const cle of Object.keys(LIBELLES_TYPE)) parType[cle] = nombre(r.parType && r.parType[cle]);
  const parTypo = {};
  for (const t of TYPOLOGIES) {
    const v = (r.parTypo && r.parTypo[t]) || {};
    parTypo[t] = { simple: nombre(v.simple), double: nombre(v.double) };
  }
  const typoAutre = nombre(r.typoAutre);
  const pourcentage = nombre(r.pourcentage);
  const unite = UNITES.includes(r.unite) ? r.unite : 'HT';
  let configuree;
  if (mode === 'pourcentage') configuree = pourcentage !== null && pourcentage > 0;
  else if (mode === 'typologie') configuree = typoAutre !== null || TYPOLOGIES.some((t) => parTypo[t].simple !== null || parTypo[t].double !== null);
  else configuree = Object.values(parType).some((v) => v !== null);
  return {
    mode,
    parType: mode === 'forfait' ? parType : null,
    parTypo: mode === 'typologie' ? parTypo : null,
    typoAutre: mode === 'typologie' ? typoAutre : null,
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
  const cat = categorieEdl(mission.type);
  if (ref.mode === 'typologie') {
    if (cat === 'autre') return ref.typoAutre;
    const typo = statTypologie(mission.bienTypo);
    const ligne = ref.parTypo[typo];
    if (!ligne) return null; // typologie non renseignée sur la mission
    return cat === 'simultane' ? ligne.double : ligne.simple;
  }
  const v = ref.parType[cat];
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
    lignes.push({ id: m.id, date: m.date || '', adresse: m.adresse || '', type: m.type || '', typologie: statTypologie(m.bienTypo), etat, montant });
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
