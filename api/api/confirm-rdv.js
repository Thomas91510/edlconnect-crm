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

    // Formater la date
    const dateObj = mission.date ? new Date(mission.date) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) : '—';
    const heureStr = dateObj ? dateObj.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit'
    }) : '—';
    const bien = [mission.bienType, mission.bienTypo, mission.bienMeuble].filter(Boolean).join(' · ') || 'Non précisé';

    // ── Email AGENT ────────────────────────────────────────
    const agentHtml = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#185FA5;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
          <div style="background:#E6F1FB;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:16px;font-weight:700;color:#185FA5">ED</span>
          </div>
          <div style="color:#fff;font-size:18px;font-weight:700">EDLConnect</div>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
          <h2 style="font-size:20px;margin-bottom:6px">✅ Confirmation de votre état des lieux</h2>
          <p style="color:#6b6b6b;margin-bottom:20px">
            Bonjour,<br><br>
            Nous vous confirmons la réalisation de votre état des lieux aux conditions suivantes :
          </p>

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

          ${message ? `
          <div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7">
            <strong>💬 Message de Thomas :</strong><br>${message}
          </div>` : ''}

          <div style="background:#EAF3DE;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#27500A;line-height:1.7">
            ✅ <strong>Notre expert sera présent à l'heure indiquée.</strong><br>
            Le rapport vous sera transmis dans les <strong>24h</strong> suivant l'intervention avec signature électronique.
          </div>

          <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
            Une question ? <strong>Thomas Langlade</strong><br>
            📞 <a href="tel:0189291429" style="color:#185FA5">01 89 29 14 29</a> · 
            ✉️ <a href="mailto:contact@edlconnect.fr" style="color:#185FA5">contact@edlconnect.fr</a>
          </div>
        </div>
      </div>`;

    // ── Email LOCATAIRE ────────────────────────────────────
    const locataireHtml = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
        <div style="background:#185FA5;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
          <div style="background:#E6F1FB;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span style="font-size:16px;font-weight:700;color:#185FA5">ED</span>
          </div>
          <div style="color:#fff;font-size:18px;font-weight:700">EDLConnect</div>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
          <h2 style="font-size:20px;margin-bottom:6px">📅 Convocation — État des lieux</h2>
          <p style="color:#6b6b6b;margin-bottom:20px">
            Bonjour${locataireNom ? ' <strong>' + locataireNom + '</strong>' : ''},<br><br>
            Nous vous convoquons pour la réalisation de votre état des lieux. Merci de vous présenter à l'heure indiquée.
          </p>

          <div style="background:#E6F1FB;border-radius:8px;padding:16px;margin-bottom:20px">
            <div style="font-size:12px;font-weight:700;color:#185FA5;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">📋 Votre convocation</div>
            <table style="width:100%;font-size:13px;border-collapse:collapse">
              <tr><td style="color:#6b6b6b;padding:4px 0;width:35%">Type</td><td style="font-weight:600">${mission.type}</td></tr>
              <tr><td style="color:#6b6b6b;padding:4px 0">Adresse</td><td style="font-weight:600">${mission.adresse}</td></tr>
              <tr><td style="color:#6b6b6b;padding:4px 0">Date</td><td style="font-weight:700;color:#185FA5;font-size:15px">${dateStr}</td></tr>
              <tr><td style="color:#6b6b6b;padding:4px 0">Heure</td><td style="font-weight:700;color:#185FA5;font-size:15px">${heureStr}</td></tr>
              ${mission.acces ? `<tr><td style="color:#6b6b6b;padding:4px 0">Accès</td><td>${mission.acces}</td></tr>` : ''}
            </table>
          </div>

          ${message ? `
          <div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7">
            <strong>💬 Information complémentaire :</strong><br>${message}
          </div>` : ''}

          <div style="background:#FAEEDA;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.8">
            <strong>📌 Merci de prévoir :</strong><br>
            ✓ Une pièce d'identité<br>
            ✓ Les relevés de compteurs (eau, gaz, électricité)<br>
            ✓ L'ensemble des clés du logement<br>
            ✓ Votre contrat de bail
          </div>

          <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
            <strong>EDLConnect</strong> — Mandaté par <strong>${mission.agence}</strong><br>
            📞 <a href="tel:0189291429" style="color:#185FA5">01 89 29 14 29</a> · 
            ✉️ <a href="mailto:contact@edlconnect.fr" style="color:#185FA5">contact@edlconnect.fr</a>
          </div>
        </div>
      </div>`;

    // Envoyer les emails
    const emails = [];

    // Email agent
    emails.push(fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: 'Thomas — EDLConnect', email: 'contact@edlconnect.fr' },
        to: [{ email: agentEmail }],
        subject: `✅ Confirmation EDL — ${mission.type} · ${dateStr} · ${mission.adresse}`,
        htmlContent: agentHtml
      })
    }));

    // Email locataire (si email fourni)
    if(locataireEmail) {
      emails.push(fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          sender: { name: 'Thomas — EDLConnect', email: 'contact@edlconnect.fr' },
          to: [{ email: locataireEmail }],
          subject: `📅 Convocation état des lieux — ${dateStr} à ${heureStr} — ${mission.adresse}`,
          htmlContent: locataireHtml
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

