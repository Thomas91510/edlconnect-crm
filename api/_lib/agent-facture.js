// Factures des agents sous-traitants (espace agent → titulaire du CRM, ex. EDL IDF ;
// ne concerne jamais les agences clientes de l'extranet).
//
// L'agent saisit lui-même ses informations juridiques (raison sociale,
// SIRET, RCS, régime de TVA, IBAN…) dans « Mon compte », puis génère depuis
// l'onglet « Facturation » une facture pré-remplie avec ses missions
// acquises du mois (date, adresse, typologie, nom du locataire — bordereau
// demandé par l'art. 8.2 du contrat de sous-traitance). Ce module ne fait
// que NETTOYER ce qui arrive du navigateur : longueurs bornées, valeurs
// connues, jamais de champ inattendu enregistré dans settings.data.agents.

const TEXTE_COURT = 120;
const TEXTE_LONG = 400;

export const STATUTS_JURIDIQUES = [
  'Micro-entrepreneur', 'Entreprise individuelle', 'EURL', 'SASU', 'SARL', 'SAS', 'Autre',
];
export const REGIMES_TVA = ['franchise', 'assujetti'];
export const MENTION_FRANCHISE_TVA = 'TVA non applicable, art. 293 B du CGI';

const texte = (v, max = TEXTE_COURT) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function nettoyerInfosLegales(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const statut = STATUTS_JURIDIQUES.includes(b.statut) ? b.statut : '';
  const regimeTva = REGIMES_TVA.includes(b.regimeTva) ? b.regimeTva : 'franchise';
  const taux = Number(b.tauxTva);
  return {
    raisonSociale: texte(b.raisonSociale),
    statut,
    adresse: texte(b.adresse, 200),
    siret: texte(b.siret, 20).replace(/[^\d ]/g, ''),
    rcs: texte(b.rcs),
    tvaIntra: texte(b.tvaIntra, 20).toUpperCase(),
    regimeTva,
    tauxTva: regimeTva === 'assujetti' && Number.isFinite(taux) && taux >= 0 && taux <= 30 ? taux : (regimeTva === 'assujetti' ? 20 : 0),
    iban: texte(b.iban, 40).toUpperCase(),
    bic: texte(b.bic, 15).toUpperCase(),
    mentions: texte(b.mentions, TEXTE_LONG),
  };
}

// Ce qui manque pour qu'une facture soit recevable (affiché à l'agent avant
// l'envoi — le contrat exige le SIRET ; nom et adresse sont des mentions
// obligatoires de toute facture).
export function champsLegauxManquants(infos) {
  const i = infos || {};
  const manquants = [];
  if (!i.raisonSociale) manquants.push('raison sociale');
  if (!i.adresse) manquants.push('adresse');
  if (!String(i.siret || '').replace(/\s/g, '')) manquants.push('SIRET');
  return manquants;
}

const arrondi = (n) => Math.round(n * 100) / 100;

// Facture telle qu'éditée par l'agent : on garde les lignes (bordereau),
// on RECALCULE les totaux — jamais ceux envoyés par le navigateur.
export function nettoyerFacture(brut, infos) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const numero = texte(b.numero, 40);
  const lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 300).map(l => {
    const montant = Number(l && l.montant);
    return {
      date: texte(l && l.date, 10),
      adresse: texte(l && l.adresse, 200),
      typologie: texte(l && l.typologie, 60),
      prestation: texte(l && l.prestation, 80),
      locataire: texte(l && l.locataire, 80),
      montant: Number.isFinite(montant) ? arrondi(montant) : 0,
    };
  });
  const totalHT = arrondi(lignes.reduce((s, l) => s + l.montant, 0));
  const taux = infos && infos.regimeTva === 'assujetti' ? Number(infos.tauxTva) || 0 : 0;
  const tva = arrondi(totalHT * taux / 100) || 0;
  return {
    numero,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : '',
    mois: /^\d{4}-\d{2}$/.test(String(b.mois || '')) ? b.mois : '',
    lignes,
    totalHT,
    tauxTva: taux,
    tva,
    totalTTC: arrondi(totalHT + tva),
    note: texte(b.note, TEXTE_LONG),
  };
}

// Nom de fichier sûr pour la pièce jointe / le stockage.
export function nomFichierFacture(numero) {
  const base = String(numero || 'facture').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return 'Facture-' + (base || 'sans-numero') + '.pdf';
}

// Enregistre (ou remplace, même numéro) la facture dans l'historique de la
// fiche agent — c'est ce que la société voit dans le CRM.
export function ajouterFactureHistorique(historique, facture, extra = {}) {
  const liste = (Array.isArray(historique) ? historique : []).filter(f => f && f.numero !== facture.numero);
  liste.unshift({
    numero: facture.numero, date: facture.date, mois: facture.mois,
    nbLignes: facture.lignes.length, totalHT: facture.totalHT, tva: facture.tva, totalTTC: facture.totalTTC,
    ...extra,
  });
  return liste.slice(0, 120);
}
