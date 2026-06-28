export const config = { runtime: 'edge' };

export default async function handler(req) {
  if(req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if(!SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_KEY manquante' }), { status: 500 });
  }
  if(!SUPABASE_URL) {
    return new Response(JSON.stringify({ error: 'SUPABASE_URL manquante' }), { status: 500 });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/missions?select=id,data,user_id&limit=1000`;
    
    const resp = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if(!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ 
        error: 'Supabase error ' + resp.status, 
        detail: errText,
        url: url.replace(SUPABASE_URL, '[URL]')
      }), { status: 500 });
    }

    const rows = await resp.json();

    // Filtrer uniquement les missions venant du booking
    const reservations = (rows || [])
      .filter(r => r.data && r.data.source === 'booking')
      .map(r => ({ ...r.data, _supaId: r.id, _userId: r.user_id }));

    return new Response(JSON.stringify(reservations), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
