// Vérifie la construction du JWT signé (compte de service Google) et
// l'échange contre un jeton d'accès — sans réseau réel (fetch mocké) ni
// vraie clé Google : une paire RSA de test suffit, la signature n'étant
// jamais vérifiée côté mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { obtenirJetonAccesGoogle } from '../api/_lib/google-service-account.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function base64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

test('construit un JWT (iss, scope, aud) correct et récupère le jeton renvoyé', async () => {
  let requete = null;
  global.fetch = async (url, opts) => {
    requete = { url, opts };
    return { ok: true, json: async () => ({ access_token: 'jeton-test-123' }) };
  };

  const token = await obtenirJetonAccesGoogle({ email: 'compte-service@exemple.iam.gserviceaccount.com', privateKey });

  assert.equal(token, 'jeton-test-123');
  assert.equal(requete.url, 'https://oauth2.googleapis.com/token');
  assert.equal(requete.opts.method, 'POST');

  const params = new URLSearchParams(requete.opts.body);
  assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const jwt = params.get('assertion');
  const [enTeteB64, revendicationsB64, signatureB64] = jwt.split('.');
  assert.deepEqual(base64urlDecode(enTeteB64), { alg: 'RS256', typ: 'JWT' });
  const revendications = base64urlDecode(revendicationsB64);
  assert.equal(revendications.iss, 'compte-service@exemple.iam.gserviceaccount.com');
  assert.equal(revendications.scope, 'https://www.googleapis.com/auth/calendar.freebusy');
  assert.equal(revendications.aud, 'https://oauth2.googleapis.com/token');
  assert.ok(revendications.exp > revendications.iat);
  assert.ok(signatureB64.length > 0);
});

test('scope explicite pris en compte', async () => {
  let requete = null;
  global.fetch = async (url, opts) => { requete = opts; return { ok: true, json: async () => ({ access_token: 'x' }) }; };

  await obtenirJetonAccesGoogle({ email: 'a@exemple.fr', privateKey, scope: 'https://www.googleapis.com/auth/calendar.readonly' });

  const jwt = new URLSearchParams(requete.body).get('assertion');
  const revendications = base64urlDecode(jwt.split('.')[1]);
  assert.equal(revendications.scope, 'https://www.googleapis.com/auth/calendar.readonly');
});

test('échec Google (réponse non OK) : erreur explicite plutôt qu\'un jeton undefined silencieux', async () => {
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'invalid_grant' });

  await assert.rejects(
    () => obtenirJetonAccesGoogle({ email: 'a@exemple.fr', privateKey }),
    /401/
  );
});
