// Relève horaire GitHub Actions : jeton OIDC signé par GitHub, vérifié sans
// secret partagé (api/_lib/github-oidc.js). Clés RSA générées pour le test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifierJetonGithub, _viderCacheCles, EMETTEUR_GITHUB } from '../api/_lib/github-oidc.js';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const paire = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', paire.publicKey)), kid: 'k1' };
const fetchFn = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const T = 1_800_000_000;

async function jeton(revendications, cle = paire.privateKey) {
  const e = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const c = b64url(JSON.stringify({ iss: EMETTEUR_GITHUB, aud: 'aud-test', repository: 'Thomas91510/edlconnect-crm', ref: 'refs/heads/main', exp: T + 300, nbf: T - 10, ...revendications }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(e + '.' + c));
  return e + '.' + c + '.' + b64url(sig);
}
const verifier = (j, aud = 'aud-test') => { _viderCacheCles(); return verifierJetonGithub(j, aud, { fetchFn, maintenant: T * 1000 }); };

test('jeton du dépôt, branche main, bonne audience : accepté', async () => {
  const c = await verifier(await jeton({}));
  assert.equal(c.repository, 'Thomas91510/edlconnect-crm');
});

test('refusé : autre dépôt, autre branche, autre audience, expiré, signature falsifiée', async () => {
  assert.equal(await verifier(await jeton({ repository: 'pirate/fork' })), null);
  assert.equal(await verifier(await jeton({ ref: 'refs/heads/beta' })), null);
  assert.equal(await verifier(await jeton({}), 'autre'), null);
  assert.equal(await verifier(await jeton({ exp: T - 1 })), null);
  const autre = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  assert.equal(await verifier(await jeton({}, autre.privateKey)), null);
  assert.equal(await verifier('pas.un.jeton'), null);
});
