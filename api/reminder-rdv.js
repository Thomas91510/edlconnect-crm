export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Vérification du secret cron
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if(cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;

  if(!SUPABASE_SERVICE_KEY || !BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  try {
    // Calculer la date de demain
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    // Récupérer toutes les missions de demain depuis Supabase
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/missions?select=id,data,user_id&limit=1000`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    if(!resp.ok) throw new Error('Erreur Supabase missions');
    const rows = await resp.json();

    // Filtrer missions de demain avec un email locataire
    const missionsDemain = rows.filter(r => {
      if(!r.data) return false;
      const m = r.data;
      if(!m.date) return false;
      if(!m.locataireEmail) return false;
      if(m.statut === 'facturée') return false;
      const mDate = m.date.split('T')[0];
      return mDate === tomorrowStr;
    });

    if(missionsDemain.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Aucune mission demain avec locataire',
        date: tomorrowStr 
      }), { status: 200 });
    }

    let sent = 0;
    const errors = [];

    for(const row of missionsDemain) {
      const m = row.data;
      try {
        const dateObj = new Date(m.date);
        const dateStr = dateObj.toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        const heureStr = dateObj.toLocaleTimeString('fr-FR', {
          hour: '2-digit', minute: '2-digit'
        });
        const bien = [m.bienType, m.bienTypo, m.bienMeuble].filter(Boolean).join(' · ') || '';
        const typeEdl = (m.type || '').toLowerCase();
        const isEntrant = typeEdl.includes('entrant');
        const isSortant = typeEdl.includes('sortant');

        // Civilité et nom
        const civilite = m.locataireCivilite || '';
        const locNom = m.locataireNom || '';
        const salutation = civilite && locNom ? `${civilite} ${locNom}` : locNom || '';

        // Contenu selon type
        let blocRappel = '';
        if(isEntrant && !isSortant) {
          blocRappel = `
            <div style="background:#EAF3DE;border-radius:8px;padding:16px;margin-bottom:16px;font-size:13px;color:#27500A;line-height:1.9">
              <strong>🔑 Rappel — Ce que vous devez apporter :</strong><br>
              ✓ Votre pièce d'identité<br>
              ✓ Votre attestation d'assurance habitation <strong>(obligatoire)</strong><br>
              ✓ Votre contrat de bail signé
            </div>`;
        } else if(isSortant) {
          blocRappel = `
            <div style="background:#FAEEDA;border-radius:8px;padding:16px;margin-bottom:16px;font-size:13px;color:#633806;line-height:1.9">
              <strong>🚪 Rappel — Checklist avant l'état des lieux :</strong><br>
              ✓ Logement entièrement vide et nettoyé<br>
              ✓ Toutes les clés, badges et télécommandes prêts<br>
              ✓ Relevés de compteurs effectués<br>
              ✓ RIB pour la restitution du dépôt de garantie
            </div>`;
        } else {
          blocRappel = `
            <div style="background:#E6F1FB;border-radius:8px;padding:16px;margin-bottom:16px;font-size:13px;color:#0C447C;line-height:1.9">
              <strong>📋 Rappel :</strong><br>
              ✓ Votre pièce d'identité<br>
              ✓ Toutes les questions sur l'état du logement
            </div>`;
        }

        const htmlContent = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#185FA5;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
    <div style="background:#E6F1FB;width:44px;height:44px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
        <tr>
          <td style="padding:0;line-height:1"><span style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#185FA5;letter-spacing:-1px">E</span></td>
          <td style="padding:0;line-height:1"><span style="font-family:Arial,sans-serif;font-size:16px;font-weight:700;color:#185FA5">D</span></td>
          <td style="padding:0 0 3px 1px;vertical-align:bottom;line-height:1"><span style="display:inline-block;width:6px;height:11px;border:2px solid #185FA5;border-left:none;border-radius:0 4px 4px 0"></span></td>
        </tr>
      </table>
    </div>
    <span style="color:#fff;font-size:18px;font-weight:700">EDLConnect</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <div style="background:#FAEEDA;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;font-weight:700;color:#633806;text-align:center">
      ⏰ Rappel — Votre état des lieux est <strong>demain</strong>
    </div>

    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">Bonjour${salutation ? ' <strong>' + salutation + '</strong>' : ''},</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Nous vous rappelons votre état des lieux <strong>${m.type}</strong> prévu <strong>demain</strong>.
    </p>

    <div style="background:#185FA5;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-bottom:4px">📅 Votre rendez-vous</div>
      <div style="color:#fff;font-size:18px;font-weight:700">${dateStr}</div>
      <div style="color:#E6F1FB;font-size:16px;font-weight:600">🕐 ${heureStr}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:6px">📍 ${m.adresse}</div>
      ${bien ? `<div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:4px">🏠 ${bien}</div>` : ''}
    </div>

    ${blocRappel}

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Nous comptons sur votre ponctualité. 🙏
    </p>

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Une question de dernière minute ?<br>
      📞 <a href="tel:0767630963" style="color:#185FA5;text-decoration:none">07 67 63 09 63</a><br>
      ✉️ Par retour de mail<br><br>
      Cordialement,<br>
      <strong>Thomas LANGLADE — EDLConnect</strong>
    </div>
  </div>
</div>
</body></html>`;

        // Envoyer le rappel
        const emailResp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
          body: JSON.stringify({
            sender: { name: 'Thomas — EDLConnect', email: 'contact@edlconnect.fr' },
            to: [{ email: m.locataireEmail, name: salutation || locNom }],
            replyTo: { email: 'contact@edlconnect.fr', name: 'Thomas Langlade' },
            subject: `⏰ Rappel — Votre état des lieux demain à ${heureStr} — ${m.adresse}`,
            htmlContent
          })
        });

        if(emailResp.ok) {
          sent++;
          // Marquer la mission comme "rappel envoyé"
          await fetch(`${SUPABASE_URL}/rest/v1/missions?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              data: { ...m, rappelEnvoye: true, rappelDate: new Date().toISOString() },
              updated_at: new Date().toISOString()
            })
          });
        }
      } catch(e) {
        errors.push({ mission: row.id, error: e.message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      date: tomorrowStr,
      missionsFound: missionsDemain.length,
      remindersSent: sent,
      errors
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
