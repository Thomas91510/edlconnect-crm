// api/calendar-create.js — Créer un événement Google Calendar
import { google } from 'googleapis';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { dureeEnMinutes } from './_lib/duree.js';
import { parisEnUTC } from './_lib/fuseau-paris.js';

// Le CRM envoie une date "AAAA-MM-JJTHH:mm:ss" sans fuseau — l'heure de Paris
// telle que saisie par l'utilisateur, pas un instant UTC. `new Date(...)` sur
// une telle chaîne (sans Z ni offset) est interprétée comme l'heure locale du
// *runtime*, pas celle de Paris ; sur Vercel ce runtime tourne en UTC, ce qui
// décale l'événement de 1h (CET) ou 2h (CEST) une fois affiché dans Google
// Calendar avec timeZone:'Europe/Paris'. On ne réinterprète que les chaînes
// réellement sans fuseau : une date qui en porte déjà un (Z ou +hh:mm) est
// laissée à new Date(), qui la traite alors correctement.
const RE_DATE_SANS_FUSEAU = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
function versInstantUTC(date) {
  const m = RE_DATE_SANS_FUSEAU.exec(String(date || '').trim());
  if (!m) return new Date(date);
  const [, annee, mois, jour, heure, minute, seconde] = m;
  return parisEnUTC(+annee, +mois, +jour, +heure, +minute, seconde ? +seconde : 0);
}

async function getCalendarClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://edlconnect.fr/api/oauth-callback'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export default async function handler(req, res) {
  // ── Authentification obligatoire : jeton de session Supabase ──

  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', origineAutorisee(req)); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); return res.status(200).end(); }
  const _authHeader = req.headers['authorization'] || '';
  const _token = _authHeader.replace('Bearer ', '').trim();
  if (!_token) return res.status(401).json({ error: 'Non authentifié' });
  const _userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + _token }
  });
  if (!_userResp.ok) return res.status(401).json({ error: 'Session invalide ou expirée' });

  res.setHeader('Access-Control-Allow-Origin', origineAutorisee(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(503).json({ error: 'Google Calendar non configuré' });
  }

  try {
    const { titre, date, duree, lieu, description } = req.body;
    const startDt = versInstantUTC(date);
    if (isNaN(startDt)) return res.status(400).json({ error: `Date invalide : ${date}` });

    const minutes = dureeEnMinutes(duree);
    const endDt = new Date(startDt.getTime() + minutes * 60000);

    const calendar = await getCalendarClient();
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: titre || 'RDV EDL IDF',
        location: lieu || '',
        description: (description || '') + '\n\n[Créé par Lokentia CRM]',
        start: { dateTime: startDt.toISOString(), timeZone: 'Europe/Paris' },
        end: { dateTime: endDt.toISOString(), timeZone: 'Europe/Paris' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'email', minutes: 1440 }
          ]
        }
      }
    });

    return res.status(201).json({ success: true, gcalId: event.data.id, link: event.data.htmlLink });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
