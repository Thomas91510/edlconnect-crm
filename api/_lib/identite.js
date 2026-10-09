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
import { ADMIN_EMAILS } from './admin.js';

const DOMAINES_VERIFIES = ['edl-idf.com', 'lokentia.fr'];

// Les domaines vérifiés appartiennent au titulaire de la plateforme. Le
// champ expediteurEmail est modifiable par chaque abonné dans ses propres
// réglages : on ne l'utilise comme expéditeur que si le COMPTE (email
// d'authentification, lu côté serveur) est un compte admin — sinon un
// abonné pourrait écrire contact@edl-idf.com et envoyer en son nom.
async function compteAdmin(supaUrl, serviceKey, userId) {
  try {
    const r = await fetch(supaUrl + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
    });
    if (!r.ok) return false;
    const u = await r.json();
    const email = String((u && (u.email || (u.user && u.user.email))) || '').toLowerCase().trim();
    return !!email && ADMIN_EMAILS.includes(email);
  } catch (_) {
    return false;
  }
}

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
    const peutExpedier = !!domaine && DOMAINES_VERIFIES.includes(domaine)
      && await compteAdmin(supaUrl, serviceKey, userId);
    return {
      nom,
      email: peutExpedier ? mail : IDENTITE_NEUTRE.email,
      replyTo: (!peutExpedier && mail && !DOMAINES_VERIFIES.includes(domaine)) ? mail : '',
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

// Vitrine publique d'un prestataire (abonné), affichée à SES agences
// (extranet) et à SES agents (espace agent) à la place d'un nom codé en
// dur : société, accroche, nom de la personne à contacter, téléphone,
// email, logo et couleur. Jamais de donnée sensible (IBAN, clés...).
export function vitrineDepuisReglages(d, supaUrl = '') {
  const r = d || {};
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const tel = txt(r.expediteurTel);
  return {
    nom: txt(r.companyName) || txt(r.expediteurNom) || txt(r.legalRaisonSociale),
    accroche: txt(r.slogan),
    contact: txt(r.userName),
    tel,
    telLien: tel.replace(/[^0-9+]/g, ''),
    email: txt(r.expediteurEmail) || txt(r.userEmail),
    logoUrl: r.logoPath && supaUrl ? supaUrl + BUCKET_LOGOS + encodeURI(String(r.logoPath)) : '',
    couleur: /^#[0-9a-fA-F]{6}$/.test(r.couleurPrimaire || '') ? r.couleurPrimaire : '',
  };
}

export async function vitrineAbonne(supaUrl, serviceKey, userId) {
  if (!userId || !supaUrl || !serviceKey) return vitrineDepuisReglages({});
  try {
    const r = await fetch(supaUrl + '/rest/v1/settings?select=data&user_id=eq.' + encodeURIComponent(userId), {
      headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey }
    });
    const rows = r.ok ? await r.json() : [];
    return vitrineDepuisReglages(rows && rows[0] && rows[0].data, supaUrl);
  } catch (_) {
    return vitrineDepuisReglages({});
  }
}
