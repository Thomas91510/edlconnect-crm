// Rémunération d'un agent EDL, calculée côté serveur à partir de la
// référence financière saisie par l'agence dans sa fiche (CRM › Réglages ›
// Agents EDL › « Rémunération »). L'agent ne peut que la consulter.
//
// Trois modes :
//   * forfait     : un montant par type d'état des lieux (entrant, sortant,
//                   sortant + entrant, autre) ;
//   * typologie   : « grille par bien », sur le modèle de l'annexe 2 du
//                   contrat de sous-traitance : des lignes LIBRES (libellé
//                   au choix : « Appartement T2 », « Maison T3 », « Garage »,
//                   « Local < 50 m² »…), chacune reliée aux missions par des
//                   critères (typologies cochées, type de bien, surface ;
//                   vide = indifférent), avec un tarif « location nue » et
//                   un tarif « location meublée ». La PREMIÈRE ligne qui
//                   correspond s'applique. Un sortant + entrant est payé
//                   comme UNE seule prestation de la typologie
//                   (coefficient 1, modifiable) ; tarif à
//                   part pour les autres prestations (pré-état…) ;
//   * pourcentage : un pourcentage du montant HT facturé pour la mission.
//
// Dans tous les modes : frais de déplacement par zone (primaire,
// secondaire, hors zone — d'après les secteurs VALIDÉS de l'agent) et
// tarif « déplacement infructueux » pour une mission annulée sur place
// (cochée comme telle par l'agence).
//
// Seules les missions TERMINÉES (et les déplacements infructueux) sont
// « acquises » ; les missions planifiées ou en cours sont « prévues » ; les
// autres annulées ne comptent pas. Suivi des paiements : l'agence coche
// « payée » sur chaque mission acquise (CRM › Réglages › Agents EDL ›
// Rémunérations), stocké sur la mission (remuPayee, remuPayeeLe). Le
// montant facturé au client n'est jamais renvoyé, seulement la part de
// l'agent.
import { categorieEdl, statTypologie } from './agent-kpi.js';

