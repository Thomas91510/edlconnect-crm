// Vérifie extraireCodePostal() : extrait un code postal français depuis
// l'adresse en texte libre saisie par le client, pour la sectorisation des
// agendas côté agenda-disponibilites.js (voir agents-calendriers.test.js
// pour la logique de correspondance secteur/code postal elle-même). Testé
// via extranet-app.html ; api/booking-page.js contient une copie identique
// de cette même fonction (même regex, même comportement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, '..', 'extranet-app.html');

function chargerExtraireCodePostal() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.map(m => m[1]).find(s => s.includes('function extraireCodePostal'));
  if (!inline) throw new Error('Script inline introuvable dans extranet-app.html');

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', url: 'https://app.lokentia.fr/' });
  const ctx = dom.getInternalVMContext();
  new vm.Script(`
    window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },
      getSession: () => new Promise(() => {})
    } }) };
  `, { filename: 'stub-supabase.js' }).runInContext(ctx);
  new vm.Script(inline, { filename: 'inline.js' }).runInContext(ctx);
  return dom.window.extraireCodePostal;
}

test('extraireCodePostal : trouve un code postal à 5 chiffres dans l\'adresse', () => {
  const fn = chargerExtraireCodePostal();
  assert.equal(fn('12 rue de la Paix, 91000 Évry'), '91000');
  assert.equal(fn('3 avenue Foch 75018 Paris'), '75018');
});

test('extraireCodePostal : chaîne vide si aucun code postal reconnaissable', () => {
  const fn = chargerExtraireCodePostal();
  assert.equal(fn('12 rue de la Paix'), '');
  assert.equal(fn(''), '');
  assert.equal(fn(null), '');
  assert.equal(fn(undefined), '');
});

test('extraireCodePostal : ignore un nombre de 5 chiffres qui n\'est pas isolé (ex. numéro de téléphone)', () => {
  const fn = chargerExtraireCodePostal();
  assert.equal(fn('123456 rue Test'), ''); // 6 chiffres collés : pas un code postal isolé
});
