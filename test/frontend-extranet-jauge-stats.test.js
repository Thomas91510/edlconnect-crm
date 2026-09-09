// Verrouille la logique pure de extranet-app.html : la jauge de progression
// (jaugeHTML) et la catégorisation des types d'EDL pour les statistiques
// (categorieEdl). Le fichier est une page autonome (pas un js/*.js chargé
// par index.html) : on en extrait le <script> inline et on l'exécute dans
// un contexte jsdom, en stubant le SDK Supabase (chargé par CDN, jamais
// utilisé par ces deux fonctions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, '..', 'extranet-app.html');

function chargerExtranetScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.map(m => m[1]).find(s => s.includes('function jaugeHTML'));
  if (!inline) throw new Error('Script inline introuvable dans extranet-app.html');

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://app.lokentia.fr/extranet-app'
  });
  const ctx = dom.getInternalVMContext();
  // Stub minimal du SDK Supabase (chargé par CDN en production) : les
  // fonctions testées ici ne l'utilisent jamais, mais le script les définit
  // au même niveau que `sb = supabase.createClient(...)`, qui appelle
  // aussitôt sb.auth.getSession().then(...) — cette promesse ne doit jamais
  // se résoudre ici (le DOM minimal du test n'a pas #login-screen etc., et
  // on ne teste pas ce flux), sans quoi le callback plante de façon
  // asynchrone après la fin du test.
  new vm.Script(`
    window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },
      getSession: () => new Promise(() => {})
    } }) };
  `, { filename: 'stub-supabase.js' }).runInContext(ctx);
  new vm.Script(inline, { filename: 'extranet-app-inline.js' }).runInContext(ctx);
  return dom.window;
}

test('categorieEdl : classe les 4 types réels du CRM', () => {
  const w = chargerExtranetScript();
  assert.equal(w.categorieEdl('EDL entrant'), 'entrant');
  assert.equal(w.categorieEdl('EDL sortant'), 'sortant');
  assert.equal(w.categorieEdl('EDL Sortant / Entrant'), 'simultane');
  assert.equal(w.categorieEdl('Pré-état des lieux'), 'autre');
});

test('jaugeHTML : "en_attente" affiche Demande acquise et Confirmé en cours', () => {
  const w = chargerExtranetScript();
  const html = w.jaugeHTML('en_attente');
  assert.match(html, /progress-dot done">✓<\/div><div class="progress-label done">Demande/);
  assert.match(html, /progress-dot current">.*<\/div><div class="progress-label current">Confirmé/);
  assert.ok(!html.includes('progress-dot done">✓</div><div class="progress-label done">Rapport'));
});

test('jaugeHTML : "confirmee" affiche Demande+Confirmé acquis, Rapport en cours', () => {
  const w = chargerExtranetScript();
  const html = w.jaugeHTML('confirmee');
  assert.match(html, /Demande<\/div>/);
  const doneCount = (html.match(/progress-dot done"/g) || []).length;
  assert.equal(doneCount, 2, 'Demande et Confirmé doivent être acquis');
  assert.match(html, /progress-dot current">.*<\/div><div class="progress-label current">Rapport/);
});

test('jaugeHTML : "rapport_dispo" (terminal) marque les 3 étapes acquises — jamais "en cours"', () => {
  const w = chargerExtranetScript();
  const html = w.jaugeHTML('rapport_dispo');
  const doneCount = (html.match(/progress-dot done"/g) || []).length;
  assert.equal(doneCount, 3, 'les 3 étapes doivent afficher le check, y compris Rapport');
  assert.ok(!html.includes('progress-dot current'), 'un dossier terminé ne doit plus montrer d\'étape "en cours"');
});

test('urlSure : rejette les schémas dangereux, accepte http(s)', () => {
  const w = chargerExtranetScript();
  assert.equal(w.urlSure('javascript:alert(1)'), '');
  assert.equal(w.urlSure(''), '');
  assert.equal(w.urlSure('https://example.com/rapport.pdf'), 'https://example.com/rapport.pdf');
});
