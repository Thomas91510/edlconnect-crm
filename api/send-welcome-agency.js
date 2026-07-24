export const config = { runtime: 'edge' };

// Identite d'envoi propre a chaque abonne (repli neutre Lokentia)
const DOMAINES_VERIFIES = ['edl-idf.com', 'lokentia.fr'];
const SUPA_URL_IDENT = 'https://pvuctwflxvvxdawsxceu.supabase.co';

async function identiteAbonne(userId) {
  const neutre = { nom: 'Lokentia', email: 'contact@lokentia.fr', replyTo: '', tel: '', signature: '', notifEmail: 'contact@edl-idf.com' };
  if (!userId) return neutre;
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return neutre;
    const r = await fetch(SUPA_URL_IDENT + '/rest/v1/settings?select=data&user_id=eq.' + encodeURIComponent(userId), {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    if (!r.ok) return neutre;
    const rows = await r.json();
    const d = (rows && rows[0] && rows[0].data) || {};
    const nom = (d.expediteurNom || d.companyName || '').trim() || neutre.nom;
    const mail = (d.expediteurEmail || d.userEmail || '').trim();
    const domaine = mail.includes('@') ? mail.split('@')[1].toLowerCase() : '';
    const peutExpedier = domaine && DOMAINES_VERIFIES.includes(domaine);
    return {
      nom: nom,
      email: peutExpedier ? mail : neutre.email,
      replyTo: (!peutExpedier && mail) ? mail : '',
      tel: (d.expediteurTel || '').trim(),
      signature: (d.expediteurSignature || '').trim(),
      notifEmail: mail || neutre.notifEmail
    };
  } catch (e) { return neutre; }
}


export default async function handler(req) {
  if(req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if(req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const _authHeader = req.headers.get('authorization') || '';
  const _token = _authHeader.replace('Bearer ', '').trim();
  if(!_token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  const _userResp = await fetch('https://pvuctwflxvvxdawsxceu.supabase.co/auth/v1/user', {
    headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic', 'Authorization': `Bearer ${_token}` }
  });
  if(!_userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  const _user = await _userResp.json();
  const IDENT = await identiteAbonne(_user && _user.id);

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if(!BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Clé Brevo manquante' }), { status: 500 });
  }

  try {
    const { email, companyName, contactName } = await req.json();
    if(!email) return new Response(JSON.stringify({ error: 'Email requis' }), { status: 400 });

    // Générer le lien booking personnalisé
    const agencySlug = (companyName || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const bookingLink = `https://app.lokentia.fr/booking?agency=${agencySlug}&name=${encodeURIComponent(companyName || '')}`;

    const htmlContent = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:20px 0">

  <!-- Header -->
  <div style="background:#1A5FA8;padding:24px;border-radius:12px 12px 0 0;text-align:center">
    <div style="color:#fff;font-size:21px;font-weight:700">EDL IDF Expert en État des Lieux</div>
    <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:4px">Votre partenaire état des lieux en Île-de-France</div>
  </div>

  <!-- Corps -->
  <div style="background:#fff;padding:32px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">

    <p style="font-size:15px;color:#1a1a1a;margin:0 0 16px 0">
      Bonjour${contactName ? ' <strong>' + contactName + '</strong>' : ''},
    </p>

    <p style="font-size:13px;color:#444;line-height:1.8;margin:0 0 20px 0">
      Nous sommes ravis de vous accueillir parmi nos partenaires et vous remercions de votre confiance.<br><br>
      À partir d'aujourd'hui, <strong>EDL IDF Expert en État des Lieux</strong> prend en charge la réalisation de vos états des lieux entrants, sortants et pré-états des lieux en Île-de-France.
    </p>

    <!-- Ce que nous proposons -->
    <div style="background:#F4F7FA;border-radius:8px;padding:18px;margin-bottom:24px">
      <div style="font-size:13px;font-weight:700;color:#1A5FA8;margin-bottom:12px">🏠 Ce que nous vous proposons :</div>
      <div style="font-size:13px;color:#0C447C;line-height:2">
        ✅ Intervention 7j/7 de 9h à 20h<br>
        ✅ Rapport numérique remis sous 24h<br>
        ✅ Signature électronique incluse<br>
        ✅ Couverture complète de l'Île-de-France
      </div>
    </div>

    <!-- Comment faire une demande -->
    <div style="margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:10px">📋 Comment faire une demande d'état des lieux ?</div>
      <p style="font-size:13px;color:#444;line-height:1.8;margin:0 0 16px 0">
        C'est simple ! Utilisez votre lien de réservation exclusif ci-dessous. En quelques clics, renseignez le bien, la date souhaitée et les coordonnées du locataire — nous nous occupons du reste.
      </p>
      <div style="background:#EAF3DE;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:12px;font-weight:600;color:#3B6D11;margin-bottom:10px">👉 Votre lien de réservation exclusif</div>
        <a href="${bookingLink}" 
           style="display:inline-block;background:#3B6D11;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:12px">
          Faire une demande d'état des lieux →
        </a>
        <div style="font-size:10px;color:#27500A;word-break:break-all;background:#fff;border-radius:6px;padding:8px 10px;margin-top:4px">
          ${bookingLink}
        </div>
      </div>
    </div>

    <!-- Extranet client -->
    <div style="margin-bottom:24px">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:10px">🔑 Votre espace client personnel</div>
      <p style="font-size:13px;color:#444;line-height:1.8;margin:0 0 14px 0">
        En tant que partenaire, vous bénéficiez d'un <strong>espace client privé</strong> pour suivre toutes vos commandes en temps réel, consulter vos statistiques et retrouver vos documents.
      </p>
      <div style="background:#F4F7FA;border-radius:8px;padding:14px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:#1A5FA8;margin-bottom:8px">📊 Ce que vous retrouvez dans votre espace :</div>
        <div style="font-size:13px;color:#0C447C;line-height:2">
          ✅ Historique de toutes vos commandes et leur statut<br>
          ✅ Passer une nouvelle commande directement<br>
          ✅ Vos statistiques mensuelles<br>
          ✅ Vos documents partagés (contrat, tarifs...)
        </div>
      </div>
      <div style="background:#f8f8f6;border-radius:8px;padding:16px;text-align:center">
        <div style="font-size:12px;font-weight:600;color:#1A5FA8;margin-bottom:4px">🔗 Accéder à mon espace client</div>
        <div style="font-size:12px;color:#444;margin-bottom:12px">Saisissez simplement votre adresse email sur la page — vous recevrez un lien de connexion instantané, aucun mot de passe à retenir.</div>
        <a href="https://app.lokentia.fr/extranet"
           style="display:inline-block;background:#1A5FA8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:8px">
          Accéder à mon espace →
        </a>
        <div style="font-size:10px;color:#6b6b6b;margin-top:4px">app.lokentia.fr/extranet</div>
      </div>
    </div>

    <!-- Contact dédié -->
    <div style="background:#f8f8f6;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:8px">📞 Votre contact dédié :</div>
      <div style="font-size:13px;color:#444;line-height:1.9">
        <strong>${IDENT.signature || IDENT.nom}</strong><br>
        Directeur Général — EDL IDF Expert en État des Lieux<br>
        ${IDENT.tel ? `📞 <a href="tel:${IDENT.tel.replace(/[^0-9+]/g,'')}" style="color:#1A5FA8;text-decoration:none">${IDENT.tel}</a>` : ''}<br>
        ✉️ <a href="mailto:${IDENT.replyTo || IDENT.email}" style="color:#1A5FA8;text-decoration:none">${IDENT.replyTo || IDENT.email}</a>
      </div>
    </div>

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Dans l'attente de nos premières interventions ensemble,<br>
      Cordialement,
    </p>

    <!-- Signature -->
    <div style="border-top:2px solid #1A5FA8;padding-top:16px;font-size:13px;color:#1A5FA8">
      <strong>${IDENT.signature || IDENT.nom}</strong><br>
      <span style="color:#6b6b6b">Directeur Général — EDL IDF Expert en État des Lieux</span><br>
      <span style="color:#6b6b6b">${IDENT.tel ? `📞 ${IDENT.tel} · ` : ``}✉️ ${IDENT.replyTo || IDENT.email}</span>
    </div>

  </div>

  <!-- Footer -->
  <div style="text-align:center;font-size:11px;color:#999;padding:16px">
    EDL IDF Expert en État des Lieux · 18 Grande Rue, 91510 Lardy
  </div>

</div>
</body></html>`;

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: IDENT.nom, email: IDENT.email },
        ...(IDENT.replyTo ? { replyTo: { email: IDENT.replyTo, name: IDENT.nom } } : {}),
        to: [{ email, name: companyName || email }],
        subject: `🤝 Bienvenue chez EDL IDF Expert en État des Lieux — Votre espace de réservation est prêt !`,
        htmlContent
      })
    });

    if(resp.ok) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } else {
      const err = await resp.json();
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
