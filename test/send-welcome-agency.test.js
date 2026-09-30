// Vérifie /api/send-welcome-agency : email envoyé à une agence partenaire
// invitée par N'IMPORTE QUEL abonné payant (pas seulement l'admin) — le
// corps de l'email doit donc refléter l'identité RÉELLE de l'abonné
// (IDENT.nom), jamais "EDL IDF" en dur. Régression cible : l'expéditeur
// utilisait déjà identiteAbonne(), mais tout le corps de l'email (bannière,
// sujet, signature, pied de page) restait codé en dur "EDL IDF Expert en
// État des Lieux" / "18 Grande Rue, 91510 Lardy" — trouvé en poursuivant
// l'audit après la PR qui avait corrigé les autres emails (RDV, IA
// Composer, Modèles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/send-welcome-agency.js';

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
    json: async () => body,
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

test('send-welcome-agency : le corps de l\'email utilise le nom réel de l\'abonné, jamais "EDL IDF" en dur', async () => {
  const brevoAppels = [];
  global.fetch = mockFetch({ companyName: 'ImmoCheck EDL', brevoAppels });

  const res = await handler(requete({ email: 'partenaire@exemple.fr', companyName: 'Agence Test', contactName: 'Marie' }));

  assert.equal(res.status, 200);
  assert.equal(brevoAppels.length, 1);
  const payload = brevoAppels[0];
  assert.match(payload.subject, /ImmoCheck EDL/);
  assert.doesNotMatch(payload.subject, /EDL IDF/);
  assert.match(payload.htmlContent, /ImmoCheck EDL/);
  assert.doesNotMatch(payload.htmlContent, /EDL IDF/);
  assert.doesNotMatch(payload.htmlContent, /Lardy/);
  assert.doesNotMatch(payload.htmlContent, /Directeur Général/);
});
