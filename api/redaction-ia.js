export const config = { runtime: 'edge' };

import Anthropic from '@anthropic-ai/sdk';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { identiteAbonne } from './_lib/identite.js';

// « Rédiger avec IA » du Composer (Emails › Écrire), rédigé par Claude, ou
// par Mistral (gratuit) tant qu'aucune clé Anthropic n'est configurée.
// Le navigateur n'envoie que la consigne (et éventuellement le destinataire
// et le brouillon en cours) : les prompts sont construits ici, avec
// l'identité d'envoi du compte — l'endpoint n'est jamais un proxy IA ouvert
// (chaque appel est décompté sur la clé API du compte).
const MODELE = 'claude-opus-5-5';
const MODELE_MISTRAL = 'mistral-small-latest';
const MAX_CONSIGNE = 2000;
const MAX_BROUILLON = 6000;

// Admin ou plan payant actif (même règle qu'auparavant pour l'IA) ;
// en cas de panne de la vérification, on laisse passer un abonné payant.
async function planAutorise(userId, email) {
  if (email && ADMIN_EMAILS.includes(email)) return true;
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key || !userId) return true;
    const r = await fetch(SUPABASE_URL + '/rest/v1/user_plans?select=plan,status&user_id=eq.' + encodeURIComponent(userId), {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (!r.ok) return true;
    const rows = await r.json();
    const p = rows && rows[0];
    if (!p) return false;
    return (p.plan === 'starter' || p.plan === 'pro') && p.status === 'active';
  } catch (e) { return true; }
}

// « Objet: … » sur la première ligne, puis le corps.
export function decouperEmail(texte) {
  const lignes = String(texte || '').replace(/\r/g, '').split('\n');
  const i = lignes.findIndex(l => /^\s*objet\s*:/i.test(l));
  const objet = i >= 0 ? lignes[i].replace(/^\s*objet\s*:\s*/i, '').trim() : '';
  const corps = (i >= 0 ? lignes.slice(i + 1) : lignes).join('\n').trim();
  return { objet, corps };
}

