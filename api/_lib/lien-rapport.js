// Lien permanent vers un rapport Edouard trop lourd pour Supabase Storage
// (limite de 50 Mo par fichier sur l'offre actuelle) : au lieu de stocker le
// PDF, on enregistre un lien vers /api/rapport-edouard qui redemande à
// Edouard une URL de téléchargement fraîche à chaque clic. Le lien est signé
// (HMAC-SHA256, clé serveur) : impossible d'en fabriquer un pour un autre
// état des lieux.

export const BASE_APP = 'https://app.lokentia.fr';
// Au-delà, on ne télécharge même pas le PDF (limite Storage ~50 Mo).
export const TAILLE_MAX_STOCKAGE = 45 * 1024 * 1024;

async function hmac(secret, texte) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(texte));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

export const signerRapport = (situationId, secret) => hmac(secret, 'rapport-edouard:' + situationId);

export async function lienRapportEdouard(situationId, secret, base = BASE_APP) {
  return `${base}/api/rapport-edouard?s=${encodeURIComponent(situationId)}&t=${await signerRapport(situationId, secret)}`;
}

export async function signatureValide(situationId, t, secret) {
  if (!situationId || !t || !secret) return false;
  const attendu = await signerRapport(situationId, secret);
  if (attendu.length !== String(t).length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ String(t).charCodeAt(i);
  return diff === 0;
}
