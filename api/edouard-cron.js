export const config = { runtime: 'edge' };

const EDOUARD_BASE = 'https://europe-west3-edouard-immo.cloudfunctions.net/api';
const BUCKET = 'rapports';
const MAX_PAR_RUN = 10; // limite de missions traitées par exécution

// Normalise une adresse pour une comparaison tolerante
function normAdr(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

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
  if (!resp.ok) {
    let corps = '';
    try { corps = (await resp.text()).slice(0, 200); } catch (e) { /* ignore */ }
    return { ok: false, status: resp.status, data: null, corps: corps };
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* non-JSON */ }
  return { ok: true, status: resp.status, data: data, corps: '' };
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
    const candidats = (rows || []).filter(r => (r.data || {}).edouardAccommodationId);

    // ── Liste des états des lieux : un seul appel, filtrage côté Lokentia ──
    // (le filtre serveur ?accommodationID=... renvoie une erreur 500 chez Edouard)
    let toutesSituations = [];
    let curseur = null;
    for (let page = 0; page < 6; page++) {
      const q = '/v1/situations?limit=100' + (curseur ? '&after=' + encodeURIComponent(curseur) : '');
      const sResp = await edouardGet(q, EDOUARD_KEY);
      if (!sResp.ok) {
        journal.erreurs.push('Liste des EDL : HTTP ' + sResp.status + ' ' + sResp.corps);
        break;
      }
      const lot = unwrap(sResp.data) || [];
      if (!Array.isArray(lot) || lot.length === 0) break;
      toutesSituations = toutesSituations.concat(lot);
      curseur = sResp.data && sResp.data.nextCursor;
      if (!curseur) break;
    }
    journal.edlDansEdouard = toutesSituations.length;

    // Logements Edouard : permet le rapprochement par adresse quand l'EDL a ete
    // cree sur un bien saisi dans l'app plutot que sur celui importe par Lokentia
    let tousLogements = [];
    let curseurLog = null;
    for (let page = 0; page < 6; page++) {
      const q = '/v1/accommodations?limit=100' + (curseurLog ? '&after=' + encodeURIComponent(curseurLog) : '');
      const aResp = await edouardGet(q, EDOUARD_KEY);
      if (!aResp.ok) {
        journal.erreurs.push('Liste des logements : HTTP ' + aResp.status + ' ' + aResp.corps);
        break;
      }
      const lot = unwrap(aResp.data) || [];
      if (!Array.isArray(lot) || lot.length === 0) break;
      tousLogements = tousLogements.concat(lot);
      curseurLog = aResp.data && aResp.data.nextCursor;
      if (!curseurLog) break;
    }
    journal.logementsDansEdouard = tousLogements.length;

    // ── Diagnostic : comprendre pourquoi un rapprochement échoue ──
    if (toutesSituations.length > 0) {
      journal.diagnostic = {
        champsDunEDL: Object.keys(toutesSituations[0]),
        exempleEDL: toutesSituations[0],
        logementsVusDansEdouard: Array.from(new Set(
          toutesSituations.map(function (s) { return s && (s.accommodationID || s.accommodationId); })
        )).filter(Boolean).slice(0, 40),
        logementsRecherches: candidats.map(function (r) { return (r.data || {}).edouardAccommodationId; })
      };
    }

    // Pour chaque mission : lister ses EDL Edouard non encore rapatries
    const travail = [];
    for (const row of candidats) {
      const md = row.data || {};
      const idsAcceptes = [md.edouardAccommodationId];
      const cible = normAdr(md.adresse);
      if (cible.length > 8) {
        tousLogements.forEach(function (lg) {
          if (!lg || !lg.id) return;
          const adrLg = normAdr([lg.street, lg.zipCode, lg.city].filter(Boolean).join(' '));
          if (!adrLg) return;
          if (adrLg === cible || adrLg.indexOf(cible) !== -1 || cible.indexOf(adrLg) !== -1) {
            if (idsAcceptes.indexOf(lg.id) === -1) idsAcceptes.push(lg.id);
          }
        });
      }
      const dejaFaits = Array.isArray(md.edouardSituationsTraitees) ? md.edouardSituationsTraitees : [];
      const aFaire = toutesSituations.filter(function (s) {
        const aid = s && (s.accommodationID || s.accommodationId);
        if (!aid || idsAcceptes.indexOf(aid) === -1) return false;
        return s.id && dejaFaits.indexOf(s.id) === -1;
      });
      aFaire.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
      if (aFaire.length > 0) travail.push({ row: row, situations: aFaire });
    }
    journal.missionsAvecEdlNouveaux = travail.length;

    for (const tache of travail.slice(0, MAX_PAR_RUN)) {
      const row = tache.row;
      const m = row.data || {};
      journal.verifie++;
      try {
        // Chaque etat des lieux du logement donne lieu a son propre rapport
        // (un sortant/entrant produit deux PDF distincts)
        const rapportsMission = Array.isArray(m.rapports) ? m.rapports.slice() : [];
        const dejaFaits = Array.isArray(m.edouardSituationsTraitees) ? m.edouardSituationsTraitees.slice() : [];
        let nouveauxPourCetteMission = 0;
        let dernierUrl = m.rapportUrl || '';

        for (const sit of tache.situations) {
          const sitId = sit.id;
          if (!sitId) continue;

          // Recuperer le rapport PDF
          const repResp = await edouardGet('/v1/situations/' + encodeURIComponent(sitId) + '/report', EDOUARD_KEY);
          if (!repResp.ok) {
            journal.details.push('Mission ' + row.id + ' / EDL du ' + (sit.date || '?') + ' : rapport indisponible (HTTP ' + repResp.status + ')');
            continue;
          }
          const fileInfo = unwrap(repResp.data);
          const fileUrl = fileInfo && (fileInfo.url || (Array.isArray(fileInfo) && fileInfo[0] && fileInfo[0].url));
          if (!fileUrl) {
            journal.details.push('Mission ' + row.id + ' / EDL ' + sitId + ' : rapport sans URL');
            continue;
          }

          const pdfResp = await fetch(fileUrl);
          if (!pdfResp.ok) {
            journal.erreurs.push('Mission ' + row.id + ' : telechargement PDF HTTP ' + pdfResp.status);
            continue;
          }
          const pdfBytes = await pdfResp.arrayBuffer();

          // Stocker dans Supabase Storage (un fichier par etat des lieux)
          const path = (row.user_id || 'inconnu') + '/' + row.id + '_' + sitId + '.pdf';
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

          // Lien signe longue duree (1 an)
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
          if (!rapportUrl) {
            journal.erreurs.push('Mission ' + row.id + ' : lien signe non genere');
            continue;
          }

          let dateLisible = '';
          try {
            if (sit.date) dateLisible = new Date(sit.date).toLocaleDateString('fr-FR');
          } catch (e) { /* date non exploitable */ }
          const nomDoc = 'Rapport EDL ' + (dateLisible ? 'du ' + dateLisible + ' ' : '') + '\u2014 ' + (m.adresse || row.id);

          rapportsMission.push({ nom: nomDoc, url: rapportUrl, date: sit.date || '', situationId: sitId, type: sit.type });
          dejaFaits.push(sitId);
          dernierUrl = rapportUrl;
          nouveauxPourCetteMission++;
          journal.rapportsRecuperes++;
          journal.details.push('Mission ' + row.id + ' (' + (m.adresse || '') + ') : ' + nomDoc + ' \u2713 [type Edouard ' + sit.type + ']');

          // Rendre le document visible dans l'extranet de l'agence
          if (m.emailClient) {
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
            } catch (e) { journal.erreurs.push('Mission ' + row.id + ' : doc extranet - ' + String(e && e.message || e)); }
          }
        }

        if (nouveauxPourCetteMission === 0) continue;

        // Mettre a jour la mission
        const newData = Object.assign({}, m, {
          statut: 'r\u00e9alis\u00e9e',
          edouardSituationsTraitees: dejaFaits,
          edouardReportDone: true,
          rapports: rapportsMission,
          rapportUrl: dernierUrl,
          rapportRecupereAt: new Date().toISOString()
        });
        const patchResp = await fetch(SUPA_URL + '/rest/v1/missions?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: supaHeaders,
          body: JSON.stringify({ data: newData, updated_at: new Date().toISOString() })
        });
        if (!patchResp.ok) {
          journal.erreurs.push('Mission ' + row.id + ' : mise a jour mission HTTP ' + patchResp.status);
        }

        // Notifier l'agence (un seul email par mission, best effort)
        if (BREVO_KEY && m.emailClient) {
          const pluriel = nouveauxPourCetteMission > 1;
          try {
            await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sender: { name: 'EDL IDF Expert en \u00c9tat des Lieux', email: 'contact@edl-idf.com' },
                to: [{ email: m.emailClient }],
                subject: '\u2705 Rapport' + (pluriel ? 's' : '') + ' d\u2019\u00e9tat des lieux disponible' + (pluriel ? 's' : '') + ' \u2014 ' + (m.adresse || ''),
                htmlContent: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1E2E">' +
                  '<h2 style="color:#1A5FA8">Votre rapport' + (pluriel ? 's est' : ' est') + ' disponible' + (pluriel ? 's' : '') + '</h2>' +
                  '<p>Bonjour,</p>' +
                  '<p>L\u2019\u00e9tat des lieux <strong>' + (m.type || '') + '</strong> au <strong>' + (m.adresse || '') + '</strong> a \u00e9t\u00e9 r\u00e9alis\u00e9. ' +
                  (pluriel ? nouveauxPourCetteMission + ' rapports sont' : 'Le rapport est') + ' d\u00e8s \u00e0 pr\u00e9sent disponible' + (pluriel ? 's' : '') + ' dans votre espace client\u00a0:</p>' +
                  '<p style="text-align:center;margin:24px 0"><a href="https://app.lokentia.fr/extranet-app" style="background:#1A5FA8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Acc\u00e9der \u00e0 mon espace</a></p>' +
                  '<p style="font-size:13px;color:#666">Thomas LANGLADE \u2014 Directeur G\u00e9n\u00e9ral<br>EDL IDF Expert en \u00c9tat des Lieux</p>' +
                  '</div>'
              })
            });
          } catch (e) { /* la notification email ne doit jamais bloquer */ }
        }

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
