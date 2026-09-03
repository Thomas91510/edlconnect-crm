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
  T6: { meuble: { slug: 'etat-des-lieux-meuble-t6',    duree: 210 }, nu: { slug: 'etat-des-lieux-classique-t6', duree: 210 } },
  // T7 = plus grande typologie proposée par le formulaire (remplace l'ancien
  // repli "T6+" qui n'existait que faute de mieux).
  T7: { meuble: { slug: 'etat-des-lieux-meuble-t7',    duree: 240 }, nu: { slug: 'etat-des-lieux-classique-t7', duree: 210 } },
};

// Normalise la typologie saisie sur le formulaire ("Studio", "T1".."T7") vers
// une clé de CAL_EVENT_MAP. Studio = T1 (même convention que statTypologie()
// dans js/app-missions.js). T7 et au-delà = T7 (plus grande typologie prise
// en charge par Cal.com pour l'instant).
export function normaliserTypologie(bienTypo) {
  const v = String(bienTypo || '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('studio')) return 'T1';
  const m = v.match(/t\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 7) return 'T7';
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
