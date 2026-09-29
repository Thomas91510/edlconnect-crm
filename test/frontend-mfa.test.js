// Double authentification (Paramètres → Sécurité, réservée au compte admin ;
// écran de vérification au login pour quiconque a un facteur TOTP vérifié).
// Le "réservé au compte admin" n'est PAS un rôle codé en dur côté connexion :
// Supabase n'exige un second facteur (aal2) qu'aux comptes ayant réellement
// activé un facteur TOTP — c'est mfaChallengeRequis() qui matérialise cette
// règle, testée ici indépendamment de qui a le droit de voir le bouton
// d'activation dans Paramètres (ça, c'est juste de l'affichage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargerScripts } from './_lib/frontend-env.js';

// Un objet construit à l'intérieur du contexte vm (ex. l'argument capturé
// d'un appel supabaseClient.auth.mfa.*) n'est pas reference-equal à un
// littéral construit dans ce fichier (realms différents) : assert.deepEqual
// échoue alors avec "same structure but are not reference-equal". On
// normalise via ce fichier's propre JSON (celui du realm externe) avant de
// comparer — même parade que dans test/frontend-fiche-contact.test.js.
function versSimple(v) { return JSON.parse(JSON.stringify(v)); }

const HTML = `
  <div id="notif"></div>
  <div id="auth-error" class="auth-error"></div>
  <div id="auth-success" class="auth-success"></div>
  <button class="auth-tab active"></button>
  <button class="auth-tab"></button>
  <div id="auth-login"></div>
  <div id="auth-signup" style="display:none"></div>
  <div id="auth-mfa" style="display:none">
    <input id="mfa-code">
    <button id="mfa-verify-btn">Vérifier</button>
  </div>

  <div id="securite-section" style="display:none">
    <span id="mfa-statut">—</span>
    <div id="mfa-zone-inactive"></div>
    <div id="mfa-zone-activee" style="display:none"></div>
    <div id="mfa-zone-enrolement" style="display:none">
      <img id="mfa-qr">
      <code id="mfa-secret"></code>
      <div id="mfa-enrol-erreur" class="auth-error"></div>
      <input id="mfa-enrol-code">
      <button id="mfa-enrol-confirmer-btn">Confirmer</button>
    </div>
  </div>
`;

function setup(mfaMock, extra = '') {
  const codeSetup = `
    window._EXTRANET_MODE = true;
    supabaseClient = { auth: { mfa: ${mfaMock}, signOut: async function(){ window.__signedOut = true; return { error: null }; } } };
    ${extra}
  `;
  return chargerScripts(['app-cloud.js', 'app-settings.js'], HTML, codeSetup).window;
}

// ─── mfaChallengeRequis ─────────────────────────────────────
test('mfaChallengeRequis : renvoie null quand le compte n\'a pas de facteur (aal1 -> aal1)', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }; },
    listFactors: async function(){ throw new Error('ne doit pas être appelé si aucun second facteur requis'); }
  }`);
  const res = await w.mfaChallengeRequis();
  assert.equal(res, null);
});

test('mfaChallengeRequis : renvoie le factorId quand aal2 est requis et qu\'un facteur TOTP est vérifié', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }; },
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-1', status: 'verified' }] }, error: null }; }
  }`);
  const res = await w.mfaChallengeRequis();
  assert.deepEqual(versSimple(res), { factorId: 'facteur-1' });
});

test('mfaChallengeRequis : renvoie null si une session est déjà au niveau aal2 (déjà vérifiée)', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }; },
    listFactors: async function(){ throw new Error('ne doit pas être appelé'); }
  }`);
  const res = await w.mfaChallengeRequis();
  assert.equal(res, null);
});

test('mfaChallengeRequis : une erreur réseau ne bloque jamais la connexion (renvoie null)', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ throw new Error('panne réseau'); },
    listFactors: async function(){ return { data: { totp: [] }, error: null }; }
  }`);
  const res = await w.mfaChallengeRequis();
  assert.equal(res, null);
});

