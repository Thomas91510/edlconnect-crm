// api/gmail-emails.js — Emails Gmail d'un contact
import { google } from 'googleapis';

async function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://edlconnect.fr/api/oauth-callback'
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = req.query.email?.trim();
  if (!email) return res.status(400).json({ error: 'email requis' });

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(503).json({ error: 'Gmail non configuré — token manquant' });
  }

  try {
    const gmail = await getGmailClient();
    const query = `from:${email} OR to:${email}`;
    const result = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: 50
    });

    const messages = result.data.messages || [];
    const emailsOut = [];
    const MY_EMAIL = 'contact@edl-idf.com';

    for (const msg of messages) {
      const m = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date']
      });

      const headers = {};
      for (const h of m.data.payload?.headers || []) {
        headers[h.name] = h.value;
      }

      const fromAddr = headers['From'] || '';
      const direction = MY_EMAIL.toLowerCase() in fromAddr.toLowerCase() ? 'envoye' : 'recu';

      let dateIso = headers['Date'] || '';
      try {
        dateIso = new Date(headers['Date']).toISOString();
      } catch (e) {}

      emailsOut.push({
        id: msg.id,
        objet: headers['Subject'] || '(sans objet)',
        from: fromAddr,
        to: headers['To'] || '',
        date: dateIso,
        direction,
        statut: direction === 'recu' ? 'Recu' : 'Envoye (Gmail)'
      });
    }

    emailsOut.sort((a, b) => b.date.localeCompare(a.date));
    return res.status(200).json({ success: true, emails: emailsOut, count: emailsOut.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
