// Vérifie les 4 correctifs "Modéré" de l'audit sécurité :
// - escapeIlike neutralise les jokers % et _ (recherche ilike détournée en
//   recherche large plutôt qu'une correspondance exacte insensible à la casse).
// - send-email.js plafonne to+cc+bcc ensemble, pas seulement "to".
// - origineAutorisee n'accepte plus n'importe quel sous-domaine *.vercel.app.
// - confirm-rdv.js est réservé aux comptes admin ou sur plan payant actif.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeIlike } from '../api/_lib/ilike.js';
import { origineAutorisee } from '../api/_lib/cors.js';
import handlerSendEmail from '../api/send-email.js';
import handlerConfirmRdv from '../api/confirm-rdv.js';

test('escapeIlike échappe %, _ et \\', () => {
  assert.equal(escapeIlike('a%b_c\\d'), 'a\\%b\\_c\\\\d');
  assert.equal(escapeIlike('contact@exemple.fr'), 'contact@exemple.fr');
  assert.equal(escapeIlike(null), '');
});

test('origineAutorisee : rejette un projet Vercel tiers non lié à ce projet', () => {
  const req = { headers: new Headers({ origin: 'https://attaquant-quelconque.vercel.app' }) };
  assert.equal(origineAutorisee(req), 'https://app.lokentia.fr');
});

test('origineAutorisee : accepte un preview du projet (nom attendu)', () => {
  const req = { headers: new Headers({ origin: 'https://edlconnect-crm-git-main-thomas91510s-projects.vercel.app' }) };
  assert.equal(origineAutorisee(req), 'https://edlconnect-crm-git-main-thomas91510s-projects.vercel.app');
});

test('origineAutorisee : accepte toujours la prod', () => {
  const req = { headers: new Headers({ origin: 'https://app.lokentia.fr' }) };
  assert.equal(origineAutorisee(req), 'https://app.lokentia.fr');
});

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

test('send-email : refuse to+cc+bcc > 50 même si "to" seul est sous la limite', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'contact@edl-idf.com' }) };
    return { ok: true, json: async () => [] };
  };
  const res = await handlerSendEmail(requete({
    to: ['a@x.fr'],
    cc: Array.from({ length: 30 }, (_, i) => `cc${i}@x.fr`),
    bcc: Array.from({ length: 25 }, (_, i) => `bcc${i}@x.fr`),
    subject: 'Test',
    htmlContent: '<p>hi</p>'
  }));
  assert.equal(res.status, 400);
});

// Vérifie le correctif "Élevée" de l'audit sécurité du 12/09 : send-email.js
// transmettait le champ "sender" fourni par le client tel quel à Brevo,
// permettant à n'importe quel abonné payant d'usurper un nom/domaine
// d'expéditeur arbitraire via le compte Brevo partagé de la plateforme.
test('send-email : ignore le sender fourni par le client, utilise l\'identité vérifiée de l\'abonné', async () => {
  let brevoBody = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [{ data: { expediteurNom: 'EDL IDF', expediteurEmail: 'contact@edl-idf.com' } }] };
    }
    if (u.includes('api.brevo.com')) {
      brevoBody = JSON.parse(opts.body);
      return { ok: true, status: 201, json: async () => ({ messageId: 'fake' }) };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handlerSendEmail(requete({
    sender: { name: 'Banque de France', email: 'securite@banque-de-france.fr' }, // usurpation tentée
    to: [{ email: 'victime@x.fr' }],
    subject: 'Test',
    htmlContent: '<p>hi</p>'
  }));
  assert.equal(res.status, 201);
  assert.equal(brevoBody.sender.email, 'contact@edl-idf.com');
  assert.notEqual(brevoBody.sender.email, 'securite@banque-de-france.fr');
});

test('send-email : abonné sans domaine vérifié → expéditeur neutre + reply-to vers lui', async () => {
  let brevoBody = null;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u2', email: 'agence@gmail.com' }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [{ plan: 'starter', status: 'active' }] };
    if (u.includes('/rest/v1/settings')) {
      return { ok: true, json: async () => [{ data: { expediteurNom: 'Agence X', expediteurEmail: 'agence@gmail.com' } }] };
    }
    if (u.includes('api.brevo.com')) {
      brevoBody = JSON.parse(opts.body);
      return { ok: true, status: 201, json: async () => ({ messageId: 'fake' }) };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handlerSendEmail(requete({
    sender: { name: 'X', email: 'nimportequoi@x.fr' },
    to: [{ email: 'client@x.fr' }],
    subject: 'Test',
    htmlContent: '<p>hi</p>'
  }));
  assert.equal(res.status, 201);
  assert.equal(brevoBody.sender.email, 'contact@lokentia.fr');
  assert.equal(brevoBody.replyTo.email, 'agence@gmail.com');
});

test('confirm-rdv : refuse un compte sans plan payant (ex. extranet)', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'client-extranet@exemple.fr' }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  };
  const res = await handlerConfirmRdv(requete({ mission: { type: 'EDL entrant', adresse: '1 rue Test' }, agentEmail: 'a@x.fr' }));
  assert.equal(res.status, 403);
});

test('confirm-rdv : plafonne le nombre de locataires (max 10)', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'contact@edl-idf.com' }) };
    return { ok: true, json: async () => [] };
  };
  const locataires = Array.from({ length: 11 }, (_, i) => ({ email: `loc${i}@x.fr`, nom: 'X' }));
  const res = await handlerConfirmRdv(requete({ mission: { type: 'EDL entrant', adresse: '1 rue Test' }, agentEmail: 'a@x.fr', locataires }));
  assert.equal(res.status, 400);
});

// Vérifie le correctif "Élevée" de l'audit sécurité du 12/09 : confirm-rdv.js
// acceptait n'importe quel id de mission sans vérifier qu'elle appartient à
// l'appelant, permettant à un abonné payant de forger l'id d'une mission
// d'un autre abonné pour lui envoyer un email de "confirmation" à son insu.
test('confirm-rdv : refuse un id de mission appartenant à un autre abonné', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/missions') && u.includes('id=eq.mission-dun-autre')) {
      return { ok: true, json: async () => [{ id: 'mission-dun-autre', user_id: 'u2-un-autre-abonne' }] };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handlerConfirmRdv(requete({ mission: { id: 'mission-dun-autre', type: 'EDL entrant', adresse: '1 rue Test' }, agentEmail: 'a@x.fr' }));
  assert.equal(res.status, 403);
});

test('confirm-rdv : accepte un id de mission appartenant bien à l\'appelant', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/missions') && u.includes('id=eq.ma-propre-mission')) {
      return { ok: true, json: async () => [{ id: 'ma-propre-mission', user_id: 'u1' }] };
    }
    return { ok: true, json: async () => [] };
  };
  const res = await handlerConfirmRdv(requete({ mission: { id: 'ma-propre-mission', type: 'EDL entrant', adresse: '1 rue Test' }, agentEmail: 'a@x.fr' }));
  assert.equal(res.status, 200);
});

test('confirm-rdv : laisse passer un id qui ne correspond à aucune mission existante (cas normal : confirmation directe depuis une réservation, la mission est créée après)', async () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'contact@edl-idf.com' }) };
    if (u.includes('/rest/v1/missions')) return { ok: true, json: async () => [] }; // aucune mission avec cet id
    return { ok: true, json: async () => [] };
  };
  const res = await handlerConfirmRdv(requete({ mission: { id: '__resa__resa1', type: 'EDL entrant', adresse: '1 rue Test' }, agentEmail: 'a@x.fr' }));
  assert.equal(res.status, 200);
});
