// api/confirm-rdv.js : le bandeau en haut des emails de confirmation de RDV
// (agent + les 3 variantes locataire) était le texte "EDL IDF Expert en Etat
// des Lieux" codé en dur, identique pour TOUS les abonnés — alors que ces
// emails partent vers les vrais locataires et agences de N'IMPORTE QUEL
// abonné du CRM (remonté en auditant le code après le bug de la signature
// email figée sur EDL IDF). Ce test vérifie seulement le point corrigé :
// le bandeau utilise l'identité réelle de l'abonné (IDENT.nom), jamais un
// texte figé — pas une suite de tests complète pour ce fichier (aucune
// n'existait avant, hors périmètre de ce correctif).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/confirm-rdv.js';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';

const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

function requete(body) {
  return {
    method: 'POST',
    headers: new Headers({ authorization: 'Bearer test-token' }),
    json: async () => body
  };
}

function mockFetch({ companyName, brevoAppels }) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u1', email: 'agence@immocheck-edl.com' }) };
    if (u.includes('/rest/v1/user_plans')) return { ok: true, json: async () => [{ plan: 'pro', status: 'active' }] };
    if (u.includes('/rest/v1/settings')) return { ok: true, json: async () => [{ data: { companyName } }] };
    if (u.includes('api.brevo.com')) {
      const payload = JSON.parse(opts.body);
      brevoAppels.push(payload);
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => [] };
  };
}

test('confirm-rdv : le bandeau de l\'email agent utilise le nom réel de l\'abonné, jamais "EDL IDF" en dur', async () => {
  const brevoAppels = [];
  global.fetch = mockFetch({ companyName: 'ImmoCheck EDL', brevoAppels });

  const res = await handler(requete({
    mission: { type: 'EDL entrant', adresse: '1 rue Test', bienType: 'Appartement' },
    agentEmail: 'agence@test.fr',
    envoyerAgence: true,
    envoyerLocataires: false
  }));

  assert.equal(res.status, 200);
  assert.equal(brevoAppels.length, 1);
  const html = brevoAppels[0].htmlContent;
  assert.match(html, /ImmoCheck EDL/);
  assert.doesNotMatch(html, /EDL IDF/);
});

test('confirm-rdv : le bandeau de l\'email locataire utilise aussi le nom réel de l\'abonné', async () => {
  const brevoAppels = [];
  global.fetch = mockFetch({ companyName: 'ImmoCheck EDL', brevoAppels });

  const res = await handler(requete({
    mission: { type: 'EDL entrant', adresse: '1 rue Test', bienType: 'Appartement' },
    locataireEmail: 'locataire@test.fr',
    locataireNom: 'Martin',
    envoyerAgence: false,
    envoyerLocataires: true
  }));

  assert.equal(res.status, 200);
  assert.equal(brevoAppels.length, 1);
  const html = brevoAppels[0].htmlContent;
  assert.match(html, /ImmoCheck EDL/);
  assert.doesNotMatch(html, /EDL IDF/);
});
