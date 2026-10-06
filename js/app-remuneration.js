// === Lokentia CRM — app-remuneration.js ===
// FICHIER GÉNÉRÉ par scripts/generer-remuneration-navigateur.mjs à partir de
// api/_lib/agent-remuneration.js — ne pas modifier à la main.
// Exposé en window.Remuneration (dans une fonction pour ne pas polluer les
// noms globaux partagés par les autres scripts du CRM).
(function(){
// Rémunération d'un agent EDL, calculée côté serveur à partir de la
// référence financière saisie par l'agence dans sa fiche (CRM › Réglages ›
// Agents EDL › « Rémunération »). L'agent ne peut que la consulter.
//
// Trois modes :
//   * forfait     : un montant par type d'état des lieux (entrant, sortant,
//                   sortant + entrant, autre) ;
//   * typologie   : une grille de lignes LIBRES (libellé au choix de
//                   l'agence : « T2 », « Maison », « T2 meublé »…), chacune
//                   reliée aux missions par des critères (une ou plusieurs
//                   typologies, type de bien, meublé/nu ; vide = tous) avec une colonne
//                   « entrant ou sortant » et une colonne « sortant +
//                   entrant ». La PREMIÈRE ligne qui correspond s'applique.
//                   Plus un montant pour les autres prestations (pré-état…) ;
//   * pourcentage : un pourcentage du montant HT facturé pour la mission.
//
// Seules les missions TERMINÉES sont « acquises » ; les missions planifiées
// ou en cours sont « prévues » ; les annulées ne comptent jamais.
// Suivi des paiements : l'agence coche « payée » sur chaque mission acquise
// (CRM › Réglages › Agents EDL › Rémunérations), stocké sur la mission
// (remuPayee, remuPayeeLe) ; l'agent voit ce qui lui reste à percevoir. Le montant
// facturé au client n'est jamais renvoyé, seulement la part de l'agent.
function categorieEdl(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('sortant') && t.includes('entrant')) return 'simultane';
  if (t.includes('sortant')) return 'sortant';
  if (t.includes('entrant')) return 'entrant';
  return 'autre';
}

function statTypologie(bienTypo) {
  const v = String(bienTypo || '').trim().toLowerCase();
  if (!v) return 'Non renseignée';
  if (v.includes('studio')) return 'T1';
  const found = v.match(/[tf]\s*(\d+)/);
  if (found) {
    const n = parseInt(found[1], 10);
    if (n >= 7) return 'T7+';
    if (n >= 1) return 'T' + n;
  }
  return 'Non renseignée';
}


const LIBELLES_TYPE = {
  entrant: 'EDL entrant',
  sortant: 'EDL sortant',
  simultane: 'Sortant + entrant',
  autre: 'Autre (pré-état des lieux…)',
};
const TYPOLOGIES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7+'];
const MODES = ['forfait', 'typologie', 'pourcentage'];
const BIENS = ['Appartement', 'Maison', 'Studio', 'Local commercial', 'Parking'];
const MAX_LIGNES = 30;
const texte = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

// Lignes de la grille par typologie. Accepte aussi l'ancien format fixe
// { parTypo: { T1: {simple, double}, … } } (beta.4), converti en lignes.
function normaliserLignes(r) {
  let brutes = Array.isArray(r.lignes) ? r.lignes : null;
  if (!brutes && r.parTypo && typeof r.parTypo === 'object') {
    brutes = TYPOLOGIES.map((t) => ({ label: t, typos: [t], ...(r.parTypo[t] || {}) }));
  }
  return (brutes || []).slice(0, MAX_LIGNES).map((l) => ({
    label: texte(l && l.label, 60),
    // Plusieurs typologies par ligne (« T4 et T5 ») ; l'ancien champ
    // unique « typo » (beta.5) reste accepté.
    typos: TYPOLOGIES.filter((t) => (Array.isArray(l && l.typos) ? l.typos : [l && l.typo]).includes(t)),
    bien: BIENS.includes(l && l.bien) ? l.bien : '',
    meuble: ['meuble', 'nu'].includes(l && l.meuble) ? l.meuble : '',
    simple: nombre(l && l.simple),
    double: nombre(l && l.double),
  })).filter((l) => l.label || l.simple !== null || l.double !== null);
}

// Libellé lisible des critères d'une ligne (« T2 · Maison · meublé »).
function criteresLigne(l) {
  const typos = l.typos.length === TYPOLOGIES.length ? '' : l.typos.map((t) => (t === 'T7+' ? 'T7 et plus' : t)).join(', ');
  return [typos, l.bien, l.meuble === 'meuble' ? 'meublé' : l.meuble === 'nu' ? 'nu' : '']
    .filter(Boolean).join(' · ') || 'Tous les biens';
}

// Première ligne de la grille dont tous les critères renseignés
// correspondent à la mission (critère vide = indifférent).
function ligneCorrespondante(mission, lignes) {
  const typo = statTypologie(mission.bienTypo);
  const bien = String(mission.bienType || '').toLowerCase();
  const m = String(mission.bienMeuble || '').toLowerCase();
  const meuble = m.includes('meubl') ? 'meuble' : m ? 'nu' : '';
  return (lignes || []).find((l) =>
    (!l.typos.length || l.typos.includes(typo)) &&
    (!l.bien || bien.includes(l.bien.toLowerCase()) || (l.bien === 'Studio' && String(mission.bienTypo || '').toLowerCase().includes('studio'))) &&
    (!l.meuble || l.meuble === meuble)
  ) || null;
}
const UNITES = ['HT', 'TTC', 'net'];

function nombre(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const arrondi = (n) => Math.round(n * 100) / 100;

// Référence nettoyée (valeurs numériques ou null), sûre à renvoyer à l'agent.
function normaliserReference(ref) {
  const r = ref && typeof ref === 'object' ? ref : {};
  const mode = MODES.includes(r.mode) ? r.mode : 'forfait';
  const parType = {};
  for (const cle of Object.keys(LIBELLES_TYPE)) parType[cle] = nombre(r.parType && r.parType[cle]);
  const lignes = normaliserLignes(r);
  const typoAutre = nombre(r.typoAutre);
  const pourcentage = nombre(r.pourcentage);
  const unite = UNITES.includes(r.unite) ? r.unite : 'HT';
  let configuree;
  if (mode === 'pourcentage') configuree = pourcentage !== null && pourcentage > 0;
  else if (mode === 'typologie') configuree = typoAutre !== null || lignes.some((l) => l.simple !== null || l.double !== null);
  else configuree = Object.values(parType).some((v) => v !== null);
  return {
    mode,
    parType: mode === 'forfait' ? parType : null,
    lignes: mode === 'typologie' ? lignes.map((l) => ({ ...l, criteres: criteresLigne(l) })) : null,
    typoAutre: mode === 'typologie' ? typoAutre : null,
    pourcentage: mode === 'pourcentage' ? pourcentage : null,
    unite,
    note: String(r.note || '').slice(0, 300),
    configuree,
  };
}

// Part de l'agent pour une mission (null si la référence ne la couvre pas).
function montantMission(mission, ref) {
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

function etatMission(statut) {
  const s = String(statut || '').toLowerCase();
  if (s.includes('annul')) return 'annulee';
  if (s.includes('termin')) return 'acquise';
  return 'prevue';
}

// maintenant : injectable pour les tests.
function calculerRemuneration(missions, refBrute, maintenant = new Date()) {
  const ref = normaliserReference(refBrute);
  const moisCourant = cleMois(maintenant.toISOString());
  const lignes = [];
  const parMois = {};
  let acquisMois = 0, prevuMois = 0, nbAcquisMois = 0, nonCouvertes = 0;
  let resteAPayer = 0, nbAPayer = 0, payeMois = 0;

  for (const m of (missions || [])) {
    const etat = etatMission(m.statut);
    if (etat === 'annulee') continue;
    const montant = montantMission(m, ref);
    if (montant === null && ref.configuree) nonCouvertes++;
    const mois = cleMois(m.date);
    const ligneGrille = ref.mode === 'typologie' && categorieEdl(m.type) !== 'autre' ? ligneCorrespondante(m, ref.lignes) : null;
    const payee = etat === 'acquise' && !!m.remuPayee;
    const payeeLe = payee ? String(m.remuPayeeLe || '') : '';
    lignes.push({ id: m.id, date: m.date || '', adresse: m.adresse || '', type: m.type || '', typologie: statTypologie(m.bienTypo), ligneGrille: ligneGrille ? (ligneGrille.label || ligneGrille.criteres) : '', etat, montant, payee, payeeLe });
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

window.Remuneration = { calculerRemuneration, normaliserReference, montantMission, etatMission, LIBELLES_TYPE };
})();
