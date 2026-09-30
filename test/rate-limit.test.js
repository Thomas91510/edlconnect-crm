// Vérifie api/_lib/rate-limit.js : limiteur en mémoire best-effort utilisé
// par plusieurs endpoints publics (agent-check-email.js, contact-form.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limiteAtteinte, ipAppelant, _reinitialiserPourTests } from '../api/_lib/rate-limit.js';

test.beforeEach(() => { _reinitialiserPourTests(); });

test('limiteAtteinte : autorise jusqu\'à "max" appels, puis refuse', () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(limiteAtteinte('cle-test', { max: 3, fenetreMs: 60000 }), false);
  }
  assert.equal(limiteAtteinte('cle-test', { max: 3, fenetreMs: 60000 }), true);
});

test('limiteAtteinte : des clés différentes ont des compteurs indépendants', () => {
  for (let i = 0; i < 3; i++) limiteAtteinte('cle-A', { max: 3, fenetreMs: 60000 });
  assert.equal(limiteAtteinte('cle-B', { max: 3, fenetreMs: 60000 }), false);
});

test('limiteAtteinte : la fenêtre expirée réinitialise le compteur', async () => {
  for (let i = 0; i < 3; i++) limiteAtteinte('cle-fenetre', { max: 3, fenetreMs: 10 });
  assert.equal(limiteAtteinte('cle-fenetre', { max: 3, fenetreMs: 10 }), true);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(limiteAtteinte('cle-fenetre', { max: 3, fenetreMs: 10 }), false);
});

test('ipAppelant : prend la première IP de x-forwarded-for', () => {
  const req = { headers: new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) };
  assert.equal(ipAppelant(req), '1.2.3.4');
});

test('ipAppelant : "inconnu" si l\'en-tête est absent', () => {
  const req = { headers: new Headers() };
  assert.equal(ipAppelant(req), 'inconnu');
});
