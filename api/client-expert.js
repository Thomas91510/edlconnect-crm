export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { contexteAgence, MESSAGE_ESPACE_INACTIF } from './_lib/espace-agence.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { vitrineAbonne } from './_lib/identite.js';

// Identité du prestataire de l'agence connectée à l'extranet (nom,
// accroche, personne à contacter, téléphone, logo) — même prestataire que
// celui retenu pour ses messages, documents et commandes
// (api/_lib/espace-agence.js), affichée à la place d'un nom codé en dur.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reponse({ error: 'Method not allowed' }, 405);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();
  const callerEmail = String((user && user.email) || '').toLowerCase().trim();
  if (!callerEmail) return reponse({ error: 'Email introuvable' }, 400);

  let body = {};
  try { body = await req.json(); } catch (_) {}
  const estAdmin = ADMIN_EMAILS.includes(callerEmail);
  let email = callerEmail;
  if (estAdmin && body && body.clientEmail) email = String(body.clientEmail).toLowerCase().trim();

  const ctx = await contexteAgence(email, serviceKey, { estAdmin, expertDemande: String((body && body.expert) || '') });
  if (!ctx.actif || !ctx.expertId) {
    if (ctx.raison === 'erreur' || ctx.raison === 'admin') return reponse({ error: 'Lecture impossible' }, 500);
    return reponse({ error: MESSAGE_ESPACE_INACTIF, code: 'espace_inactif' }, 403);
  }
  return reponse(await vitrineAbonne(SUPABASE_URL, serviceKey, ctx.expertId), 200);
}
