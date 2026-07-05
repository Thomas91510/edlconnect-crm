// api/calendar-list.js — Lister les événements Google Calendar
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
  // ── Authentification obligatoire : jeton de session Supabase ──

  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); return res.status(200).end(); }
  const _authHeader = req.headers['authorization'] || '';
  const _token = _authHeader.replace('Bearer ', '').trim();
  if (!_token) return res.status(401).json({ error: 'Non authentifié' });
  const _userResp = await fetch('https://pvuctwflxvvxdawsxceu.supabase.co/auth/v1/user', {
    headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic', 'Authorization': 'Bearer ' + _token }
  });
  if (!_userResp.ok) return res.status(401).json({ error: 'Session invalide ou expirée' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(503).json({ error: 'Google Calendar non configuré' });
  }

  try {
    const calendar = await getCalendarClient();
    const now = new Date();
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 200,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = (result.data.items || []).map(evt => ({
      id: evt.id,
      summary: evt.summary || '',
      description: evt.description || '',
      location: evt.location || '',
      start: evt.start?.dateTime || evt.start?.date || '',
      htmlLink: evt.htmlLink || '',
      source: 'google'
    }));

    return res.status(200).json({ success: true, events, count: events.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
