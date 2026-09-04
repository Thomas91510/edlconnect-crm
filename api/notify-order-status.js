export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';

// Echappement HTML : les champs proviennent du CRM (saisie libre agence/mission)
// et sont reinjectes dans un email envoye a un client final.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

const DOMAINES_VERIFIES = ['edl-idf.com', 'lokentia.fr'];

async function identiteAbonne(userId, serviceKey) {
  const neutre = { nom: 'Lokentia', email: 'contact@lokentia.fr', replyTo: '', tel: '' };
  if (!userId || !serviceKey) return neutre;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/settings?select=data&user_id=eq.' + encodeURIComponent(userId), {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
    });
    if (!r.ok) return neutre;
    const rows = await r.json();
    const d = (rows && rows[0] && rows[0].data) || {};
    const nom = (d.expediteurNom || d.companyName || '').trim() || neutre.nom;
    const mail = (d.expediteurEmail || d.userEmail || '').trim();
    const domaine = mail.includes('@') ? mail.split('@')[1].toLowerCase() : '';
    const peutExpedier = domaine && DOMAINES_VERIFIES.includes(domaine);
    return {
      nom,
      email: peutExpedier ? mail : neutre.email,
      replyTo: (!peutExpedier && mail) ? mail : '',
      tel: (d.expediteurTel || '').trim()
    };
  } catch (e) { return neutre; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!SUPABASE_SERVICE_KEY || !BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  const _user = await userResp.json();
  const _userId = _user && _user.id;
  if (!_userId) {
    return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  const supaHeaders = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };

  try {
    const { missionId, emailClient, adresse, type, date, agence } = await req.json();
    if (!missionId || !emailClient) {
      return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // Vérifier que la mission appartient bien à l'abonné appelant, et
    // récupérer les indicateurs d'envoi déjà présents (anti-doublon).
    const missionResp = await fetch(
      `${SUPABASE_URL}/rest/v1/missions?select=data&id=eq.${encodeURIComponent(missionId)}&user_id=eq.${encodeURIComponent(_userId)}`,
      { headers: supaHeaders }
    );
    if (!missionResp.ok) {
      return new Response(JSON.stringify({ error: 'Mission introuvable' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    const missionRows = await missionResp.json();
    const missionData = (missionRows && missionRows[0] && missionRows[0].data) || null;
    if (!missionData) {
      return new Response(JSON.stringify({ error: 'Mission introuvable' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const dejaStatut = !!missionData.notifStatutEnvoye;
    const dejaRapport = !!missionData.notifRapportEnvoye;

    // Un rapport est-il déjà disponible pour ce client ? Même heuristique
    // que l'extranet (client-orders.js) : au moins un document sur une de
    // ses fiches contact, tous abonnés confondus pour cette adresse email.
    let aUnDocument = false;
    try {
      const docsResp = await fetch(
        `${SUPABASE_URL}/rest/v1/contacts?select=data&data->>email=ilike.${encodeURIComponent(emailClient)}`,
        { headers: supaHeaders }
      );
      if (docsResp.ok) {
        const contactRows = await docsResp.json();
        aUnDocument = (contactRows || []).some(c => Array.isArray(c.data?.documents) && c.data.documents.some(d => d && d.url));
      }
    } catch (e) { /* best effort */ }

    let envoiType = null;
    let nouveauxFlags = null;
    if (!dejaStatut) {
      envoiType = aUnDocument ? 'rapport_dispo' : 'realise';
      nouveauxFlags = { notifStatutEnvoye: true, notifRapportEnvoye: aUnDocument };
    } else if (!dejaRapport && aUnDocument) {
      envoiType = 'rapport_dispo';
      nouveauxFlags = { notifRapportEnvoye: true };
    }

    if (!envoiType) {
      return new Response(JSON.stringify({ success: true, sent: 'none' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const IDENT = await identiteAbonne(_userId, SUPABASE_SERVICE_KEY);
    const dateObj = date ? new Date(date) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const lienExtranet = 'https://app.lokentia.fr/extranet';

    const estRapport = envoiType === 'rapport_dispo';
    const sujet = estRapport ? '📄 Votre rapport d\'état des lieux est disponible' : '✅ Votre état des lieux a été réalisé';
    const intro = estRapport
      ? `L'état des lieux ${esc(type || '')} du ${esc(dateStr)}${adresse ? ' — ' + esc(adresse) : ''} est terminé et le rapport est désormais disponible dans votre espace client.`
      : `L'état des lieux ${esc(type || '')} du ${esc(dateStr)}${adresse ? ' — ' + esc(adresse) : ''} a bien été réalisé. Le rapport vous sera transmis très prochainement dans votre espace client.`;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700">${esc(IDENT.nom)}</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <h2 style="font-size:19px;margin:0 0 16px 0">${estRapport ? '📄 Rapport disponible' : '✅ État des lieux réalisé'}</h2>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">${intro}</p>
    <div style="text-align:center;margin:0 0 20px 0">
      <a href="${lienExtranet}" style="display:inline-block;background:#1A5FA8;color:#fff;font-size:13px;font-weight:700;padding:12px 26px;border-radius:8px;text-decoration:none">Se connecter à mon espace client →</a>
    </div>
    <p style="font-size:12px;color:#999;text-align:center;margin:0 0 20px 0">Connexion par lien magique avec votre adresse email — aucun mot de passe à retenir.</p>
    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
      ${IDENT.tel ? `📞 <a href="tel:${esc(IDENT.tel.replace(/[^0-9+]/g,''))}" style="color:#1A5FA8">${esc(IDENT.tel)}</a> · ` : ''}
      ✉️ <a href="mailto:${esc(IDENT.replyTo || IDENT.email)}" style="color:#1A5FA8">${esc(IDENT.replyTo || IDENT.email)}</a>
    </div>
  </div>
</div>
</body></html>`;

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: IDENT.nom, email: IDENT.email },
        to: [{ email: emailClient, name: agence || '' }],
        ...(IDENT.replyTo ? { replyTo: { email: IDENT.replyTo, name: IDENT.nom } } : {}),
        subject: sujet,
        htmlContent: html
      })
    });

    // Fusionner les indicateurs anti-doublon dans la mission (lecture-fusion-
    // écriture, comme saveSettingsToSupabase, pour ne pas écraser un champ
    // modifié entre-temps par ailleurs).
    await fetch(`${SUPABASE_URL}/rest/v1/missions?id=eq.${encodeURIComponent(missionId)}&user_id=eq.${encodeURIComponent(_userId)}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...missionData, ...nouveauxFlags }, updated_at: new Date().toISOString() })
    });

    return new Response(JSON.stringify({ success: true, sent: envoiType }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
}
