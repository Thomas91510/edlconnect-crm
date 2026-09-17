export const config = { runtime: 'edge' };

import { resolveCalEvent } from './_lib/cal-mapping.js';
import { obtenirJetonAccesGoogle } from './_lib/google-service-account.js';
import { creneauxLibres } from './_lib/creneaux-libres.js';
import { recupererCalendriersAgents } from './_lib/agents-calendriers.js';
import { origineAutorisee } from './_lib/cors.js';
import { minuitParisEnUTC, moisActuelParis } from './_lib/fuseau-paris.js';

// Endpoint public (appelé depuis le formulaire de réservation en ligne, non
// authentifié) qui fusionne les agendas Google ("libre/occupé" uniquement)
// de plusieurs collaborateurs pour proposer des créneaux réellement
// disponibles — sans Cal.com : un compte de service Google gratuit lit le
// libre/occupé de chaque agenda partagé avec lui ("Voir uniquement le
// libre/occupé"), aucune installation côté collaborateur. Réutilise les
// durées par typologie déjà définies dans cal-mapping.js. La liste des
// agendas à interroger vient du CRM (Paramètres → Agents EDL → email) via
// recupererCalendriersAgents — ajouter/retirer un collaborateur se fait
// entièrement depuis le CRM, sans toucher à la configuration Vercel.
//
// Règle retenue : un créneau est proposé dès qu'AU MOINS UN collaborateur
// est libre sur toute sa durée (union des disponibilités) — pas besoin que
// toute l'équipe le soit, pour répartir librement les missions. Un tampon
// de 30 min est respecté avant/après chaque rendez-vous existant (temps de
// trajet entre deux missions).
//
// Fonctionnalité désactivée par défaut : tant que le compte de service
// (GOOGLE_FREEBUSY_SERVICE_ACCOUNT_EMAIL / _KEY) n'est pas configuré, ou
// qu'aucun agent du CRM n'a d'email renseigné, cet endpoint répond "aucun
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
const TAMPON_MINUTES = 30;

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
  if (!email || !cleBrute) {
    return repli({ debug: 'Compte de service absent des variables d\'environnement' });
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

    // Code postal du bien (extrait côté formulaire depuis l'adresse en texte
    // libre) — sectorise les agents interrogés quand il est exploitable,
    // sinon aucun filtrage (cf. agentCouvreSecteur dans agents-calendriers.js).
    const codePostal = (url.searchParams.get('cp') || '').replace(/\D/g, '').slice(0, 5);

    const calendriers = await recupererCalendriersAgents(process.env.DEFAULT_OWNER_ID, process.env.SUPABASE_SERVICE_KEY, codePostal);
    if (calendriers.length === 0) {
      return repli({ debug: 'Aucun agent disponible pour ce secteur ou avec un email renseigné dans le CRM (Paramètres → Agents EDL)' });
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

    // Un agenda en erreur (accès révoqué, partage non finalisé, email
    // invalide...) est exclu plutôt que traité comme "toujours libre" — sans
    // ça, un partage cassé rendrait silencieusement ce collaborateur
    // disponible en permanence et risquerait un double rendez-vous.
    const occupePar = {};
    const calendriersEnErreur = [];
    for (const id of calendriers) {
      const entree = fbData.calendars && fbData.calendars[id];
      if (!entree || (Array.isArray(entree.errors) && entree.errors.length > 0)) {
        calendriersEnErreur.push(id);
        continue;
      }
      const busy = Array.isArray(entree.busy) ? entree.busy : [];
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
      tamponMinutes: TAMPON_MINUTES,
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
    if (debug) { body.debug = 'OK'; body.codePostal = codePostal; body.calendriers = calendriers; body.calendriersEnErreur = calendriersEnErreur; body.fbDataBrut = fbData; }
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch (e) {
    return repli({ debug: 'Exception : ' + e.message });
  }
}
