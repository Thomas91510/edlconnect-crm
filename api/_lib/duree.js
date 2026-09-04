// Parse une duree du CRM ("30 min", "1h", "1h30", "8h"...) en minutes.
// Utilisee par calendar-create.js pour calculer l'heure de fin d'un
// evenement Google Agenda. Isolee ici (plutot que dans calendar-create.js)
// pour rester testable sans tirer la dependance googleapis.
export function dureeEnMinutes(duree) {
  const s = String(duree || '').trim().toLowerCase();
  let m = s.match(/^(\d+)\s*min$/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/^(\d+)h(\d{1,2})?$/);
  if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  return 60;
}
