// Contrat de sous-traitance de données personnelles (article 28 du RGPD)
// entre l'éditeur de Lokentia (sous-traitant) et chaque abonné du CRM
// (responsable de traitement). Source unique : le texte affiché dans le
// CRM, l'empreinte SHA-256 enregistrée comme preuve de signature et la
// copie envoyée par email sont tous produits à partir d'ici.
//
// Toute modification du texte doit changer VERSION : chaque abonné est
// alors invité à signer la nouvelle version à sa prochaine connexion.
//
// La signature n'est demandée que lorsque l'identité légale de l'éditeur
// est complète (raison sociale + SIRET) : un contrat avec des champs vides
// n'a pas de valeur et ne doit pas être présenté à la signature.

export const VERSION = '2026-10-09';

// Identité légale de l'éditeur : valeurs ci-dessous, ou variables
// d'environnement Vercel EDITEUR_* (prioritaires) pour la compléter sans
// modifier le code.
const env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';
export const EDITEUR = Object.freeze({
  marque: 'Lokentia',
  raisonSociale: env('EDITEUR_RAISON_SOCIALE') || '',   // ex. « EDL IDF SAS » — À COMPLÉTER
  formeCapital: env('EDITEUR_FORME_CAPITAL') || '',     // ex. « SAS au capital de 1 000 € »
  siret: env('EDITEUR_SIRET') || '',                    // À COMPLÉTER
  rcs: env('EDITEUR_RCS') || '',                        // ex. « RCS Évry 123 456 789 »
  adresse: env('EDITEUR_ADRESSE') || '18 Grande Rue, 91510 Lardy',
  representant: env('EDITEUR_REPRESENTANT') || 'Thomas Langlade',
  qualite: env('EDITEUR_QUALITE') || 'Directeur Général',
  emailContact: 'contact@lokentia.fr',
});

export const contratActif = () => !!(EDITEUR.raisonSociale && EDITEUR.siret);

// Sous-traitants ultérieurs effectivement utilisés par la plateforme.
export const SOUS_TRAITANTS = Object.freeze([
  { nom: 'Supabase Inc.', role: 'Base de données, fichiers et authentification', lieu: 'Union européenne (Stockholm, Suède)', garanties: 'Hébergement UE ; DPA Supabase' },
  { nom: 'Vercel Inc.', role: 'Hébergement de l’application et exécution des fonctions serveur', lieu: 'États-Unis / réseau mondial', garanties: 'Data Privacy Framework UE–États-Unis et clauses contractuelles types' },
  { nom: 'Sendinblue SAS (Brevo)', role: 'Envoi des emails transactionnels (confirmations, rappels, demandes d’avis)', lieu: 'Union européenne (France)', garanties: 'Hébergement UE ; DPA Brevo' },
  { nom: 'Mistral AI SAS', role: 'Aide à la rédaction d’emails (uniquement lorsque l’abonné utilise cette fonction)', lieu: 'Union européenne (France)', garanties: 'Hébergement UE ; DPA Mistral AI' },
  { nom: 'Google Ireland Ltd', role: 'Copie de sauvegarde quotidienne (Google Drive)', lieu: 'Union européenne / États-Unis', garanties: 'Data Privacy Framework UE–États-Unis et clauses contractuelles types' },
]);

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function identiteEditeur() {
  const e = EDITEUR;
  const morceaux = [
    e.raisonSociale || '[raison sociale à compléter]',
    e.formeCapital,
    e.rcs,
    e.siret ? 'SIRET ' + e.siret : '[SIRET à compléter]',
    'dont le siège est situé ' + e.adresse,
    'représentée par ' + e.representant + ', ' + e.qualite,
  ].filter(Boolean);
  return esc(morceaux.join(', ')) + ', éditrice de la plateforme <strong>' + esc(e.marque) + '</strong>';
}

