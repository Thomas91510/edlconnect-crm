// Limiteur de débit minimal, en mémoire (Map au niveau du module) — best
// effort seulement : chaque instance edge a son propre compteur, remis à
// zéro à chaque cold start, jamais partagé entre régions. Suffisant pour
// freiner un abus scripté basique sur un endpoint public (énumération
// d'emails, spam de formulaire) sans dépendre d'une infrastructure externe ;
// pas une garantie stricte multi-instance.
const fenetres = new Map();
const TAILLE_MAX_CARTE = 5000;

export function ipAppelant(req) {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || 'inconnu';
}

// Renvoie true si la limite est dépassée (à appeler AVANT de traiter la
// requête). `cle` identifie l'appelant (ex: IP + nom d'endpoint).
export function limiteAtteinte(cle, { max, fenetreMs }) {
  const maintenant = Date.now();
  if (fenetres.size > TAILLE_MAX_CARTE) {
    for (const [k, v] of fenetres) {
      if (maintenant - v.debut > fenetreMs) fenetres.delete(k);
    }
  }
  const entree = fenetres.get(cle);
  if (!entree || maintenant - entree.debut > fenetreMs) {
    fenetres.set(cle, { debut: maintenant, count: 1 });
    return false;
  }
  entree.count++;
  return entree.count > max;
}

// Réservé aux tests : remet le compteur à zéro entre deux suites qui
// partagent autrement le même processus Node (et donc la même Map).
export function _reinitialiserPourTests() {
  fenetres.clear();
}
