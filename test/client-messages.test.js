// Vérifie /api/client-messages : list/send/markRead, scoping par email
// (avec aperçu admin), et notification Slack best-effort à l'envoi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
const { default: handler } = await import('../api/client-messages.js');

const ADMIN_EMAIL = 'contact@edl-idf.com';
const CLIENT_EMAIL = 'client@exemple.fr';
const AUTRE_EMAIL = 'agence@exemple.fr';

const fetchOriginal = global.fetch;
const envSlackOriginal = process.env.SLACK_WEBHOOK_URL;
test.after(() => { global.fetch = fetchOriginal; process.env.SLACK_WEBHOOK_URL = envSlackOriginal; });

function requete(callerEmail, body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body,
  };
}

function mockFetch({ callerEmail, contactRows, patchSpy, slackSpy }) {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: callerEmail }) };
    if (u.includes('/rest/v1/contacts') && (!opts || opts.method !== 'PATCH')) {
      return { ok: true, json: async () => contactRows ?? [] };
    }
    if (opts && opts.method === 'PATCH') {
      if (patchSpy) patchSpy(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    if (slackSpy && u === process.env.SLACK_WEBHOOK_URL) {
      slackSpy(JSON.parse(opts.body));
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  };
}

test('client-messages : list renvoie les messages triés par date', async () => {
  mockFetch({
    callerEmail: CLIENT_EMAIL,
    contactRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, messages: [
      { sender: 'expert', body: 'B', createdAt: '2026-06-02T00:00:00Z' },
      { sender: 'client', body: 'A', createdAt: '2026-06-01T00:00:00Z' },
    ] } }]
  });
  const resp = await handler(requete(CLIENT_EMAIL, { action: 'list' }));
  const msgs = await resp.json();
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].body, 'A');
  assert.equal(msgs[1].body, 'B');
});

test('client-messages : send refuse un message vide', async () => {
  mockFetch({ callerEmail: CLIENT_EMAIL, contactRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, messages: [] } }] });
  const resp = await handler(requete(CLIENT_EMAIL, { action: 'send', body: '   ' }));
  assert.equal(resp.status, 400);
});

test('client-messages : send ajoute le message et notifie Slack', async () => {
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/xyz';
  let patched = null;
  let slacked = null;
  mockFetch({
    callerEmail: CLIENT_EMAIL,
    contactRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, entreprise: 'Century 21 Évry', messages: [] } }],
    patchSpy: (b) => { patched = b; },
    slackSpy: (b) => { slacked = b; },
  });
  const resp = await handler(requete(CLIENT_EMAIL, { action: 'send', body: 'Bonjour, une question sur mon dossier' }));
  const out = await resp.json();
  assert.equal(out.success, true);
  assert.equal(patched.data.messages.length, 1);
  assert.equal(patched.data.messages[0].sender, 'client');
  assert.equal(patched.data.messages[0].lu, false);
  assert.ok(slacked && slacked.text.includes(CLIENT_EMAIL));
  assert.ok(slacked.text.includes('Century 21 Évry'), 'le nom de l\'agence doit aider à identifier l\'expéditeur dans le canal partagé');
});

test('client-messages : send notifie Slack avec l\'email seul si l\'agence n\'est pas renseignée', async () => {
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/xyz';
  let slacked = null;
  mockFetch({
    callerEmail: CLIENT_EMAIL,
    contactRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, messages: [] } }],
    patchSpy: () => {},
    slackSpy: (b) => { slacked = b; },
  });
  await handler(requete(CLIENT_EMAIL, { action: 'send', body: 'Bonjour' }));
  assert.ok(slacked && slacked.text.includes(CLIENT_EMAIL));
});

test('client-messages : markRead ne touche que les messages "expert"', async () => {
  let patched = null;
  mockFetch({
    callerEmail: CLIENT_EMAIL,
    contactRows: [{ id: 'c1', data: { email: CLIENT_EMAIL, messages: [
      { sender: 'expert', body: 'B', createdAt: '2026-06-02T00:00:00Z', lu: false },
      { sender: 'client', body: 'A', createdAt: '2026-06-01T00:00:00Z', lu: false },
    ] } }],
    patchSpy: (b) => { patched = b; },
  });
  const resp = await handler(requete(CLIENT_EMAIL, { action: 'markRead' }));
  const out = await resp.json();
  assert.equal(out.success, true);
  const expertMsg = patched.data.messages.find(m => m.sender === 'expert');
  const clientMsg = patched.data.messages.find(m => m.sender === 'client');
  assert.equal(expertMsg.lu, true);
  assert.equal(clientMsg.lu, false);
});

test('client-messages : un non-admin ne peut pas lire les messages d\'un autre email', async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: AUTRE_EMAIL }) };
    return { ok: true, json: async () => [] };
  };
  await handler(requete(AUTRE_EMAIL, { action: 'list', clientEmail: 'victime@exemple.fr' }));
  const urlContacts = urls.find(u => u.includes('/rest/v1/contacts'));
  assert.ok(urlContacts.includes(encodeURIComponent(AUTRE_EMAIL)));
  assert.ok(!urlContacts.includes('victime'));
});

test('client-messages : un admin peut consulter un autre email via clientEmail', async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: ADMIN_EMAIL }) };
    return { ok: true, json: async () => [] };
  };
  await handler(requete(ADMIN_EMAIL, { action: 'list', clientEmail: CLIENT_EMAIL }));
  const urlContacts = urls.find(u => u.includes('/rest/v1/contacts'));
  assert.ok(urlContacts.includes(encodeURIComponent(CLIENT_EMAIL)));
});
