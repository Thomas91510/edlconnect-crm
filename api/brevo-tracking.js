// api/brevo-tracking.js — Récupère les événements de tracking des emails transactionnels Brevo
// Renvoie un tableau d'événements agrégés par email, format attendu par le CRM :
// [{ id, email, subject, statut, date, opens, clicks }]
export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });
  }
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  }

  try {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) {
      return new Response(JSON.stringify({ error: 'Clé API Brevo non configurée' }), { status: 500, headers });
    }

    // Fenêtre : 30 derniers jours
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = d => d.toISOString().split('T')[0];
    const startDate = fmt(start);
    const endDate = fmt(now);

    // Récupérer les événements transactionnels (pagination par offset)
    // Doc Brevo : GET /v3/smtp/statistics/events
    let allEvents = [];
    let offset = 0;
    const limit = 100;
    const maxPages = 30; // garde-fou : 3000 événements max

    for (let page = 0; page < maxPages; page++) {
      const url = `https://api.brevo.com/v3/smtp/statistics/events?limit=${limit}&offset=${offset}&startDate=${startDate}&endDate=${endDate}&sort=desc`;
      const resp = await fetch(url, {
        headers: { 'accept': 'application/json', 'api-key': brevoKey }
      });
      if (!resp.ok) break;
      const data = await resp.json();
      const events = data.events || [];
      if (!events.length) break;
      allEvents = allEvents.concat(events);
      if (events.length < limit) break;
      offset += limit;
    }

    // Agréger par (email + messageId) pour reconstituer un historique par email envoyé.
    // Chaque email transactionnel a un messageId ; on suit son cycle : delivered -> opened -> clicks.
    const rank = { 'requests':0, 'delivered':1, 'opened':2, 'uniqueOpened':2, 'clicks':3, 'unsubscribed':1, 'hardBounces':1, 'softBounces':1, 'spam':1, 'blocked':1, 'invalid':1, 'error':1, 'deferred':1 };
    const statutLabel = ev => {
      if (ev === 'clicks') return 'Cliqué';
      if (ev === 'opened' || ev === 'uniqueOpened') return 'Ouvert';
      if (ev === 'delivered') return 'Envoyé';
      if (ev === 'hardBounces' || ev === 'softBounces' || ev === 'blocked' || ev === 'invalid' || ev === 'error') return 'Échec';
      if (ev === 'spam') return 'Spam';
      if (ev === 'unsubscribed') return 'Désabonné';
      return 'Envoyé';
    };

    const byMsg = {};
    for (const ev of allEvents) {
      const email = (ev.email || '').toLowerCase();
      if (!email) continue;
      const msgId = ev.messageId || (email + '|' + (ev.subject || '') + '|' + (ev.date || '').split('T')[0]);
      const key = email + '::' + msgId;
      if (!byMsg[key]) {
        byMsg[key] = {
          id: key,
          email,
          objet: ev.subject || '(sans objet)',
          subject: ev.subject || '(sans objet)',
          direction: 'envoye',
          date: ev.date || new Date().toISOString(),
          statut: 'Envoyé',
          opens: 0,
          clicks: 0,
          _rank: 0
        };
      }
      const rec = byMsg[key];
      // conserver la date la plus récente et l'événement de plus haut rang
      if (ev.date && ev.date > rec.date) rec.date = ev.date;
      if ((ev.event === 'opened' || ev.event === 'uniqueOpened')) rec.opens++;
      if (ev.event === 'clicks') rec.clicks++;
      const r = rank[ev.event] ?? 0;
      if (r >= rec._rank) { rec._rank = r; rec.statut = statutLabel(ev.event); }
    }

    const result = Object.values(byMsg).map(({ _rank, ...rest }) => rest);
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
