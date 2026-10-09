// Ouverture du CRM : une erreur de chargement depuis Supabase ne doit jamais
// autoriser l'envoi de la copie locale (qui écraserait des données plus
// récentes) ; seul un cloud réellement vide le permet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

function preparer(reponse) {
  const { window } = chargerScripts(['app-core.js', 'app-cloud.js']);
  window.eval(`_supaReady = true; _currentUser = { id: 'u1' };`);
  const requete = { select(){ return this; }, eq(){ return this; }, order(){ return this; }, range(){ return Promise.resolve(reponse); } };
  window.eval('supabaseClient = undefined');
  window.__client = { from: () => requete };
  window.eval('supabaseClient = window.__client');
  return window;
}

test('erreur de chargement : pas de feu vert pour écraser le cloud', async () => {
  const w = preparer({ data: null, error: { message: 'JWT expired' } });
  assert.equal(await w.eval('loadFromSupabase()'), false);
  assert.equal(w.eval('_cloudVideConfirme'), false);
});

test('cloud vide sans erreur : vraie première connexion', async () => {
  const w = preparer({ data: [], error: null });
  assert.equal(await w.eval('loadFromSupabase()'), false);
  assert.equal(w.eval('_cloudVideConfirme'), true);
});
