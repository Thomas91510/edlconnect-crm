export const config = { runtime: 'edge' };

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

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if(!BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Clé Brevo manquante' }), { status: 500 });
  }

  try {
    const { mission, agentEmail, agentNom, locataireEmail, locataireNom, message } = await req.json();

    if(!agentEmail || !mission) {
      return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400 });
    }

    const dateObj = mission.date ? new Date(mission.date) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) : '—';
    const heureStr = dateObj ? dateObj.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit'
    }) : '—';
    const bien = [mission.bienType, mission.bienTypo, mission.bienMeuble].filter(Boolean).join(' · ') || 'Non précisé';
    const typeEdl = (mission.type || '').toLowerCase();

    // ── Déterminer le type d'EDL ───────────────────────────
    const isEntrant = typeEdl.includes('entrant');
    const isSortant = typeEdl.includes('sortant') && !typeEdl.includes('entrant');
    const isDoubleEdl = typeEdl.includes('sortant') && typeEdl.includes('entrant');
    const isPre = typeEdl.includes('pré') || typeEdl.includes('pre');

    // ── EMAIL AGENT ────────────────────────────────────────
    const agentHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#185FA5;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
    <div style="background:#E6F1FB;width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center">
      <span style="font-size:16px;font-weight:700;color:#185FA5">ED</span>
    </div>
    <span style="color:#fff;font-size:18px;font-weight:700;margin-left:10px">EDLConnect</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <h2 style="font-size:20px;margin:0 0 6px 0">✅ Confirmation de votre état des lieux</h2>
    <p style="color:#6b6b6b;margin-bottom:20px">Bonjour,<br><br>
    Nous vous confirmons la réalisation de votre état des lieux aux conditions suivantes :</p>
    <div style="background:#E6F1FB;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:#185FA5;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">📋 Détails de l'intervention</div>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        <tr><td style="color:#6b6b6b;padding:4px 0;width:35%">Type</td><td style="font-weight:600">${mission.type}</td></tr>
        <tr><td style="color:#6b6b6b;padding:4px 0">Adresse</td><td style="font-weight:600">${mission.adresse}</td></tr>
        <tr><td style="color:#6b6b6b;padding:4px 0">Bien</td><td>${bien}</td></tr>
        <tr><td style="color:#6b6b6b;padding:4px 0">Date</td><td style="font-weight:600;color:#185FA5">${dateStr}</td></tr>
        <tr><td style="color:#6b6b6b;padding:4px 0">Heure</td><td style="font-weight:600;color:#185FA5">${heureStr}</td></tr>
        ${locataireNom ? `<tr><td style="color:#6b6b6b;padding:4px 0">Locataire</td><td>${locataireNom}</td></tr>` : ''}
        ${mission.acces ? `<tr><td style="color:#6b6b6b;padding:4px 0">Accès</td><td>${mission.acces}</td></tr>` : ''}
      </table>
    </div>
    ${message ? `<div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7"><strong>💬 Message :</strong><br>${message}</div>` : ''}
    <div style="background:#EAF3DE;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#27500A;line-height:1.7">
      ✅ <strong>Notre expert sera présent à l'heure indiquée.</strong><br>
      Le rapport vous sera transmis dans les <strong>24h</strong> avec signature électronique.
    </div>
    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
      <strong>Thomas Langlade — EDLConnect</strong><br>
      📞 <a href="tel:0189291429" style="color:#185FA5">01 89 29 14 29</a> · 
      ✉️ <a href="mailto:contact@edlconnect.fr" style="color:#185FA5">contact@edlconnect.fr</a>
    </div>
  </div>
