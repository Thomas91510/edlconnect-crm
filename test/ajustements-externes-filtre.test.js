// Le panneau "Ajustement externe (clients hors CRM)" du dashboard peut vite
// accumuler des dizaines de lignes (plusieurs partenaires par mois), rendant
// la liste plate difficile à parcourir. Ajoute un menu déroulant pour filtrer
// par mois (js/app-missions.js). Zone à risque : le filtre doit rafraîchir
// uniquement la liste (#ajustements-liste), pas tout le panneau de stats —
// sinon une saisie en cours dans le formulaire d'ajout juste en-dessous
// serait perdue à chaque changement de filtre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <select id="aj-filtre-mois"></select>
  <div id="ajustements-liste"></div>
`;

function setup(ajustementsExternes) {
  const codeSetup = `
    DB.ajustementsExternes = ${JSON.stringify(ajustementsExternes)};
  `;
  return chargerScripts(['app-missions.js'], HTML, codeSetup).window;
}

test('_ajustementsListeHtml("all") : affiche tous les ajustements, triés du mois le plus récent au plus ancien', () => {
  const w = setup([
    { id: 'aj1', mois: '2026-05', nbEdl: 3, ca: 500 },
    { id: 'aj2', mois: '2026-07', nbEdl: 10, ca: 625 },
    { id: 'aj3', mois: '2026-06', nbEdl: 10, ca: 630, note: 'EDL 77' }
  ]);
  const html = w._ajustementsListeHtml('all');
  const posJuillet = html.indexOf('juillet 2026');
  const posJuin = html.indexOf('juin 2026');
  const posMai = html.indexOf('mai 2026');
  assert.ok(posJuillet >= 0 && posJuin > posJuillet && posMai > posJuin, 'doit être trié du plus récent au plus ancien');
  assert.ok(html.includes('EDL 77'));
});

test('_ajustementsListeHtml(mois) : ne garde que les entrées du mois demandé', () => {
  const w = setup([
    { id: 'aj1', mois: '2026-05', nbEdl: 1, ca: 163, note: 'Immo Gestion' },
    { id: 'aj2', mois: '2026-05', nbEdl: 3, ca: 504, note: 'PAP' },
    { id: 'aj3', mois: '2026-04', nbEdl: 5, ca: 330, note: 'EDL 77' }
  ]);
  const html = w._ajustementsListeHtml('2026-05');
  assert.ok(html.includes('Immo Gestion'));
  assert.ok(html.includes('PAP'));
  assert.ok(!html.includes('EDL 77'), 'les entrées d\'un autre mois ne doivent pas apparaître');
});

test('_ajustementsListeHtml : message vide quand aucun ajustement n\'existe pour le mois filtré', () => {
  const w = setup([{ id: 'aj1', mois: '2026-04', nbEdl: 5, ca: 330 }]);
  const html = w._ajustementsListeHtml('2026-01');
  assert.ok(html.includes('Aucun ajustement enregistré'));
});

test('filtrerAjustementsListe : ne met à jour que #ajustements-liste, selon la sélection du menu déroulant', () => {
  const w = setup([
    { id: 'aj1', mois: '2026-05', nbEdl: 1, ca: 163, note: 'Immo Gestion' },
    { id: 'aj2', mois: '2026-04', nbEdl: 5, ca: 330, note: 'EDL 77' }
  ]);
  w.document.getElementById('aj-filtre-mois').innerHTML = `
    <option value="all">Tous les mois</option>
    <option value="2026-05">Mai 2026</option>
    <option value="2026-04">Avril 2026</option>
  `;
  w.document.getElementById('aj-filtre-mois').value = '2026-04';
  w.filtrerAjustementsListe();
  const liste = w.document.getElementById('ajustements-liste').innerHTML;
  assert.ok(liste.includes('EDL 77'));
  assert.ok(!liste.includes('Immo Gestion'));
});