// ─── tenterOuvrirSession ────────────────────────────────────
test('tenterOuvrirSession : sans second facteur, ouvre directement le CRM (onAuthSuccess)', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }; },
    listFactors: async function(){ return { data: { totp: [] }, error: null }; }
  }`);
  w.onAuthSuccess = function(user){ w.__capture = user; };
  await w.tenterOuvrirSession({ email: 'contact@edl-idf.com' });
  assert.deepEqual(w.__capture, { email: 'contact@edl-idf.com' });
  assert.equal(w.document.getElementById('auth-mfa').style.display, 'none');
});

test('tenterOuvrirSession : avec un facteur vérifié, affiche l\'écran de code au lieu d\'ouvrir le CRM', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }; },
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-1', status: 'verified' }] }, error: null }; }
  }`);
  w.onAuthSuccess = function(){ w.__capture = 'appelé trop tôt'; };
  await w.tenterOuvrirSession({ email: 'contact@edl-idf.com' });
  assert.equal(w.__capture, undefined);
  assert.equal(w.document.getElementById('auth-mfa').style.display, 'block');
  assert.equal(w.document.getElementById('auth-login').style.display, 'none');
});

// ─── verifierCodeMfa / annulerMfa (écran de login) ──────────
test('verifierCodeMfa : refuse un code qui n\'est pas à 6 chiffres, sans appeler challengeAndVerify', async () => {
  const w = setup(`{ challengeAndVerify: async function(){ throw new Error('ne doit pas être appelé'); } }`);
  w.document.getElementById('mfa-code').value = '42';
  await w.verifierCodeMfa();
  assert.match(w.document.getElementById('auth-error').textContent, /6 chiffres/);
});