</div>
</body></html>`;

    // ── EMAIL LOCATAIRE — contenu selon type d'EDL ─────────

    // Bloc "à prévoir" selon le type
    let titreEmail, introLocataire, blocPrevoir, blocInfo;

    if(isEntrant) {
      titreEmail = `🔑 Bienvenue — État des lieux d'entrée`;
      introLocataire = `Bonjour${locataireNom ? ' <strong>' + locataireNom + '</strong>' : ''},<br><br>
      Nous vous convoquons pour la réalisation de votre <strong>état des lieux d'entrée</strong>. Cet état des lieux marque officiellement le début de votre location.`;
      blocPrevoir = `
        <div style="background:#EAF3DE;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#27500A;line-height:1.9">
          <strong>🔑 Ce que vous devez prévoir pour l'entrée :</strong><br>
          ✓ Une pièce d'identité valide<br>
          ✓ Votre contrat de bail signé<br>
          ✓ Un justificatif d'assurance habitation <strong>(obligatoire)</strong><br>
          ✓ Vos coordonnées bancaires pour le dépôt de garantie<br>
          ✓ Stylo pour signer le rapport
        </div>
        <div style="background:#E6F1FB;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#0C447C;line-height:1.7">
          💡 <strong>Conseil :</strong> Relevez tous les compteurs (eau, gaz, électricité) dès votre arrivée et photographiez chaque pièce. Ces preuves vous seront utiles lors de votre sortie.
        </div>`;
      blocInfo = `L'expert EDLConnect réalisera un tour complet du logement avec vous. Le rapport détaillé vous sera transmis par email dans les <strong>24h</strong> avec votre signature électronique.`;
    } else if(isSortant) {
      titreEmail = `🚪 État des lieux de sortie — Préparez votre départ`;
      introLocataire = `Bonjour${locataireNom ? ' <strong>' + locataireNom + '</strong>' : ''},<br><br>
      Nous vous convoquons pour la réalisation de votre <strong>état des lieux de sortie</strong>. Cet état des lieux déterminera la restitution de votre dépôt de garantie.`;
      blocPrevoir = `
        <div style="background:#FAEEDA;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.9">
          <strong>🚪 Ce que vous devez préparer pour votre sortie :</strong><br>
          ✓ <strong>Toutes les clés du logement</strong> (boîte aux lettres, cave, parking inclus)<br>
          ✓ Les relevés de compteurs (eau froide/chaude, gaz, électricité)<br>
          ✓ Le logement entièrement <strong>vidé et nettoyé</strong><br>
          ✓ Les équipements en état de fonctionnement<br>
          ✓ Votre adresse de réexpédition du courrier<br>
          ✓ Un RIB pour la restitution du dépôt de garantie
        </div>
        <div style="background:#FCEBEB;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#791F1F;line-height:1.7">
          ⚠️ <strong>Important :</strong> Tout défaut non signalé lors de l'état des lieux d'entrée et constaté à la sortie pourra être imputé sur votre dépôt de garantie. Anticipez les petites réparations (trous, peinture, joints...).
        </div>`;
      blocInfo = `L'expert EDLConnect comparera l'état actuel du logement avec celui de votre entrée. Le rapport comparatif vous sera transmis dans les <strong>24h</strong> avec mention des éventuelles différences constatées.`;
    } else if(isDoubleEdl) {
      titreEmail = `🔄 État des lieux sortant/entrant`;
      introLocataire = `Bonjour${locataireNom ? ' <strong>' + locataireNom + '</strong>' : ''},<br><br>
      Nous vous convoquons pour la réalisation de votre <strong>état des lieux</strong>.`;
      blocPrevoir = `
        <div style="background:#FAEEDA;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.9">
          <strong>📋 Ce que vous devez prévoir :</strong><br>
          ✓ Une pièce d'identité valide<br>
          ✓ Toutes les clés du logement<br>
          ✓ Les relevés de compteurs<br>
          ✓ Votre contrat de bail (si entrant)<br>
          ✓ Justificatif d'assurance habitation (si entrant)
        </div>`;
      blocInfo = `Le rapport vous sera transmis dans les <strong>24h</strong> avec signature électronique.`;
    } else {
      // Pré-état des lieux
      titreEmail = `🔍 Pré-état des lieux — Anticipez votre sortie`;
      introLocataire = `Bonjour${locataireNom ? ' <strong>' + locataireNom + '</strong>' : ''},<br><br>
      Nous vous convoquons pour la réalisation de votre <strong>pré-état des lieux</strong>. Cette visite préventive vous permet d'anticiper les travaux à réaliser avant votre départ officiel.`;
      blocPrevoir = `
        <div style="background:#E6F1FB;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#0C447C;line-height:1.9">
          <strong>🔍 Comment profiter au mieux du pré-état des lieux :</strong><br>
          ✓ Notez toutes vos questions sur l'état du logement<br>
          ✓ Identifiez les éventuels dommages à réparer avant la sortie<br>
          ✓ Comparez avec votre état des lieux d'entrée si possible<br>
          ✓ Demandez conseil à l'expert sur les réparations prioritaires
        </div>
        <div style="background:#EAF3DE;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#27500A;line-height:1.7">
          💡 <strong>Bon à savoir :</strong> Le pré-état des lieux n'a pas de valeur contractuelle. Il vous donne simplement le temps d'effectuer les réparations nécessaires avant l'état des lieux officiel de sortie.
        </div>`;
      blocInfo = `Un compte-rendu de visite vous sera transmis dans les <strong>24h</strong> avec les points de vigilance identifiés.`;
    }

    const locataireHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#185FA5;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
    <div style="background:#E6F1FB;width:40px;height:40px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center">
      <span style="font-size:16px;font-weight:700;color:#185FA5">ED</span>
    </div>
    <span style="color:#fff;font-size:18px;font-weight:700;margin-left:10px">EDLConnect</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <h2 style="font-size:20px;margin:0 0 6px 0">${titreEmail}</h2>
    <p style="color:#6b6b6b;margin-bottom:20px;line-height:1.7">${introLocataire}</p>

    <div style="background:#185FA5;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-bottom:4px">📅 Votre rendez-vous</div>
      <div style="color:#fff;font-size:18px;font-weight:700">${dateStr}</div>
      <div style="color:#E6F1FB;font-size:16px;font-weight:600">🕐 ${heureStr}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:6px">📍 ${mission.adresse}</div>
    </div>

    ${blocPrevoir}

    ${message ? `<div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7"><strong>💬 Message de votre expert :</strong><br>${message}</div>` : ''}

    <div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7">
      ℹ️ ${blocInfo}
    </div>

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
      <strong>EDLConnect</strong> — Mandaté par <strong>${mission.agence}</strong><br>
      📞 <a href="tel:0189291429" style="color:#185FA5;text-decoration:none">01 89 29 14 29</a> · 
      ✉️ <a href="mailto:contact@edlconnect.fr" style="color:#185FA5;text-decoration:none">contact@edlconnect.fr</a>
    </div>
  </div>
