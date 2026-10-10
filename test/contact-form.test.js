// Vérifie /api/contact-form : formulaire de contact public du site vitrine
// Lokentia (pas de compte, pas de multi-tenant) — validation des champs,
// piège à bots, et envoi Brevo vers la boîte de Thomas. Régression cible :
// le destinataire était nommé "ImmoCheck EDL" (une vieille erreur de
// copier-coller sans rapport, cf. historique git), corrigé en "Lokentia"
// pour matcher l'expéditeur ("Lokentia — Site web").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/contact-form.js';
import { _reinitialiserPourTests } from '../api/_lib/rate-limit.js';

process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });
test.beforeEach(() => { _reinitialiserPourTests(); });

function requete(body, ip) {
  return {
    method: 'POST',
    headers: new Headers(ip ? { 'x-forwarded-for': ip } : {}),
    json: async () => body,
  };
}

function mockBrevoOk(appels) {
  return async (url, opts) => {
    if (String(url).includes('api.brevo.com')) {
      if (appels) appels.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

test('contact-form : refuse sans champs requis', async () => {
  global.fetch = mockBrevoOk();
  const resp = await handler(requete({ nom: '', email: '', message: '' }, '1.1.1.1'));
  assert.equal(resp.status, 400);
});

test('contact-form : refuse un email invalide', async () => {
  global.fetch = mockBrevoOk();
  const resp = await handler(requete({ nom: 'Jean', email: 'pas-un-email', message: 'Bonjour' }, '1.1.1.2'));
  assert.equal(resp.status, 400);
});

test('contact-form : piège à bots — le champ caché "site" rempli renvoie succès sans rien envoyer', async () => {
  let appele = false;
  global.fetch = async (url) => { if (String(url).includes('api.brevo.com')) appele = true; return { ok: true, json: async () => ({}) }; };
  const resp = await handler(requete({ nom: 'Bot', email: 'bot@exemple.fr', message: 'x', site: 'http://spam.fr' }, '1.1.1.3'));
  const body = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(body.success, true);
  assert.equal(appele, false);
});

test('contact-form : envoie bien vers la boîte Lokentia, jamais "ImmoCheck EDL" (vieille erreur corrigée)', async () => {
  const appels = [];
  global.fetch = mockBrevoOk(appels);
  const resp = await handler(requete({ nom: 'Jean Dupont', email: 'jean@exemple.fr', sujet: 'Question', message: 'Bonjour, un devis svp.' }, '1.1.1.4'));
  assert.equal(resp.status, 200);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].to[0].email, 'contact@lokentia.fr');
  assert.equal(appels[0].to[0].name, 'Lokentia');
});

test('contact-form : au-delà de 5 messages depuis la même IP en 1h, renvoie 429', async () => {
  const appels = [];
  global.fetch = mockBrevoOk(appels);
  for (let i = 0; i < 5; i++) {
    const resp = await handler(requete({ nom: 'Jean', email: 'jean@exemple.fr', message: 'msg ' + i }, '9.9.9.9'));
    assert.equal(resp.status, 200);
  }
  const resp6 = await handler(requete({ nom: 'Jean', email: 'jean@exemple.fr', message: 'msg 6' }, '9.9.9.9'));
  assert.equal(resp6.status, 429);
  assert.equal(appels.length, 5, 'le 6e appel ne doit jamais atteindre Brevo');
});

test('contact-form : la limite de débit est bien PAR IP, une autre IP n\'est pas affectée', async () => {
  const appels = [];
  global.fetch = mockBrevoOk(appels);
  for (let i = 0; i < 5; i++) {
    await handler(requete({ nom: 'Jean', email: 'jean@exemple.fr', message: 'msg ' + i }, '8.8.8.8'));
  }
  const respAutreIp = await handler(requete({ nom: 'Marie', email: 'marie@exemple.fr', message: 'bonjour' }, '7.7.7.7'));
  assert.equal(respAutreIp.status, 200);
});

function preflight(origin) {
  return { method: 'OPTIONS', headers: new Headers(origin ? { origin } : {}), json: async () => ({}) };
}

test('contact-form : CORS autorise le site vitrine (lokentia.fr, www, previews edlconnect-landing)', async () => {
  for (const o of ['https://lokentia.fr', 'https://www.lokentia.fr', 'https://edlconnect-landing-git-ma-branche-equipe.vercel.app', 'https://app.lokentia.fr']) {
    const resp = await handler(preflight(o));
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), o);
  }
});

test('contact-form : CORS ne reflète jamais une origine tierce', async () => {
  for (const o of ['https://evil.fr', 'https://lokentia.fr.evil.fr', 'https://autre-projet.vercel.app', 'https://edlconnect-landing.evil.app']) {
    const resp = await handler(preflight(o));
    assert.equal(resp.headers.get('Access-Control-Allow-Origin'), 'https://app.lokentia.fr');
  }
});
