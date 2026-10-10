export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { effacerCompte } from './_lib/suppression-compte.js';

// Suppression définitive de son compte par l'abonné lui-même (droit à
// l'effacement, RGPD) : le détail de l'effacement est dans
// _lib/suppression-compte.js, partagé avec la suppression par l'admin.
//
// Le compte admin (éditeur de la plateforme) ne peut pas se supprimer ici.
export { TABLES_ABONNE } from './_lib/suppression-compte.js';
export const CONFIRMATION = 'SUPPRIMER';

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
  if (!user || !user.id) return reponse({ error: 'Session invalide ou expirée' }, 401);
  if (ADMIN_EMAILS.includes(String(user.email || '').toLowerCase().trim())) {
    return reponse({ error: 'Le compte éditeur de la plateforme ne peut pas être supprimé ici' }, 403);
  }

  let body = {};
  try { body = await req.json(); } catch (_) {}
  if (!body || body.confirmation !== CONFIRMATION) {
    return reponse({ error: `Tapez ${CONFIRMATION} pour confirmer` }, 400);
  }

  const resultat = await effacerCompte(user.id, serviceKey);
  if (!resultat.ok && resultat.etape === 'donnees') {
    // Compte de connexion conservé : l'abonné peut réessayer, rien n'est orphelin.
    return reponse({ error: 'Suppression incomplète, réessayez dans un instant', tables: resultat.tables }, 500);
  }
  if (!resultat.ok) return reponse({ error: 'Données supprimées, mais le compte de connexion n’a pas pu l’être : contactez contact@lokentia.fr' }, 500);

  // Confirmation par email (best-effort)
  const brevo = process.env.BREVO_API_KEY;
  if (brevo && user.email) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevo },
      body: JSON.stringify({
        sender: { name: 'Lokentia', email: 'contact@lokentia.fr' },
        to: [{ email: user.email }],
        bcc: [{ email: ADMIN_EMAILS[0] }],
        subject: 'Votre compte Lokentia a été supprimé',
        htmlContent: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6"><p>Bonjour,</p><p>Votre compte Lokentia et l’ensemble de ses données (clients, missions, réservations, agents, fichiers) ont été supprimés à votre demande. Les copies de sauvegarde seront effacées automatiquement sous 30 jours.</p><p>Merci d’avoir utilisé Lokentia.</p><p>L’équipe Lokentia</p></div>',
      }),
    }).catch(() => {});
  }
  return reponse({ success: true }, 200);
}