// Texte HTML du contrat (sans styles : le CRM et l'email l'habillent).
export function contratHtml() {
  const st = SOUS_TRAITANTS.map(s => `<tr><td>${esc(s.nom)}</td><td>${esc(s.role)}</td><td>${esc(s.lieu)}</td><td>${esc(s.garanties)}</td></tr>`).join('');
  return `
<h2>Contrat de sous-traitance de données personnelles</h2>
<p class="contrat-version">Article 28 du Règlement (UE) 2016/679 (RGPD) — version du ${esc(VERSION.split('-').reverse().join('/'))}</p>

<h3>Entre les soussignés</h3>
<p><strong>Le Client</strong>, personne morale ou entrepreneur individuel titulaire d’un compte sur la plateforme ${esc(EDITEUR.marque)}, identifié par les informations de son compte et signataire du présent contrat par voie électronique, ci-après le « <strong>Responsable de traitement</strong> » ;</p>
<p>et <strong>${identiteEditeur()}</strong>, ci-après le « <strong>Sous-traitant</strong> ».</p>

<h3>1. Objet</h3>
<p>Le présent contrat définit les conditions dans lesquelles le Sous-traitant traite, pour le compte du Responsable de traitement, les données à caractère personnel nécessaires à la fourniture du logiciel ${esc(EDITEUR.marque)} (CRM de gestion d’états des lieux, extranet des agences clientes, espace des agents, page de réservation et envois d’emails). Il complète les conditions d’utilisation de la plateforme ; en cas de contradiction sur la protection des données, il prévaut.</p>

<h3>2. Description du traitement</h3>
<ul>
  <li><strong>Nature des opérations :</strong> hébergement, enregistrement, organisation, consultation, mise à disposition des agences et agents autorisés par le Client, envoi d’emails, sauvegarde et suppression.</li>
  <li><strong>Finalités :</strong> gestion de la relation avec les agences immobilières clientes, planification et suivi des états des lieux, information des locataires, gestion des agents intervenants, prospection commerciale du Client.</li>
  <li><strong>Personnes concernées :</strong> contacts des agences clientes et prospects du Client, locataires et propriétaires, agents intervenants du Client, utilisateurs du compte du Client.</li>
  <li><strong>Données traitées :</strong> identité et coordonnées (nom, email, téléphone, adresse), adresses des biens, dates et comptes rendus de rendez-vous, rapports et documents déposés, messages échangés, et pour les agents : informations légales, coordonnées bancaires et factures. Aucune donnée sensible au sens de l’article 9 du RGPD ne doit être enregistrée.</li>
  <li><strong>Durée :</strong> celle de l’abonnement du Client, augmentée du délai de restitution et de suppression prévu à l’article 10.</li>
</ul>

<h3>3. Obligations du Sous-traitant</h3>
<p>Le Sous-traitant s’engage à :</p>
<ul>
  <li>traiter les données uniquement pour les finalités ci-dessus et sur instruction documentée du Client, constituée par l’usage qu’il fait de la plateforme et par le présent contrat ; il informe immédiatement le Client si une instruction lui paraît contraire au RGPD ;</li>
  <li>garantir la confidentialité des données et veiller à ce que les personnes autorisées à les traiter soient soumises à une obligation de confidentialité ;</li>
  <li>ne jamais utiliser les données du Client à ses propres fins, ni les vendre, ni les communiquer à un autre client de la plateforme ;</li>
  <li>cloisonner les données de chaque client : un client n’a jamais accès aux données d’un autre ;</li>
  <li>prendre en compte la protection des données dès la conception et par défaut.</li>
</ul>

<h3>4. Sous-traitance ultérieure</h3>
<p>Le Client autorise le recours aux sous-traitants ultérieurs suivants :</p>
<table class="contrat-table"><thead><tr><th>Sous-traitant</th><th>Rôle</th><th>Localisation</th><th>Garanties</th></tr></thead><tbody>${st}</tbody></table>
<p>Le Sous-traitant impose à chacun des obligations de protection au moins équivalentes à celles du présent contrat et reste responsable de leur respect. Tout ajout ou remplacement est notifié au Client par une nouvelle version du présent contrat, présentée à sa signature dans le CRM ; le Client peut s’y opposer en résiliant son abonnement.</p>

<h3>5. Transferts hors de l’Union européenne</h3>
<p>Les données de la base sont hébergées dans l’Union européenne. Lorsqu’un sous-traitant ultérieur peut y accéder depuis un pays tiers, le transfert est encadré par une décision d’adéquation (Data Privacy Framework UE–États-Unis) ou par les clauses contractuelles types de la Commission européenne.</p>

<h3>6. Sécurité</h3>
<p>Le Sous-traitant met en œuvre les mesures techniques et organisationnelles suivantes : chiffrement des échanges (HTTPS/TLS) ; accès au compte par authentification individuelle ; cloisonnement des données par compte au niveau de la base (règles d’accès par ligne) et contrôles d’accès côté serveur ; fichiers privés accessibles uniquement par liens temporaires ; clés techniques jamais exposées dans le navigateur ; sauvegarde quotidienne conservée 30 jours ; limitation du débit des formulaires publics ; tests automatisés de non-régression avant chaque mise en production.</p>

<h3>7. Droits des personnes concernées</h3>
<p>Le Client reste l’interlocuteur des personnes concernées. Le Sous-traitant l’aide, dans la mesure du possible, à répondre aux demandes d’accès, de rectification, d’effacement, d’opposition, de limitation et de portabilité, notamment grâce aux fonctions d’export et de suppression du CRM. Toute demande reçue directement par le Sous-traitant est transmise au Client sans délai.</p>

<h3>8. Violation de données</h3>
<p>Le Sous-traitant notifie au Client toute violation de données personnelles dans un délai maximal de <strong>48 heures</strong> après en avoir pris connaissance, par email à l’adresse du compte, avec les informations disponibles (nature, catégories et volume approximatif de données et de personnes concernées, conséquences probables, mesures prises ou envisagées), afin de permettre au Client de notifier, le cas échéant, l’autorité de contrôle (CNIL) et les personnes concernées.</p>

<h3>9. Assistance et documentation</h3>
<p>Le Sous-traitant aide le Client à réaliser, si nécessaire, une analyse d’impact et à consulter l’autorité de contrôle. Il met à sa disposition la documentation nécessaire pour démontrer le respect de ses obligations et permet la réalisation d’audits, au plus une fois par an, par le Client ou un auditeur indépendant tenu au secret, avec un préavis de 30 jours et aux frais du Client.</p>

<h3>10. Fin du contrat</h3>
<p>À la fin de l’abonnement, le Client peut exporter ses données depuis le CRM pendant 30 jours. À l’issue de ce délai, le Sous-traitant supprime les données du Client de la base et des fichiers ; les copies de sauvegarde sont effacées au fil de leur rotation, au plus tard 30 jours plus tard. Le Sous-traitant peut conserver les seules informations nécessaires au respect de ses obligations légales (facturation, preuve du présent contrat).</p>

<h3>11. Registre et délégué</h3>
<p>Le Sous-traitant tient un registre des traitements effectués pour le compte de ses clients. Pour toute question relative aux données personnelles : <strong>${esc(EDITEUR.emailContact)}</strong>.</p>

<h3>12. Signature électronique, droit applicable</h3>
<p>Le présent contrat est conclu par voie électronique : le Client le signe en cochant la case d’acceptation puis en cliquant sur « Signer » dans le CRM. Le Sous-traitant conserve une preuve horodatée de cette signature (identité du compte, version et empreinte du texte, date, adresse IP) et en adresse une copie au Client par email. Il est soumis au droit français ; tout litige relève des tribunaux compétents du ressort du siège du Sous-traitant.</p>
`.trim();
}

export async function empreinte(texte) {
  const octets = new TextEncoder().encode(String(texte || ''));
  const h = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
