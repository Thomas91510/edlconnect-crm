// Garde-fou des chemins de stockage signés ou supprimés avec la clé
// service. Ces chemins sont lus dans des données que l'abonné peut modifier
// lui-même (ses réglages, ses réservations) : sans contrôle, « ../sauvegardes/x »
// — ou sa variante encodée « %2e%2e » — sortirait du bucket visé une fois
// l'URL normalisée par fetch. Un chemin n'est accepté que s'il commence par
// le préfixe attendu (dossier de l'agent, jeton de réservation) et ne
// contient aucun segment vide, « . » ou « .. », même après décodage.
const CARACTERES = /^[A-Za-z0-9._~%@+\-\/]+$/;

export function cheminSur(chemin, prefixe) {
  const c = String(chemin || '');
  if (!c || c.length > 300 || !CARACTERES.test(c)) return false;
  if (prefixe != null) {
    const p = String(prefixe);
    if (!p || p.includes('/') || !c.startsWith(p + '/')) return false;
  }
  for (const segment of c.split('/')) {
    let dec;
    try { dec = decodeURIComponent(segment); } catch (_) { return false; }
    if (!dec || dec === '.' || dec === '..' || /[\/\\]/.test(dec)) return false;
  }
  return true;
}

// Jeton de dépôt des pièces jointes de réservation (upload-booking-attachment.js) :
// « <jeton>/<horodatage>-<aléa>.<ext> », jeton limité à [A-Za-z0-9_-].
const PIECE_JOINTE = /^[A-Za-z0-9_-]{1,64}\/[0-9]{10,16}-[a-z0-9]{1,12}(\.[A-Za-z0-9]{1,10})?$/;

export function cheminPieceJointeValide(chemin) {
  return PIECE_JOINTE.test(String(chemin || ''));
}
