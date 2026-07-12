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

  // ── Authentification obligatoire : jeton de session Supabase ──
  const _authHeader = req.headers.get('authorization') || '';
  const _token = _authHeader.replace('Bearer ', '').trim();
  if(!_token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
  const _userResp = await fetch(`${'https://pvuctwflxvvxdawsxceu.supabase.co'}/auth/v1/user`, {
    headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic', 'Authorization': `Bearer ${_token}` }
  });
  if(!_userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if(!BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Clé Brevo manquante' }), { status: 500 });
  }

  try {
    const { mission, agentEmail, agentNom, locataireEmail, locataireNom, locataireCivilite, locataires, expertNom, expertTel, message } = await req.json();
    // Liste complète des locataires (principal + supplémentaires)
    const allLocataires = locataires && locataires.length > 0 ? locataires : 
      (locataireEmail ? [{ civilite: locataireCivilite||'', nom: locataireNom||'', tel:'', email: locataireEmail }] : []);
    const civilite = locataireCivilite || '';
    const isFemme = civilite === 'Mme';
    const isHomme = civilite === 'M.';
    const salutation = civilite && locataireNom ? civilite + ' ' + locataireNom : (locataireNom || '');

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
    const dureeLabel = mission.dureeEstimee || '1h';
    const typeEdl = (mission.type || '').toLowerCase();

    const isEntrant = typeEdl.includes('entrant');
    const isSortant = typeEdl.includes('sortant') && !typeEdl.includes('entrant');
    const isDouble = typeEdl.includes('sortant') && typeEdl.includes('entrant');
    const isPre = typeEdl.includes('pré') || typeEdl.includes('pre');

    // Bloc "Expert qui se déplace" (affiché si renseigné)
    const expertBlockAgent = expertNom
      ? `<tr><td style="color:#6b6b6b;padding:5px 0">Expert</td><td style="font-weight:600">${expertNom}${expertTel ? ' — 📱 ' + expertTel : ''}</td></tr>`
      : '';
    const expertBlockLoc = expertNom
      ? `👤 Expert qui se déplacera : <strong>${expertNom}</strong>${expertTel ? '<br>📱 ' + expertTel : ''}<br>`
      : '';

    // ── EMAIL AGENT (identique pour tous les types) ────────
    const agentHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700">EDL IDF Expert en Etat des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <h2 style="font-size:20px;margin:0 0 16px 0">✅ Confirmation de votre état des lieux</h2>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="color:#6b6b6b;padding:5px 0;width:35%">Type</td><td style="font-weight:600">${mission.type}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Adresse</td><td style="font-weight:600">${mission.adresse}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Bien</td><td>${bien}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Date</td><td style="font-weight:600;color:#1A5FA8">${dateStr}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Heure</td><td style="font-weight:600;color:#1A5FA8">${heureStr}</td></tr>
      ${expertBlockAgent}
      ${locataireNom ? `<tr><td style="color:#6b6b6b;padding:5px 0">Locataire</td><td>${locataireNom}</td></tr>` : ''}
      ${mission.proprietaire ? `<tr><td style="color:#6b6b6b;padding:5px 0">Propriétaire</td><td>${mission.proprietaire}</td></tr>` : ''}
      ${mission.acces ? `<tr><td style="color:#6b6b6b;padding:5px 0">Accès</td><td>${mission.acces}</td></tr>` : ''}
    </table>
    ${message ? `<div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:#555;line-height:1.7"><strong>💬 Message :</strong><br>${message}</div>` : ''}
    <div style="background:#EAF3DE;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#27500A;line-height:1.7">
      ✅ Notre expert sera présent à l'heure indiquée. Le rapport vous sera transmis dans les <strong>24h</strong> avec signature électronique.
    </div>
    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
      <strong>Thomas Langlade — EDL IDF Expert en Etat des Lieux</strong><br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8">07 67 63 09 63</a> · 
      ✉️ <a href="mailto:contact@edl-idf.com" style="color:#1A5FA8">contact@edl-idf.com</a>
    </div>
  </div>
</div>
</body></html>`;

    // ── EMAIL LOCATAIRE — EDL ENTRANT ──────────────────────
    const locataireEntrantHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700">EDL IDF Expert en Etat des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">Bonjour${salutation ? ' <strong>' + salutation + '</strong>' : ''},</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Je vous confirme notre rendez-vous pour l'état des lieux d'entrée de votre logement situé au :
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#0C447C;line-height:2">
      📍 <strong>${mission.adresse}</strong><br>
      🏠 Type de bien : <strong>${bien}</strong><br>
      📅 Date et heure : <strong>${dateStr} à ${heureStr}</strong><br>
      ⏱️ Durée estimée de l'intervention : <strong>environ ${dureeLabel}</strong><br>
      ${expertBlockLoc}    </div>

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Nous intervenons en tant que mandataires de la société <strong>${mission.agence}</strong>.
    </p>

    <div style="background:#f8f8f6;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:10px">📋 Merci de bien vouloir vous munir des documents suivants le jour du rendez-vous :</div>
      <div style="font-size:13px;color:#444;line-height:2">
        • 🪪 Votre pièce d'identité<br>
        • 🛡️ Votre attestation d'assurance habitation <strong>(obligatoire avant la remise des clés)</strong>
      </div>
    </div>

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Nous comptons sur votre ponctualité afin d'assurer le bon déroulement de l'état des lieux. 🙏
    </p>

    ${message ? `<div style="background:#FFF8E6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.7"><strong>💬 Message :</strong><br>${message}</div>` : ''}

    <div style="border-top:1px dashed #e5e5e2;margin:20px 0;padding-top:20px">
      <div style="font-size:13px;font-weight:700;color:#1A5FA8;margin-bottom:8px">💡 Astuce pour votre emménagement :</div>
      <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 8px 0">
        Afin de vous accompagner dans vos démarches (ouverture de compteurs, changement d'adresse, etc.), découvrez les services gratuits de BeMove :
      </p>
      <a href="https://www.bemove.fr/landing/immobilier/edl-idf/services" style="display:inline-block;background:#1A5FA8;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
        👉 Découvrir BeMove
      </a>
    </div>

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;margin-top:20px;line-height:1.8">
      En cas d'empêchement ou pour toute question, n'hésitez pas à me contacter :<br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8;text-decoration:none">07 67 63 09 63</a><br>
      ✉️ Par retour de mail<br><br>
      Dans l'attente de vous rencontrer,<br>
      Cordialement,<br>
      <strong>Thomas LANGLADE</strong>
    </div>
  </div>
</div>
</body></html>`;

    // ── EMAIL LOCATAIRE — EDL SORTANT ──────────────────────
    const locataireSortantHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700">EDL IDF Expert en Etat des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">${civilite && locataireNom ? '<strong>' + civilite + ' ' + locataireNom + '</strong>,' : locataireNom ? 'Bonjour <strong>' + locataireNom + '</strong>,' : 'Madame, Monsieur,'}</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Suite à notre conversation, nous vous confirmons le rendez-vous pour effectuer l'état des lieux de sortie de votre logement, diligenté par <strong>${mission.agence}</strong>.
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:24px;font-size:13px;color:#0C447C;line-height:2">
      📅 Date : <strong>${dateStr}</strong><br>
      🕘 Heure : <strong>${heureStr}</strong><br>
      📍 Adresse : <strong>${mission.adresse}</strong><br>
      ⏱️ Durée estimée de l'intervention : <strong>environ ${dureeLabel}</strong><br>
      ${expertBlockLoc}    </div>

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Afin que l'état des lieux se déroule dans les meilleures conditions et conformément à la législation, nous vous remercions de bien vouloir respecter les points suivants :
    </p>

    <div style="margin-bottom:16px">
      <div style="background:#FFF3CD;border-left:4px solid #FFA500;border-radius:0 8px 8px 0;padding:14px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:6px">📦 1. Le logement doit être entièrement vide</div>
        <div style="font-size:13px;color:#444;line-height:1.7">
          Tous vos meubles et effets personnels doivent avoir été déménagés. Aucun objet ne doit rester dans l'appartement, la cave, le garage ou le grenier.
        </div>
      </div>

      <div style="background:#FFF3CD;border-left:4px solid #FFA500;border-radius:0 8px 8px 0;padding:14px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:6px">🧹 2. Le logement doit être parfaitement nettoyé</div>
        <div style="font-size:13px;color:#444;line-height:1.7">
          Cela inclut :<br>
          • Les sols (aspirés et lavés)<br>
          • Les murs (lessivés si nécessaire)<br>
          • Les vitres et encadrements de fenêtres<br>
          • La cuisine (plaques de cuisson, hotte, four, évier, placards)<br>
          • La salle de bain (sanitaires, joints, aération)<br>
          • Les balcons et terrasses
        </div>
      </div>

      <div style="background:#FFF3CD;border-left:4px solid #FFA500;border-radius:0 8px 8px 0;padding:14px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:6px">🔑 3. L'ensemble des clés doit être restitué</div>
        <div style="font-size:13px;color:#444;line-height:1.7">
          Merci de préparer toutes les clés du logement, de la boîte aux lettres, de la cave, du garage, ainsi que les badges d'accès et les télécommandes.
        </div>
      </div>
    </div>

    ${message ? `<div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7"><strong>💬 Message :</strong><br>${message}</div>` : ''}

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Pour toute question ou en cas d'empêchement majeur, n'hésitez pas à nous contacter :<br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8;text-decoration:none">07 67 63 09 63</a><br>
      ✉️ Par retour de mail<br><br>
      Cordialement,<br>
      <strong>Thomas LANGLADE</strong>
    </div>
  </div>
</div>
</body></html>`;

    // ── EMAIL LOCATAIRE — PRÉ-ÉTAT DES LIEUX ──────────────
    const locatairePreHtml = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px 0">
  <div style="background:#1A5FA8;padding:20px 24px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:18px;font-weight:700">EDL IDF Expert en Etat des Lieux</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">${civilite && locataireNom ? '<strong>' + civilite + ' ' + locataireNom + '</strong>,' : locataireNom ? 'Bonjour <strong>' + locataireNom + '</strong>,' : 'Madame, Monsieur,'}</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Nous vous confirmons le rendez-vous pour votre <strong>pré-état des lieux</strong>, diligenté par <strong>${mission.agence}</strong>.<br>
      Cette visite préventive vous permettra d'anticiper les travaux à réaliser avant votre départ officiel.
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#0C447C;line-height:2">
      📅 Date : <strong>${dateStr}</strong><br>
      🕘 Heure : <strong>${heureStr}</strong><br>
      📍 Adresse : <strong>${mission.adresse}</strong><br>
      ⏱️ Durée estimée de l'intervention : <strong>environ ${dureeLabel}</strong><br>
      ${expertBlockLoc}    </div>

    <div style="background:#EAF3DE;border-radius:8px;padding:16px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:#27500A;margin-bottom:8px">💡 Comment profiter au mieux de cette visite :</div>
      <div style="font-size:13px;color:#27500A;line-height:1.9">
        ✓ Notez toutes vos questions sur l'état du logement<br>
        ✓ Identifiez les éventuels dommages à réparer avant la sortie<br>
        ✓ Comparez avec votre état des lieux d'entrée si possible<br>
        ✓ Demandez conseil à l'expert sur les réparations prioritaires
      </div>
    </div>

    <div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7">
      ℹ️ <strong>Bon à savoir :</strong> Le pré-état des lieux n'a pas de valeur contractuelle. Il vous donne simplement le temps d'effectuer les réparations nécessaires avant l'état des lieux officiel de sortie.
    </div>

    ${message ? `<div style="background:#FFF8E6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.7"><strong>💬 Message :</strong><br>${message}</div>` : ''}

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Pour toute question, n'hésitez pas à nous contacter :<br>
      📞 <a href="tel:0767630963" style="color:#1A5FA8;text-decoration:none">07 67 63 09 63</a><br>
      ✉️ Par retour de mail<br><br>
      Cordialement,<br>
      <strong>Thomas LANGLADE</strong>
    </div>
  </div>
</div>
</body></html>`;

    // ── Choisir le bon template locataire ──────────────────
    let locataireHtml, sujetLocataire;
    if(isEntrant) {
      locataireHtml = locataireEntrantHtml;
      sujetLocataire = `🔑 Confirmation état des lieux d'entrée — ${dateStr} à ${heureStr}`;
    } else if(isSortant || isDouble) {
      locataireHtml = locataireSortantHtml;
      sujetLocataire = `🚪 Confirmation état des lieux de sortie — ${dateStr} à ${heureStr}`;
    } else {
      locataireHtml = locatairePreHtml;
      sujetLocataire = `🔍 Confirmation pré-état des lieux — ${dateStr} à ${heureStr}`;
    }

    // ── Envoi des emails ───────────────────────────────────
    const emailsToSend = [];

    emailsToSend.push(fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { name: 'Thomas — EDL IDF', email: 'contact@edl-idf.com' },
        to: [{ email: agentEmail }],
        replyTo: { email: 'contact@edl-idf.com', name: 'Thomas Langlade' },
        subject: `✅ Confirmation EDL — ${mission.type} · ${dateStr} · ${mission.adresse}`,
        htmlContent: agentHtml
      })
    }));

    // Envoyer à tous les locataires qui ont un email
    allLocataires.forEach(loc => {
      if(!loc.email) return;
      const salutationLoc = loc.civilite && loc.nom ? loc.civilite + ' ' + loc.nom : loc.nom || '';
      // Personnaliser le HTML pour ce locataire
      const htmlPerso = locataireHtml
        .replace(salutation ? salutation : '___NOREPLACE___', salutationLoc)
        .replace(locataireNom || '___NOREPLACE___', loc.nom || '');
      emailsToSend.push(fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          sender: { name: 'Thomas — EDL IDF', email: 'contact@edl-idf.com' },
          to: [{ email: loc.email, name: (loc.civilite+' '+loc.nom).trim() || '' }],
          replyTo: { email: 'contact@edl-idf.com', name: 'Thomas Langlade' },
          subject: sujetLocataire,
          htmlContent: locataireHtml
        })
      }));
    });

    await Promise.all(emailsToSend);

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

