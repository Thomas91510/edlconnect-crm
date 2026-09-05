// Conversions entre dates civiles dans le fuseau Europe/Paris et instants UTC
// — nécessaire pour borner une fenêtre par mois calendaire complet (ex. "tout
// septembre") plutôt que par un nombre de jours glissant à partir de
// maintenant. Utilisé par api/cal-availability.js pour interroger Cal.com sur
// exactement les bornes d'un mois vu depuis Paris, quelle que soit l'heure
// d'été/hiver en vigueur.

// Décalage Paris − UTC (en ms) au moment `instantMs`, déterminé via la base
// de fuseaux horaires du runtime (gère automatiquement CET/CEST).
function decalageParisMs(instantMs) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(instantMs)).reduce((o, p) => {
    if (p.type !== 'literal') o[p.type] = p.value;
    return o;
  }, {});
  // L'heure "24" (minuit) renvoyée par certains runtimes en hour12:false doit
  // être ramenée à 0 pour rester un composant d'heure valide.
  const heure = parts.hour === '24' ? 0 : Number(parts.hour);
  const vuCommeUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), heure, Number(parts.minute), Number(parts.second));
  return vuCommeUTC - instantMs;
}

// Instant UTC correspondant à minuit (00:00:00) le `jour`/`mois1`/`annee`
// donné, heure de Paris. `mois1` est 1-indexé (1 = janvier).
export function minuitParisEnUTC(annee, mois1, jour) {
  const cibleUTCNombre = Date.UTC(annee, mois1 - 1, jour, 0, 0, 0);
  let instant = cibleUTCNombre;
  // Deux itérations suffisent : le décalage Paris ne prend que deux valeurs
  // (CET +1h / CEST +2h), donc converge dès la première correction sauf tout
  // au bord d'une bascule DST où une seconde itération lève l'ambiguïté.
  for (let i = 0; i < 2; i++) {
    instant = cibleUTCNombre - decalageParisMs(instant);
  }
  return new Date(instant);
}

// Année et mois (1-12) actuels vus depuis le fuseau Europe/Paris — utilisé
// pour ne jamais proposer de mois déjà révolu, indépendamment du fuseau du
// serveur d'exécution.
export function moisActuelParis() {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });
  const parts = fmt.formatToParts(new Date()).reduce((o, p) => {
    if (p.type !== 'literal') o[p.type] = p.value;
    return o;
  }, {});
  return { annee: Number(parts.year), mois: Number(parts.month) };
}
