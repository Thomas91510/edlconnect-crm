// Authentifie un appel venant d'un workflow GitHub Actions du dépôt, sans
// secret partagé : le workflow demande à GitHub un jeton OIDC (JWT signé
// RS256 par token.actions.githubusercontent.com) et l'envoie en Bearer. On
// vérifie la signature avec les clés publiques de GitHub, puis l'émetteur,
// l'audience, le dépôt, la branche et l'expiration.

export const EMETTEUR_GITHUB = 'https://token.actions.githubusercontent.com';
export const DEPOT_AUTORISE = 'Thomas91510/edlconnect-crm';
export const BRANCHE_AUTORISEE = 'refs/heads/main';

const b64urlEnOctets = (s) => {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const b64urlEnJson = (s) => JSON.parse(new TextDecoder().decode(b64urlEnOctets(s)));

let _cleCache = { at: 0, keys: null };
async function clesGithub(fetchFn) {
  if (_cleCache.keys && Date.now() - _cleCache.at < 3600_000) return _cleCache.keys;
  const r = await fetchFn(EMETTEUR_GITHUB + '/.well-known/jwks');
  if (!r.ok) return [];
  const d = await r.json();
  _cleCache = { at: Date.now(), keys: (d && d.keys) || [] };
  return _cleCache.keys;
}
export function _viderCacheCles() { _cleCache = { at: 0, keys: null }; }

// Renvoie les revendications du jeton si tout est valide, sinon null.
export async function verifierJetonGithub(jeton, audience, { fetchFn = fetch, maintenant = Date.now() } = {}) {
  try {
    const parts = String(jeton || '').split('.');
    if (parts.length !== 3) return null;
    const entete = b64urlEnJson(parts[0]);
    if (entete.alg !== 'RS256' || !entete.kid) return null;
    const jwk = (await clesGithub(fetchFn)).find(k => k.kid === entete.kid);
    if (!jwk) return null;
    const cle = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, b64urlEnOctets(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const c = b64urlEnJson(parts[1]);
    const t = Math.floor(maintenant / 1000);
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (c.iss !== EMETTEUR_GITHUB || !aud.includes(audience)) return null;
    if (c.repository !== DEPOT_AUTORISE || c.ref !== BRANCHE_AUTORISEE) return null;
    if (!(c.exp > t) || (c.nbf && c.nbf > t + 60)) return null;
    return c;
  } catch (_) {
    return null;
  }
}
