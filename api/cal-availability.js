export const config = { runtime: 'edge' };

import { CAL_USERNAME, resolveCalEvent } from './_lib/cal-mapping.js';

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
// IMPORTANT — non vérifié en direct : l'accès réseau vers api.cal.com est
// bloqué depuis l'environnement de développement utilisé pour écrire ce
// fichier (politique réseau du bac à sable), donc ni le nom exact des
// paramètres de /v2/slots, ni la version d'API, ni la forme de la réponse
// n'ont pu être confirmés contre l'API réelle. Tout ceci est à valider au
// premier test réel une fois déployé sur Vercel (qui a un accès réseau
// normal) — voir le README de la conversation pour le détail des points à
// vérifier avant d'activer la fonctionnalité en production.
const CAL_API_VERSION = '2024-09-04';
const CAL_BASE = 'https://api.cal.com/v2';
const FENETRE_JOURS = 14;

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const CAL_API_KEY = process.env.CAL_API_KEY;
  if (!CAL_API_KEY) {
    return new Response(JSON.stringify({ available: false, slots: [] }), { status: 200, headers });
  }

  try {
    const url = new URL(req.url);
    const bienTypo = url.searchParams.get('bienTypo') || '';
    const meuble = url.searchParams.get('meuble') || '';

    const evt = resolveCalEvent(bienTypo, meuble);
    if (!evt) {
      return new Response(JSON.stringify({ available: false, slots: [] }), { status: 200, headers });
    }

    // Fenêtre glissante : à partir de demain (comme le formulaire actuel qui
    // fixe déjà "date min = demain"), sur FENETRE_JOURS jours.
    const debut = new Date(); debut.setDate(debut.getDate() + 1); debut.setHours(0, 0, 0, 0);
    const fin = new Date(debut); fin.setDate(fin.getDate() + FENETRE_JOURS);

    const calUrl = `${CAL_BASE}/slots?eventTypeSlug=${encodeURIComponent(evt.slug)}&username=${encodeURIComponent(CAL_USERNAME)}&start=${debut.toISOString()}&end=${fin.toISOString()}`;
    const calResp = await fetch(calUrl, {
      headers: {
        'Authorization': `Bearer ${CAL_API_KEY}`,
        'cal-api-version': CAL_API_VERSION,
      },
    });

    if (!calResp.ok) {
      // Panne Cal.com, clé invalide, ou événement introuvable : on dégrade
      // proprement plutôt que de bloquer un formulaire public avec une 500.
      return new Response(JSON.stringify({ available: false, slots: [] }), { status: 200, headers });
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

    return new Response(JSON.stringify({ available: slots.length > 0, slots, dureeMinutes: evt.duree }), {
      status: 200, headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({ available: false, slots: [] }), { status: 200, headers });
  }
}
