// Champs obligatoires d'une réservation d'état des lieux — même règle sur
// les trois formulaires (extranet agence, page publique de réservation,
// réservation manuelle du CRM : copie navigateur js/reservation-validation.js,
// gardée identique par test/reservation-validation.test.js) et ici, côté
// serveur (api/booking-request.js), pour qu'aucune demande incomplète ne
// passe. Renvoie le premier message d'erreur, ou '' si tout est rempli.
//   * superficie du bien et nom du propriétaire : toujours ;
//   * date de l'état des lieux d'entrée : pour toute sortie ;
//   * téléphone ET email (valide) : pour chaque locataire, sortant ou entrant.
export function erreurReservation(p) {
  const d = p || {};
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  const rempli = (v) => String(v == null ? '' : v).trim() !== '';
  const type = String(d.typeEdl || '').toLowerCase();
  const superficie = Number(String(d.superficie == null ? '' : d.superficie).replace(',', '.'));
  if (!(superficie > 0)) return 'La superficie du bien est requise.';
  if (!rempli(d.proprietaire)) return 'Le nom du propriétaire est requis.';
  if (type.includes('sortant') && !/^\d{4}-\d{2}-\d{2}/.test(String(d.dateEntree || ''))) {
    return 'La date de l’état des lieux d’entrée est requise pour une sortie.';
  }
  const locataires = Array.isArray(d.locataires) && d.locataires.length ? d.locataires : [d.locataire || {}];
  for (let i = 0; i < locataires.length; i++) {
    const l = locataires[i] || {};
    const qui = 'du locataire' + (locataires.length > 1 ? ' ' + (i + 1) : '');
    if (!rempli(l.tel)) return 'Le téléphone ' + qui + ' est requis.';
    if (!emailOk(l.email)) return 'L’email ' + qui + ' est requis (adresse valide).';
  }
  const entrants = Array.isArray(d.locatairesEntrants) ? d.locatairesEntrants : [];
  for (let i = 0; i < entrants.length; i++) {
    const e = entrants[i] || {};
    const qui = 'du locataire entrant' + (entrants.length > 1 ? ' ' + (i + 1) : '');
    if (!rempli(e.tel)) return 'Le téléphone ' + qui + ' est requis.';
    if (!emailOk(e.email)) return 'L’email ' + qui + ' est requis (adresse valide).';
  }
  return '';
}
