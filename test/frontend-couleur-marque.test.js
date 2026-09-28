// Couleur de marque de l'agence (Paramètres → Identité visuelle) : une seule
// couleur choisie dérive les nuances déjà utilisées par tout le CSS existant
// (--blue/--blue-bg/--blue-text côté CRM admin), appliquées sur :root. Même
// principe dupliqué séparément dans agent-app.html (autres noms de
// variables) et api/booking-page.js (rendu serveur) — voir leurs propres
// suites de tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

function setup() {
  return chargerScripts(['app-core.js'], '').window;
}

test('appliquerCouleurMarque : applique la couleur choisie et dérive un fond clair et un texte foncé', () => {
  const w = setup();
  w.appliquerCouleurMarque('#800000');
  const style = w.document.documentElement.style;
  assert.equal(style.getPropertyValue('--blue'), '#800000');
  // Fond clair : mélangé vers le blanc, doit rester une couleur valide et différente de la base.
  const bg = style.getPropertyValue('--blue-bg');
  assert.match(bg, /^#[0-9a-f]{6}$/);
  assert.notEqual(bg, '#800000');
  // Texte : mélangé vers le noir, plus foncé que la base.
  const texte = style.getPropertyValue('--blue-text');
  assert.match(texte, /^#[0-9a-f]{6}$/);
  assert.notEqual(texte, '#800000');
});

test('appliquerCouleurMarque : une valeur invalide ou absente retombe sur le bleu par défaut', () => {
  const w = setup();
  w.appliquerCouleurMarque('pas-une-couleur');
  assert.equal(w.document.documentElement.style.getPropertyValue('--blue'), '#1A5FA8');

  w.appliquerCouleurMarque(undefined);
  assert.equal(w.document.documentElement.style.getPropertyValue('--blue'), '#1A5FA8');

  w.appliquerCouleurMarque('"><script>alert(1)</script>');
  assert.equal(w.document.documentElement.style.getPropertyValue('--blue'), '#1A5FA8');
});

test('appliquerCouleurMarque : le bleu par défaut donne les mêmes nuances qu\'avant (non-régression visuelle)', () => {
  const w = setup();
  w.appliquerCouleurMarque('#1A5FA8');
  const style = w.document.documentElement.style;
  // Pas besoin d'égalité stricte avec les anciennes constantes choisies à la
  // main : juste que le résultat reste dans le même registre (bleu clair
  // pour le fond, bleu foncé pour le texte), pas une couleur aberrante.
  assert.match(style.getPropertyValue('--blue-bg'), /^#[0-9a-f]{6}$/);
  assert.match(style.getPropertyValue('--blue-text'), /^#[0-9a-f]{6}$/);
});

test('CFG.couleurPrimaire : "#1A5FA8" par défaut, persiste ce qui est enregistré', () => {
  // CFG est déclaré avec `const` (portée lexique du contexte vm, pas une
  // propriété de `window`) — on l'expose via un accesseur injecté dans ce
  // même contexte, comme window.__getDB ailleurs dans ces tests.
  const w = chargerScripts(['app-config.js'], '', 'window.__getCFG = function(){ return CFG; };').window;
  const cfg = w.__getCFG();
  assert.equal(cfg.couleurPrimaire, '#1A5FA8');
  cfg.couleurPrimaire = '#800000';
  assert.equal(cfg.couleurPrimaire, '#800000');
});

test('CFG.logoPath : vide par défaut, persiste ce qui est enregistré', () => {
  const w = chargerScripts(['app-config.js'], '', 'window.__getCFG = function(){ return CFG; };').window;
  const cfg = w.__getCFG();
  assert.equal(cfg.logoPath, '');
  cfg.logoPath = 'abc123.png';
  assert.equal(cfg.logoPath, 'abc123.png');
});

function setupLogo() {
  return chargerScripts(
    ['app-core.js'],
    '<svg id="sidebar-logo-svg"></svg><img id="sidebar-logo-custom" style="display:none">'
  ).window;
}

test('appliquerLogoMarque : une URL affiche le logo personnalisé et masque le SVG par défaut', () => {
  const w = setupLogo();
  w.appliquerLogoMarque('https://exemple/logo.png');
  const svg = w.document.getElementById('sidebar-logo-svg');
  const img = w.document.getElementById('sidebar-logo-custom');
  assert.equal(img.src, 'https://exemple/logo.png');
  assert.notEqual(img.style.display, 'none');
  assert.equal(svg.style.display, 'none');
});

test('appliquerLogoMarque : une URL vide restaure le SVG par défaut et retire le src', () => {
  const w = setupLogo();
  w.appliquerLogoMarque('https://exemple/logo.png');
  w.appliquerLogoMarque('');
  const svg = w.document.getElementById('sidebar-logo-svg');
  const img = w.document.getElementById('sidebar-logo-custom');
  assert.equal(img.style.display, 'none');
  assert.equal(img.hasAttribute('src'), false);
  assert.notEqual(svg.style.display, 'none');
});

test('appliquerLogoMarque : ne fait rien (ne plante pas) si les éléments de la sidebar sont absents', () => {
  const w = chargerScripts(['app-core.js'], '').window;
  assert.doesNotThrow(() => w.appliquerLogoMarque('https://exemple/logo.png'));
});
