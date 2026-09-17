// Vérifie l'autocomplétion d'adresse (API Adresse gratuite, data.gouv.fr)
// dans extranet-app.html : affichage/masquage des suggestions, et surtout
// que le code postal confirmé par une suggestion sélectionnée prime sur
// l'extraction par motif tant que l'adresse n'est pas remodifiée — c'est le
// comportement qui motive cette fonctionnalité (fiabiliser le secteur
// utilisé pour filtrer les agendas). Sans réseau réel (fetch mocké).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, '..', 'extranet-app.html');

const DOM_MINIMAL = `
  <div class="adresse-wrap">
    <input id="f-adresse">
    <div id="f-adresse-suggestions" class="adresse-suggestions"></div>
  </div>
  <select id="f-typo"><option value=""></option></select>
  <select id="f-meuble"><option value=""></option></select>
  <div id="slots-panel"></div>
  <div id="slots-loading"></div>
`;

function chargerAutocompleteAdresse() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.map(m => m[1]).find(s => s.includes('function onSaisieAdresse'));
  if (!inline) throw new Error('Script inline introuvable dans extranet-app.html');

  const dom = new JSDOM(`<!DOCTYPE html><html><body>${DOM_MINIMAL}</body></html>`, { runScripts: 'outside-only', url: 'https://app.lokentia.fr/' });
  const ctx = dom.getInternalVMContext();
  new vm.Script(`
    window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },
      getSession: () => new Promise(() => {})
    } }) };
  `, { filename: 'stub-supabase.js' }).runInContext(ctx);
  new vm.Script(inline, { filename: 'inline.js' }).runInContext(ctx);
  return dom.window;
}

test('onSaisieAdresse : requête trop courte (<3 caractères) masque les suggestions sans appeler le réseau', () => {
  const window = chargerAutocompleteAdresse();
  let appele = false;
  window.fetch = async () => { appele = true; return { ok: true, json: async () => ({ features: [] }) }; };

  window.document.getElementById('f-adresse').value = 'ab';
  window.onSaisieAdresse();

  assert.equal(appele, false);
  assert.ok(!window.document.getElementById('f-adresse-suggestions').classList.contains('show'));
});

test('rechercherAdresses : affiche les suggestions renvoyées par l\'API Adresse', async () => {
  const window = chargerAutocompleteAdresse();
  window.fetch = async (url) => {
    assert.ok(String(url).startsWith('https://api-adresse.data.gouv.fr/search/'));
    return { ok: true, json: async () => ({ features: [
      { properties: { label: '12 Rue de la Paix 91000 Évry', postcode: '91000' } },
      { properties: { label: '12 Rue de la Paix 75002 Paris', postcode: '75002' } },
    ] }) };
  };

  await window.rechercherAdresses('12 rue de la paix');

  const wrap = window.document.getElementById('f-adresse-suggestions');
  assert.ok(wrap.classList.contains('show'));
  const items = wrap.querySelectorAll('.adresse-suggestion');
  assert.equal(items.length, 2);
  assert.equal(items[0].textContent, '12 Rue de la Paix 91000 Évry');
});

test('rechercherAdresses : aucune suggestion renvoyée → masqué', async () => {
  const window = chargerAutocompleteAdresse();
  window.fetch = async () => ({ ok: true, json: async () => ({ features: [] }) });

  await window.rechercherAdresses('adresse introuvable');

  assert.ok(!window.document.getElementById('f-adresse-suggestions').classList.contains('show'));
});

test('rechercherAdresses : panne réseau → masqué silencieusement (jamais d\'exception)', async () => {
  const window = chargerAutocompleteAdresse();
  window.fetch = async () => { throw new Error('panne réseau'); };

  await assert.doesNotReject(() => window.rechercherAdresses('12 rue de la paix'));
  assert.ok(!window.document.getElementById('f-adresse-suggestions').classList.contains('show'));
});

test('choisirSuggestionAdresse : remplit le champ et le code postal confirmé prime sur l\'extraction par motif', async () => {
  const window = chargerAutocompleteAdresse();
  window.document.getElementById('f-typo').value = ''; // f-typo est vide dans l'option par défaut mais on force une valeur non vide juste après
  const typoEl = window.document.createElement('option');
  typoEl.value = 'T1'; typoEl.textContent = 'T1';
  window.document.getElementById('f-typo').appendChild(typoEl);
  window.document.getElementById('f-typo').value = 'T1';
  const meubleEl = window.document.createElement('option');
  meubleEl.value = 'Nu'; meubleEl.textContent = 'Nu';
  window.document.getElementById('f-meuble').appendChild(meubleEl);
  window.document.getElementById('f-meuble').value = 'Nu';

  let urlAppelee = null;
  window.fetch = async (url) => { urlAppelee = url; return { ok: true, json: async () => ({ configured: false }) }; };

  // L'adresse en texte contient un autre code postal (92100) que celui de la
  // suggestion sélectionnée (91000) : c'est la valeur confirmée qui doit
  // l'emporter, pas l'extraction par motif sur le texte affiché.
  window.choisirSuggestionAdresse({ properties: { label: '12 Rue de la Paix, 91000 Évry (ex. 92100)', postcode: '91000' } });
  // choisirSuggestionAdresse déclenche chargerCreneauxSiPossible(false), qui
  // est asynchrone : on laisse le microtask/timer courant se dérouler.
  await new Promise(r => setTimeout(r, 0));

  assert.equal(window.document.getElementById('f-adresse').value, '12 Rue de la Paix, 91000 Évry (ex. 92100)');
  assert.ok(urlAppelee, 'chargerCreneauxSiPossible aurait dû appeler fetch');
  assert.ok(String(urlAppelee).includes('cp=91000'), `attendu cp=91000 dans l'URL, obtenu : ${urlAppelee}`);
});

test('une nouvelle frappe après sélection invalide le code postal confirmé', async () => {
  const window = chargerAutocompleteAdresse();
  const typoEl = window.document.createElement('option');
  typoEl.value = 'T1'; typoEl.textContent = 'T1';
  window.document.getElementById('f-typo').appendChild(typoEl);
  window.document.getElementById('f-typo').value = 'T1';
  const meubleEl = window.document.createElement('option');
  meubleEl.value = 'Nu'; meubleEl.textContent = 'Nu';
  window.document.getElementById('f-meuble').appendChild(meubleEl);
  window.document.getElementById('f-meuble').value = 'Nu';

  window.fetch = async () => ({ ok: true, json: async () => ({ features: [] }) });
  window.choisirSuggestionAdresse({ properties: { label: '12 Rue de la Paix, 91000 Évry', postcode: '91000' } });

  // Le client retape ensuite une adresse différente, sans resélectionner de suggestion.
  window.document.getElementById('f-adresse').value = '5 Rue de Rivoli 75004 Paris';
  window.onSaisieAdresse();

  let urlAppelee = null;
  window.fetch = async (url) => { urlAppelee = url; return { ok: true, json: async () => ({ configured: false }) }; };
  window.chargerCreneauxSiPossible();
  await new Promise(r => setTimeout(r, 0));

  // Doit refléter le NOUVEAU texte (75004), pas l'ancien code postal confirmé (91000).
  assert.ok(String(urlAppelee).includes('cp=75004'), `attendu cp=75004 dans l'URL, obtenu : ${urlAppelee}`);
});
