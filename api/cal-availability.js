export const config = { runtime: 'edge' };

import { CAL_USERNAME, resolveCalEvent } from './_lib/cal-mapping.js';
import { origineAutorisee } from './_lib/cors.js';
import { minuitParisEnUTC, moisActuelParis } from './_lib/fuseau-paris.js';

// Endpoint public (appelé depuis le formulaire de réservation en ligne, non
// authentifié) qui renvoie les créneaux réellement libres de l'expert pour
// un type de bien donné, en interrogeant l'API Cal.com — le formulaire garde
// entièrement sa propre interface, l'agence ne voit jamais Cal.com.
//
// Fonctionnalité désactivée par défaut : tant que CAL_API_KEY n'est pas
// configurée dans les variables d'environnement Vercel, cet endpoint répond
// simplement "aucun créneau disponible" et le formulaire public bascule sur
// la saisie de date libre existante — comportement inchangé jusqu'à
// activation volontaire.
//
// Format d'appel et forme de réponse validés en conditions réelles le
// 03/09/2026 contre le compte Cal.com "edl-idf-myqe4m" (réponse groupée par
// date : { data: { "2026-09-04": [{start:...}], ... }, status: "success" }).
const CAL_API_VERSION = '2024-09-04';
const CAL_BASE = 'https://api.cal.com/v2';
// Délai minimum avant un créneau en ligne : une demande déposée l'après-midi
// ne doit pas pouvoir aboutir à un rendez-vous le jour même ou le lendemain
// matin, pris de court sans marge d'organisation. Un besoin urgent passe par
// le message de contact direct affiché sur le formulaire, pas par cette
// prise de rendez-vous en libre-service.
const DELAI_MINIMUM_HEURES = 48;

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

  const CAL_API_KEY = process.env.CAL_API_KEY;
  const url = new URL(req.url);
  // &debug=1 renvoie le détail de l'appel Cal.com (utile en cas de nouveau
  // souci) au lieu de dégrader silencieusement — sans, comportement normal.
  const debug = url.searchParams.get('debug') === '1';
  const repli = (extra) => new Response(JSON.stringify(Object.assign({ available: false, slots: [], configured: false }, debug ? extra : {})), { status: 200, headers });

  if (!CAL_API_KEY) {
    return repli({ debug: 'CAL_API_KEY absente des variables d\'environnement' });
  }

  try {
    const bienTypo = url.searchParams.get('bienTypo') || '';
    const meuble = url.searchParams.get('meuble') || '';

    const evt = resolveCalEvent(bienTypo, meuble);
    if (!evt) {
      return repli({ debug: 'Type de bien non reconnu', bienTypo, meuble });
    }

    // Mois calendaire affiché (ex. "2026-09" pour tout septembre), pour
    // naviguer mois par mois sans limite dans le temps plutôt que par
    // fenêtre glissante de quelques jours. Par défaut : le mois en cours.
    // Jamais un mois déjà révolu — impossible de reculer avant le mois
    // courant, qui contient déjà le délai minimum de 48h le cas échéant.
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
    // timeZone est indispensable : sans lui, Cal.com calcule les creneaux par
    // rapport a un fuseau par defaut (constate : les horaires renvoyes ne
    // correspondaient pas du tout a ceux affiches sur la page Cal.com
    // publique du meme evenement/jour, ex. le 30/09/2026 constate en
    // conditions reelles). L'expert opere en France, d'ou Europe/Paris fixe
    // (meme fuseau que celui deja utilise pour les evenements Google Agenda
    // dans calendar-create.js) — et les bornes du mois sont calculées dans ce
    // même fuseau (minuitParisEnUTC) pour couvrir exactement "tout le mois"
    // vu depuis Paris, quelle que soit l'heure d'été/hiver en vigueur.
    const debutMois = minuitParisEnUTC(annee, mois, 1);
    const finMois = minuitParisEnUTC(moisSuivant.annee, moisSuivant.mois, 1);

    const calUrl = `${CAL_BASE}/slots?eventTypeSlug=${encodeURIComponent(evt.slug)}&username=${encodeURIComponent(CAL_USERNAME)}&start=${debutMois.toISOString()}&end=${finMois.toISOString()}&timeZone=${encodeURIComponent('Europe/Paris')}`;
    const calResp = await fetch(calUrl, {
      headers: {
        'Authorization': `Bearer ${CAL_API_KEY}`,
        'cal-api-version': CAL_API_VERSION,
      },
    });

    if (!calResp.ok) {
      // Panne Cal.com, clé invalide, ou événement introuvable : on dégrade
      // proprement plutôt que de bloquer un formulaire public avec une 500.
      const corpsErreur = await calResp.text().catch(() => '');
      return repli({ debug: 'Réponse Cal.com non OK', calUrl, calStatus: calResp.status, calBody: corpsErreur.slice(0, 500) });
    }

    const calData = await calResp.json();
    // Forme de réponse non confirmée en direct (cf. avertissement en haut du
    // fichier) : on tente les deux formes documentées pour /v2/slots — une
    // liste plate, ou un objet groupé par date ({ "2026-09-10": [...] }) —
    // et on aplatit en une simple liste d'horodatages ISO.
    const payload = (calData && calData.data !== undefined) ? calData.data : calData;
    let slots = [];
    if (Array.isArray(payload)) {
      slots = payload.map(s => (s && (s.time || s.start)) || (typeof s === 'string' ? s : null)).filter(Boolean);
    } else if (payload && typeof payload === 'object') {
      slots = Object.values(payload)
        .flat()
        .map(s => (s && (s.time || s.start)) || (typeof s === 'string' ? s : null))
        .filter(Boolean);
    }

    // Filet de sécurité : jamais un créneau avant le délai minimum de 48h,
    // même si le mois affiché (ex. le mois en cours) commence avant cette
    // échéance — indépendant des bornes du mois envoyées à Cal.com.
    const seuil = Date.now() + DELAI_MINIMUM_HEURES * 60 * 60 * 1000;
    slots = slots.filter(iso => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= seuil;
    });

    const body = {
      available: slots.length > 0,
      slots,
      dureeMinutes: evt.duree,
      configured: true,
      mois: annee + '-' + String(mois).padStart(2, '0'),
      fenetreDebut: debutMois.toISOString(),
      fenetreFin: finMois.toISOString()
    };
    if (debug) { body.debug = 'OK'; body.calUrl = calUrl; body.calDataBrut = calData; }
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch (e) {
    return repli({ debug: 'Exception : ' + e.message });
  }
}