// Offre gratuite : le modèle principal renvoie souvent 429 (capacité de
// l'offre gratuite dépassée, ~1 requête/s). On réessaie après une courte
// pause puis on bascule sur d'autres modèles gratuits.
const MODELES_MISTRAL_SECOURS = ['open-mistral-nemo', 'ministral-8b-latest'];
export const PAUSE_MISTRAL_MS = { valeur: 1200 };
const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function redigerAvecMistral(system, demande, reponse) {
  const essais = [MODELE_MISTRAL, MODELE_MISTRAL, ...MODELES_MISTRAL_SECOURS];
  let dernierStatut = 0, detail = '';
  try {
    for (let i = 0; i < essais.length; i++) {
      if (i > 0) await pause(PAUSE_MISTRAL_MS.valeur);
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: essais[i],
          messages: [{ role: 'system', content: system }, { role: 'user', content: demande }],
          max_tokens: 1500,
          temperature: 0.7,
        }),
      });
      dernierStatut = r.status;
      if (r.status === 401) return reponse({ error: 'Clé MISTRAL_API_KEY invalide.' }, 503);
      if (r.status === 429 || r.status >= 500) {
        detail = String((await r.text().catch(() => '')) || '').slice(0, 200);
        continue;
      }
      if (!r.ok) return reponse({ error: 'Erreur de l’IA (' + r.status + ')' }, 502);
      const data = await r.json();
      const texte = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!texte) return reponse({ error: 'Réponse vide de l’IA' }, 502);
      return reponse(decouperEmail(texte), 200);
    }
  } catch (_) {
    return reponse({ error: 'Erreur réseau vers l’IA' }, 502);
  }
  console.warn('redaction-ia mistral', dernierStatut, detail);
  if (dernierStatut === 429) {
    return reponse({ error: /month|mensuel|quota|limit/i.test(detail)
      ? 'Quota gratuit de l’IA atteint pour le moment. Réessayez plus tard.'
      : 'IA gratuite saturée, réessayez dans une minute.' }, 429);
  }
  return reponse({ error: 'Erreur de l’IA (' + dernierStatut + ')' }, 502);
}

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

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const user = await userResp.json();
  if (!(await planAutorise(user && user.id, user && user.email))) {
    return reponse({ error: 'La rédaction assistée par IA est réservée aux plans Starter et Pro.', planRequis: true }, 403);
  }
  // Claude si la clé ANTHROPIC_API_KEY est configurée ; sinon Mistral
  // (clé MISTRAL_API_KEY, offre gratuite « Experiment ») — même consigne,
  // même format de réponse.
  const fournisseur = process.env.ANTHROPIC_API_KEY ? 'claude' : (process.env.MISTRAL_API_KEY ? 'mistral' : '');
  if (!fournisseur) {
    return reponse({ error: 'Rédaction IA non configurée (clé ANTHROPIC_API_KEY ou MISTRAL_API_KEY absente).' }, 503);
  }

  let body;
  try { body = await req.json(); } catch (_) { return reponse({ error: 'Corps de requête invalide' }, 400); }
  const consigne = String((body && body.consigne) || '').trim();
  if (!consigne) return reponse({ error: 'Décrivez l’email à rédiger.' }, 400);
  if (consigne.length > MAX_CONSIGNE) return reponse({ error: 'Consigne trop longue' }, 400);
  const destinataire = String((body && body.destinataire) || '').trim().slice(0, 200);
  const brouillon = String((body && body.brouillon) || '').trim().slice(0, MAX_BROUILLON);

  const ident = await identiteAbonne(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, user.id);
  const societe = ident.nom || 'notre entreprise';
  const accroche = ident.slogan === undefined ? 'Expert en État des Lieux' : ident.slogan;
  const societeAccroche = accroche ? `${societe} — ${accroche}` : societe;
  const signature = [ident.signature, societeAccroche].filter(Boolean).join('\n');

  const system = `Tu rédiges les emails de ${societe}, spécialiste des états des lieux professionnels, pour des agences immobilières et des gestionnaires de biens.
Style : français soigné, professionnel et chaleureux, phrases courtes, concret, une seule idée par paragraphe, un appel à l'action clair à la fin.
Présente la société comme « ${societeAccroche} ».
Mets quelques emojis pertinents pour donner de l'impact (un dans l'objet, un devant chaque intertitre ou point clé), sans en abuser.
Pas de formules creuses ni de flatterie, pas de promesse chiffrée inventée : n'invente ni prix, ni date, ni chiffre absent de la consigne.
Signe avec :
${signature}
Réponds uniquement avec l'email : première ligne « Objet: … », une ligne vide, puis le corps. Aucun commentaire.`;

  const demande = [
    destinataire ? `Destinataire : ${destinataire}` : '',
    `Consigne : ${consigne}`,
    brouillon ? `Brouillon actuel à améliorer (garde les informations utiles) :\n${brouillon}` : '',
  ].filter(Boolean).join('\n\n');

  if (fournisseur === 'mistral') return redigerAvecMistral(system, demande, reponse);

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, fetch: (...a) => fetch(...a) });
    const message = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 16000,
      // Rédaction courte : effort bas pour une réponse rapide.
      output_config: { effort: 'low' },
      // Si un filtre de sécurité refuse la demande, l'API la relance sur un
      // modèle de repli plutôt que d'échouer.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: demande }],
    });
    if (message.stop_reason === 'refusal') {
      return reponse({ error: 'Demande refusée par l’IA : reformulez la consigne.' }, 422);
    }
    const texte = (message.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!texte) return reponse({ error: 'Réponse vide de l’IA' }, 502);
    return reponse(decouperEmail(texte), 200);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return reponse({ error: 'IA momentanément saturée, réessayez dans un instant.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return reponse({ error: 'Clé ANTHROPIC_API_KEY invalide.' }, 503);
    if (e instanceof Anthropic.APIError) return reponse({ error: 'Erreur de l’IA (' + (e.status || '?') + ')' }, 502);
    return reponse({ error: 'Erreur réseau vers l’IA' }, 502);
  }
}
