// Onglet Plateforme : interrupteur « Accès » et bouton de suppression par
// compte ; rien de tel sur le compte admin ; un compte désactivé s'affiche
// comme tel avec l'interrupteur éteint ; les agences sont listées à part et
// ne comptent pas dans les chiffres.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const IDS = ['adm-total', 'adm-active', 'adm-pro', 'adm-free', 'adm-mrr', 'adm-arr', 'adm-conversion', 'adm-new-month', 'adm-plan-chart', 'adm-monthly-chart'];
const HTML = `<div id="notif"></div>${IDS.map(id => `<div id="${id}"></div>`).join('')}<table><tbody id="admin-tbody"></tbody></table><table><tbody id="admin-agences-tbody"></tbody></table>`;

const LIGNES = [
  { user_id: 'a1', email: 'contact@edl-idf.com', plan: 'pro', status: 'active', created_at: '2026-06-01', type: 'abonne' },
  { user_id: 'u1', email: 'actif@x.fr', plan: 'free', status: 'active', created_at: '2026-07-01', type: 'abonne' },
  { user_id: 'u2', email: 'coupe@x.fr', plan: 'starter', status: 'disabled', created_at: '2026-08-01', type: 'abonne' },
  { user_id: 'g1', email: 'agence@immo.fr', plan: null, status: 'active', created_at: '2026-09-01', type: 'agence', sans_plan: true },
];

async function charger() {
  const { window } = chargerScripts(['app-cloud.js', 'app-settings.js'], HTML, `
    window._EXTRANET_MODE = true;
    _currentUser = { id: 'a1', email: 'contact@edl-idf.com' };
    supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } };
    window.fetch = async (url) => {
      if (String(url) !== '/api/admin-comptes') throw new Error('URL inattendue ' + url);
      return { ok: true, json: async () => ({ comptes: ${JSON.stringify(LIGNES)} }) };
    };
  `);
  await window.loadAdminData();
  return window;
}
async function rendu() {
  const window = await charger();
  return [...window.document.querySelectorAll('#admin-tbody tr')];
}

test('compte admin : ni interrupteur ni suppression', async () => {
  const [admin] = await rendu();
  assert.equal(admin.querySelector('input[type=checkbox]'), null);
  assert.equal(admin.querySelector('[onclick^="supprimerCompteAdmin"]'), null);
});

test('compte actif : interrupteur allumé et bouton de suppression', async () => {
  const [, actif] = await rendu();
  assert.equal(actif.querySelector('input[type=checkbox]').checked, true);
  assert.ok(actif.querySelector('[onclick^="supprimerCompteAdmin"]'));
});

test('compte désactivé : interrupteur éteint, statut « désactivé »', async () => {
  const [, , coupe] = await rendu();
  assert.equal(coupe.querySelector('input[type=checkbox]').checked, false);
  assert.match(coupe.textContent, /désactivé/);
});

test('agences : listées à part, hors des chiffres des abonnés', async () => {
  const w = await charger();
  const abonnes = w.document.getElementById('admin-tbody').textContent;
  assert.doesNotMatch(abonnes, /agence@immo\.fr/);
  assert.match(w.document.getElementById('admin-agences-tbody').textContent, /agence@immo\.fr/);
  // admin et agence exclus : 2 abonnés (actif + coupé), 1 payant (starter)
  assert.equal(w.document.getElementById('adm-total').textContent, '2');
  assert.equal(w.document.getElementById('adm-free').textContent, '1');
});
