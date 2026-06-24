// api/calendar-create.js — Créer un événement Google Calendar
import { google } from 'googleapis';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(503).json({ error: 'Google Calendar non configuré' });
  }

  try {
    const { titre, date, duree, lieu, description } = req.body;
    const startDt = new Date(date);
    if (isNaN(startDt)) return res.status(400).json({ error: `Date invalide : ${date}` });

    const dureeMap = { '30 min': 30, '1h': 60, '1h30': 90, '2h': 120, '3h': 180 };
    const minutes = dureeMap[duree] || 60;
    const endDt = new Date(startDt.getTime() + minutes * 60000);

    const calendar = await getCalendarClient();
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: titre || 'RDV EDL IDF',
        location: lieu || '',
        description: (description || '') + '\n\n[Créé par EDLConnect CRM]',
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
