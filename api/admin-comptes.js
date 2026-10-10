export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
import { escapeIlike } from './_lib/ilike.js';

// Liste des comptes pour l'onglet Plateforme (admin uniquement), à partir
// des comptes de connexion Supabase Auth — et non plus de la seule table
// user_plans, qui ne contient pas les comptes jamais passés par
// l'inscription au CRM (agences connectées à leur extranet, inscriptions
// interrompues).
//
// Chaque compte est classé :
//   - « agence » : rôle agence dans user_plans, ou compte sans plan ni
//     réglages CRM dont l'email est celui d'un client d'un abonné (connexion
//     à l'extranet). Son accès se gère dans Espaces agences ;
//   - « abonne » : tout le reste (abonnés du CRM, comptes de test, comptes
//     sans plan inconnus), gérable depuis Plateforme.
export function classerCompte({ plan, aReglages, estClient }) {
  if (plan && plan.role === 'agence') return 'agence';
  if (!plan && !aReglages && estClient) return 'agence';
  return 'abonne';
}

async function listerUtilisateurs(h) {
  const tous = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=500`, { headers: h });
    if (!r.ok) throw new Error('Lecture des comptes impossible (HTTP ' + r.status + ')');
    const corps = await r.json();
    const users = Array.isArray(corps) ? corps : ((corps && corps.users) || []);
    tous.push(...users);
    if (users.length < 500) break;
  }
  return tous;
}

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origineAutorisee(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  const reponse = (corps, status) => new Response(JSON.stringify(corps), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') return reponse({ error: 'Method not allowed' }, 405);

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '').trim();
  if (!token) return reponse({ error: 'Non authentifié' }, 401);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResp.ok) return reponse({ error: 'Session invalide ou expirée' }, 401);
  const caller = await userResp.json();
  const callerEmail = String((caller && caller.email) || '').toLowerCase().trim();
  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
    return reponse({ error: 'Accès réservé aux administrateurs' }, 403);
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return reponse({ error: 'Configuration serveur manquante' }, 500);
  const h = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    const [users, plansResp, reglagesResp] = await Promise.all([
      listerUtilisateurs(h),
      fetch(`${SUPABASE_URL}/rest/v1/user_plans?select=*`, { headers: h }),
      fetch(`${SUPABASE_URL}/rest/v1/settings?select=user_id`, { headers: h }),
    ]);
    if (!plansResp.ok || !reglagesResp.ok) throw new Error('Lecture des plans impossible');
    const plans = new Map((await plansResp.json()).map(p => [p.user_id, p]));
    const avecReglages = new Set((await reglagesResp.json()).map(s => s.user_id));

    // Seuls les comptes sans plan ni réglages peuvent être des agences non
    // marquées : on ne cherche que leur email parmi les clients (peu nombreux).
    const estClient = new Map();
    await Promise.all(users
      .filter(u => u && u.email && !plans.has(u.id) && !avecReglages.has(u.id))
      .map(async u => {
        const email = String(u.email).toLowerCase().trim();
        const r = await fetch(`${SUPABASE_URL}/rest/v1/contacts?select=id&limit=1&data->>email=ilike.${encodeURIComponent(escapeIlike(email))}`, { headers: h }).catch(() => null);
        const lignes = r && r.ok ? await r.json() : [];
        estClient.set(u.id, lignes.length > 0);
      }));

    const maintenant = Date.now();
    const comptes = users.filter(u => u && u.id).map(u => {
      const plan = plans.get(u.id) || null;
      const banni = !!(u.banned_until && Date.parse(u.banned_until) > maintenant);
      return {
        user_id: u.id,
        email: String((plan && plan.email) || u.email || '').toLowerCase(),
        plan: plan ? plan.plan : null,
        status: plan ? plan.status : (banni ? 'disabled' : 'active'),
        expires_at: plan ? plan.expires_at : null,
        notes: plan ? plan.notes : null,
        role: plan ? plan.role : null,
        created_at: (plan && plan.created_at) || u.created_at || null,
        derniere_connexion: u.last_sign_in_at || null,
        sans_plan: !plan,
        type: classerCompte({ plan, aReglages: avecReglages.has(u.id), estClient: estClient.get(u.id) }),
      };
    }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    return reponse({ comptes }, 200);
  } catch (e) {
    return reponse({ error: e.message }, 500);
  }
}
