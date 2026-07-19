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
            <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:16px;font-size:13px;color:#0C447C;line-height:1.9">
              <strong>📋 Rappel :</strong><br>
              ✓ Votre pièce d'identité<br>
              ✓ Toutes les questions sur l'état du logement
            </div>`;
        }

        const htmlContent = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
    <span style="color:#fff;font-size:17px;font-weight:700">EDL IDF Expert en État des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <div style="background:#FAEEDA;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;font-weight:700;color:#633806;text-align:center">
      ⏰ Rappel — Votre état des lieux est <strong>demain</strong>
    </div>

    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">Bonjour${salutation ? ' <strong>' + salutation + '</strong>' : ''},</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Nous vous rappelons votre état des lieux <strong>${m.type}</strong> prévu <strong>demain</strong>.
    </p>

    <div style="background:#1A5FA8;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-bottom:4px">📅 Votre rendez-vous</div>
      <div style="color:#fff;font-size:18px;font-weight:700">${dateStr}</div>
      <div style="color:#F4F7FA;font-size:16px;font-weight:600">🕐 ${heureStr}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:6px">📍 ${m.adresse}</div>
      ${bien ? `<div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:4px">🏠 ${bien}</div>` : ''}
    </div>

    ${blocRappel}

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Nous comptons sur votre ponctualité. 🙏
    </p>

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Une question de dernière minute ?<br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8;text-decoration:none">07 67 63 09 63</a><br>
      ✉️ Par retour de mail<br><br>
      Cordialement,<br>
      <strong>Thomas LANGLADE — EDL IDF Expert en État des Lieux</strong>
    </div>
  </div>
