export const config = { runtime: 'edge' };

import { origineAutorisee } from './_lib/cors.js';
import { resolverAgentParEmail } from './_lib/agent-lookup.js';

// Vérifie, AVANT l'envoi du lien magique, si un email correspond à un
// Agent EDL enregistré — pour ne jamais envoyer de lien de connexion à
// quelqu'un qui n'obtiendrait de toute façon aucune donnée une fois
// connecté (voir api/agent-missions.js). Endpoint public (appelé avant
// authentification) qui ne renvoie qu'un booléen, jamais le nom de
// l'agent ni son agence — pas de fuite d'information au-delà du strict
// nécessaire pour bloquer l'envoi côté client.
export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const { email } = await req.json();
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!email) return new Response(JSON.stringify({ registered: false }), { status: 200, headers });
    // Une clé de service absente est une panne de configuration serveur, pas
    // une preuve que l'email est inconnu : on échoue ouvert comme pour les
    // autres pannes ci-dessous, plutôt que de bloquer tous les agents.
    if (!serviceKey) return new Response(JSON.stringify({ registered: true }), { status: 200, headers });
    const resolu = await resolverAgentParEmail(email, serviceKey);
    return new Response(JSON.stringify({ registered: !!resolu }), { status: 200, headers });
  } catch (e) {
    // En cas de souci (JSON invalide, panne réseau vers Supabase...), on
    // laisse passer plutôt que de bloquer : ce contrôle n'est qu'un filtre
    // pour éviter un envoi inutile, la vérification qui compte reste celle
    // d'agent-missions.js à la connexion — jamais un agent légitime privé
    // de son lien à cause d'un pépin transitoire côté serveur.
    return new Response(JSON.stringify({ registered: true }), { status: 200, headers });
  }
}