test('verifierCodeMfa : un bon code ouvre le CRM avec l\'utilisateur en attente', async () => {
  // _mfaPendingUser est un `let` du contexte vm (pas une propriété de
  // window) : on passe par le vrai parcours (tenterOuvrirSession) pour le
  // renseigner, plutôt que d'essayer de l'écrire depuis l'extérieur.
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }; },
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-9', status: 'verified' }] }, error: null }; },
    challengeAndVerify: async function(args){ window.__verifyArgs = args; return { data: {}, error: null }; }
  }`);
  w.onAuthSuccess = function(user){ w.__capture = user; };
  await w.tenterOuvrirSession({ email: 'contact@edl-idf.com' });
  assert.equal(w.document.getElementById('auth-mfa').style.display, 'block');
  w.document.getElementById('mfa-code').value = '123456';
  await w.verifierCodeMfa();
  assert.deepEqual(versSimple(w.__verifyArgs), { factorId: 'facteur-9', code: '123456' });
  assert.deepEqual(w.__capture, { email: 'contact@edl-idf.com' });
  assert.equal(w.document.getElementById('auth-mfa').style.display, 'none');
});

test('verifierCodeMfa : un code refusé par Supabase affiche une erreur et n\'ouvre pas le CRM', async () => {
  const w = setup(`{
    getAuthenticatorAssuranceLevel: async function(){ return { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }; },
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-9', status: 'verified' }] }, error: null }; },
    challengeAndVerify: async function(){ return { data: null, error: { message: 'Invalid TOTP code' } }; }
  }`);
  w.onAuthSuccess = function(){ w.__capture = 'ne doit pas être appelé'; };
  await w.tenterOuvrirSession({ email: 'contact@edl-idf.com' });
  w.document.getElementById('mfa-code').value = '000000';
  await w.verifierCodeMfa();
  assert.equal(w.__capture, undefined);
  assert.match(w.document.getElementById('auth-error').textContent, /invalide/i);
});

test('annulerMfa : déconnecte et rend la main à l\'écran de connexion', async () => {
  const w = setup(`{}`);
  w.afficherEcranMfa('facteur-9');
  await w.annulerMfa();
  assert.equal(w.__signedOut, true);
  assert.equal(w.document.getElementById('auth-mfa').style.display, 'none');
});

// ─── Paramètres → Sécurité : état + activation ──────────────
test('chargerEtatMfa : aucun facteur vérifié -> statut "Désactivée", zone d\'activation visible', async () => {
  const w = setup(`{
    listFactors: async function(){ return { data: { totp: [] }, error: null }; }
  }`);
  await w.chargerEtatMfa();
  assert.match(w.document.getElementById('mfa-statut').innerHTML, /Désactivée/);
  assert.notEqual(w.document.getElementById('mfa-zone-inactive').style.display, 'none');
  assert.equal(w.document.getElementById('mfa-zone-activee').style.display, 'none');
});

test('chargerEtatMfa : un facteur vérifié -> statut "Activée", bouton Désactiver visible', async () => {
  const w = setup(`{
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-1', status: 'verified' }] }, error: null }; }
  }`);
  await w.chargerEtatMfa();
  assert.match(w.document.getElementById('mfa-statut').innerHTML, /Activée/);
  assert.equal(w.document.getElementById('mfa-zone-inactive').style.display, 'none');
  assert.notEqual(w.document.getElementById('mfa-zone-activee').style.display, 'none');
});

test('demarrerEnrolementMfa : affiche le QR code et la clé secrète renvoyés par Supabase', async () => {
  const w = setup(`{
    enroll: async function(){ return { data: { id: 'facteur-nouveau', totp: { qr_code: 'data:image/svg+xml;...', secret: 'ABCD1234' } }, error: null }; }
  }`);
  await w.demarrerEnrolementMfa();
  assert.equal(w.document.getElementById('mfa-qr').src, 'data:image/svg+xml;...');
  assert.equal(w.document.getElementById('mfa-secret').textContent, 'ABCD1234');
  assert.notEqual(w.document.getElementById('mfa-zone-enrolement').style.display, 'none');
});

test('confirmerEnrolementMfa : un bon code active la 2FA et recharge l\'état', async () => {
  let verifie = false;
  const w = setup(`{
    enroll: async function(){ return { data: { id: 'facteur-nouveau', totp: { qr_code: 'x', secret: 'y' } }, error: null }; },
    challengeAndVerify: async function(args){ window.__confirmArgs = args; return { data: {}, error: null }; },
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-nouveau', status: 'verified' }] }, error: null }; }
  }`);
  await w.demarrerEnrolementMfa();
  w.document.getElementById('mfa-enrol-code').value = '654321';
  await w.confirmerEnrolementMfa();
  assert.deepEqual(versSimple(w.__confirmArgs), { factorId: 'facteur-nouveau', code: '654321' });
  assert.match(w.document.getElementById('mfa-statut').innerHTML, /Activée/);
});

test('confirmerEnrolementMfa : un code invalide affiche une erreur sans activer', async () => {
  const w = setup(`{
    enroll: async function(){ return { data: { id: 'facteur-nouveau', totp: { qr_code: 'x', secret: 'y' } }, error: null }; },
    challengeAndVerify: async function(){ return { data: null, error: { message: 'Invalid TOTP code' } }; }
  }`);
  await w.demarrerEnrolementMfa();
  w.document.getElementById('mfa-enrol-code').value = '111111';
  await w.confirmerEnrolementMfa();
  assert.match(w.document.getElementById('mfa-enrol-erreur').textContent, /invalide/i);
});

test('annulerEnrolementMfa : masque la zone d\'activation et retire le facteur non confirmé', async () => {
  const w = setup(`{
    enroll: async function(){ return { data: { id: 'facteur-nouveau', totp: { qr_code: 'x', secret: 'y' } }, error: null }; },
    unenroll: async function(args){ window.__unenrollArgs = args; return { data: {}, error: null }; }
  }`);
  await w.demarrerEnrolementMfa();
  w.annulerEnrolementMfa();
  assert.equal(w.document.getElementById('mfa-zone-enrolement').style.display, 'none');
  // unenroll() est async et déclenché en tâche de fond (non attendu) : laisser passer un tick.
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(versSimple(w.__unenrollArgs), { factorId: 'facteur-nouveau' });
});

test('desactiverMfa : demande confirmation avant de désenrôler', async () => {
  const w = setup(`{
    listFactors: async function(){ return { data: { totp: [{ id: 'facteur-1', status: 'verified' }] }, error: null }; },
    unenroll: async function(args){ window.__unenrollArgs = args; return { data: {}, error: null }; }
  }`);
  await w.chargerEtatMfa();
  w.confirm = () => false; // l'utilisateur annule la confirmation
  await w.desactiverMfa();
  assert.equal(w.__unenrollArgs, undefined);

  w.confirm = () => true;
  await w.desactiverMfa();
  assert.deepEqual(versSimple(w.__unenrollArgs), { factorId: 'facteur-1' });
});
