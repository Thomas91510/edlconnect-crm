export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';
import { identiteAbonne } from './_lib/identite.js';
import { limiteAtteinte } from './_lib/rate-limit.js';
import {
  nettoyerInfosLegales, champsLegauxManquants, nettoyerFacture, nomFichierFacture, ajouterFactureHistorique,
} from './_lib/agent-facture.js';

const BUCKET = 'agent-documents';
const TAILLE_MAX_B64 = 7 * 1024 * 1024; // ~5 Mo de PDF

const echapper = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (n) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// L'agent envoie la facture qu'il a générée et éditée dans son espace
// (onglet « Facturation ») : le PDF (produit dans son navigateur) part par
// email au titulaire du CRM (la société donneuse d'ordre, ex. EDL IDF —
// jamais les agences clientes de l'extranet), en copie à l'agent, et est conservé dans le stockage
// privé « agent-documents » ; la fiche agent garde l'historique (numéro,
// mois, montants) que la société consulte dans le CRM. Les totaux sont
// recalculés ici à partir des lignes, jamais repris du navigateur.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reponse({ error: 'Method not allowed' }, 405);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  if (!serviceKey || !brevoKey) return reponse({ error: 'Configuration serveur manquante' }, 500);

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();

  if (limiteAtteinte('facture-agent:' + String(user.email || '').toLowerCase(), { max: 10, fenetreMs: 3600000 })) {
    return reponse({ error: 'Trop d\'envois en peu de temps — réessaie dans une heure.' }, 429);
  }

  const resolu = await resolverAgentParEmail(user.email, serviceKey);
  if (!resolu) return reponse({ error: 'Aucun profil agent trouvé pour cet email' }, 403);
  const { ownerId, agent } = resolu;

  let body;
  try { body = await req.json(); } catch (_) { return reponse({ error: 'Corps de requête invalide' }, 400); }

  const infos = nettoyerInfosLegales(agent.infosLegales);
  const manquants = champsLegauxManquants(infos);
  if (manquants.length) {
    return reponse({ error: 'Complète d\'abord tes informations juridiques (Mon compte) : ' + manquants.join(', ') }, 400);
  }
  const facture = nettoyerFacture(body && body.facture, infos);
  if (!facture.numero) return reponse({ error: 'Numéro de facture manquant' }, 400);
  if (!facture.lignes.length) return reponse({ error: 'La facture ne contient aucune ligne' }, 400);

  const pdf = String((body && body.pdfBase64) || '');
  if (!pdf || pdf.length > TAILLE_MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(pdf) || !pdf.startsWith('JVBER')) {
    return reponse({ error: 'PDF de la facture invalide ou trop volumineux' }, 400);
  }
  const nomFichier = nomFichierFacture(facture.numero);
  const supaHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // 1. Conservation du PDF (stockage privé, lien signé à la demande)
  const chemin = `${encodeURIComponent(agent.id)}/factures/${Date.now()}-${nomFichier}`;
  const octets = Uint8Array.from(atob(pdf), c => c.charCodeAt(0));
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${chemin}`, {
    method: 'POST', headers: { ...supaHeaders, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: octets,
  });
  if (!up.ok) return reponse({ error: 'Échec de l\'enregistrement du PDF' }, 500);

  // 2. Email au titulaire du CRM (copie à l'agent), PDF en pièce jointe
  const ident = await identiteAbonne(SUPABASE_URL, serviceKey, ownerId);
  const emetteur = infos.raisonSociale || agent.nom || 'Agent';
  const html = `<p>Bonjour,</p>
<p>${echapper(emetteur)} vous adresse sa facture <strong>n° ${echapper(facture.numero)}</strong>${facture.mois ? ' pour les missions de ' + echapper(facture.mois) : ''} :
${facture.lignes.length} mission(s), <strong>${euros(facture.totalHT)} HT</strong>${facture.tva ? ' — ' + euros(facture.totalTTC) + ' TTC' : ''}.</p>
<p>La facture est jointe en PDF et consultable dans le CRM (Réglages › Rémunérations).</p>
${facture.note ? '<p>' + echapper(facture.note) + '</p>' : ''}
<p>${echapper(agent.nom || emetteur)}<br>${echapper(user.email || '')}</p>`;
  const envoi = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
    body: JSON.stringify({
      sender: { name: emetteur.slice(0, 60), email: ident.email },
      to: [{ email: ident.notifEmail, name: ident.nom }],
      cc: user.email ? [{ email: user.email, name: agent.nom || emetteur }] : undefined,
      replyTo: user.email ? { email: user.email } : undefined,
      subject: `Facture ${facture.numero} — ${emetteur}`,
      htmlContent: html,
      attachment: [{ content: pdf, name: nomFichier }],
      tags: ['sub_' + ownerId, 'facture-agent'],
    }),
  });
  if (!envoi.ok) return reponse({ error: 'L\'email n\'a pas pu être envoyé (Brevo ' + envoi.status + ')' }, 502);

  // 3. Historique sur la fiche agent (vu dans le CRM)
  const settingsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=data&user_id=eq.${encodeURIComponent(ownerId)}`,
    { headers: supaHeaders }
  );
  if (!settingsResp.ok) return reponse({ success: true, avertissement: 'Facture envoyée, historique non mis à jour' }, 200);
  const rows = await settingsResp.json();
  const data = (rows[0] && rows[0].data) || {};
  const agents = Array.isArray(data.agents) ? data.agents.slice() : [];
  const idx = agents.findIndex(a => a && a.id === agent.id);
  let factures = [];
  if (idx !== -1) {
    factures = ajouterFactureHistorique(agents[idx].factures, facture, {
      envoyeeLe: new Date().toISOString(), destinataire: ident.notifEmail, chemin,
    });
    agents[idx] = { ...agents[idx], factures };
    await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${encodeURIComponent(ownerId)}`, {
      method: 'PATCH',
      headers: { ...supaHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { ...data, agents }, updated_at: new Date().toISOString() }),
    });
  }
  return reponse({ success: true, destinataire: ident.notifEmail, factures: factures.map(({ chemin: _c, ...f }) => f) }, 200);
}
