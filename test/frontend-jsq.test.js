// jsq() : une valeur insérée dans onclick="f('…')" ne peut jamais sortir de
// sa chaîne JS, même si elle contient des apostrophes (que le navigateur
// décode depuis &#39; avant d'exécuter l'attribut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

test('jsq : la valeur ressort intacte et n’exécute rien', () => {
  const { window } = chargerScripts(['app-core.js']);
  const valeurs = [
    "x');window.__pirate=1;//",
    "sub_1/a\\');window.__pirate=1;//",
    "o'neil@exemple.fr",
    'ligne1\nligne2',
    '"><img src=x onerror="window.__pirate=1">',
  ];
  for (const v of valeurs) {
    const div = window.document.createElement('div');
    div.innerHTML = `<button onclick="window.__recu='${window.jsq(v)}'">x</button>`;
    window.document.body.appendChild(div);
    // jsdom (runScripts: outside-only) n'exécute pas les attributs : on
    // évalue le code tel que le navigateur le verrait, entités décodées.
    window.eval(div.querySelector('button').getAttribute('onclick'));
    assert.equal(window.__recu, v, v);
    assert.equal(window.__pirate, undefined, v);
    div.remove();
  }
});
