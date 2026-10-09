// En-tête commun des emails automatiques (api/_lib/identite.js) : logo seul
// centré sur fond blanc + trait de couleur, à défaut le nom de la société.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enteteEmail, identiteAbonne } from '../api/_lib/identite.js';

test('avec logo : image seule, dimensionnée par la hauteur, trait de couleur', () => {
  const h = enteteEmail({ nom: 'EDL IDF', logoUrl: 'https://x.supabase.co/storage/v1/object/public/agency-logos/u1.png', couleur: '#1a5fa8' });
  assert.match(h, /<img src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/agency-logos\/u1\.png"/);
  assert.match(h, /height:110px;width:auto/);
  assert.match(h, /border-bottom:3px solid #1a5fa8/);
  assert.match(h, /background:#ffffff/);
});

test('sans logo : nom de la société échappé, en couleur de marque', () => {
  const h = enteteEmail({ nom: 'A & <B>', couleur: 'pas-une-couleur' });
  assert.doesNotMatch(h, /<img/);
  assert.match(h, /A &amp; &lt;B&gt;/);
  assert.match(h, /#1A5FA8/);
});

test('identiteAbonne : URL publique du logo et couleur depuis les réglages', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => [{ data: { companyName: 'EDL IDF', logoPath: 'u1.png', couleurPrimaire: '#123456' } }] });
  try {
    const i = await identiteAbonne('https://x.supabase.co', 'cle', 'u1');
    assert.equal(i.logoUrl, 'https://x.supabase.co/storage/v1/object/public/agency-logos/u1.png');
    assert.equal(i.couleur, '#123456');
  } finally { global.fetch = fetchOriginal; }
});