</div>
</body></html>`;

        // Envoyer le rappel
        const emailResp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
          body: JSON.stringify({
            sender: { name: 'Thomas — EDL IDF Expert en État des Lieux', email: 'contact@edl-idf.com' },
            to: [{ email: m.locataireEmail, name: salutation || locNom }],
            replyTo: { email: 'contact@edl-idf.com', name: 'Thomas Langlade' },
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

    // ============ J+1 : DEMANDE D'AVIS GOOGLE ============
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const missionsHier = rows.filter(r => {
      if(!r.data) return false;
      const m = r.data;
      if(!m.date || !m.locataireEmail) return false;
      if(m.avisEnvoye) return false;
      if((m.statut || '').toLowerCase().includes('annul')) return false;
      return m.date.split('T')[0] === yesterdayStr;
    });

    let avisSent = 0;

    for(const row of missionsHier) {
      const m = row.data;
      try {
        const civilite = m.locataireCivilite || '';
        const locNom = m.locataireNom || '';
        const salutation = civilite && locNom ? `${civilite} ${locNom}` : locNom || '';

        const avisHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:17px;font-weight:700">EDL IDF Expert en État des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">Bonjour${salutation ? ' <strong>' + salutation + '</strong>' : ''},</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Chez <strong>EDL IDF</strong>, nous accordons une grande importance à la qualité de nos prestations et à la satisfaction des personnes que nous accompagnons. Votre retour est précieux&nbsp;: il nous permet d'améliorer continuellement nos services.
    </p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Si vous avez quelques instants, pourriez-vous partager votre expérience sur notre page Google&nbsp;? Cela ne prend que quelques minutes et nous aide énormément&nbsp;:
    </p>
    <div style="text-align:center;margin:0 0 24px 0">
      <a href="https://g.page/r/CQOIf5lzL3xwEBM/review" style="display:inline-block;background:#1A5FA8;color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none">⭐ Laisser un avis Google</a>
    </div>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      N'hésitez pas si vous avez la moindre question, nous restons à votre entière disposition.
    </p>
    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Bien cordialement,<br>
      <strong>L'équipe EDL IDF</strong><br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8;text-decoration:none">07 67 63 09 63</a>
    </div>
  </div>
</div>
</body></html>`;

        const avisResp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
          body: JSON.stringify({
            sender: { name: 'EDL IDF Expert en État des Lieux', email: 'contact@edl-idf.com' },
            to: [{ email: m.locataireEmail, name: salutation || locNom }],
            replyTo: { email: 'contact@edl-idf.com', name: 'Thomas Langlade' },
            subject: '⭐ Comment s\'est passé votre état des lieux ?',
            htmlContent: avisHtml
          })
        });

        if(avisResp.ok) {
          avisSent++;
          await fetch(`${SUPABASE_URL}/rest/v1/missions?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: { ...m, avisEnvoye: true, avisDate: new Date().toISOString() },
              updated_at: new Date().toISOString()
            })
          });
        }
      } catch(e) {
        errors.push({ mission: row.id, avis: true, error: e.message });
      }
    }

    // ============ J+3 : 2e RELANCE AVIS GOOGLE ============
    // Cible : missions realisees il y a 3 jours, dont la 1re demande (J+1) a bien ete envoyee,
    // qui n'ont pas encore recu la 2e relance, et non annulees.
    const day3 = new Date();
    day3.setDate(day3.getDate() - 3);
    const day3Str = day3.toISOString().split('T')[0];

    const missionsJ3 = rows.filter(r => {
      if(!r.data) return false;
      const m = r.data;
      if(!m.date || !m.locataireEmail) return false;
      if(!m.avisEnvoye) return false;      // la 1re demande doit avoir ete envoyee
      if(m.avis2Envoye) return false;      // pas deja relance une 2e fois
      if((m.statut || '').toLowerCase().includes('annul')) return false;
      return m.date.split('T')[0] === day3Str;
    });

    let avis2Sent = 0;

    for(const row of missionsJ3) {
      const m = row.data;
      try {
        const civilite = m.locataireCivilite || '';
        const locNom = m.locataireNom || '';
        const salutation = civilite && locNom ? `${civilite} ${locNom}` : locNom || '';

        const avis2Html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:17px;font-weight:700">EDL IDF Expert en État des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">Bonjour${salutation ? ' <strong>' + salutation + '</strong>' : ''},</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Nous nous permettons de revenir vers vous au sujet de l'état des lieux réalisé récemment. Si vous n'avez pas encore eu l'occasion de nous laisser un avis, votre retour nous serait très précieux&nbsp;: il ne prend qu'une minute et nous aide beaucoup à faire connaître notre travail.
    </p>
    <div style="text-align:center;margin:0 0 24px 0">
      <a href="https://g.page/r/CQOIf5lzL3xwEBM/review" style="display:inline-block;background:#1A5FA8;color:#fff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none">⭐ Laisser un avis Google</a>
    </div>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Si vous l'avez déjà fait, nous vous en remercions sincèrement et vous prions d'ignorer ce message.
    </p>
    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Bien cordialement,<br>
      <strong>L'équipe EDL IDF</strong><br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8;text-decoration:none">07 67 63 09 63</a>
    </div>
  </div>
</div>
</body></html>`;

        const avis2Resp = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
          body: JSON.stringify({
            sender: { name: 'EDL IDF Expert en État des Lieux', email: 'contact@edl-idf.com' },
            to: [{ email: m.locataireEmail, name: salutation || locNom }],
            replyTo: { email: 'contact@edl-idf.com', name: 'Thomas Langlade' },
            subject: '⭐ Votre avis compte pour nous',
            htmlContent: avis2Html
          })
        });

        if(avis2Resp.ok) {
          avis2Sent++;
          await fetch(`${SUPABASE_URL}/rest/v1/missions?id=eq.${row.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: { ...m, avis2Envoye: true, avis2Date: new Date().toISOString() },
              updated_at: new Date().toISOString()
            })
          });
        }
      } catch(e) {
        errors.push({ mission: row.id, avis2: true, error: e.message });
      }
    }

    // ============ SYNCHRO EDOUARD : rapatrier les rapports PDF ============
    let edouardJournal = null;
    try {
      const edouardResp = await fetch('https://app.lokentia.fr/api/edouard-cron', {
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
      });
      if(edouardResp.ok) {
        const ej = await edouardResp.json();
        edouardJournal = ej.journal || null;
      } else {
        edouardJournal = { erreur: 'HTTP ' + edouardResp.status };
      }
    } catch(e) {
      edouardJournal = { erreur: String(e && e.message || e) };
    }

    return new Response(JSON.stringify({
      success: true,
      edouard: edouardJournal,
      date: tomorrowStr,
      missionsFound: missionsDemain.length,
      remindersSent: sent,
      avisFound: missionsHier.length,
      avisSent,
      avis2Found: missionsJ3.length,
      avis2Sent,
      errors
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
