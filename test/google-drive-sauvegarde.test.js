// Copie quotidienne de la sauvegarde du CRM sur Google Drive
// (api/_lib/google-drive.js, appelée par api/backup-auto.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configDrive, corpsMultipart, fichiersAPurger, sauvegarderSurDrive, NOM_DOSSIER_DRIVE } from '../api/_lib/google-drive.js';

test('configuration : absente sans refresh token, rétention 90 jours par défaut', () => {
  assert.equal(configDrive({}), null);
  assert.equal(configDrive({ GOOGLE_DRIVE_REFRESH_TOKEN: 'r' }), null, 'client OAuth requis');
  const c = configDrive({ GOOGLE_DRIVE_REFRESH_TOKEN: 'r', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' });
  assert.equal(c.retentionJours, 90);
  assert.equal(c.dossierId, '');
  assert.equal(configDrive({ GOOGLE_DRIVE_REFRESH_TOKEN: 'r', GOOGLE_DRIVE_CLIENT_ID: 'i2', GOOGLE_DRIVE_CLIENT_SECRET: 's2', GOOGLE_DRIVE_RETENTION_JOURS: '30' }).retentionJours, 30);
});

test('corps multipart et sélection des sauvegardes à purger', () => {
  const corps = corpsMultipart({ name: 'a.json' }, '{"x":1}', 'B');
  assert.match(corps, /^--B\r\nContent-Type: application\/json; charset=UTF-8\r\n\r\n\{"name":"a.json"\}\r\n--B\r\n/);
  assert.ok(corps.endsWith('{"x":1}\r\n--B--'));
  const p = fichiersAPurger([{ name: 'lokentia-2026-06-01.json' }, { name: 'lokentia-2026-09-30.json' }, { name: 'autre.json' }], '2026-07-08');
  assert.deepEqual(p.map(f => f.name), ['lokentia-2026-06-01.json']);
});

test('envoi : crée le dossier si besoin, dépose le fichier, purge les anciens', async () => {
  const appels = [];
  const fetchFn = async (url, opts = {}) => {
    const u = String(url); appels.push([opts.method || 'GET', u]);
    if (u.includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'AT' }) };
    if (u.includes('/drive/v3/files?q=')) {
      const q = decodeURIComponent(u);
      if (q.includes('folder')) return { ok: true, json: async () => ({ files: [] }) };
      if (q.includes("name contains 'lokentia-'")) return { ok: true, json: async () => ({ files: [{ id: 'old', name: 'lokentia-2026-01-01.json' }, { id: 'new', name: 'lokentia-2026-10-05.json' }] }) };
      return { ok: true, json: async () => ({ files: [] }) };
    }
    if (u.endsWith('/drive/v3/files?fields=id')) { assert.match(opts.body, new RegExp(NOM_DOSSIER_DRIVE)); return { ok: true, json: async () => ({ id: 'DOSSIER' }) }; }
    if (u.includes('/upload/drive/v3/files')) {
      assert.equal(opts.headers.Authorization, 'Bearer AT');
      assert.match(opts.body, /"parents":\["DOSSIER"\]/);
      return { ok: true, json: async () => ({ id: 'F1' }) };
    }
    if (opts.method === 'DELETE') return { ok: true, status: 204 };
    throw new Error('URL inattendue ' + u);
  };
  const cfg = configDrive({ GOOGLE_DRIVE_REFRESH_TOKEN: 'r', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' });
  const r = await sauvegarderSurDrive('lokentia-2026-10-06.json', '{}', cfg, { fetchFn, maintenant: new Date('2026-10-06T03:00:00Z') });
  assert.deepEqual(r, { fichierId: 'F1', dossierId: 'DOSSIER', remplace: false, purges: 1 });
  assert.ok(appels.some(([m, u]) => m === 'DELETE' && u.endsWith('/old')));
  assert.ok(!appels.some(([m, u]) => m === 'DELETE' && u.endsWith('/new')));
});

test('jeton refusé : erreur explicite (consignée par backup-auto sans bloquer)', async () => {
  const fetchFn = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
  const cfg = configDrive({ GOOGLE_DRIVE_REFRESH_TOKEN: 'r', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' });
  await assert.rejects(sauvegarderSurDrive('x.json', '{}', cfg, { fetchFn }), /invalid_grant/);
});
