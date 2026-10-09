export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { VERSION, EDITEUR, contratActif, contratHtml, empreinte } from './_lib/contrat-rgpd.js';

// Contrat de sous-traitance RGPD (api/_lib/contrat-rgpd.js) :
//   GET  sans session : texte + version (lecture avant inscription) ;
//   GET  avec session : + statut de signature du compte ;
//   POST avec session : signature de la version en cours.
// La preuve de signature est un fichier JSON écrit avec la clé service
// dans le bucket privé « sauvegardes » (contrats-rgpd/<user_id>/…), jamais
// modifiable par l'abonné (contrairement à ses réglages). Le compte admin,
// éditeur de la plateforme, n'a pas à signer.
const BUCKET = 'sauvegardes';
const DOSSIER = 'contrats-rgpd';

async function utilisateur(req) {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

export async function signatures(userId, serviceKey) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: `${DOSSIER}/${userId}/`, limit: 100, sortBy: { column: 'name', order: 'desc' } }),
  });
  if (!r.ok) return null;
  const liste = await r.json();
  return (liste || []).map(f => String((f && f.name) || '')).filter(n => n.endsWith('.json'));
}

// Nom de fichier : <version>__<date ISO sans « : »>.json
export function derniereSignature(noms, version) {
  const n = (noms || []).filter(x => x.startsWith(version + '__')).sort().pop();
  if (!n) return null;
  const iso = n.slice(version.length + 2, -5).replace(/(\d{2})-(\d{2})-(\d{2})(\.\d+)?Z$/, '$1:$2:$3$4Z');
  return { version, date: iso };
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailCopie(ident, preuve, html) {
  const date = new Date(preuve.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f8f8f6;font-family:Arial,sans-serif;color:#1a1a1a">
<div style="max-width:720px;margin:0 auto;padding:20px">
  <div style="background:#fff;border:1px solid #e5e5e2;border-radius:12px;padding:28px;font-size:13px;line-height:1.6">
    <p>Bonjour,</p>
    <p>Vous avez signé électroniquement le contrat de sous-traitance de données personnelles (RGPD) de ${EDITEUR.marque}. En voici votre copie.</p>
    <div style="background:#F4F7FA;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:12px">
      <strong>Preuve de signature</strong><br>
      Compte : ${esc(ident.email)}<br>
      Date : ${date} (heure de Paris)<br>
      Version : ${preuve.version}<br>
      Empreinte SHA-256 du texte : <span style="font-family:monospace;word-break:break-all">${preuve.empreinte}</span>
    </div>
    <hr style="border:none;border-top:1px solid #e5e5e2;margin:18px 0">
    ${html}
  </div>
</div></body></html>`;
}

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  const html = contratHtml();
  const hash = await empreinte(html);
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const user = await utilisateur(req);
  const estAdmin = !!user && ADMIN_EMAILS.includes(String(user.email || '').toLowerCase().trim());

  if (req.method === 'GET') {
    const corps = { version: VERSION, empreinte: hash, html, actif: contratActif() };
    if (!user) return reponse(corps, 200);
    if (estAdmin) return reponse({ ...corps, exempt: true, signature: null }, 200);
    if (!serviceKey) return reponse({ ...corps, signature: null, erreur: 'config' }, 200);
    const noms = await signatures(user.id, serviceKey);
    // Lecture impossible : on ne bloque pas l'abonné (le contrôle sera
    // refait à la prochaine connexion), mais on ne prétend pas qu'il a signé.
    if (noms === null) return reponse({ ...corps, signature: null, erreur: 'lecture' }, 200);
    return reponse({ ...corps, signature: derniereSignature(noms, VERSION) }, 200);
  }

  if (req.method !== 'POST') return reponse({ error: 'Method not allowed' }, 405);
  if (!user) return reponse({ error: 'Non authentifié' }, 401);
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);
  if (!contratActif()) return reponse({ error: 'Contrat pas encore disponible à la signature' }, 409);
  if (estAdmin) return reponse({ error: 'Le compte éditeur n’a pas à signer' }, 400);

  let body = {};
  try { body = await req.json(); } catch (_) {}
  if (!body || body.accepte !== true) return reponse({ error: 'Acceptation requise' }, 400);
  // Le texte signé doit être exactement celui en vigueur.
  if (body.version !== VERSION || body.empreinte !== hash) {
    return reponse({ error: 'Le contrat a été mis à jour : rechargez la page pour lire la nouvelle version', code: 'version' }, 409);
  }

  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  let societe = '';
  try {
    const s = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(user.id)}`, { headers: supaHeaders });
    const rows = s.ok ? await s.json() : [];
    const d = (rows[0] && rows[0].data) || {};
    societe = String(d.legalRaisonSociale || d.companyName || (user.user_metadata && user.user_metadata.company_name) || '').slice(0, 200);
  } catch (_) {}

  const date = new Date().toISOString();
  const preuve = {
    type: 'contrat-sous-traitance-rgpd',
    version: VERSION,
    empreinte: hash,
    date,
    userId: user.id,
    email: user.email || '',
    societe,
    ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim(),
    userAgent: String(req.headers.get('user-agent') || '').slice(0, 300),
    editeur: { raisonSociale: EDITEUR.raisonSociale, siret: EDITEUR.siret },
  };
  const nom = `${DOSSIER}/${user.id}/${VERSION}__${date.replace(/:/g, '-')}.json`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${nom}`, {
    method: 'POST',
    headers: { ...supaHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(preuve, null, 2),
  });
  if (!up.ok) return reponse({ error: 'Enregistrement de la signature impossible, réessayez' }, 500);

  // Copie au client (et à l'éditeur) — best-effort : la signature est déjà
  // enregistrée, un échec d'envoi ne doit pas la faire échouer.
  let copieEnvoyee = false;
  const brevo = process.env.BREVO_API_KEY;
  if (brevo && user.email) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevo },
        body: JSON.stringify({
          sender: { name: EDITEUR.marque, email: 'contact@lokentia.fr' },
          to: [{ email: user.email }],
          bcc: [{ email: ADMIN_EMAILS[0] }],
          subject: `Votre contrat de sous-traitance RGPD ${EDITEUR.marque} signé`,
          htmlContent: emailCopie(user, preuve, html),
        }),
      });
      copieEnvoyee = r.ok;
    } catch (_) {}
  }
  return reponse({ success: true, signature: { version: VERSION, date }, copieEnvoyee }, 200);
}
