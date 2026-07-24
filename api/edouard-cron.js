export const config = { runtime: 'edge' };

const EDOUARD_BASE = 'https://europe-west3-edouard-immo.cloudfunctions.net/api';
const BUCKET = 'rapports';
const MAX_PAR_RUN = 10; // limite de missions traitées par exécution

function unwrap(x) {
  // L'API Edouard peut renvoyer [...] ou { data: [...] }
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && x.data) return x.data;
  return x;
}

async function edouardGet(path, apiKey) {
  const resp = await fetch(EDOUARD_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  if (!resp.ok) return { ok: false, status: resp.status, data: null };
  let data = null;
  try { data = await resp.json(); } catch (e) { /* non-JSON */ }
  return { ok: true, status: resp.status, data: data };
}

const ADMIN_EMAILS = ['contact@edl-idf.com'];
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';

export default async function handler(req) {
  // Accès autorisé : (1) le cron Vercel, (2) un administrateur connecté
  const authHeader = req.headers.get('authorization') || '';
  let autorise = (authHeader === `Bearer ${process.env.CRON_SECRET}`);
  let declencheur = 'cron';

  if (!autorise) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token) {
      try {
        const uResp = await fetch('https://pvuctwflxvvxdawsxceu.supabase.co/auth/v1/user', {
          headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + token }
        });
        if (uResp.ok) {
          const u = await uResp.json();
          if (u && u.email && ADMIN_EMAILS.includes(u.email)) {
            autorise = true;
            declencheur = 'manuel';
          }
        }
      } catch (e) { /* jeton invalide */ }
    }
  }

  if (!autorise) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const EDOUARD_KEY = process.env.EDOUARD_API_KEY;
  const SUPA_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;

  if (!EDOUARD_KEY || !SUPA_KEY) {
    return new Response(JSON.stringify({ error: 'Variables manquantes (EDOUARD_API_KEY / SUPABASE_SERVICE_KEY)' }), { status: 500 });
  }

  const supaHeaders = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json'
  };

  const journal = { declencheur: declencheur, verifie: 0, rapportsRecuperes: 0, erreurs: [], details: [] };

  try {
    // ── 1. Missions liées à un logement Edouard, rapport pas encore récupéré ──
    const missResp = await fetch(
      SUPA_URL + '/rest/v1/missions?select=id,data,user_id&data->>edouardAccommodationId=not.is.null&order=updated_at.desc&limit=100',
      { headers: supaHeaders }
    );
    if (!missResp.ok) {
      return new Response(JSON.stringify({ error: 'Lecture missions impossible', status: missResp.status }), { status: 500 });
    }
    const rows = await missResp.json();
    const aTraiter = (rows || []).filter(r => {
      const d = r.data || {};
      return d.edouardAccommodationId && !d.edouardReportDone;
    }).slice(0, MAX_PAR_RUN);

    for (const row of aTraiter) {
      const m = row.data || {};
      journal.verifie++;
      try {
        // ── 2. Un état des lieux existe-t-il pour ce logement ? ──
        const sitResp = await edouardGet('/v1/situations?accommodationID=' + encodeURIComponent(m.edouardAccommodationId), EDOUARD_KEY);
        if (!sitResp.ok) {
          journal.erreurs.push('Mission ' + row.id + ' : situations HTTP ' + sitResp.status);
          continue;
        }
        const situations = unwrap(sitResp.data) || [];
        if (!Array.isArray(situations) || situations.length === 0) {
          journal.details.push('Mission ' + row.id + ' : aucun EDL pour l\u2019instant');
          continue;
        }
        // Prendre le plus récent
        const sit = situations[situations.length - 1];
        const sitId = sit.id || (sit.data && sit.data.id);
        if (!sitId) {
          journal.erreurs.push('Mission ' + row.id + ' : EDL sans id');
          continue;
        }

        // ── 3. Récupérer le rapport PDF ──
        const repResp = await edouardGet('/v1/situations/' + encodeURIComponent(sitId) + '/report', EDOUARD_KEY);
        if (!repResp.ok) {
          journal.details.push('Mission ' + row.id + ' : rapport pas encore disponible (HTTP ' + repResp.status + ')');
          continue;
        }
        const fileInfo = unwrap(repResp.data);
        const fileUrl = fileInfo && (fileInfo.url || (Array.isArray(fileInfo) && fileInfo[0] && fileInfo[0].url));
        if (!fileUrl) {
          journal.details.push('Mission ' + row.id + ' : rapport sans URL de t\u00e9l\u00e9chargement');
          continue;
        }

        const pdfResp = await fetch(fileUrl);
        if (!pdfResp.ok) {
          journal.erreurs.push('Mission ' + row.id + ' : t\u00e9l\u00e9chargement PDF HTTP ' + pdfResp.status);
          continue;
        }
        const pdfBytes = await pdfResp.arrayBuffer();

        // ── 4. Stocker dans Supabase Storage ──
        const path = (row.user_id || 'inconnu') + '/' + row.id + '.pdf';
        const upResp = await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
          method: 'POST',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': 'Bearer ' + SUPA_KEY,
            'Content-Type': 'application/pdf',
            'x-upsert': 'true'
          },
          body: pdfBytes
        });
        if (!upResp.ok) {
          const t = await upResp.text();
          journal.erreurs.push('Mission ' + row.id + ' : upload storage HTTP ' + upResp.status + ' ' + t.slice(0, 120));
          continue;
        }

        // ── 5. URL signée longue durée (1 an) ──
        let rapportUrl = '';
        const signResp = await fetch(SUPA_URL + '/storage/v1/object/sign/' + BUCKET + '/' + path, {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify({ expiresIn: 31536000 })
        });
        if (signResp.ok) {
          const signData = await signResp.json();
          if (signData && signData.signedURL) {
            rapportUrl = SUPA_URL + '/storage/v1' + signData.signedURL;
          }
        }

        // ── 6. Mettre à jour la mission ──
        const newData = Object.assign({}, m, {
          statut: 'r\u00e9alis\u00e9e',
          edouardSituationId: sitId,
          edouardReportDone: true,
          rapportUrl: rapportUrl,
          rapportRecupereAt: new Date().toISOString()
        });
        const patchResp = await fetch(SUPA_URL + '/rest/v1/missions?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: supaHeaders,
          body: JSON.stringify({ data: newData, updated_at: new Date().toISOString() })
        });
        if (!patchResp.ok) {
          journal.erreurs.push('Mission ' + row.id + ' : mise \u00e0 jour mission HTTP ' + patchResp.status);
          continue;
        }

        // ── 7. Rendre le document visible dans l'extranet de l'agence ──
        const nomDoc = 'Rapport EDL \u2014 ' + (m.adresse || row.id);
        if (rapportUrl && m.emailClient) {
          try {
            const ctResp = await fetch(
              SUPA_URL + '/rest/v1/contacts?select=id,data&user_id=eq.' + encodeURIComponent(row.user_id || '') + '&data->>email=ilike.' + encodeURIComponent(m.emailClient),
              { headers: supaHeaders }
            );
            if (ctResp.ok) {
              const contacts = await ctResp.json();
              if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const cdata = contact.data || {};
                const docs = Array.isArray(cdata.documents) ? cdata.documents : [];
                if (!docs.find(d => d && d.url === rapportUrl)) {
                  docs.push({ nom: nomDoc, url: rapportUrl });
                  cdata.documents = docs;
                  await fetch(SUPA_URL + '/rest/v1/contacts?id=eq.' + encodeURIComponent(contact.id), {
                    method: 'PATCH',
                    headers: supaHeaders,
                    body: JSON.stringify({ data: cdata, updated_at: new Date().toISOString() })
                  });
                }
              }
            }
          } catch (e) { journal.erreurs.push('Mission ' + row.id + ' : doc extranet — ' + String(e && e.message || e)); }
        }

        // ── 8. Notifier l'agence par email (best effort) ──
        if (BREVO_KEY && m.emailClient) {
          try {
            await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sender: { name: 'EDL IDF Expert en \u00c9tat des Lieux', email: 'contact@edl-idf.com' },
                to: [{ email: m.emailClient }],
                subject: '\u2705 Rapport d\u2019\u00e9tat des lieux disponible \u2014 ' + (m.adresse || ''),
                htmlContent: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1E2E">' +
                  '<h2 style="color:#1A5FA8">Votre rapport est disponible</h2>' +
                  '<p>Bonjour,</p>' +
                  '<p>L\u2019\u00e9tat des lieux <strong>' + (m.type || '') + '</strong> au <strong>' + (m.adresse || '') + '</strong> a \u00e9t\u00e9 r\u00e9alis\u00e9. Le rapport est d\u00e8s \u00e0 pr\u00e9sent disponible dans votre espace client\u00a0:</p>' +
                  '<p style="text-align:center;margin:24px 0"><a href="https://app.lokentia.fr/extranet-app" style="background:#1A5FA8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Acc\u00e9der \u00e0 mon espace</a></p>' +
                  '<p style="font-size:13px;color:#666">Thomas LANGLADE \u2014 Directeur G\u00e9n\u00e9ral<br>EDL IDF Expert en \u00c9tat des Lieux</p>' +
                  '</div>'
              })
            });
          } catch (e) { /* la notification email ne doit jamais bloquer */ }
        }

        journal.rapportsRecuperes++;
        journal.details.push('Mission ' + row.id + ' : rapport r\u00e9cup\u00e9r\u00e9 \u2713');

      } catch (e) {
        journal.erreurs.push('Mission ' + row.id + ' : ' + String(e && e.message || e));
      }
    }

    return new Response(JSON.stringify({ success: true, journal: journal }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Erreur serveur', details: String(e && e.message || e), journal: journal }), { status: 500 });
  }
}
