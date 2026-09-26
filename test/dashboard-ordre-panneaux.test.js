// Thomas voulait que le bloc "Pipeline commercial / Dernières missions /
// Contacts récents / Prochains RDV" (les 4 widgets de vue d'ensemble)
// apparaisse AVANT le détail "Volume et répartition des états des lieux"
// (qui contient "Ajustement externe / CA extérieur" tout en bas) —
// auparavant renderStatsMissions() insérait ce détail avant les widgets.
// Ce positionnement n'a lieu qu'à la toute première création du bloc
// (js/app-missions.js, renderStatsMissions) : les appels suivants se
// contentent de réécrire son contenu sans le redéplacer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

const HTML = `
  <div class="view" id="view-dashboard">
    <div>
      <div id="dash-pipeline"></div>
    </div>
  </div>
`;

test('renderStatsMissions : insère le détail des stats APRÈS le bloc des widgets (Pipeline commercial...), pas avant', () => {
  const codeSetup = `
    DB.missions = [];
    DB.ajustementsExternes = [];
  `;
  const { window: w } = chargerScripts(['app-contacts.js', 'app-missions.js'], HTML, codeSetup);
  w.renderStatsMissions();

  const vue = w.document.getElementById('view-dashboard');
  const blocWidgets = w.document.getElementById('dash-pipeline').closest('#view-dashboard > div');
  const blocStats = w.document.getElementById('dash-stats-edl');

  assert.ok(blocStats, 'le bloc de stats doit avoir été créé');
  const enfants = Array.from(vue.children);
  assert.ok(enfants.indexOf(blocWidgets) < enfants.indexOf(blocStats), 'les widgets doivent précéder le détail des stats dans le DOM');
});
