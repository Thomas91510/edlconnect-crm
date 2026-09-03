// Correspondance entre le type de bien saisi sur le formulaire de réservation
// (typologie + meublé/nu) et les événements Cal.com correspondants, pour
// interroger leurs disponibilités réelles (voir api/cal-availability.js).
//
// Construite à partir des événements Cal.com existants de l'abonné (compte
// "edl-idf-myqe4m") au 03/09/2026. Les titres affichés dans le dashboard
// Cal.com ne correspondent pas toujours exactement à l'usage réel (ex: le
// slug "classique" pour un événement titré "meublé") — ce fichier se fie
// uniquement aux slugs (stables), jamais aux titres.
export const CAL_USERNAME = 'edl-idf-myqe4m';

export const CAL_EVENT_MAP = {
  T1: { meuble: { slug: 'etat-des-lieux-meuble-t1',    duree: 90  }, nu: { slug: 'etat-des-lieux-classique-t1', duree: 60  } },
  T2: { meuble: { slug: 'etat-des-lieux-classique-t2', duree: 120 }, nu: { slug: 'appartement-location-nue-t2', duree: 90  } },
  T3: { meuble: { slug: 'etat-des-lieux-meuble-t3',    duree: 150 }, nu: { slug: 'etat-des-lieux-classique-t3', duree: 120 } },
  T4: { meuble: { slug: 'etat-des-lieux-meuble-t4',    duree: 180 }, nu: { slug: 'etat-des-lieux-classique-t4', duree: 150 } },
  T5: { meuble: { slug: 'etat-des-lieux-meuble-t5',    duree: 180 }, nu: { slug: 'etat-des-lieux-classique-t5', duree: 180 } },
  // T6 sert aussi de repli pour "T6+" : le CRM ne propose pas de typologie
  // au-delà de T6+ (pas de T7 dans le formulaire), alors que Cal.com a un
  // événement T7 dédié — actuellement de même durée que T6 côté nu (210m),
  // donc sans impact pratique. À revoir si un T7 meublé (240m) doit un jour
  // être distingué d'un T6+ meublé (210m) dans le formulaire public.
  T6: { meuble: { slug: 'etat-des-lieux-meuble-t6',    duree: 210 }, nu: { slug: 'etat-des-lieux-classique-t6', duree: 210 } },
};

// Normalise la typologie saisie sur le formulaire ("Studio", "T1".."T6+")
// vers une clé de CAL_EVENT_MAP. Studio = T1 (même convention que
// statTypologie() dans js/app-missions.js). T6+ et au-delà = T6.
export function normaliserTypologie(bienTypo) {
  const v = String(bienTypo || '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('studio')) return 'T1';
  const m = v.match(/t\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 6) return 'T6';
    if (n >= 1) return 'T' + n;
  }
  return null;
}

// Retourne { slug, duree } pour un couple (typologie, meublé/nu) donné, ou
// null si non pris en charge (typologie non reconnue).
export function resolveCalEvent(bienTypo, bienMeuble) {
  const typo = normaliserTypologie(bienTypo);
  if (!typo) return null;
  const entry = CAL_EVENT_MAP[typo];
  if (!entry) return null;
  const estMeuble = String(bienMeuble || '').trim().toLowerCase().includes('meubl');
  return estMeuble ? entry.meuble : entry.nu;
}
