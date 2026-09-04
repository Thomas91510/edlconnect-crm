export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
const ADMIN_EMAILS = ['contact@edl-idf.com'];

// ── Vérifie que l'utilisateur est admin ou sur un plan payant actif. ──
async function planAutorise(userId, email) {
  if (email && ADMIN_EMAILS.includes(email)) return true;
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key || !userId) return true;
    const r = await fetch(SUPABASE_URL + '/rest/v1/user_plans?select=plan,status&user_id=eq.' + encodeURIComponent(userId), {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (!r.ok) return true;
    const rows = await r.json();
    const p = rows && rows[0];
    if (!p) return false;
    return (p.plan === 'starter' || p.plan === 'pro') && p.status === 'active';
  } catch (e) { return true; }
}

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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });

  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  // ── Fonctionnalité réservée aux plans Starter/Pro (envoi de campagnes) ──
  const _user = await userResp.json();
  const _autorise = await planAutorise(_user && _user.id, _user && _user.email);
  if (!_autorise) {
    return new Response(JSON.stringify({ error: 'L\'envoi de campagnes email est réservé aux plans Starter et Pro.', planRequis: true }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }

  try {
    const body = await req.json();
    const brevoKey = process.env.BREVO_API_KEY;

    if (!brevoKey) {
      return new Response(JSON.stringify({ error: 'Clé API Brevo non configurée' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }

    // Garde-fous minimaux : le corps est transmis à Brevo quasiment tel quel,
    // sans autre limite que le plan payant. Un compte compromis ou malveillant
    // pourrait sinon s'en servir comme relais d'envoi en masse via le domaine
    // partagé de la plateforme.
    if (!body || !body.to || !body.subject || !(body.htmlContent || body.textContent)) {
      return new Response(JSON.stringify({ error: 'Requête incomplète (to, subject et contenu requis)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }
    const nbDestinataires = Array.isArray(body.to) ? body.to.length : 1;
    if (nbDestinataires > 50) {
      return new Response(JSON.stringify({ error: 'Trop de destinataires en un seul envoi (max 50)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }

    // Marquer l'email avec l'identifiant de l'abonné expéditeur : le compte
    // Brevo est partagé par toute la plateforme, donc sans ce tag l'endpoint
    // /api/brevo-tracking (qui interroge les statistiques Brevo) ne peut pas
    // distinguer les emails d'un abonné de ceux des autres. Voir aussi
    // brevo-tracking.js qui filtre ses requêtes sur ce même tag.
    const bodyTague = {
      ...body,
      tags: [...(Array.isArray(body.tags) ? body.tags : []), 'sub_' + _user.id]
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify(bodyTague)
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }
}