</div>
</body></html>`;

    // ── Envoi des emails ───────────────────────────────────
    const emails = [];

    // Email agent
    emails.push(fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: 'Thomas — EDLConnect', email: 'contact@edlconnect.fr' },
        to: [{ email: agentEmail }],
        replyTo: { email: 'contact@edlconnect.fr', name: 'Thomas Langlade — EDLConnect' },
        subject: `✅ Confirmation EDL — ${mission.type} · ${dateStr} · ${mission.adresse}`,
        htmlContent: agentHtml,
        headers: {
          'X-Mailer': 'EDLConnect',
          'List-Unsubscribe': '<mailto:contact@edlconnect.fr>'
        }
      })
    }));

    // Email locataire
    if(locataireEmail) {
      const sujetLocataire = isEntrant
        ? `🔑 Convocation état des lieux d'entrée — ${dateStr} à ${heureStr}`
        : isSortant
        ? `🚪 Convocation état des lieux de sortie — ${dateStr} à ${heureStr}`
        : isPre
        ? `🔍 Convocation pré-état des lieux — ${dateStr} à ${heureStr}`
        : `📋 Convocation état des lieux — ${dateStr} à ${heureStr}`;

      emails.push(fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          sender: { name: 'Thomas — EDLConnect', email: 'contact@edlconnect.fr' },
          to: [{ email: locataireEmail, name: locataireNom || '' }],
          replyTo: { email: 'contact@edlconnect.fr', name: 'Thomas Langlade — EDLConnect' },
          subject: sujetLocataire,
          htmlContent: locataireHtml,
          headers: {
            'X-Mailer': 'EDLConnect',
            'List-Unsubscribe': '<mailto:contact@edlconnect.fr>'
          }
        })
      }));
    }

    await Promise.all(emails);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
