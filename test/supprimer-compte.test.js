// Suppression de compte (RGPD) : confirmation obligatoire, admin protégé,
// toutes les lignes + fichiers de l'abonné puis son compte de connexion ;
// rien n'est touché chez un autre abonné.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_SERVICE_KEY = 'cle-test';
process.env.BREVO_API_KEY = 'cle-brevo';
const { default: handler, TABLES_ABONNE } = await import('../api/supprimer-compte.js');
const fetchOriginal = global.fetch;
test.after(() => { global.fetch = fetchOriginal; });

const req = (body) => ({ method: 'POST', headers: new Headers({ authorization: 'Bearer t' }), json: async () => body });

function mock({ email = 'presta@x.fr', echecTable } = {}) {
  const a = { deletes: [], fichiers: {}, auth: null, email: null };
  global.fetch = async (url, opts = {}) => {
    const u = decodeURIComponent(String(url));
    const m = opts.method || 'GET';
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u42', email }) };
    if (u.includes('/auth/v1/admin/users/') && m === 'DELETE') { a.auth = u; return { ok: true }; }
    if (u.includes('/rest/v1/settings?select=data')) return { ok: true, json: async () => [{ data: { logoPath: 'u42.png', agents: [
      { id: 'agent_1', contratPath: 'agent_1/contrat-1.pdf', factures: [{ chemin: 'agent_1/factures/f1.pdf' }, { chemin: '../sauvegardes/x.json' }] },
      { id: 'agent_2', avenantPath: 'agent_AUTRE/avenant.pdf' },
    ] } }] };
    if (u.includes('/rest/v1/bookings?select=')) return { ok: true, json: async () => [{ id: 'b1', data: { piecesJointes: [{ path: 'sub_1/1700000000000-abc.pdf' }, { path: '../x' }] } }] };
    if (u.includes('/storage/v1/object/list/agent-photos')) return { ok: true, json: async () => [{ name: 'agent_1.jpg' }] };
    if (u.includes('/storage/v1/object/') && m === 'DELETE') {
      const bucket = u.split('/storage/v1/object/')[1];
      a.fichiers[bucket] = (a.fichiers[bucket] || []).concat(JSON.parse(opts.body).prefixes);
      return { ok: true };
    }
    if (u.includes('/rest/v1/') && m === 'DELETE') {
      a.deletes.push(u.split('/rest/v1/')[1]);
      return { ok: !(echecTable && u.includes('/rest/v1/' + echecTable + '?')) };
    }
    if (u.includes('api.brevo.com')) { a.email = JSON.parse(opts.body); return { ok: true }; }
    throw new Error('URL inattendue ' + u);
  };
  return a;
}

test('sans le mot SUPPRIMER : refus, rien supprimé', async () => {
  const a = mock();
  const r = await handler(req({ confirmation: 'oui' }));
  assert.equal(r.status, 400);
  assert.equal(a.deletes.length, 0);
});

test('admin protégé', async () => {
  const a = mock({ email: 'contact@edl-idf.com' });
  assert.equal((await handler(req({ confirmation: 'SUPPRIMER' }))).status, 403);
  assert.equal(a.deletes.length, 0);
});

test('suppression complète : lignes, fichiers référencés, compte, email', async () => {
  const a = mock();
  const r = await handler(req({ confirmation: 'SUPPRIMER' }));
  assert.equal(r.status, 200);
  for (const t of TABLES_ABONNE) assert.ok(a.deletes.includes(`${t}?user_id=eq.u42`), t);
  assert.ok(a.deletes.includes('bookings?data->>ownerId=eq.u42'));
  assert.deepEqual(a.fichiers['agent-documents'].sort(), ['agent_1/contrat-1.pdf', 'agent_1/factures/f1.pdf'], 'jamais un chemin hors du dossier de SES agents');
  assert.deepEqual(a.fichiers['reservations'], ['sub_1/1700000000000-abc.pdf']);
  assert.deepEqual(a.fichiers['agent-photos'], ['u42/agent_1.jpg']);
  assert.deepEqual(a.fichiers['agency-logos'], ['u42.png']);
  assert.match(a.auth, /admin\/users\/u42$/);
  assert.equal(a.email.to[0].email, 'presta@x.fr');
});

test('échec sur une table : le compte de connexion est conservé', async () => {
  const a = mock({ echecTable: 'missions' });
  const r = await handler(req({ confirmation: 'SUPPRIMER' }));
  assert.equal(r.status, 500);
  assert.equal(a.auth, null);
});