export const LIBELLES_TYPE = {
  entrant: 'EDL entrant',
  sortant: 'EDL sortant',
  simultane: 'Sortant + entrant',
  autre: 'Autre (pré-état des lieux…)',
};
export const TYPOLOGIES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7+'];
export const BIENS = ['Appartement', 'Maison', 'Studio', 'Garage', 'Parking', 'Local commercial'];
export const ZONES = { primaire: 'Zone primaire', secondaire: 'Zone secondaire', hors: 'Hors zone' };
const MODES = ['forfait', 'typologie', 'pourcentage'];
const UNITES = ['HT', 'TTC', 'net'];
const MAX_LIGNES = 60;
const texte = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function nombre(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const arrondi = (n) => Math.round(n * 100) / 100;

// Lignes de la grille par bien. Formats antérieurs (bêta) acceptés :
// { parTypo: { T1: {simple, double} } } et lignes { typo, meuble, simple }.
function normaliserLignes(r) {
  let brutes = Array.isArray(r.lignes) ? r.lignes : null;
  if (!brutes && r.parTypo && typeof r.parTypo === 'object') {
    brutes = TYPOLOGIES.map((t) => ({ label: t, typos: [t], ...(r.parTypo[t] || {}) }));
  }
  return (brutes || []).slice(0, MAX_LIGNES).map((l) => {
    l = l || {};
    let nue = nombre(l.nue), meublee = nombre(l.meublee);
    if (nue === null && meublee === null && nombre(l.simple) !== null) {
      if (l.meuble === 'meuble') meublee = nombre(l.simple); else nue = nombre(l.simple);
    }
    return {
      label: texte(l.label, 60),
      typos: TYPOLOGIES.filter((t) => (Array.isArray(l.typos) ? l.typos : [l.typo]).includes(t)),
      bien: BIENS.includes(l.bien) ? l.bien : '',
      surfaceMin: nombre(l.surfaceMin),
      surfaceMax: nombre(l.surfaceMax),
      nue, meublee,
    };
  }).filter((l) => l.label || l.nue !== null || l.meublee !== null);
}

// Libellé lisible des critères d'une ligne (« Maison · T4, T5 · 50–99 m² »).
export function criteresLigne(l) {
  const typos = l.typos.length === TYPOLOGIES.length ? '' : l.typos.map((t) => (t === 'T7+' ? 'T7 et plus' : t)).join(', ');
  let surface = '';
  if (l.surfaceMin !== null && l.surfaceMax !== null) surface = l.surfaceMin + '–' + l.surfaceMax + ' m²';
  else if (l.surfaceMin !== null) surface = '≥ ' + l.surfaceMin + ' m²';
  else if (l.surfaceMax !== null) surface = '≤ ' + l.surfaceMax + ' m²';
  return [l.bien, typos, surface].filter(Boolean).join(' · ') || 'Tous les biens';
}

// Type de bien de la mission, rapproché des valeurs de la grille. Un type
// non renseigné est traité comme un appartement (cas le plus courant).
function bienMission(m) {
  const b = String(m.bienType || '').toLowerCase();
  if (!b) return 'appartement';
  if (b.includes('parking') || b.includes('garage') || b.includes('box')) return 'garage';
  if (b.includes('local')) return 'local commercial';
  return b;
}
function bienCorrespond(ligneBien, m) {
  if (!ligneBien) return true;
  const b = bienMission(m);
  const voulu = ligneBien.toLowerCase();
  if (voulu === 'garage' || voulu === 'parking') return b === 'garage';
  if (voulu === 'studio') return b.includes('studio') || String(m.bienTypo || '').toLowerCase().includes('studio');
  if (voulu === 'appartement') return b.includes('appartement') || b.includes('studio');
  return b.includes(voulu);
}

// Première ligne de la grille dont tous les critères renseignés
// correspondent à la mission (critère vide = indifférent).
export function ligneCorrespondante(mission, lignes) {
  const typo = statTypologie(mission.bienTypo);
  const surface = nombre(mission.superficie);
  return (lignes || []).find((l) =>
    (!l.typos.length || l.typos.includes(typo)) &&
    bienCorrespond(l.bien, mission) &&
    (l.surfaceMin === null || (surface !== null && surface >= l.surfaceMin)) &&
    (l.surfaceMax === null || (surface !== null && surface <= l.surfaceMax))
  ) || null;
}
const estMeuble = (m) => String(m.bienMeuble || '').toLowerCase().includes('meubl');

// Référence nettoyée (valeurs numériques ou null), sûre à renvoyer à l'agent.
export function normaliserReference(ref) {
  const r = ref && typeof ref === 'object' ? ref : {};
  const mode = MODES.includes(r.mode) ? r.mode : 'forfait';
  const parType = {};
  for (const cle of Object.keys(LIBELLES_TYPE)) parType[cle] = nombre(r.parType && r.parType[cle]);
  const lignes = normaliserLignes(r);
  const typoAutre = nombre(r.typoAutre);
  const coef = nombre(r.coefSortantEntrant);
  const pourcentage = nombre(r.pourcentage);
  const fz = r.fraisZone || {};
  const fraisZone = { primaire: nombre(fz.primaire), secondaire: nombre(fz.secondaire), hors: nombre(fz.hors) };
  const unite = UNITES.includes(r.unite) ? r.unite : 'HT';
  let configuree;
  if (mode === 'pourcentage') configuree = pourcentage !== null && pourcentage > 0;
  else if (mode === 'typologie') configuree = typoAutre !== null || lignes.some((l) => l.nue !== null || l.meublee !== null);
  else configuree = Object.values(parType).some((v) => v !== null);
  return {
    mode,
    parType: mode === 'forfait' ? parType : null,
    lignes: mode === 'typologie' ? lignes.map((l) => ({ ...l, criteres: criteresLigne(l) })) : null,
    typoAutre: mode === 'typologie' ? typoAutre : null,
    coefSortantEntrant: mode === 'typologie' ? (coef && coef > 0 ? coef : 1) : null,
    pourcentage: mode === 'pourcentage' ? pourcentage : null,
    fraisZone,
    deplacementInfructueux: nombre(r.deplacementInfructueux),
    unite,
    note: String(r.note || '').slice(0, 300),
    configuree,
  };
}

// Part de l'agent pour la prestation elle-même, hors frais de déplacement
// (null si la référence ne couvre pas cette mission).
export function montantMission(mission, ref) {
  if (!ref.configuree) return null;
  if (ref.mode === 'pourcentage') {
    const base = nombre(mission.montant);
    return base === null ? null : arrondi(base * ref.pourcentage / 100);
  }
  const cat = categorieEdl(mission.type);
  if (ref.mode === 'typologie') {
    if (cat === 'autre') return ref.typoAutre;
    const ligne = ligneCorrespondante(mission, ref.lignes);
    if (!ligne) return null; // aucune ligne de la grille ne couvre ce bien
    // Tarif meublé, à défaut le tarif location nue.
    const base = estMeuble(mission) && ligne.meublee !== null ? ligne.meublee : ligne.nue;
    if (base === null) return null;
    return cat === 'simultane' ? arrondi(base * ref.coefSortantEntrant) : base;
  }
  const v = ref.parType[cat];
  return v === null || v === undefined ? null : v;
}

// Zone de la mission d'après les secteurs de l'agent — seulement s'ils ont
// été VALIDÉS par l'agence (une demande en attente ne coûte rien).
export function zoneMission(mission, zones) {
  const z = zones || {};
  if (z.statut !== 'valide') return '';
  const prim = Array.isArray(z.primaire) ? z.primaire.map(String) : [];
  const sec = Array.isArray(z.secondaire) ? z.secondaire.map(String) : [];
  if (!prim.length && !sec.length) return '';
  const cp = String(mission.codePostal || (String(mission.adresse || '').match(/\b(\d{5})\b/) || [])[1] || '');
  if (!cp) return '';
  if (prim.includes(cp)) return 'primaire';
  if (sec.includes(cp)) return 'secondaire';
  return 'hors';
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

// zones : { primaire: [cp…], secondaire: [cp…], statut } de la fiche agent.
// maintenant : injectable pour les tests.
export function calculerRemuneration(missions, refBrute, maintenant = new Date(), zones = null) {
  const ref = normaliserReference(refBrute);
  const moisCourant = cleMois(maintenant.toISOString());
  const lignes = [];
  const parMois = {};
  let acquisMois = 0, prevuMois = 0, nbAcquisMois = 0, nonCouvertes = 0;
  let resteAPayer = 0, nbAPayer = 0, payeMois = 0;

  for (const m of (missions || [])) {
    let etat = etatMission(m.statut);
    const infructueux = etat === 'annulee' && !!m.deplacementInfructueux;
    if (etat === 'annulee' && !infructueux) continue;
    if (infructueux) etat = 'acquise';

    let prestation, frais = null, zone = '';
    if (infructueux) {
      prestation = ref.deplacementInfructueux;
    } else {
      prestation = montantMission(m, ref);
      zone = zoneMission(m, zones);
      frais = zone ? ref.fraisZone[zone] : null;
    }
    const montant = prestation === null ? null : arrondi(prestation + (frais || 0));
    if (montant === null && ref.configuree) nonCouvertes++;
    const mois = cleMois(m.date);
    const ligneGrille = !infructueux && ref.mode === 'typologie' && categorieEdl(m.type) !== 'autre' ? ligneCorrespondante(m, ref.lignes) : null;
    const payee = etat === 'acquise' && !!m.remuPayee;
    const payeeLe = payee ? String(m.remuPayeeLe || '') : '';
    lignes.push({
      id: m.id, date: m.date || '', adresse: m.adresse || '', type: m.type || '',
      typologie: statTypologie(m.bienTypo), bien: m.bienType || '',
      locataire: m.locataireNom || '',
      ligneGrille: infructueux ? 'Déplacement infructueux' : (ligneGrille ? (ligneGrille.label || ligneGrille.criteres) : ''),
      infructueux, zone, prestation, frais, montant, etat, payee, payeeLe,
    });
    if (montant === null) continue;
    if (etat === 'acquise' && mois) {
      if (!parMois[mois]) parMois[mois] = { mois, nb: 0, total: 0, paye: 0 };
      parMois[mois].nb++;
      parMois[mois].total = arrondi(parMois[mois].total + montant);
      if (payee) parMois[mois].paye = arrondi(parMois[mois].paye + montant);
    }
    if (etat === 'acquise') {
      if (payee) { if (cleMois(payeeLe) === moisCourant) payeMois = arrondi(payeMois + montant); }
      else { resteAPayer = arrondi(resteAPayer + montant); nbAPayer++; }
    }
    if (mois === moisCourant) {
      if (etat === 'acquise') { acquisMois = arrondi(acquisMois + montant); nbAcquisMois++; }
      else prevuMois = arrondi(prevuMois + montant);
    }
  }

  lignes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return {
    reference: ref,
    moisCourant: { mois: moisCourant, acquis: acquisMois, prevu: prevuMois, nbAcquises: nbAcquisMois, paye: payeMois },
    paiements: { resteAPayer, nbAPayer },
    parMois: Object.values(parMois).sort((a, b) => b.mois.localeCompare(a.mois)).slice(0, 12),
    lignes,
    nonCouvertes,
  };
}

// Grille de l'annexe 2 du contrat cadre de sous-traitance EDL IDF 2026,
// proposée comme point de départ dans la fiche agent (tout reste modifiable).
// Les lignes les plus précises (garages, locaux, maisons) passent avant les
// appartements, la première ligne qui correspond s'appliquant.
export const GRILLE_CONTRAT_2026 = {
  mode: 'typologie',
  unite: 'HT',
  coefSortantEntrant: 1,
  typoAutre: '',
  deplacementInfructueux: 50,
  fraisZone: { primaire: '', secondaire: '', hors: '' },
  note: 'Grille tarifaire — annexe 2 du contrat cadre de sous-traitance 2026. Facturation mensuelle, règlement sous 30 jours par virement.',
  lignes: [
    { label: 'Garage — 1 place', bien: 'Garage', nue: 20, meublee: 20 },
    { label: 'Local commercial < 50 m²', bien: 'Local commercial', surfaceMax: 49, nue: 80, meublee: 80 },
    { label: 'Local commercial 50–99 m²', bien: 'Local commercial', surfaceMin: 50, surfaceMax: 99, nue: 160, meublee: 160 },
    { label: 'Local commercial 100–199 m²', bien: 'Local commercial', surfaceMin: 100, surfaceMax: 199, nue: 180, meublee: 180 },
    { label: 'Maison T2', bien: 'Maison', typos: ['T2'], nue: 50, meublee: 70 },
    { label: 'Maison T3', bien: 'Maison', typos: ['T3'], nue: 65, meublee: 85 },
    { label: 'Maison T4', bien: 'Maison', typos: ['T4'], nue: 75, meublee: 95 },
    { label: 'Maison T5', bien: 'Maison', typos: ['T5'], nue: 85, meublee: 105 },
    { label: 'Maison T6', bien: 'Maison', typos: ['T6'], nue: 95, meublee: 115 },
    { label: 'Maison T7 et +', bien: 'Maison', typos: ['T7+'], nue: 105, meublee: 125 },
    { label: 'Appartement studio / T1', bien: 'Appartement', typos: ['T1'], nue: 42, meublee: 52 },
    { label: 'Appartement T2', bien: 'Appartement', typos: ['T2'], nue: 47, meublee: 57 },
    { label: 'Appartement T3', bien: 'Appartement', typos: ['T3'], nue: 53, meublee: 62 },
    { label: 'Appartement T4', bien: 'Appartement', typos: ['T4'], nue: 60, meublee: 80 },
    { label: 'Appartement T5', bien: 'Appartement', typos: ['T5'], nue: 70, meublee: 90 },
    { label: 'Appartement T6', bien: 'Appartement', typos: ['T6'], nue: 80, meublee: 100 },
    { label: 'Appartement T7 et +', bien: 'Appartement', typos: ['T7+'], nue: 90, meublee: 110 },
  ],
};
