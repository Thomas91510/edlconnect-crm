export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { escapeIlike } from './_lib/ilike.js';
import { ADMIN_EMAILS } from './_lib/admin.js';

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const LONGUEUR_MAX_MESSAGE = 4000;

// Messagerie simple client ↔ expert, stockée dans contacts.data.messages
// (même schéma que "documents" — pas de nouvelle table). Ce point d'accès
// gère uniquement le côté client (extranet) : le côté CRM lit/écrit
// directement DB.contacts via le mécanisme de synchronisation déjà en
// place (pushToSupabase/subscribeRealtime), sans passer par cette API.
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origineAutorisee(req),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) };

  if (!SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Config serveur manquante' }), { status: 500, headers: cors });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: cors });
    }

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: cors });
    }
    const user = await userResp.json();
    const callerEmail = (user?.email || '').toLowerCase().trim();
    if (!callerEmail) {
      return new Response(JSON.stringify({ error: 'Email introuvable' }), { status: 400, headers: cors });
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}
    const action = body?.action || 'list';

    // Aperçu admin : même règle que client-orders.js/client-documents.js.
    let email = callerEmail;
    if (ADMIN_EMAILS.includes(callerEmail)) {
      const clientEmail = (body && body.clientEmail || '').toLowerCase().trim();
      if (clientEmail) email = clientEmail;
    }

    const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };
    const contactsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/contacts?select=id,data&data->>email=ilike.${encodeURIComponent(escapeIlike(email))}`,
      { headers: supaHeaders }
    );
    if (!contactsResp.ok) {
      return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des messages' }), { status: 500, headers: cors });
    }
    const rows = await contactsResp.json();

    if (action === 'list') {
      const messages = [];
      (rows || []).forEach(row => {
        (row.data?.messages || []).forEach(m => {
          if (m && m.body) messages.push({ sender: m.sender, body: m.body, createdAt: m.createdAt });
        });
      });
      messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return new Response(JSON.stringify(messages), { status: 200, headers: cors });
    }

    if (action === 'markRead') {
      for (const row of (rows || [])) {
        const data = row.data || {};
        const msgs = Array.isArray(data.messages) ? data.messages : [];
        if (!msgs.some(m => m && m.sender === 'expert' && !m.lu)) continue;
        const misAJour = msgs.map(m => (m && m.sender === 'expert') ? { ...m, lu: true } : m);
        await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: { ...supaHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { ...data, messages: misAJour } })
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    if (action === 'send') {
      const texte = String(body?.body || '').trim();
      if (!texte) {
        return new Response(JSON.stringify({ error: 'Message vide' }), { status: 400, headers: cors });
      }
      if (texte.length > LONGUEUR_MAX_MESSAGE) {
        return new Response(JSON.stringify({ error: 'Message trop long' }), { status: 400, headers: cors });
      }
      if (!rows || !rows.length) {
        return new Response(JSON.stringify({ error: 'Aucun contact associé à ce compte' }), { status: 404, headers: cors });
      }

      const nouveauMessage = { sender: 'client', body: texte, createdAt: new Date().toISOString(), lu: false };
      for (const row of rows) {
        const data = row.data || {};
        const msgs = Array.isArray(data.messages) ? data.messages.slice() : [];
        msgs.push(nouveauMessage);
        await fetch(`${SUPABASE_URL}/rest/v1/contacts?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: { ...supaHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { ...data, messages: msgs } })
        });
      }

      // Notification Slack best-effort — ne doit jamais faire échouer l'envoi.
      try {
        const slackUrl = process.env.SLACK_WEBHOOK_URL;
        if (slackUrl) {
          await fetch(slackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: '💬 *Nouveau message extranet*\n👤 ' + email + '\n' + texte
            })
          });
        }
      } catch (_) {}

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), { status: 400, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}
