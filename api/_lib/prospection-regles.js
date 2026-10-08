// Règles métier de la séquence de prospection EDL IDF, partagées entre
// prospection-cron.js (envois) et prospection-click.js (webhook clic Brevo).

// Les antivirus des réseaux d'agences (Laforêt, Century 21...) ouvrent
// chaque lien d'un email entrant quelques secondes après sa réception pour
// le tester. Analyse du 08/10/2026 : 100 % des 60 clics enregistrés depuis
// le 14/09 tombaient dans la minute suivant un envoi. Un tel clic arrêtait
// les relances J+4/J+6 (clickedAt) et faisait passer la carte en "Email
// ouvert" à tort. Un clic trop proche du dernier envoi ne compte donc pas
// comme un clic humain.
const DELAI_CLIC_ROBOT_MS = 3 * 60 * 1000;

export function dernierEnvoi(d) {
  const dates = [d && d.sentAt1, d && d.sentAt2, d && d.sentAt3]
    .filter(Boolean).map(x => new Date(x).getTime()).filter(t => !isNaN(t));
  return dates.length ? Math.max(...dates) : null;
}

export function clicDeRobot(d, maintenant = Date.now()) {
  const envoi = dernierEnvoi(d);
  return envoi !== null && maintenant - envoi >= 0 && maintenant - envoi < DELAI_CLIC_ROBOT_MS;
}

// Cibles EDL IDF : agences immobilières, cabinets d'administration de
// biens, bailleurs. Les réseaux de mandataires indépendants (agents
// commerciaux en nom propre, orientés transaction) n'en font pas partie —
// ils représentaient ~980 des 2 060 fiches "À contacter" jamais contactées.
export const DOMAINES_MANDATAIRES = [
  'efficity.com', 'lfimmo.fr', 'weinvest.fr', 'megagence.com', 'expfrance.fr',
  'expertimo.com', 'ikami.fr', '3gimmobilier.com', 'iadfrance.fr', 'safti.fr',
  'capifrance.fr', 'optimhome.com', 'proprietes-privees.com'
];

// Adresses de l'entreprise elle-même (tests, boîtes internes) : ne jamais
// les inscrire dans la séquence — c'est arrivé avec contact@edl-idf.com.
const DOMAINES_INTERNES = ['edl-idf.com', 'lokentia.fr'];

// Fiches "contacts" à ne jamais prospecter : clients/partenaires déjà en
// relation, ou adresses ayant refusé les emails (blacklist Brevo).
const STATUTS_NON_PROSPECTABLES = ['Client actif', 'Client signé ✅', 'Partenaire', 'Inactif'];

export function contactExclu(c) {
  return !!c && (c.bl === true || c.bl === 'true' || STATUTS_NON_PROSPECTABLES.includes(c.statut));
}

function domaine(email) { return String(email || '').toLowerCase().split('@')[1] || ''; }

export function domaineExclu(email) {
  const d = domaine(email);
  return !d || DOMAINES_INTERNES.includes(d) || DOMAINES_MANDATAIRES.includes(d);
}

// Une fiche du pipeline "À contacter" est envoyable par la séquence si elle
// désigne une vraie agence : un nom saisi (pas la partie locale de l'email
// recopiée automatiquement — signe d'une fiche importée en vrac, souvent
// un mandataire en nom propre) et un département renseigné.
export function estCandidatStock(p) {
  if (!p || p.etape !== 'a_contacter') return false;
  const email = String(p.email || '').trim().toLowerCase();
  if (!email.includes('@') || domaineExclu(email)) return false;
  const agence = String(p.agence || '').trim().toLowerCase();
  if (!agence || agence === email.split('@')[0]) return false;
  return String(p.dept || '').trim() !== '';
}

// Nom d'agence affiché dans les emails de la séquence ("Chez Laforêt Meaux,
// est-ce un sujet..."). Renvoie '' quand le nom n'est pas présentable (vide,
// recopie automatique de l'email, adresse) : le modèle Brevo retombe alors
// sur "chez vous" / "votre agence". Les noms tout en majuscules, fréquents
// dans les imports (LAFORET AGENCE DE FONTAINEBLEAU), sont remis en casse
// normale, sauf les sigles courts (ERA, ORPI, IDF...).
export function nomAgencePourEmail(nom, email) {
  const brut = String(nom || '').replace(/\s+/g, ' ').trim();
  if (!brut || brut.length < 3 || brut.length > 60 || brut.includes('@')) return '';
  const local = String(email || '').toLowerCase().split('@')[0];
  if (brut.toLowerCase() === local) return '';
  const lettres = brut.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (lettres && lettres === lettres.toUpperCase()) {
    return brut.toLowerCase().replace(/(^|[\s\-'’(])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase())
      .replace(/\b(Era|Orpi|Idf|Sci|Sarl|Sas|Sasu|Adb|Edl)\b/g, s => s.toUpperCase())
      .replace(/(?!^)\b(De|Du|Des|La|Le|Les|Et|Sur|Sous|En|Aux?)\b(?=\s)/g, s => s.toLowerCase());
  }
  return brut;
}
