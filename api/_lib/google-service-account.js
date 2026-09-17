// Authentification "compte de service" Google (JWT RS256 signé via
// crypto.subtle, compatible runtime Edge — pas besoin de la librairie
// googleapis, plus lourde et pensée pour Node classique) — utilisée par
// agenda-disponibilites.js pour lire le libre/occupé de plusieurs agendas
// collaborateurs sans OAuth interactif ni Cal.com. Le compte de service doit
// être ajouté en "Voir uniquement le libre/occupé" sur chaque agenda
// collaborateur : aucune installation ni action récurrente de leur côté.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function base64url(donnees) {
  const octets = typeof donnees === 'string' ? new TextEncoder().encode(donnees) : new Uint8Array(donnees);
  let brut = '';
  for (const o of octets) brut += String.fromCharCode(o);
  return btoa(brut).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemVersArrayBuffer(pem) {
  const corps = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const brut = atob(corps);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets.buffer;
}

async function signerJWT(email, privateKeyPem, scope) {
  const maintenant = Math.floor(Date.now() / 1000);
  const enTete = { alg: 'RS256', typ: 'JWT' };
  const revendications = {
    iss: email,
    scope,
    aud: TOKEN_URL,
    iat: maintenant,
    exp: maintenant + 3600,
  };
  const donneesSignees = `${base64url(JSON.stringify(enTete))}.${base64url(JSON.stringify(revendications))}`;

  const cle = await crypto.subtle.importKey(
    'pkcs8',
    pemVersArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(donneesSignees));

  return `${donneesSignees}.${base64url(signature)}`;
}

// Échange un compte de service (email + clé privée PEM) contre un jeton
// d'accès OAuth2 de courte durée (1h). Scope par défaut : lecture seule du
// libre/occupé, le minimum nécessaire (cohérent avec le partage d'agenda
// "Voir uniquement le libre/occupé" demandé à chaque collaborateur).
export async function obtenirJetonAccesGoogle({ email, privateKey, scope = 'https://www.googleapis.com/auth/calendar.freebusy' }) {
  const jwt = await signerJWT(email, privateKey, scope);
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const corps = await resp.text().catch(() => '');
    throw new Error(`Échec authentification Google (compte de service) : ${resp.status} ${corps.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.access_token;
}
