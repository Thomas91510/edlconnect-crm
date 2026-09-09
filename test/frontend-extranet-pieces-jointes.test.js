// Verrouille la logique des pièces jointes du formulaire "Nouvelle commande"
// de l'extranet (extranet-app.html) : dépôt immédiat à la sélection, rendu de
// la liste (icônes ⏳/📎/⚠️, échappement anti-XSS), suppression, et remise à
// zéro entre deux ouvertures du formulaire. Même mécanisme que le formulaire
// public /booking (api/upload-booking-attachment.js), mais ce fichier est une
// page autonome : on en extrait le <script> inline et on l'exécute dans un
// contexte jsdom avec un DOM minimal reproduisant #attachments-input /
// #attachments-list, en stubant le SDK Supabase et fetch().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, '..', 'extranet-app.html');

function chargerExtranetScript(fetchImpl) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline = scripts.map(m => m[1]).find(s => s.includes('function onAttachmentsSelected'));
  if (!inline) throw new Error('Script inline introuvable dans extranet-app.html');

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="attachments-list"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'https://app.lokentia.fr/extranet-app'
  });
  const ctx = dom.getInternalVMContext();
  new vm.Script(`
    window.supabase = { createClient: () => ({ auth: {
      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },
      getSession: () => new Promise(() => {})
    } }) };
    window.alert = () => {};
  `, { filename: 'stub-supabase.js' }).runInContext(ctx);
  dom.window.fetch = fetchImpl;
  new vm.Script(inline, { filename: 'extranet-app-inline.js' }).runInContext(ctx);
  return dom.window;
}

function fakeFile(nom) {
  return { name: nom };
}

test('onAttachmentsSelected : dépose un fichier et affiche l\'icône 📎 une fois envoyé', async () => {
  const w = chargerExtranetScript(async () => ({
    ok: true,
    json: async () => ({ success: true, path: 'sub_1/a.pdf', nom: 'diagnostic.pdf' })
  }));
  await w.onAttachmentsSelected({ files: [fakeFile('diagnostic.pdf')], value: 'x' });
  const html = w.document.getElementById('attachments-list').innerHTML;
  assert.ok(html.includes('diagnostic.pdf'));
  assert.ok(html.includes('📎'));
  assert.ok(!html.includes('⏳'));
});

test('onAttachmentsSelected : affiche ⚠️ et le message d\'erreur si le dépôt échoue', async () => {
  const w = chargerExtranetScript(async () => ({
    ok: false,
    json: async () => ({ error: 'Fichier trop volumineux' })
  }));
  await w.onAttachmentsSelected({ files: [fakeFile('trop-gros.pdf')], value: 'x' });
  const html = w.document.getElementById('attachments-list').innerHTML;
  assert.ok(html.includes('⚠️'));
  assert.ok(html.includes('Fichier trop volumineux'));
});

test('onAttachmentsSelected : erreur réseau (fetch qui rejette) marque le fichier en erreur', async () => {
  const w = chargerExtranetScript(async () => { throw new Error('offline'); });
  await w.onAttachmentsSelected({ files: [fakeFile('a.pdf')], value: 'x' });
  const html = w.document.getElementById('attachments-list').innerHTML;
  assert.ok(html.includes('⚠️'));
  assert.ok(html.includes('Erreur réseau'));
});

test('renderAttachments : échappe le nom de fichier (anti-XSS)', async () => {
  const w = chargerExtranetScript(async () => ({
    ok: true,
    json: async () => ({ success: true, path: 'sub_1/a.pdf' })
  }));
  await w.onAttachmentsSelected({ files: [fakeFile('<img src=x onerror=alert(1)>.pdf')], value: 'x' });
  const wrap = w.document.getElementById('attachments-list');
  assert.equal(wrap.querySelectorAll('img').length, 0, 'aucune balise <img> ne doit être créée dans le DOM');
  assert.ok(wrap.innerHTML.includes('&lt;img'), 'le texte visible doit être échappé');
});

test('removeAttachment : retire le fichier de la liste affichée', async () => {
  const w = chargerExtranetScript(async () => ({
    ok: true,
    json: async () => ({ success: true, path: 'sub_1/a.pdf' })
  }));
  await w.onAttachmentsSelected({ files: [fakeFile('a.pdf')], value: 'x' });
  w.removeAttachment(0);
  const html = w.document.getElementById('attachments-list').innerHTML;
  assert.equal(html, '');
});

test('resetAttachments : vide la liste et le jeton (rouvrir le formulaire ne garde pas les fichiers précédents)', async () => {
  const w = chargerExtranetScript(async () => ({
    ok: true,
    json: async () => ({ success: true, path: 'sub_1/a.pdf' })
  }));
  await w.onAttachmentsSelected({ files: [fakeFile('a.pdf')], value: 'x' });
  w.resetAttachments();
  assert.equal(w.document.getElementById('attachments-list').innerHTML, '');
  await w.onAttachmentsSelected({ files: [fakeFile('b.pdf')], value: 'x' });
  const html = w.document.getElementById('attachments-list').innerHTML;
  assert.ok(html.includes('b.pdf'));
  assert.ok(!html.includes('a.pdf'), 'un nouveau jeton doit être généré après reset');
});

test('onAttachmentsSelected : refuse au-delà de 10 fichiers par soumission', async () => {
  const w = chargerExtranetScript(async () => ({
    ok: true,
    json: async () => ({ success: true, path: 'sub_1/x.pdf' })
  }));
  const fichiers = Array.from({ length: 12 }, (_, i) => fakeFile(`f${i}.pdf`));
  await w.onAttachmentsSelected({ files: fichiers, value: 'x' });
  const html = w.document.getElementById('attachments-list').innerHTML;
  const count = (html.match(/📎/g) || []).length;
  assert.equal(count, 10, 'au plus 10 fichiers doivent être acceptés par soumission');
});
