export const config = { runtime: 'edge' };

import { resolveCalEvent } from './_lib/cal-mapping.js';
import { obtenirJetonAccesGoogle } from './_lib/google-service-account.js';
import { creneauxLibres } from './_lib/creneaux-libres.js';
import { origineAutorisee } from './_lib/cors.js';
import { minuitParisEnUTC, moisActuelParis } from './_lib/fuseau-paris.js';

// Endpoint public (appelé depuis le formulaire de réservation en ligne, non
// authentifié) qui fusionne les agendas Google ("libre/occupé" uniquement)
// de plusieurs collaborateurs pour proposer des créneaux réellement
// disponibles — sans Cal.com : un compte de service Google gratuit lit le
// libre/occupé de chaque agenda partagé avec lui ("Voir uniquement le
// libre/occupé"), aucune installation côté collaborateur. Réutilise les
// durées par typologie déjà définies dans cal-mapping.js.
//
// Règle retenue : un créneau est proposé dès qu'AU MOINS UN collaborateur
// est libre sur toute sa durée (union des disponibilités) — pas besoin que
// toute l'équipe le soit, pour répartir librement les missions.
//
// Fonctionnalité désactivée par défaut : tant que
// GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL / _KEY / GOOGLE_FREEBUSY_CALENDARS ne
// sont pas toutes les trois configurées, cet endpoint répond "aucun
// créneau" et le formulaire public bascule sur la saisie de date libre
// existante — comportement inchangé jusqu'à activation volontaire.
const FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
// Même règle métier que l'ancien chemin Cal.com (cal-availability.js) : une
// demande déposée l'après-midi ne doit pas aboutir à un rendez-vous le jour
// même ou le lendemain matin.
const DELAI_MINIMUM_HEURES = 48;
const HEURE_OUVERTURE = 9;
const HEURE_FERMETURE = 19;
const JOURS_OUVRES = [1, 2, 3, 4, 5, 6]; // lundi à samedi
const PAS_MINUTES = 30;

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const url = new URL(req.url);
  // &debug=1 renvoie le détail de l'appel Google (utile en cas de souci) au
  // lieu de dégrader silencieusement — sans, comportement normal.
  const debug = url.searchParams.get('debug') === '1';
  const repli = (extra) => new Response(JSON.stringify(Object.assign({ available: false, slots: [], configured: false }, debug ? extra : {})), { status: 200, headers });

  const email = process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL;
  const cleBrute = process.env.GOOGLE_FREEBUSY_SERVICE_ACCOUNT_KEY;
  const calendriers = (process.env.GOOGLE_FREEBUSY_CALENDARS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !cleBrute || calendriers.length === 0) {
    return repli({ debug: 'Compte de service ou liste de calendriers absents des variables d\'environnement' });
  }
  // Vercel n'accepte pas toujours les retours à la ligne littéraux dans une
  // variable d'environnement : la clé peut y être collée avec des "\n"
  // échappés, à reconvertir en vrais retours à la ligne pour le PEM.
  const privateKey = cleBrute.replace(/\\n/g, '\n');

  try {
    const bienTypo = url.searchParams.get('bienTypo') || '';
    const meuble = url.searchParams.get('meuble') || '';

    const evt = resolveCalEvent(bienTypo, meuble);
    if (!evt) {
      return repli({ debug: 'Type de bien non reconnu', bienTypo, meuble });
    }

    // Mois calendaire affiché, même logique que cal-availability.js :
    // navigation mois par mois, jamais avant le mois courant.
    const { annee: anneeCourante, mois: moisCourant } = moisActuelParis();
    const moisDemande = (url.searchParams.get('mois') || '').match(/^(\d{4})-(\d{2})$/);
    let annee = anneeCourante, mois = moisCourant;
    if (moisDemande) {
      annee = parseInt(moisDemande[1], 10);
      mois = parseInt(moisDemande[2], 10);
    }
    if (annee < anneeCourante || (annee === anneeCourante && mois < moisCourant)) {
      annee = anneeCourante; mois = moisCourant;
    }

    const moisSuivant = mois === 12 ? { annee: annee + 1, mois: 1 } : { annee, mois: mois + 1 };
    const debutMois = minuitParisEnUTC(annee, mois, 1);
    const finMois = minuitParisEnUTC(moisSuivant.annee, moisSuivant.mois, 1);

    const accessToken = await obtenirJetonAccesGoogle({ email, privateKey });

    const fbResp = await fetch(FREEBUSY_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: debutMois.toISOString(),
        timeMax: finMois.toISOString(),
        timeZone: 'Europe/Paris',
        items: calendriers.map(id => ({ id })),
      }),
    });
    if (!fbResp.ok) {
      const corpsErreur = await fbResp.text().catch(() => '');
      return repli({ debug: 'Réponse Google freebusy non OK', fbStatus: fbResp.status, fbBody: corpsErreur.slice(0, 500) });
    }
    const fbData = await fbResp.json();

    const occupePar = {};
    for (const id of calendriers) {
      const entree = fbData.calendars && fbData.calendars[id];
      const busy = (entree && Array.isArray(entree.busy)) ? entree.busy : [];
      occupePar[id] = busy.map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
    }

    const seuilMs = Date.now() + DELAI_MINIMUM_HEURES * 60 * 60 * 1000;
    const slots = creneauxLibres({
      fenetreDebut: debutMois,
      fenetreFin: finMois,
      occupePar,
      dureeMinutes: evt.duree,
      seuilMs,
      heureOuverture: HEURE_OUVERTURE,
      heureFermeture: HEURE_FERMETURE,
      joursOuvres: JOURS_OUVRES,
      pasMinutes: PAS_MINUTES,
    });

    const body = {
      available: slots.length > 0,
      slots,
      dureeMinutes: evt.duree,
      configured: true,
      mois: annee + '-' + String(mois).padStart(2, '0'),
      fenetreDebut: debutMois.toISOString(),
      fenetreFin: finMois.toISOString(),
    };
    if (debug) { body.debug = 'OK'; body.calendriers = calendriers; body.fbDataBrut = fbData; }
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch (e) {
    return repli({ debug: 'Exception : ' + e.message });
  }
}
