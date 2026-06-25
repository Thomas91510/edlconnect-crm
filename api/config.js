export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  return new Response(JSON.stringify({
    brevo_api_key: process.env.BREVO_API_KEY || '',
  }), { status: 200, headers });
}
