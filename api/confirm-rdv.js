export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';

// Echappement HTML : mission/message/locataires proviennent en bout de chaine
// d'un formulaire de reservation public (aucune authentification), et sont
// reinjectes tels quels dans des emails envoyes a de vraies agences et de
// vrais locataires. Sans ceci, n'importe quel compte peut y injecter du HTML.
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Domaines authentifies chez Brevo : seuls ceux-ci peuvent servir d'expediteur.
// Pour les autres abonnes, on expedie depuis Lokentia avec leur nom, et
// leurs clients repondent directement sur leur adresse (replyTo).
const DOMAINES_VERIFIES = ['edl-idf.com', 'lokentia.fr'];
const SUPA_URL_BASE = SUPABASE_URL;

async function identiteAbonne(userId) {
  const neutre = { nom: 'Lokentia', email: 'contact@lokentia.fr', replyTo: '', tel: '', signature: '', partenaire: '' };
  if (!userId) return neutre;
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) return neutre;
    const r = await fetch(SUPA_URL_BASE + '/rest/v1/settings?select=data&user_id=eq.' + encodeURIComponent(userId), {
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
      partenaire: (d.expediteurPartenaire || '').trim()
    };
  } catch (e) {
    return neutre;
  }
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
  const _userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${_token}` }
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
    const { mission, agentEmail, agentNom, locataireEmail, locataireNom, locataireCivilite, locataires, expertNom, expertTel, message, envoyerAgence, envoyerLocataires } = await req.json();

    // Destinataires : par defaut on envoie a tout le monde, pour rester
    // compatible avec les appels qui ne precisent rien. Le CRM transmet
    // explicitement false quand une case a ete decochee dans la modal.
    const _envAgence = (envoyerAgence !== false);
    const _envLocataires = (envoyerLocataires !== false);

    // Liste complète des locataires (principal + supplémentaires)
    // On ne retient que les locataires disposant d'un email ; sinon repli sur la saisie de la modal
    let allLocataires = (locataires || []).filter(l => l && l.email);
    if(allLocataires.length === 0 && locataireEmail){
      allLocataires = [{ civilite: locataireCivilite||'', nom: locataireNom||'', tel:'', email: locataireEmail }];
    }
    const civilite = locataireCivilite || '';
    const isFemme = civilite === 'Mme';
    const isHomme = civilite === 'M.';
    const salutation = civilite && locataireNom ? civilite + ' ' + locataireNom : (locataireNom || '');

    if(!mission) {
      return new Response(JSON.stringify({ error: 'Données manquantes' }), { status: 400 });
    }
    if(_envAgence && !agentEmail) {
      return new Response(JSON.stringify({ error: "Email de l'agence requis" }), { status: 400 });
    }
    if(!_envAgence && !_envLocataires) {
      return new Response(JSON.stringify({ error: 'Aucun destinataire sélectionné' }), { status: 400 });
    }

    const dateObj = mission.date ? new Date(mission.date) : null;
    const dateStr = dateObj ? dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }) : '—';
    const heureStr = dateObj ? dateObj.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit'
    }) : '—';
    const bien = esc([mission.bienType, mission.bienTypo, mission.bienMeuble].filter(Boolean).join(' · ') || 'Non précisé');
    const dureeLabel = esc(mission.dureeEstimee || '1h');
    const typeEdl = (mission.type || '').toLowerCase();

    const isEntrant = typeEdl.includes('entrant');
    const isSortant = typeEdl.includes('sortant') && !typeEdl.includes('entrant');
    const isDouble = typeEdl.includes('sortant') && typeEdl.includes('entrant');
    const isPre = typeEdl.includes('pré') || typeEdl.includes('pre');

    // Bloc "Expert qui se déplace" (affiché si renseigné)
    const expertBlockAgent = expertNom
      ? `<tr><td style="color:#6b6b6b;padding:5px 0">Expert</td><td style="font-weight:600">${esc(expertNom)}${expertTel ? ' — 📱 ' + esc(expertTel) : ''}</td></tr>`
      : '';
    const expertBlockLoc = expertNom
      ? `👤 Expert qui se déplacera : <strong>${esc(expertNom)}</strong>${expertTel ? '<br>📱 ' + esc(expertTel) : ''}<br>`
      : '';

// Aucun encart particulier : l'email a l'agence est identique, que la
    // convocation locataire ait ete envoyee ou non.
    const blocAgencePrevient = '';

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
      <tr><td style="color:#6b6b6b;padding:5px 0;width:35%">Type</td><td style="font-weight:600">${esc(mission.type)}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Adresse</td><td style="font-weight:600">${esc(mission.adresse)}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Bien</td><td>${bien}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Date</td><td style="font-weight:600;color:#1A5FA8">${dateStr}</td></tr>
      <tr><td style="color:#6b6b6b;padding:5px 0">Heure</td><td style="font-weight:600;color:#1A5FA8">${heureStr}</td></tr>
      ${expertBlockAgent}
      ${locataireNom ? `<tr><td style="color:#6b6b6b;padding:5px 0">Locataire</td><td>${esc(locataireNom)}</td></tr>` : ''}
      ${mission.proprietaire ? `<tr><td style="color:#6b6b6b;padding:5px 0">Propriétaire</td><td>${esc(mission.proprietaire)}</td></tr>` : ''}
      ${mission.acces ? `<tr><td style="color:#6b6b6b;padding:5px 0">Accès</td><td>${esc(mission.acces)}</td></tr>` : ''}
    </table>
    ${blocAgencePrevient}
    ${message ? `<div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:#555;line-height:1.7"><strong>💬 Message :</strong><br>${esc(message)}</div>` : ''}
    <div style="background:#EAF3DE;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#27500A;line-height:1.7">
      ✅ Notre expert sera présent à l'heure indiquée. Le rapport vous sera transmis dans les <strong>24h</strong> avec signature électronique.
    </div>
    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px">
      <strong>${IDENT.signature || IDENT.nom}</strong><br>
      ${IDENT.tel ? `📞 <a href="tel:${IDENT.tel.replace(/[^0-9+]/g,'')}" style="color:#1A5FA8">${IDENT.tel}</a> · ` : ''}
      ${IDENT.replyTo || IDENT.email ? `✉️ <a href="mailto:${IDENT.replyTo || IDENT.email}" style="color:#1A5FA8">${IDENT.replyTo || IDENT.email}</a>` : ''}
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
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">__SALUT_BONJOUR__</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Je vous confirme notre rendez-vous pour l'état des lieux d'entrée de votre logement situé au :
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#0C447C;line-height:2">
      📍 <strong>${esc(mission.adresse)}</strong><br>
      🏠 Type de bien : <strong>${bien}</strong><br>
      📅 Date et heure : <strong>${dateStr} à ${heureStr}</strong><br>
      ⏱️ Durée estimée de l'intervention : <strong>environ ${dureeLabel}</strong><br>
      ${expertBlockLoc}    </div>

    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 16px 0">
      Nous intervenons en tant que mandataires de la société <strong>${esc(mission.agence)}</strong>.
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

    ${message ? `<div style="background:#FFF8E6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.7"><strong>💬 Message :</strong><br>${esc(message)}</div>` : ''}

    ${IDENT.partenaire ? `<div style="border-top:1px dashed #e5e5e2;margin:20px 0;padding-top:20px">
      <div style="font-size:13px;font-weight:700;color:#1A5FA8;margin-bottom:8px">💡 Astuce pour votre emménagement :</div>
      <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 8px 0">
        Afin de vous accompagner dans vos démarches (ouverture de compteurs, changement d'adresse, etc.), découvrez ces services gratuits :
      </p>
      <a href="${IDENT.partenaire}" style="display:inline-block;background:#1A5FA8;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
        👉 Découvrir
      </a>
    </div>` : ''}

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;margin-top:20px;line-height:1.8">
      En cas d'empêchement ou pour toute question, n'hésitez pas à me contacter :<br>
      ${IDENT.tel ? `📞 <a href="tel:${IDENT.tel.replace(/[^0-9+]/g,'')}" style="color:#1A5FA8;text-decoration:none">${IDENT.tel}</a>` : ''}<br>
      ✉️ Par retour de mail<br><br>
      Dans l'attente de vous rencontrer,<br>
      Cordialement,<br>
      <strong>${IDENT.signature || IDENT.nom}</strong>
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
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">__SALUT_FORMEL__</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Suite à notre conversation, nous vous confirmons le rendez-vous pour effectuer l'état des lieux de sortie de votre logement, diligenté par <strong>${esc(mission.agence)}</strong>.
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:24px;font-size:13px;color:#0C447C;line-height:2">
      📅 Date : <strong>${dateStr}</strong><br>
      🕘 Heure : <strong>${heureStr}</strong><br>
      📍 Adresse : <strong>${esc(mission.adresse)}</strong><br>
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

    ${message ? `<div style="background:#f8f8f6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#555;line-height:1.7"><strong>💬 Message :</strong><br>${esc(message)}</div>` : ''}

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Pour toute question ou en cas d'empêchement majeur, n'hésitez pas à nous contacter :<br>
      ${IDENT.tel ? `📞 <a href="tel:${IDENT.tel.replace(/[^0-9+]/g,'')}" style="color:#1A5FA8;text-decoration:none">${IDENT.tel}</a>` : ''}<br>
      ✉️ Par retour de mail<br><br>
      Cordialement,<br>
      <strong>${IDENT.signature || IDENT.nom}</strong>
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
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px 0">__SALUT_FORMEL__</p>
    <p style="font-size:13px;color:#444;line-height:1.7;margin:0 0 20px 0">
      Nous vous confirmons le rendez-vous pour votre <strong>pré-état des lieux</strong>, diligenté par <strong>${esc(mission.agence)}</strong>.<br>
      Cette visite préventive vous permettra d'anticiper les travaux à réaliser avant votre départ officiel.
    </p>

    <div style="background:#F4F7FA;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:#0C447C;line-height:2">
      📅 Date : <strong>${dateStr}</strong><br>
      🕘 Heure : <strong>${heureStr}</strong><br>
      📍 Adresse : <strong>${esc(mission.adresse)}</strong><br>
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

    ${message ? `<div style="background:#FFF8E6;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#633806;line-height:1.7"><strong>💬 Message :</strong><br>${esc(message)}</div>` : ''}

    <div style="font-size:13px;color:#6b6b6b;border-top:1px solid #e5e5e2;padding-top:16px;line-height:1.8">
      Pour toute question, n'hésitez pas à nous contacter :<br>
      ${IDENT.tel ? `📞 <a href="tel:${IDENT.tel.replace(/[^0-9+]/g,'')}" style="color:#1A5FA8;text-decoration:none">${IDENT.tel}</a>` : ''}<br>
      ✉️ Par retour de mail<br><br>
      Cordialement,<br>
      <strong>${IDENT.signature || IDENT.nom}</strong>
    </div>
  </div>
