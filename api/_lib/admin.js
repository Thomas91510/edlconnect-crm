// Liste des comptes admin, partagée par toutes les fonctions api/*.js qui en
// ont besoin (aperçu client, envoi d'emails réservé, gestion des plans...).
// Auparavant recopiée à l'identique dans 11 fichiers : une correction ou un
// ajout d'admin ne demandait qu'un seul oubli pour désynchroniser les
// contrôles d'accès entre endpoints.
export const ADMIN_EMAILS = ['contact@edl-idf.com'];
