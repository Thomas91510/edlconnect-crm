// Identité d'envoi partagée par toutes les fonctions api/*.js qui envoient
// un email pour le compte d'un abonné (nom affiché, adresse d'expédition
// si un domaine vérifié est configuré, sinon repli neutre Lokentia +
// reply-to vers l'abonné).
//
// Recopiée à l'identique dans 5 fichiers avant ce module (booking-request,
// confirm-rdv, reminder-rdv, edouard-cron, send-welcome-agency) :
// centralisée ici pour qu'une correction future
// (ex. un nouveau champ d'identité) n'ait plus à être répétée six fois.
//
// Ne lance jamais d'exception : un email dégradé (expéditeur neutre) vaut
// mieux qu'un envoi bloqué par une erreur réseau ou une ligne settings
// absente.
const DOMAINES_VERIFIES = ['edl-idf.com', 'lokentia.fr'];

const IDENTITE_NEUTRE = {
  nom: 'Lokentia',
  email: 'contact@lokentia.fr',
  replyTo: '',
  tel: '',
  signature: '',
  partenaire: '',
  avisGoogleLien: '',
  logoUrl: '',
  couleur: '#1A5FA8',
  notifEmail: 'contact@edl-idf.com'
};

const BUCKET_LOGOS = '/storage/v1/object/public/agency-logos/';
const _esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// En-tête des emails automatiques, identique à celui des emails du CRM
// (js/app-emails.js) : fond blanc, logo seul centré (à défaut le nom de la
// société en couleur de marque), trait de couleur dessous. Le logo est
// dimensionné par la hauteur pour garder ses proportions (logo rond).
export function enteteEmail(ident) {
  const i = ident || IDENTITE_NEUTRE;
  const couleur = /^#[0-9a-fA-F]{6}$/.test(i.couleur || '') ? i.couleur : '#1A5FA8';
  const contenu = i.logoUrl
    ? `<img src="${_esc(i.logoUrl)}" alt="${_esc(i.nom)}" height="110" style="height:110px;width:auto;max-width:260px;display:inline-block;border:0">`
    : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:700;color:${couleur}">${_esc(i.nom)}</span>`;
  return `<div style="background:#ffffff;padding:22px 24px 18px;border:1px solid #e5e5e2;border-bottom:3px solid ${couleur};border-radius:12px 12px 0 0;text-align:center">${contenu}</div>`;
}

export async function identiteAbonne(supaUrl, serviceKey, userId) {
  if (!userId || !supaUrl || !serviceKey) return IDENTITE_NEUTRE;
  try {
    const r = await fetch(supaUrl + '/rest/v1/settings?select=data&user_id=eq.' + encodeURIComponent(userId), {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
    });
    if (!r.ok) return IDENTITE_NEUTRE;
    const rows = await r.json();
    const d = (rows && rows[0] && rows[0].data) || {};
    const nom = (d.expediteurNom || d.companyName || '').trim() || IDENTITE_NEUTRE.nom;
    const mail = (d.expediteurEmail || d.userEmail || '').trim();
    const domaine = mail.includes('@') ? mail.split('@')[1].toLowerCase() : '';
    const peutExpedier = domaine && DOMAINES_VERIFIES.includes(domaine);
    return {
      nom,
      email: peutExpedier ? mail : IDENTITE_NEUTRE.email,
      replyTo: (!peutExpedier && mail) ? mail : '',
      tel: (d.expediteurTel || '').trim(),
      slogan: typeof d.slogan === 'string' ? d.slogan.trim() : 'Expert en État des Lieux',
      signature: (d.expediteurSignature || '').trim(),
      partenaire: (d.expediteurPartenaire || '').trim(),
      avisGoogleLien: (d.avisGoogleLien || '').trim(),
      logoUrl: d.logoPath ? supaUrl + BUCKET_LOGOS + encodeURI(String(d.logoPath)) : '',
      couleur: /^#[0-9a-fA-F]{6}$/.test(d.couleurPrimaire || '') ? d.couleurPrimaire : '#1A5FA8',
      notifEmail: mail || IDENTITE_NEUTRE.notifEmail
    };
  } catch (e) {
    return IDENTITE_NEUTRE;
  }
}
