// Bug remonté par Thomas après la brique 4 (fiche contact éditable en
// direct partout, plus de bouton "Enregistrer") : une édition (ex. Statut,
// Notes) restait invisible après un rechargement de la page. Cause : la
// synchronisation Supabase est debounced de 1.5s (syncDirtyToSupabase,
// app-core.js) — sans bouton "Enregistrer" pour naturellement laisser
// passer ce délai avant de fermer/recharger, rien n'empêchait de perdre
// une modification faite juste avant de quitter l'onglet. Fix : vider la
// file d'attente immédiatement dès que l'onglet devient invisible
// (visibilitychange), sans attendre le debounce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `<div id="sync-dot"></div><span id="sync-text"></span>`;

// supabaseClient est un `let` du contexte vm (pas une propriété de window,
// cf. test/_lib/frontend-env.js) : le mock doit être injecté dans ce même
// contexte via codeSetup, pas assigné depuis l'extérieur après coup.
function setup(contacts, { supaReady = true } = {}) {
  const codeSetup = `
    _supaReady = ${supaReady};
    _supaSyncing = false;
    _currentUser = { id: 'u1' };
    DB.contacts = ${JSON.stringify(contacts)};
    window.__pushCalls = [];
    supabaseClient = {
      from: function(table){
        return {
          upsert: async function(rows){
            window.__pushCalls.push({ table: table, rows: rows });
            return { error: null };
          }
        };
      }
    };
  `;
  return chargerScripts(['app-cloud.js'], HTML, codeSetup).window;
}

function cacherOnglet(w) {
  Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
  w.document.dispatchEvent(new w.Event('visibilitychange'));
}

test('visibilitychange (onglet caché) déclenche un push Supabase immédiat, sans attendre le debounce de 1.5s', async () => {
  const w = setup([{ id: 'c1', entreprise: 'Terminus' }]);

  cacherOnglet(w);
  // _pousserVersSupabase est asynchrone (await sur upsert) : laisser une
  // tâche macrotask s'exécuter, bien en-dessous des 1.5s du debounce normal.
  await new Promise(r => setTimeout(r, 20));

  assert.equal(w.__pushCalls.length, 1, 'la synchro doit être partie immédiatement au lieu d\'attendre le debounce');
  assert.equal(w.__pushCalls[0].rows[0].id, 'c1');
});

test('visibilitychange annule le debounce en attente (pas de double envoi 1.5s plus tard)', async () => {
  const w = setup([{ id: 'c1', entreprise: 'Terminus' }]);

  w.syncDirtyToSupabase(); // programme le push debounced normal (1.5s)
  cacherOnglet(w); // doit annuler ce timer et pousser tout de suite à la place
  await new Promise(r => setTimeout(r, 20));
  assert.equal(w.__pushCalls.length, 1, 'un seul push doit partir (le flush immédiat), pas le debounce original en plus');
});

test('visibilitychange ne fait rien si Supabase n\'est pas prêt (mode localStorage seul)', async () => {
  const w = setup([{ id: 'c1', entreprise: 'Terminus' }], { supaReady: false });

  cacherOnglet(w);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(w.__pushCalls.length, 0, 'aucune synchro tant que Supabase n\'est pas prêt');
});
