export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req) {
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

    // 2) Récupérer uniquement les commandes liées à cette adresse email
    //    (filtre direct côté base, on ne renvoie jamais les données des autres clients)
    // Filtre sur la colonne JSONB "data" — syntaxe PostgREST correcte
    const filterUrl = `${SUPABASE_URL}/rest/v1/bookings?select=id,data,created_at&data->email=eq.%22${encodeURIComponent(userEmail)}%22&order=created_at.desc`;

    const bookingsResp = await fetch(filterUrl, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (!bookingsResp.ok) {
      return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des commandes.' }), { status: 500 });
    }

    const rows = await bookingsResp.json();

    const orders = (rows || []).map(r => ({
      id: r.id,
      typeEdl: r.data?.typeEdl || '',
      adresse: r.data?.adresse || '',
      statut: r.data?.statut || 'en_attente',
      dateSouhaitee: r.data?.dateSouhaitee || '',
      heure: r.data?.heure || '',
      createdAt: r.created_at
    }));

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
