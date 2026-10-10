// Onglet Plateforme : interrupteur « Accès » et bouton de suppression par
// compte ; rien de tel sur le compte admin ; un compte désactivé s'affiche
// comme tel avec l'interrupteur éteint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const IDS = ['adm-total', 'adm-active', 'adm-pro', 'adm-free', 'adm-mrr', 'adm-arr', 'adm-conversion', 'adm-new-month', 'adm-plan-chart', 'adm-monthly-chart'];
const HTML = `<div id="notif"></div>${IDS.map(id => `<div id="${id}"></div>`).join('')}<table><tbody id="admin-tbody"></tbody></table>`;

const LIGNES = [
  { user_id: 'a1', email: 'contact@edl-idf.com', plan: 'pro', status: 'active', created_at: '2026-06-01' },
  { user_id: 'u1', email: 'actif@x.fr', plan: 'free', status: 'active', created_at: '2026-07-01' },
  { user_id: 'u2', email: 'coupe@x.fr', plan: 'starter', status: 'disabled', created_at: '2026-08-01' },
];

async function rendu() {
  const { window } = chargerScripts(['app-cloud.js', 'app-settings.js'], HTML, `
    window._EXTRANET_MODE = true;
    _currentUser = { id: 'a1', email: 'contact@edl-idf.com' };
    supabaseClient = { from: () => ({ select: () => ({ order: async () => ({ data: ${JSON.stringify(LIGNES)}, error: null }) }) }) };
  `);
  await window.loadAdminData();
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
