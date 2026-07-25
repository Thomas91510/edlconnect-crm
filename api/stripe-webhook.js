export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';

// Correspondance price_id -> plan, pour retrouver le plan depuis l'abonnement Stripe.
const PRICE_TO_PLAN = {
  'price_1Tx5TcRsPmdM03WaRLMRHOBz': 'starter', // Starter mensuel
  'price_1Tx5TzRsPmdM03Wa9x9ajzC0': 'starter', // Starter annuel
  'price_1Tx5UIRsPmdM03WarWcJ8w6B': 'pro',     // Pro mensuel
  'price_1Tx5UZRsPmdM03WaM41NzgEO': 'pro',     // Pro annuel
};

// ── Vérification de la signature Stripe (HMAC-SHA256) ──
// Stripe envoie un header "stripe-signature" du type "t=timestamp,v1=signature".
// On recalcule HMAC(timestamp + "." + rawBody) avec le secret du webhook.
async function verifierSignatureStripe(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  try {
    const parts = {};
    sigHeader.split(',').forEach(kv => {
      const [k, v] = kv.split('=');
      if (k && v) parts[k.trim()] = v.trim();
    });
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    // Rejeter les événements trop anciens (protection anti-rejeu, tolérance 5 min)
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (isNaN(age) || Math.abs(age) > 300) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(timestamp + '.' + rawBody));
    const computed = [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Comparaison à temps constant
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  } catch (e) {
    return false;
  }
}

// ── Mise à jour (ou création) du plan d'un abonné dans user_plans. ──
// upsert sur user_id : met à jour si la ligne existe, la crée sinon.
// Retourne un objet { ok, detail } pour que l'appelant puisse remonter
// une vraie erreur au lieu d'échouer silencieusement.
async function majPlan(userId, champs, email) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return { ok: false, detail: 'SUPABASE_SERVICE_KEY manquante' };
  if (!userId) return { ok: false, detail: 'user_id absent' };
  const body = Object.assign({ user_id: userId }, champs);
  if (email) body.email = email;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const detail = await resp.text();
    return { ok: false, detail: detail.slice(0, 300) };
  }
  return { ok: true };
}

// Retrouver le user_id à partir d'un abonnement Stripe (via ses métadonnées),
// ou à défaut via le stripe_customer_id déjà stocké.
async function trouverUserId(sub) {
  if (sub && sub.metadata && sub.metadata.user_id) return sub.metadata.user_id;
  const customerId = sub && sub.customer;
  if (!customerId) return null;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return null;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/user_plans?select=user_id&stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
    { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return (rows && rows[0] && rows[0].user_id) || null;
}

function planDepuisSub(sub) {
  try {
    const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
    return PRICE_TO_PLAN[priceId] || null;
  } catch (e) { return null; }
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');

  const valide = await verifierSignatureStripe(rawBody, sig, secret);
  if (!valide) {
    return new Response(JSON.stringify({ error: 'Signature invalide' }), { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Corps invalide' }), { status: 400 });
  }

  try {
    const type = event.type;
    const obj = event.data && event.data.object;

    if (type === 'checkout.session.completed') {
      // Paiement initial réussi — activer le plan et mémoriser le customer Stripe
      const userId = (obj.metadata && obj.metadata.user_id) || obj.client_reference_id;
      const customerId = obj.customer || '';
      const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || null;
      // Récupérer l'abonnement pour connaître le plan
      let plan = null, expiresAt = null;
      if (obj.subscription && process.env.STRIPE_SECRET_KEY) {
        const subResp = await fetch('https://api.stripe.com/v1/subscriptions/' + obj.subscription, {
          headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY }
        });
        if (subResp.ok) {
          const sub = await subResp.json();
          plan = planDepuisSub(sub);
          if (sub.current_period_end) expiresAt = new Date(sub.current_period_end * 1000).toISOString();
        }
      }
      const r = await majPlan(userId, {
        plan: plan || 'starter',
        status: 'active',
        stripe_customer_id: customerId,
        expires_at: expiresAt
      }, email);
      if (!r.ok) {
        // Renvoyer une vraie erreur pour qu'elle soit visible dans Stripe et déclenche un retry
        return new Response(JSON.stringify({ error: 'majPlan a échoué', detail: r.detail }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

    } else if (type === 'invoice.payment_succeeded') {
      // Renouvellement réussi — prolonger la période
      const sub = obj.subscription;
      if (sub && process.env.STRIPE_SECRET_KEY) {
        const subResp = await fetch('https://api.stripe.com/v1/subscriptions/' + sub, {
          headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY }
        });
        if (subResp.ok) {
          const subObj = await subResp.json();
          const userId = await trouverUserId(subObj);
          await majPlan(userId, {
            plan: planDepuisSub(subObj) || 'starter',
            status: 'active',
            expires_at: subObj.current_period_end ? new Date(subObj.current_period_end * 1000).toISOString() : null
          });
        }
      }

    } else if (type === 'invoice.payment_failed') {
      // Échec de paiement — suspendre (le client garde ses données, accès payant coupé)
      const sub = obj.subscription;
      if (sub && process.env.STRIPE_SECRET_KEY) {
        const subResp = await fetch('https://api.stripe.com/v1/subscriptions/' + sub, {
          headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY }
        });
        if (subResp.ok) {
          const subObj = await subResp.json();
          const userId = await trouverUserId(subObj);
          await majPlan(userId, { status: 'suspended' });
        }
      }

    } else if (type === 'customer.subscription.deleted') {
      // Résiliation — retour au plan gratuit
      const userId = await trouverUserId(obj);
      await majPlan(userId, { plan: 'free', status: 'active', expires_at: null });

    } else if (type === 'customer.subscription.updated') {
      // Changement de formule (upgrade/downgrade) ou de statut
      const userId = await trouverUserId(obj);
      const plan = planDepuisSub(obj);
      const statutStripe = obj.status; // active, past_due, canceled, unpaid...
      let status = 'active';
      if (statutStripe === 'past_due' || statutStripe === 'unpaid') status = 'suspended';
      else if (statutStripe === 'canceled') { await majPlan(userId, { plan: 'free', status: 'active', expires_at: null }); }
      if (statutStripe !== 'canceled') {
        await majPlan(userId, {
          plan: plan || 'starter',
          status: status,
          expires_at: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null
        });
      }
    }

    // Toujours répondre 200 rapidement pour que Stripe ne réessaie pas en boucle
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    // On log l'erreur mais on renvoie 200 : un 500 ferait retenter Stripe indéfiniment
    // sur un événement qu'on ne sait pas traiter. Les cas gérés ci-dessus sont sûrs.
    return new Response(JSON.stringify({ received: true, note: String(e && e.message || e) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
