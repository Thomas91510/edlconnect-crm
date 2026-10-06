// Génère js/app-remuneration.js (script classique pour index.html) à partir
// de api/_lib/agent-remuneration.js (module ES du serveur), pour que le CRM
// calcule les rémunérations EXACTEMENT comme le serveur, sans dupliquer la
// logique à la main. Le test test/remuneration-navigateur-synchro.test.js
// échoue si le fichier généré n'est plus à jour.
//   Usage : node scripts/generer-remuneration-navigateur.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function genererSource() {
  const kpi = fs.readFileSync(path.join(racine, 'api/_lib/agent-kpi.js'), 'utf8');
  const lib = fs.readFileSync(path.join(racine, 'api/_lib/agent-remuneration.js'), 'utf8');
  // Seules categorieEdl et statTypologie sont utilisées depuis agent-kpi.js.
  const extraire = (nom) => {
    const debut = kpi.indexOf('export function ' + nom);
    const fin = kpi.indexOf('\n}\n', debut) + 3;
    return kpi.slice(debut, fin).replace('export function', 'function');
  };
  const corps = lib
    .replace(/^import .*$/m, extraire('categorieEdl') + '\n' + extraire('statTypologie'))
    .replace(/^export (const|function)/gm, '$1');
  return `// === Lokentia CRM — app-remuneration.js ===
// FICHIER GÉNÉRÉ par scripts/generer-remuneration-navigateur.mjs à partir de
// api/_lib/agent-remuneration.js — ne pas modifier à la main.
// Exposé en window.Remuneration (dans une fonction pour ne pas polluer les
// noms globaux partagés par les autres scripts du CRM).
(function(){
${corps}
window.Remuneration = { calculerRemuneration, normaliserReference, montantMission, etatMission, zoneMission, LIBELLES_TYPE, ZONES, GRILLE_CONTRAT_2026 };
})();
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(path.join(racine, 'js/app-remuneration.js'), genererSource());
  console.log('js/app-remuneration.js régénéré');
}
