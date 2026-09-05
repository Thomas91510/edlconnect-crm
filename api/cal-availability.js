export const config = { runtime: 'edge' };

import { CAL_USERNAME, resolveCalEvent } from './_lib/cal-mapping.js';
import { origineAutorisee } from './_lib/cors.js';

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
const FENETRE_JOURS = 14;
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
    // Décalage en jours pour naviguer vers une fenêtre plus lointaine (ex.
    // un RDV souhaité dans 2 mois) : 0 = fenêtre par défaut, chaque "page"
    // suivante avance de FENETRE_JOURS. Jamais négatif — la fenêtre par
    // défaut part déjà du délai minimum, impossible de reculer avant.
    const decalageJours = Math.max(0, parseInt(url.searchParams.get('decalage') || '0', 10) || 0);

    const evt = resolveCalEvent(bienTypo, meuble);
    if (!evt) {
      return repli({ debug: 'Type de bien non reconnu', bienTypo, meuble });
    }

    // Fenêtre glissante : à partir de DELAI_MINIMUM_HEURES à compter de
    // l'instant de la demande (pas d'un jour calendaire arrondi), sur
    // FENETRE_JOURS jours — décalée de decalageJours pour la pagination.
    const debut = new Date(Date.now() + DELAI_MINIMUM_HEURES * 60 * 60 * 1000 + decalageJours * 24 * 60 * 60 * 1000);
    const fin = new Date(debut); fin.setDate(fin.getDate() + FENETRE_JOURS);

    // timeZone est indispensable : sans lui, Cal.com calcule les creneaux par
    // rapport a un fuseau par defaut (constate : les horaires renvoyes ne
    // correspondaient pas du tout a ceux affiches sur la page Cal.com
    // publique du meme evenement/jour, ex. le 30/09/2026 constate en
    // conditions reelles). L'expert opere en France, d'ou Europe/Paris fixe
    // (meme fuseau que celui deja utilise pour les evenements Google Agenda
    // dans calendar-create.js).
    const calUrl = `${CAL_BASE}/slots?eventTypeSlug=${encodeURIComponent(evt.slug)}&username=${encodeURIComponent(CAL_USERNAME)}&start=${debut.toISOString()}&end=${fin.toISOString()}&timeZone=${encodeURIComponent('Europe/Paris')}`;
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

    // Filet de sécurité : si jamais Cal.com renvoyait un créneau antérieur au
    // délai minimum (précision de "start" non garantie), on l'exclut plutôt
    // que de compter uniquement sur le paramètre envoyé.
    const seuil = debut.getTime();
    slots = slots.filter(iso => {
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= seuil;
    });

    const body = {
      available: slots.length > 0,
      slots,
      dureeMinutes: evt.duree,
      configured: true,
      fenetreDebut: debut.toISOString(),
      fenetreFin: fin.toISOString()
    };
    if (debug) { body.debug = 'OK'; body.calUrl = calUrl; body.calDataBrut = calData; }
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch (e) {
    return repli({ debug: 'Exception : ' + e.message });
  }
}
