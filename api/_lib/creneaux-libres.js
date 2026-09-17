// Calcule, pour une fenêtre donnée, les créneaux de départ disponibles à
// partir des périodes "occupé" de chaque collaborateur (résultat d'un
// freebusy.query Google — voir agenda-disponibilites.js). Règle retenue :
// un créneau est proposé dès qu'AU MOINS UN collaborateur est libre sur
// toute sa durée (union des disponibilités) — pas besoin que toute l'équipe
// le soit, pour laisser répartir librement les missions dans l'équipe.
import { parisEnUTC } from './fuseau-paris.js';

const JOURS_SEMAINE = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function dateLocaleParis(instant) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(instant).reduce((o, p) => { if (p.type !== 'literal') o[p.type] = p.value; return o; }, {});
  return { annee: Number(parts.year), mois: Number(parts.month), jour: Number(parts.day), jourSemaine: JOURS_SEMAINE[parts.weekday] };
}

function chevauche(debutA, finA, debutB, finB) {
  return debutA < finB && finA > debutB;
}

// - fenetreDebut/fenetreFin : Date (bornes UTC de la période à couvrir, ex. minuit Paris du 1er du mois au 1er du mois suivant)
// - occupePar : { [idCollaborateur]: [{ start: Date, end: Date }, ...] }
// - dureeMinutes : durée du rendez-vous
// - seuilMs : timestamp minimum autorisé pour le début d'un créneau (délai minimum avant réservation)
// - heureOuverture/heureFermeture : heures locales Paris (ex. 9 → 9h00)
// - joursOuvres : jours de la semaine autorisés, 0=dimanche..6=samedi
// - pasMinutes : granularité des heures de départ proposées
// - tamponMinutes : marge à respecter avant/après chaque rendez-vous déjà
//   posé (temps de trajet/installation entre deux missions) — un créneau
//   trop proche d'un rendez-vous existant du même collaborateur est exclu,
//   même si les deux ne se chevauchent pas au sens strict
//
// Retourne une liste d'horodatages ISO (instants UTC de début de créneau),
// triée chronologiquement.
export function creneauxLibres({
  fenetreDebut, fenetreFin, occupePar, dureeMinutes, seuilMs,
  heureOuverture = 9, heureFermeture = 19, joursOuvres = [1, 2, 3, 4, 5, 6], pasMinutes = 30,
  tamponMinutes = 0,
}) {
  const tamponMs = tamponMinutes * 60000;
  const collaborateurs = Object.keys(occupePar || {});
  if (collaborateurs.length === 0) return [];

  const resultat = [];
  const finMs = fenetreFin.getTime();
  let curseur = fenetreDebut;

  while (curseur.getTime() < finMs) {
    const { annee, mois, jour, jourSemaine } = dateLocaleParis(curseur);

    if (joursOuvres.includes(jourSemaine)) {
      for (let minute = heureOuverture * 60; minute + dureeMinutes <= heureFermeture * 60; minute += pasMinutes) {
        const debutCreneau = parisEnUTC(annee, mois, jour, Math.floor(minute / 60), minute % 60);
        if (seuilMs && debutCreneau.getTime() < seuilMs) continue;
        const finCreneau = new Date(debutCreneau.getTime() + dureeMinutes * 60000);

        const auMoinsUnLibre = collaborateurs.some(id => {
          const occupations = occupePar[id] || [];
          return !occupations.some(o => chevauche(debutCreneau.getTime(), finCreneau.getTime(), o.start.getTime() - tamponMs, o.end.getTime() + tamponMs));
        });
        if (auMoinsUnLibre) resultat.push(debutCreneau.toISOString());
      }
    }

    // Jour suivant (minuit Paris) plutôt que +24h fixe, pour rester correct
    // autour d'un changement d'heure d'été/hiver (jour+1 déborde proprement
    // sur le mois/l'année suivants via la normalisation native de Date.UTC).
    curseur = parisEnUTC(annee, mois, jour + 1, 0, 0, 0);
  }

  return resultat;
}
