// Vérifie que la notification Slack d'une nouvelle réservation (api/booking-request.js)
// inclut le téléphone du locataire, en plus de son nom.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// SUPABASE_URL/SERVICE_KEY et BREVO_API_KEY sont lus comme constantes de
// module au chargement : les laisser absents ici désactive volontairement
// l'écriture Supabase et les emails Brevo (tous deux gardés par
// "if (SUPABASE_SERVICE_KEY && ...)"/"if (BREVO_KEY)"), pour isoler le test
// sur la seule notification Slack, sans avoir à mocker ces deux services.
process.env.DEFAULT_OWNER_ID = 'owner-test';
process.env.SLACK_OWNER_ID = 'owner-test';
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.test/webhook';
const { default: handler } = await import('../api/booking-request.js');

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return { method: 'POST', headers: new Headers(), json: async () => body };
}

test('booking-request : le message Slack inclut le téléphone du locataire', async () => {
  let slackBody = null;
  global.fetch = async (url, opts) => {
    if (String(url) === process.env.SLACK_WEBHOOK_URL) {
      slackBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const res = await handler(requete({
    agence: 'Immo Gestion Era',
    contact: 'Jean Dupont',
    email: 'agence@exemple.fr',
    typeEdl: 'EDL entrant',
    adresse: '10 Résidence du Parc',
    dateSouhaitee: '2026-09-08',
    heure: '09h30',
    locataire: { nom: 'Bardel', tel: '0695104367' }
  }));

  assert.equal(res.status, 200);
  assert.ok(slackBody, 'la notification Slack aurait dû partir');
  assert.match(slackBody.text, /👤 Locataire: Bardel/);
  assert.match(slackBody.text, /📱 Téléphone: 0695104367/);
});

test('booking-request : téléphone absent affiche "—" plutôt que de casser le message', async () => {
  let slackBody = null;
  global.fetch = async (url, opts) => {
    if (String(url) === process.env.SLACK_WEBHOOK_URL) {
      slackBody = JSON.parse(opts.body);
    }
    return { ok: true, json: async () => ({}) };
  };

  await handler(requete({
    agence: 'Immo Gestion Era',
    contact: 'Jean Dupont',
    email: 'agence@exemple.fr',
    typeEdl: 'EDL entrant',
    adresse: '10 Résidence du Parc',
    dateSouhaitee: '2026-09-08',
    locataire: { nom: 'Bardel' }
  }));

  assert.ok(slackBody);
  assert.match(slackBody.text, /📱 Téléphone: —/);
});
