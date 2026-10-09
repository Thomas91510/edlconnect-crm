export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { contexteAgence, MESSAGE_ESPACE_INACTIF } from './_lib/espace-agence.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

  try {
    if (!SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Config serveur manquante' }), { status: 500 });
    }

    // ── Authentification obligatoire : l'email vient du jeton, jamais du corps ──
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

    const user = await userResp.json();
    const callerEmail = user?.email || '';

    // ── Aperçu admin : voir cf. api/client-orders.js — un administrateur
    // peut demander les documents d'un autre client via "clientEmail" dans
    // le corps, jamais accepté pour un appelant non-admin.
    let body = {};
    try { body = await req.json(); } catch (_) {}
    const estAdmin = ADMIN_EMAILS.includes((callerEmail || '').toLowerCase().trim());
    let email = callerEmail;
    if (estAdmin) {
      const clientEmail = (body && body.clientEmail || '').toLowerCase().trim();
      if (clientEmail) email = clientEmail;
    }

    if (!email) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }

    // Espace extranet non activé (CRM › fiche client) : accès refusé
    // (api/_lib/espace-agence.js). L'administrateur n'est jamais concerné.
    // Documents des seules fiches du prestataire retenu (cloisonnement).
    const ctx = await contexteAgence(email, SUPABASE_SERVICE_KEY, { estAdmin, expertDemande: String((body && body.expert) || '') });
    if (!ctx.actif) {
      if (ctx.raison === 'erreur') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) } });
      }
      return new Response(JSON.stringify({ error: MESSAGE_ESPACE_INACTIF, code: 'espace_inactif' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
      });
    }
    const rows = ctx.contacts;

    // Collecter tous les documents trouvés (un client peut être dans plusieurs agences)
    let documents = [];
    (rows || []).forEach(row => {
      const docs = row.data?.documents || [];
      docs.forEach(d => {
        // Pas de factures pour les agences : les anciennes entrées de type
        // "facture" ne sont jamais renvoyées à l'extranet.
        if (d.type === 'facture') return;
        if (d.url && d.nom && !documents.find(x => x.url === d.url)) {
          documents.push({ nom: d.nom, url: d.url, type: d.type || 'document' });
        }
      });
    });

    return new Response(JSON.stringify(documents), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });

  } catch (e) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }
}
