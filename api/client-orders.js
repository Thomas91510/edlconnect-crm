export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    // 1) Vérifier le token et récupérer l'email du client connecté
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Session invalide, merci de vous reconnecter.' }), { status: 401 });
    }

    const userData = await userResp.json();
    const userEmail = (userData.email || '').toLowerCase().trim();

    if (!userEmail) {
      return new Response(JSON.stringify({ error: 'Email introuvable sur ce compte.' }), { status: 400 });
    }

    const supaHeaders = {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    };

    // 2) Récupérer uniquement les commandes liées à cette adresse email
    //    (filtre direct côté base, on ne renvoie jamais les données des autres clients)
    // Filtre sur la colonne JSONB "data" — syntaxe PostgREST correcte
    const filterUrl = `${SUPABASE_URL}/rest/v1/bookings?select=id,data,created_at&data->email=eq.%22${encodeURIComponent(userEmail)}%22&order=created_at.desc`;

    const bookingsResp = await fetch(filterUrl, { headers: supaHeaders });

    if (!bookingsResp.ok) {
      return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des commandes.' }), { status: 500 });
    }

    const rows = await bookingsResp.json();

    // Récupérer aussi les missions liées à cet email pour synchroniser le statut "réalisé"
    const missionsUrl = `${SUPABASE_URL}/rest/v1/missions?select=id,data&data->emailClient=eq.%22${encodeURIComponent(userEmail)}%22`;
    let missionRows = [];
    try {
      const mResp = await fetch(missionsUrl, { headers: supaHeaders });
      if(mResp.ok) missionRows = await mResp.json();
    } catch(_){}

    // Index des missions par missionId pour lookup rapide
    const missionMap = {};
    (missionRows || []).forEach(m => {
      if(m.data?.missionId) missionMap[m.data.missionId] = m.data;
      if(m.id) missionMap[m.id] = m.data;
    });

    const orders = (rows || []).map(r => {
      // Une mission liée est-elle réellement effectuée ? "terminée" et
      // "facturée" sont les statuts que le CRM écrit vraiment (le statut
      // "réalisée" n'existe dans aucun formulaire et ne se produit jamais).
      // Le rapport EDL (Edouard) se synchronise en temps réel avec les
      // locataires : pas de palier intermédiaire "réalisé sans rapport" à
      // afficher, on passe directement à "rapport disponible".
      const linkedMission = missionMap[r.data?.missionId] || null;
      const missionEffectuee = linkedMission && ['terminée', 'facturée', 'réalisée'].includes(linkedMission.statut);
      let statut = r.data?.statut || 'en_attente';
      if (missionEffectuee) statut = 'rapport_dispo';

      return {
        id: r.id,
        typeEdl: r.data?.typeEdl || '',
        adresse: r.data?.adresse || '',
        bienType: r.data?.bienType || '',
        bienTypo: r.data?.bienTypo || '',
        meuble: r.data?.meuble || '',
        statut,
        dateSouhaitee: r.data?.dateSouhaitee || '',
        heure: r.data?.heure || '',
        locataireNom: r.data?.locataireNom || (r.data?.locataire?.nom) || '',
        locataireTel: r.data?.locataireTel || (r.data?.locataire?.tel) || '',
        createdAt: r.created_at
      };
    });

    return new Response(JSON.stringify(orders), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
