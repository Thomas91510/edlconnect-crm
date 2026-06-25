export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  return new Response(JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_ANON_KEY || '',
    brevoKey: process.env.BREVO_API_KEY ? 'ok' : 'missing',
  }), { status: 200, headers });
}
