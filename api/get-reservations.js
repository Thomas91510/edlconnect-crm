export const config = { runtime: 'edge' };

export default async function handler(req) {
  if(req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if(!SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Service key manquante' }), { status: 500 });
  }

  try {
    // Lire TOUTES les missions avec la service key (bypass RLS)
    let allRows = [];
    let from = 0;
    const pageSize = 1000;

    while(true) {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/missions?select=id,data,user_id&range=${from}-${from + pageSize - 1}`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Range-Unit': 'items'
          }
        }
      );

      if(!resp.ok) {
        const err = await resp.text();
        throw new Error('Supabase error: ' + err);
      }

      const rows = await resp.json();
      if(!rows || rows.length === 0) break;
      allRows = allRows.concat(rows);
      if(rows.length < pageSize) break;
      from += pageSize;
    }

    // Filtrer uniquement les missions venant du booking
    const reservations = allRows
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
