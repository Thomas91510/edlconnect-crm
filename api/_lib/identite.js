// Identité d'envoi partagée par toutes les fonctions api/*.js qui envoient
// un email pour le compte d'un abonné (nom affiché, adresse d'expédition
// si un domaine vérifié est configuré, sinon repli neutre Lokentia +
// reply-to vers l'abonné).
//
// Recopiée à l'identique dans 6 fichiers avant ce module (booking-request,
// confirm-rdv, reminder-rdv, edouard-cron, send-welcome-agency,
// notify-order-status) : centralisée ici pour qu'une correction future
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
  notifEmail: 'contact@edl-idf.com'
};

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
      signature: (d.expediteurSignature || '').trim(),
      partenaire: (d.expediteurPartenaire || '').trim(),
      notifEmail: mail || IDENTITE_NEUTRE.notifEmail
    };
  } catch (e) {
    return IDENTITE_NEUTRE;
  }
}
