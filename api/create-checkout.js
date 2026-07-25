export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';

// Prix Stripe (identifiants publics, pas des secrets).
// Un seul point de vérité côté serveur : le client envoie juste un code de
// formule, jamais un montant ni un price_id, pour éviter toute manipulation.
const PRIX = {
  starter_mensuel: 'price_1Tx5TcRsPmdM03WaRLMRHOBz',
  starter_annuel:  'price_1Tx5TzRsPmdM03Wa9x9ajzC0',
  pro_mensuel:     'price_1Tx5UIRsPmdM03WarWcJ8w6B',
  pro_annuel:      'price_1Tx5UZRsPmdM03WaM41NzgEO',
};

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers });
  }
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers });
  }
  const user = await userResp.json();
  if (!user || !user.id || !user.email) {
    return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), { status: 400, headers });
  }

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) {
    return new Response(JSON.stringify({ error: 'Stripe non configuré (STRIPE_SECRET_KEY manquante)' }), { status: 500, headers });
  }

  try {
    const { formule } = await req.json();
    const priceId = PRIX[formule];
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Formule inconnue' }), { status: 400, headers });
    }

    // Récupérer un éventuel stripe_customer_id déjà associé, pour ne pas
    // recréer un client Stripe à chaque abonnement (via user_plans).
    let customerId = '';
    try {
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
      if (SERVICE_KEY) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/user_plans?select=stripe_customer_id&user_id=eq.${encodeURIComponent(user.id)}`,
          { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } }
        );
        if (r.ok) {
          const rows = await r.json();
          customerId = (rows && rows[0] && rows[0].stripe_customer_id) || '';
        }
      }
    } catch (e) { /* pas bloquant : Stripe créera un client si besoin */ }

    const origin = req.headers.get('origin') || 'https://app.lokentia.fr';

    // Construction du corps x-www-form-urlencoded attendu par l'API Stripe
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', origin + '/?abonnement=succes&session_id={CHECKOUT_SESSION_ID}');
    params.append('cancel_url', origin + '/?abonnement=annule');
    params.append('client_reference_id', user.id);
    // Métadonnées reportées sur l'abonnement, lues ensuite par le webhook
    params.append('subscription_data[metadata][user_id]', user.id);
    params.append('subscription_data[metadata][formule]', formule);
    params.append('metadata[user_id]', user.id);
    if (customerId) {
      params.append('customer', customerId);
    } else {
      params.append('customer_email', user.email);
    }
    // Autoriser l'utilisation d'un code promo (facultatif, sans risque)
    params.append('allow_promotion_codes', 'true');

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeResp.json();
    if (!stripeResp.ok) {
      return new Response(JSON.stringify({ error: 'Erreur Stripe', details: (session.error && session.error.message) || '' }), { status: 502, headers });
    }

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
