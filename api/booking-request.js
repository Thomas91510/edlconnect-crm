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


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BREVO_KEY = process.env.BREVO_API_KEY;

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

  try {
    const data = await req.json();
    const { agencyId, contactId, agence, contact, email, tel, typeEdl, adresse, bienType, bienTypo, meuble, superficie, dateEntree, acces, proprietaire, dateSouhaitee, heure, notes, locataire, locataires, locatairesEntrants } = data;

    if(!agence || !email || !typeEdl || !adresse) {
      return new Response(JSON.stringify({ error: 'Champs requis manquants' }), { status: 400 });
    }

    const bookingId = 'booking_' + Date.now();
    const createdAt = new Date().toISOString();

    // ── Retrouver l'abonne proprietaire de cette agence ──────
    // 1) par l'identifiant du contact (liens recents), 2) par l'email de
    // l'agence, 3) par le nom de l'agence. Vide = compte historique.
    let ownerId = '';
    if (SUPABASE_SERVICE_KEY && SUPABASE_URL) {
      const supaHeaders = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      };
      const chercher = async (filtre) => {
        try {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/contacts?select=user_id&${filtre}&limit=1`, { headers: supaHeaders });
          if (!r.ok) return '';
          const rows = await r.json();
          return (rows && rows[0] && rows[0].user_id) || '';
        } catch (e) { return ''; }
      };
      if (contactId) ownerId = await chercher('id=eq.' + encodeURIComponent(contactId));
      if (!ownerId && email) ownerId = await chercher('data-%3E%3Eemail=ilike.' + encodeURIComponent(email));
      if (!ownerId && agence) ownerId = await chercher('data-%3E%3Eentreprise=ilike.' + encodeURIComponent(agence));
    }

    const IDENT = await identiteAbonne(ownerId);

    // ── 1. Sauvegarder dans la table bookings ──────────────
    if(SUPABASE_SERVICE_KEY && SUPABASE_URL) {
      const bookingData = {
        id: bookingId,
        agencyId: agencyId || '',
        agence, contact, email, tel,
        typeEdl, adresse,
        bienType: bienType || '',
        bienTypo: bienTypo || '',
        meuble: meuble || '',
        superficie: superficie || '',
        dateEntree: dateEntree || '',
        acces: acces || '',
        proprietaire: proprietaire || '',
        dateSouhaitee, heure,
        notes: notes || '',
        locataire: locataire || {},
        locataires: locataires || [locataire].filter(Boolean),
        locatairesEntrants: locatairesEntrants || [],
        locataireCivilite: locataire?.civilite || '',
        locataireNom: locataire?.nom || '',
        locataireTel: locataire?.tel || '',
        locataireEmail: locataire?.email || '',
        ownerId: ownerId,
        source: 'booking',
        statut: 'en_attente',
        rdvConfirme: false,
        createdAt
      };

      await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ id: bookingId, data: bookingData, created_at: createdAt, updated_at: createdAt })
      });
    }

    // ── 2. Email confirmation agent ────────────────────────
    const dateFormatted = dateSouhaitee ? new Date(dateSouhaitee).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) : '—';
    let bienDesc = [bienType, bienTypo, meuble].filter(Boolean).join(' · ') || 'Non précisé';
    if(superficie) bienDesc += (bienDesc !== 'Non précisé' ? ' · ' : '') + superficie + ' m²';

    if(BREVO_KEY) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          sender: { name: IDENT.nom, email: IDENT.email },
          ...(IDENT.replyTo ? { replyTo: { email: IDENT.replyTo, name: IDENT.nom } } : {}),
          to: [{ email, name: contact }],
          subject: `✅ Demande d'EDL reçue — ${typeEdl} · ${adresse}`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
              <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
                <div style="color:#fff;font-size:18px;font-weight:700">Lokentia</div>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="font-size:20px;margin-bottom:6px">✅ Votre demande est bien reçue !</h2>
                <p style="color:#6b6b6b;margin-bottom:20px">Bonjour <strong>${contact}</strong>, Thomas vous contactera sous <strong>2h</strong> pour confirmer la date définitive.</p>
                <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:20px">
                  <div style="font-size:12px;font-weight:700;color:#1A5FA8;margin-bottom:12px">📋 Récapitulatif</div>
                  <table style="width:100%;font-size:13px;border-collapse:collapse">
                    <tr><td style="color:#6b6b6b;padding:4px 0;width:35%">Type d'EDL</td><td style="font-weight:600">${typeEdl}</td></tr>
                    <tr><td style="color:#6b6b6b;padding:4px 0">Adresse</td><td style="font-weight:600">${adresse}</td></tr>
                    <tr><td style="color:#6b6b6b;padding:4px 0">Bien</td><td>${bienDesc}</td></tr>
                    <tr><td style="color:#6b6b6b;padding:4px 0">Date souhaitée</td><td style="font-weight:600;color:#1A5FA8">${dateFormatted}${heure ? ' · ' + heure : ''}</td></tr>
                    ${dateEntree ? `<tr><td style="color:#6b6b6b;padding:4px 0">Date d'entrée</td><td>${new Date(dateEntree).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</td></tr>` : ''}
                    <tr><td style="color:#6b6b6b;padding:4px 0">Locataire</td><td>${locataire?.nom || '—'} · ${locataire?.tel || '—'}</td></tr>
                    ${(locatairesEntrants && locatairesEntrants.length) ? `<tr><td style="color:#6b6b6b;padding:4px 0">Entrant(s)</td><td>${locatairesEntrants.map(e => (e.prenom||'') + ' ' + (e.nom||'')).join(', ')}</td></tr>` : ''}
                    ${proprietaire ? `<tr><td style="color:#6b6b6b;padding:4px 0">Propriétaire</td><td>${proprietaire}</td></tr>` : ''}
                    ${notes ? `<tr><td style="color:#6b6b6b;padding:4px 0">Notes</td><td style="font-size:12px">${notes}</td></tr>` : ''}
                  </table>
                </div>
                <div style="background:#EAF3DE;border-radius:8px;padding:14px;font-size:13px;color:#27500A;margin-bottom:20px">
                  📅 Thomas vous contactera pour confirmer la date. Le locataire recevra sa convocation une fois le RDV planifié.
                </div>
                <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
                  ${IDENT.tel ? `📞 <a href="tel:${IDENT.tel.replace(/[^0-9+]/g,'')}" style="color:#1A5FA8">${IDENT.tel}</a>` : ''} · 
                  ✉️ <a href="mailto:${IDENT.replyTo || IDENT.email}" style="color:#1A5FA8">${IDENT.replyTo || IDENT.email}</a>
                </div>
              </div>
            </div>`
        })
      });

      // ── 3. Email notification Thomas ─────────────────────
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          sender: { name: 'Lokentia — Réservations', email: 'contact@lokentia.fr' },
          to: [{ email: IDENT.notifEmail, name: IDENT.nom }],
          subject: `🔔 Nouvelle demande EDL — ${agence} · ${typeEdl}`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
              <div style="background:#1A5FA8;padding:16px 20px;border-radius:12px 12px 0 0">
                <div style="color:#fff;font-size:16px;font-weight:700">🔔 Nouvelle demande de mission</div>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
                <div style="background:#FAEEDA;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:#633806">
                  <strong>⚡ Action requise :</strong> Confirmer la date avec l'agence sous 2h.
                </div>
                <table style="width:100%;font-size:13px;border-collapse:collapse">
                  <tr><td style="color:#999;padding:5px 0;width:35%">Agence</td><td style="font-weight:600">${agence}</td></tr>
                  <tr><td style="color:#999;padding:5px 0">Contact</td><td>${contact} · <a href="mailto:${email}" style="color:#1A5FA8">${email}</a>${tel ? ' · ' + tel : ''}</td></tr>
                  <tr><td style="color:#999;padding:5px 0">Type d'EDL</td><td style="font-weight:600">${typeEdl}</td></tr>
                  <tr><td style="color:#999;padding:5px 0">Adresse</td><td style="font-weight:600">${adresse}</td></tr>
                  <tr><td style="color:#999;padding:5px 0">Bien</td><td>${bienDesc}</td></tr>
                  <tr><td style="color:#999;padding:5px 0">Date souhaitée</td><td style="font-weight:600;color:#1A5FA8">${dateFormatted}${heure ? ' · ' + heure : ' · Flexible'}</td></tr>
                  ${dateEntree ? `<tr><td style="color:#999;padding:5px 0">Date d'entrée</td><td>${new Date(dateEntree).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}</td></tr>` : ''}
                  ${acces ? `<tr><td style="color:#999;padding:5px 0">Accès</td><td>${acces}</td></tr>` : ''}
                  ${proprietaire ? `<tr><td style="color:#999;padding:5px 0">Propriétaire</td><td>${proprietaire}</td></tr>` : ''}
                  <tr><td style="color:#999;padding:5px 0">Locataire</td><td><strong>${locataire?.nom || '—'}</strong><br>📞 ${locataire?.tel || '—'}${locataire?.email ? '<br>✉️ ' + locataire.email : ''}</td></tr>
                  ${(locatairesEntrants && locatairesEntrants.length) ? `<tr><td style="color:#999;padding:5px 0">Locataire(s) entrant(s)</td><td>${locatairesEntrants.map(e => `<strong>${(e.prenom||'') + ' ' + (e.nom||'')}</strong> · 📞 ${e.tel||'—'}${e.email ? ' · ✉️ ' + e.email : ''}`).join('<br>')}</td></tr>` : ''}
                  ${notes ? `<tr><td style="color:#999;padding:5px 0">Notes</td><td style="color:#6b6b6b">${notes}</td></tr>` : ''}
                </table>
                <div style="margin-top:20px;text-align:center">
                  <a href="https://app.lokentia.fr" style="background:#1A5FA8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block">
                    Ouvrir le CRM →
                  </a>
                </div>
              </div>
            </div>`
        })
      });
    }

    return new Response(JSON.stringify({ success: true, bookingId }), {
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
