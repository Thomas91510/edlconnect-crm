export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { identiteAbonne } from './_lib/identite.js';

// Envoie automatiquement à un nouvel "Agent EDL" (renseigné avec un email
// dans Paramètres → Agents EDL) le lien vers son espace agent — appelé
// depuis addAgent() (js/app-settings.js) juste après la création d'un
// agent, jamais lors d'une simple modification. Contrairement à
// send-welcome-agency.js (envoi vers un tiers arbitraire, réservé aux
// comptes payants), cet endpoint n'envoie qu'aux emails que le compte
// authentifié a lui-même saisis dans SES PROPRES agents : pas de gate sur
// le plan, juste une session valide.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });

  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  const user = await userResp.json();

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return new Response(JSON.stringify({ error: 'Clé Brevo manquante' }), { status: 500, headers });

  try {
    const { email, nom } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'Email requis' }), { status: 400, headers });

    const IDENT = await identiteAbonne(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, user && user.id);
    const lienEspaceAgent = 'https://app.lokentia.fr/agent';

    const htmlContent = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:20px 0">

  <div style="background:#1A5FA8;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <div style="color:#fff;font-size:21px;font-weight:700">${esc(IDENT.nom)}</div>
    <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:4px">Votre espace agent</div>
  </div>

  <div style="background:#fff;padding:32px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:15px;color:#1a1a1a;margin:0 0 16px 0">
      Bonjour${nom ? ' <strong>' + esc(nom) + '</strong>' : ''},
    </p>
    <p style="font-size:13px;color:#444;line-height:1.8;margin:0 0 20px 0">
      Un espace personnel vient de t'être créé chez ${esc(IDENT.nom)}. Tu y retrouveras tes missions assignées (états des lieux) et tes statistiques.
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:18px;margin-bottom:24px">
      <div style="font-size:13px;font-weight:700;color:#1A5FA8;margin-bottom:12px">📋 Ce que tu retrouves dans ton espace :</div>
      <div style="font-size:13px;color:#0C447C;line-height:2">
        ✅ Tes missions à venir, avec adresse et horaire<br>
        ✅ Les coordonnées du locataire pour chaque RDV<br>
        ✅ Tes statistiques (types d'EDL, meublé/nu, typologies)
      </div>
    </div>

    <div style="background:#f8f8f6;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:#1A5FA8;margin-bottom:4px">🔗 Accéder à mon espace</div>
      <div style="font-size:12px;color:#444;margin-bottom:12px">Saisis ton adresse email sur la page — tu recevras un lien de connexion instantané, aucun mot de passe à retenir.</div>
      <a href="${lienEspaceAgent}"
         style="display:inline-block;background:#1A5FA8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:8px">
        Accéder à mon espace →
      </a>
      <div style="font-size:10px;color:#6b6b6b;margin-top:4px">${lienEspaceAgent}</div>
    </div>

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">À bientôt,</p>
    <div style="border-top:2px solid #1A5FA8;padding-top:16px;font-size:13px;color:#1A5FA8">
      <strong>${esc(IDENT.signature || IDENT.nom)}</strong><br>
      <span style="color:#6b6b6b">${IDENT.tel ? `📞 ${esc(IDENT.tel)} · ` : ''}✉️ ${esc(IDENT.replyTo || IDENT.email)}</span>
    </div>
  </div>

</div>
</body></html>`;

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: IDENT.nom, email: IDENT.email },
        ...(IDENT.replyTo ? { replyTo: { email: IDENT.replyTo, name: IDENT.nom } } : {}),
        to: [{ email, name: nom || email }],
        subject: `👋 Ton espace agent ${IDENT.nom} est prêt`,
        htmlContent,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: err.message || 'Échec envoi Brevo' }), { status: 500, headers });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