</div>
</body></html>`;

    // ── Choisir le bon template locataire ──────────────────
    // Fonction qui retourne le template + sujet adaptés à UN locataire donné.
    // Pour un EDL Sortant/Entrant, le rôle du locataire (marqué à la source)
    // détermine s'il reçoit la convocation d'entrée ou de sortie ; les autres
    // types (entrant seul, sortant seul, pré-EDL) utilisent le même pour tous.
    function templatePourLocataire(loc){
      let tpl, sujet, kind;
      if(isDouble){
        if(loc && loc.role === 'entrant'){ kind = 'entree'; }
        else { kind = 'sortie'; }
      } else if(isEntrant){ kind = 'entree'; }
      else if(isSortant){ kind = 'sortie'; }
      else { kind = 'pre'; }

      if(kind === 'entree'){
        tpl = locataireEntrantHtml;
        sujet = `🔑 Confirmation état des lieux d'entrée — ${dateStr} à ${heureStr}`;
      } else if(kind === 'sortie'){
        tpl = locataireSortantHtml;
        sujet = `🚪 Confirmation état des lieux de sortie — ${dateStr} à ${heureStr}`;
      } else {
        tpl = locatairePreHtml;
        sujet = `🔍 Confirmation pré-état des lieux — ${dateStr} à ${heureStr}`;
      }
      return { tpl, sujet };
    }

    // ── Envoi des emails ───────────────────────────────────
    const emailsToSend = [];
    let nbAgence = 0;
    let nbLocataires = 0;

    if(_envAgence){
      nbAgence = 1;
      emailsToSend.push(fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
        body: JSON.stringify({
          sender: { name: IDENT.nom, email: IDENT.email },
          to: [{ email: agentEmail }],
          replyTo: { email: IDENT.replyTo || IDENT.email, name: IDENT.nom },
          subject: `✅ Confirmation EDL — ${mission.type} · ${dateStr} · ${mission.adresse}`,
          htmlContent: agentHtml
        })
      }));
    }

    // Envoyer à chaque locataire son email, avec le bon template et son propre nom
    if(_envLocataires){
      allLocataires.forEach(loc => {
        if(!loc.email) return;
        nbLocataires++;
        const { tpl, sujet } = templatePourLocataire(loc);
        const nomLoc = esc((loc.nom || '').trim());
        const civLoc = esc((loc.civilite || '').trim());
        // Salutations personnalisées, remplaçant les placeholders des templates
        const salutBonjour = nomLoc
          ? 'Bonjour <strong>' + (civLoc ? civLoc + ' ' + nomLoc : nomLoc) + '</strong>,'
          : 'Bonjour,';
        const salutFormel = nomLoc
          ? '<strong>' + (civLoc ? civLoc + ' ' + nomLoc : nomLoc) + '</strong>,'
          : 'Madame, Monsieur,';
        const htmlPerso = tpl
          .split('__SALUT_BONJOUR__').join(salutBonjour)
          .split('__SALUT_FORMEL__').join(salutFormel);
        emailsToSend.push(fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
          body: JSON.stringify({
            sender: { name: IDENT.nom, email: IDENT.email },
            to: [{ email: loc.email, name: (civLoc + ' ' + nomLoc).trim() || '' }],
            replyTo: { email: IDENT.replyTo || IDENT.email, name: IDENT.nom },
            subject: sujet,
            htmlContent: htmlPerso
          })
        }));
      });
    }

    await Promise.all(emailsToSend);

    return new Response(JSON.stringify({ success: true, envoyes: { agence: nbAgence, locataires: nbLocataires } }), {
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
