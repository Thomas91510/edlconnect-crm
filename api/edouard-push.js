export const config = { runtime: 'edge' };

const EDOUARD_BASE = 'https://europe-west3-edouard-immo.cloudfunctions.net/api';

// ── Découpe une adresse française, formats tolérés :
// "12 rue Exemple, 75001 Paris" / "12 rue Exemple 75001 Paris"
// "12 rue Exemple, Paris 75001" / "12 rue Exemple, Paris"
function parseAdresse(adresse) {
  const a = (adresse || '').trim().replace(/\s+/g, ' ');
  // Cas standard : rue puis CP puis ville
  let m = a.match(/^(.*?)[,\s]+(\d{5})[\s,]+(.+)$/);
  if (m) {
    return { street: m[1].replace(/,\s*$/, '').trim(), zipCode: m[2], city: m[3].replace(/^,\s*/, '').trim() };
  }
  // Cas inversé : rue puis ville puis CP en fin
  m = a.match(/^(.*?)[,\s]+([A-Za-z\u00C0-\u017F' -]+?)\s+(\d{5})$/);
  if (m) {
    return { street: m[1].replace(/,\s*$/, '').trim(), zipCode: m[3], city: m[2].trim() };
  }
  // Pas de code postal : dernière partie après virgule = ville
  const parts = a.split(',');
  if (parts.length >= 2) {
    const city = parts[parts.length - 1].trim();
    // Éviter de prendre un numéro ou complément pour une ville
    if (city && !/\d/.test(city)) {
      return { street: parts.slice(0, -1).join(',').trim(), zipCode: '', city: city };
    }
  }
  return { street: a, zipCode: '', city: '' };
}

// ── Convertit "06 12 34 56 78" / "+33 6 12..." en numéro local sans préfixe (integer) ──
function parseTel(tel) {
  let t = (tel || '').replace(/[^\d+]/g, '');
  if (t.startsWith('+33')) t = t.slice(3);
  else if (t.startsWith('0033')) t = t.slice(4);
  if (t.startsWith('0')) t = t.slice(1);
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

// ── Sépare "Jean Dupont" en prénom / nom (best effort) ──
function parseNom(nomComplet) {
  const parts = (nomComplet || '').trim().split(/\s+/);
  if (parts.length >= 2) {
    return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
  }
  return { firstname: '', lastname: nomComplet || '' };
}

async function edouardPost(path, body, apiKey) {
  const resp = await fetch(EDOUARD_BASE + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await resp.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* réponse non-JSON */ }
  return { ok: resp.ok, status: resp.status, data: data, raw: text };
}

export default async function handler(req) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  // ── Authentification obligatoire : jeton de session Supabase ──
  const _authHeader = req.headers.get('authorization') || '';
  const _token = _authHeader.replace('Bearer ', '').trim();
  if (!_token) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401, headers: CORS });
  }
  const _userResp = await fetch('https://pvuctwflxvvxdawsxceu.supabase.co/auth/v1/user', {
    headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic', 'Authorization': 'Bearer ' + _token }
  });
  if (!_userResp.ok) {
    return new Response(JSON.stringify({ error: 'Session invalide ou expirée' }), { status: 401, headers: CORS });
  }

  const EDOUARD_KEY = process.env.EDOUARD_API_KEY;
  if (!EDOUARD_KEY) {
    return new Response(JSON.stringify({ error: 'Clé Edouard manquante (EDOUARD_API_KEY)' }), { status: 500, headers: CORS });
  }

  try {
    const { mission } = await req.json();
    if (!mission || !mission.adresse) {
      return new Response(JSON.stringify({ error: 'Mission ou adresse manquante' }), { status: 400, headers: CORS });
    }

    const result = { accommodationId: null, tenantIds: [], ownerId: null, warnings: [] };

    // ── 1. Créer le logement ──
    const addr = parseAdresse(mission.adresse);
    if (!addr.city) {
      // street + city sont requis par l'API Edouard : fallback sur l'adresse brute
      addr.city = 'Non renseignée';
      result.warnings.push('Ville non détectée dans l\u2019adresse, à corriger dans Edouard');
    }
    const meuble = (mission.bienMeuble || '').toLowerCase();
    const isFurnished = meuble.includes('meubl') && !meuble.includes('non') && !meuble.includes('vide');

    // Typologie T1/T2/T3... -> nombre de pièces
    let roomNumber;
    const typoMatch = (mission.bienTypo || '').match(/[TF](\d+)/i);
    if (typoMatch) roomNumber = parseInt(typoMatch[1], 10);

    const accBody = {
      type: mission.bienType || 'Appartement',
      isFurnished: isFurnished,
      surface: mission.superficie ? String(mission.superficie) : '',
      street: addr.street,
      zipCode: addr.zipCode,
      city: addr.city,
      reference: mission.id || '',
      notes: [
        mission.type ? 'Type EDL : ' + mission.type : '',
        mission.agence ? 'Agence : ' + mission.agence : '',
        mission.acces ? 'Acc\u00e8s : ' + mission.acces : '',
        'Cr\u00e9\u00e9 automatiquement depuis Lokentia'
      ].filter(Boolean).join(' | ')
    };
    if (roomNumber) accBody.roomNumber = roomNumber;

    const accResp = await edouardPost('/v1/accommodations', accBody, EDOUARD_KEY);
    if (!accResp.ok) {
      return new Response(JSON.stringify({
        error: 'Erreur Edouard (logement)',
        status: accResp.status,
        details: accResp.data || accResp.raw
      }), { status: 502, headers: CORS });
    }
    result.accommodationId = (accResp.data && (accResp.data.id || (accResp.data.data && accResp.data.data.id))) || null;

    // ── 2. Créer les locataires ──
    const locataires = (mission.locataires && mission.locataires.length > 0)
      ? mission.locataires
      : (mission.locataireNom ? [{
          civilite: mission.locataireCivilite || '',
          nom: mission.locataireNom || '',
          tel: mission.locataireTel || '',
          email: mission.locataireEmail || ''
        }] : []);

    for (const loc of locataires) {
      if (!loc || !loc.nom) continue;
      const noms = parseNom(loc.nom);
      const persBody = {
        title: loc.civilite || '',
        firstname: noms.firstname,
        lastname: noms.lastname,
        email: loc.email || '',
        countryCode: 'FR',
        prefixPhone: '+33',
        notes: 'Locataire | Import Lokentia | Mission ' + (mission.id || ''),
        isAgent: false
      };
      const tel = parseTel(loc.tel);
      if (tel) persBody.phone = tel;

      const persResp = await edouardPost('/v1/persons', persBody, EDOUARD_KEY);
      if (persResp.ok) {
        const pid = (persResp.data && (persResp.data.id || (persResp.data.data && persResp.data.data.id))) || null;
        if (pid) result.tenantIds.push(pid);
      } else {
        result.warnings.push('Locataire "' + loc.nom + '" non cr\u00e9\u00e9 (HTTP ' + persResp.status + ')');
      }
    }

    // ── 3. Créer le propriétaire (si renseigné) ──
    if (mission.proprietaire) {
      const nomsProprio = parseNom(mission.proprietaire);
      const proprioBody = {
        firstname: nomsProprio.firstname,
        lastname: nomsProprio.lastname,
        countryCode: 'FR',
        prefixPhone: '+33',
        notes: 'Propri\u00e9taire | Import Lokentia | Mission ' + (mission.id || ''),
        isAgent: false
      };
      const proprioResp = await edouardPost('/v1/persons', proprioBody, EDOUARD_KEY);
      if (proprioResp.ok) {
        result.ownerId = (proprioResp.data && (proprioResp.data.id || (proprioResp.data.data && proprioResp.data.data.id))) || null;
      } else {
        result.warnings.push('Propri\u00e9taire non cr\u00e9\u00e9 (HTTP ' + proprioResp.status + ')');
      }
    }

    return new Response(JSON.stringify({ success: true, edouard: result }), { status: 200, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Erreur serveur', details: String(e && e.message || e) }), { status: 500, headers: CORS });
  }
}
