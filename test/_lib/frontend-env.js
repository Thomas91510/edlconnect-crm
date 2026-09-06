// Harnais minimal pour tester les scripts navigateur classiques de js/*.js
// (pas de modules ES, pas de bundler dans ce projet — chargés tels quels via
// <script src> dans index.html). On les exécute avec jsdom pour disposer
// d'un vrai `document`/`window`, sans dépendre d'un navigateur réel comme le
// fait la vérification Playwright ponctuelle.
//
// Usage :
//   const { window } = chargerScripts(['app-core.js', 'app-agenda.js'], '<div id="x"></div>');
//   window.esc('<b>')
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_JS = path.join(__dirname, '..', '..', 'js');

// Chaque fichier js/*.js suppose que app-core.js a déjà défini DB/UI/esc/...
// avant lui (même ordre que les <script> dans index.html) : on le charge en
// premier par défaut, sauf s'il est explicitement demandé sinon.
export function chargerScripts(fichiers, htmlBody = '') {
  // Sans "url" explicite, jsdom part de about:blank dont location.origin est
  // null — cassant pour tout code qui résout une URL relative (new
  // URL(u, window.location.origin)), comme le fait le CRM en production.
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${htmlBody}</body></html>`, {
    runScripts: 'outside-only',
    url: 'https://app.lokentia.fr/'
  });
  const ctx = dom.getInternalVMContext();

  const liste = fichiers.includes('app-core.js') ? fichiers : ['app-core.js', ...fichiers];
  for (const nom of liste) {
    const source = fs.readFileSync(path.join(RACINE_JS, nom), 'utf8');
    new vm.Script(source, { filename: nom }).runInContext(ctx);
  }
  return { window: dom.window, document: dom.window.document };
}
