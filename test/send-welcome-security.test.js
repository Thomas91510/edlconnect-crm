// Vérifie les correctifs de sécurité sur /api/send-welcome et
// /api/send-welcome-agency :
// - send-welcome envoie toujours à l'adresse vérifiée de l'appelant, jamais
//   à une adresse fournie dans le corps (sinon relais d'email arbitraire).
// - send-welcome-agency (qui envoie à un tiers) est réservé aux comptes
//   admin ou sur un plan payant actif, jamais à un simple compte extranet.
// - companyName/contactName sont échappés avant insertion dans l'email HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handlerWelcome from '../api/send-welcome.js';
import handlerWelcomeAgency from '../api/send-welcome-agency.js';

process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetchWelcome(callerEmail) {
  const brevoBodies = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ email: callerEmail }) };
    }
    if (u.includes('api.brevo.com')) {
      brevoBodies.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [] };
  };
  return brevoBodies;
}

test('send-welcome : ignore l\'email du corps, envoie toujours au compte appelant', async () => {
  const brevoBodies = mockFetchWelcome('victime@exemple.fr');
  const res = await handlerWelcome(requete({ email: 'cible-attaquant@exemple.fr', companyName: 'Ma Société' }));
  assert.equal(res.status, 200);
  assert.equal(brevoBodies.length, 1);
  assert.equal(brevoBodies[0].to[0].email, 'victime@exemple.fr');
});

test('send-welcome : échappe companyName dans le HTML envoyé', async () => {
  const brevoBodies = mockFetchWelcome('user@exemple.fr');
  const payload = '<img src=x onerror=alert(1)>';
  await handlerWelcome(requete({ companyName: payload }));
  const html = brevoBodies[0].htmlContent;
  assert.ok(!html.includes('<img src=x'), 'le payload ne doit pas apparaitre en HTML brut');
  assert.ok(html.includes('&lt;img'), 'le payload doit apparaitre echappe');
});

function mockFetchAgency({ callerEmail, plan, status }) {
  const brevoBodies = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      return { ok: true, json: async () => ({ id: 'user-1', email: callerEmail }) };
    }
    if (u.includes('/rest/v1/user_plans')) {
      return { ok: true, json: async () => (plan ? [{ plan, status }] : []) };
    }
    if (u.includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('api.brevo.com')) {
      brevoBodies.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [] };
  };
  return brevoBodies;
}

test('send-welcome-agency : un compte sans plan payant (ex. extranet) est refusé', async () => {
  mockFetchAgency({ callerEmail: 'client-extranet@exemple.fr', plan: null });
  const res = await handlerWelcomeAgency(requete({ email: 'cible@exemple.fr', companyName: 'Agence X' }));
  assert.equal(res.status, 403);
});

test('send-welcome-agency : un compte sur plan pro actif peut envoyer', async () => {
  const brevoBodies = mockFetchAgency({ callerEmail: 'abonne@exemple.fr', plan: 'pro', status: 'active' });
  const res = await handlerWelcomeAgency(requete({ email: 'agence@exemple.fr', companyName: 'Agence X' }));
  assert.equal(res.status, 200);
  assert.equal(brevoBodies.length, 1);
});

test('send-welcome-agency : le compte admin peut toujours envoyer, même sans plan', async () => {
  const brevoBodies = mockFetchAgency({ callerEmail: 'contact@edl-idf.com', plan: null });
  const res = await handlerWelcomeAgency(requete({ email: 'agence@exemple.fr', companyName: 'Agence X' }));
  assert.equal(res.status, 200);
  assert.equal(brevoBodies.length, 1);
});

test('send-welcome-agency : échappe contactName dans le HTML envoyé', async () => {
  const brevoBodies = mockFetchAgency({ callerEmail: 'contact@edl-idf.com', plan: null });
  const payload = '<img src=x onerror=alert(1)>';
  await handlerWelcomeAgency(requete({ email: 'agence@exemple.fr', contactName: payload }));
  const html = brevoBodies[0].htmlContent;
  assert.ok(!html.includes('<img src=x'), 'le payload ne doit pas apparaitre en HTML brut');
  assert.ok(html.includes('&lt;img'), 'le payload doit apparaitre echappe');
});
