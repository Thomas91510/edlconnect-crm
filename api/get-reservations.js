export const config = { runtime: 'edge' };

export default async function handler(req) {
  if(req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if(!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?select=id,data,created_at&order=created_at.desc&limit=100`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if(!resp.ok) {
      const err = await resp.text();
      return new Response(JSON.stringify({ error: 'Supabase: ' + err }), { status: 500 });
    }

    const rows = await resp.json();
    const reservations = (rows || []).map(r => ({ ...r.data, _supaId: r.id }));

    return new Response(JSON.stringify(reservations), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
