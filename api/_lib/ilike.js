// Échappement des jokers PostgREST/SQL (% et _) pour un filtre ilike.
// Ces lookups servent tous à une comparaison exacte insensible à la casse
// (retrouver LE contact dont l'email correspond), jamais à une recherche
// partielle : sans échappement, un email ou un nom d'agence contenant un
// caractère joker (ex. "%") élargit silencieusement le filtre à d'autres
// enregistrements que celui visé — certains de ces champs viennent d'un
// formulaire public non authentifié (booking-request, booking-page).
export function escapeIlike(s) {
  return String(s == null ? '' : s).replace(/[%_\\]/g, '\\$&');
}
