export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CAL_WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET; // optionnel — à définir plus tard dans Vercel si tu veux sécuriser

// ── Vérification de la signature Cal.com (optionnelle) ──────
// Cal.com signe ses webhooks avec HMAC SHA-256 (header x-cal-signature-256).
// Si CAL_WEBHOOK_SECRET n'est pas configuré, on accepte sans vérifier
// (pratique pour les premiers tests, à activer avant la mise en prod réelle).
async function verifySignature(rawBody, signatureHeader) {
  if (!CAL_WEBHOOK_SECRET) return true; // pas de secret configuré → on laisse passer
  if (!signatureHeader) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(CAL_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const computed = [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === signatureHeader;
}

// ── Extraction robuste des champs depuis le payload Cal.com ──
// Le format exact peut varier légèrement selon le type d'événement / version Cal.com,
// donc on essaie plusieurs chemins possibles pour chaque champ.
function extractBookingData(body) {
  const p = body.payload || body;

  const attendee = (p.attendees && p.attendees[0]) || {};
  const responses = p.responses || {};

  const getResponse = (...keys) => {
    for (const k of keys) {
      if (responses[k] && responses[k].value) return responses[k].value;
    }
    return '';
  };

  const startTime = p.startTime || p.start || '';
  let dateSouhaitee = '';
  let heure = '';
  if (startTime) {
    const d = new Date(startTime);
    dateSouhaitee = d.toISOString().split('T')[0];
    heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  return {
    triggerEvent: body.triggerEvent || '',
    uid: p.uid || p.bookingId || ('cal_' + Date.now()),
    eventTitle: p.title || (p.eventType && p.eventType.title) || '',
    // Contact (côté agence — celui qui réserve)
    contact: attendee.name || getResponse('name') || '',
    email: attendee.email || getResponse('email') || '',
    tel: attendee.phoneNumber || getResponse('phone', 'attendeePhoneNumber') || '',
    agence: getResponse('agence', 'agency', 'company') || attendee.name || '',
    // Détails du rendez-vous
    typeEdl: p.eventType?.title || p.title || 'EDL (via Cal.com)',
    adresse: getResponse('adresse', 'address', 'location') || p.location || '',
    notes: p.description || getResponse('notes', 'notes2') || '',
    dateSouhaitee,
    heure,
    // Locataire (si capturé via un champ personnalisé Cal.com — à adapter selon tes vrais champs)
    locataire: {
      nom: getResponse('locataireNom', 'tenantName') || '',
      tel: getResponse('locataireTel', 'tenantPhone') || '',
      email: getResponse('locataireEmail', 'tenantEmail') || ''
    }
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-cal-signature-256',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-cal-signature-256');

    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Signature invalide' }), { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // On ne traite que les créations de réservation pour l'instant
    // (BOOKING_CANCELLED / BOOKING_RESCHEDULED pourront être gérés dans un second temps)
    if (body.triggerEvent && body.triggerEvent !== 'BOOKING_CREATED') {
      return new Response(JSON.stringify({ success: true, ignored: body.triggerEvent }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = extractBookingData(body);

    if (!SUPABASE_SERVICE_KEY || !SUPABASE_URL) {
      return new Response(JSON.stringify({ error: 'Variables Supabase manquantes' }), { status: 500 });
    }

    const bookingId = 'calcom_' + (data.uid || Date.now());
    const createdAt = new Date().toISOString();

    const bookingData = {
      id: bookingId,
      agencyId: '',
      agence: data.agence || data.contact || 'Réservation Cal.com',
      contact: data.contact,
      email: data.email,
      tel: data.tel,
      typeEdl: data.typeEdl,
      adresse: data.adresse,
      bienType: '', bienTypo: '', meuble: '', superficie: '', dateEntree: '', acces: '',
      dateSouhaitee: data.dateSouhaitee,
      heure: data.heure,
      notes: data.notes,
      locataire: data.locataire,
      locataires: [data.locataire].filter(l => l.nom || l.tel || l.email),
      locataireCivilite: '',
      locataireNom: data.locataire.nom,
      locataireTel: data.locataire.tel,
      locataireEmail: data.locataire.email,
      source: 'calcom',
      calComEventTitle: data.eventTitle,
      statut: 'en_attente', // reste à valider manuellement dans le CRM pour l'instant — sécurité avant mise en prod
      rdvConfirme: false,
      createdAt
    };

    await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ id: bookingId, data: bookingData, created_at: createdAt, updated_at: createdAt })
    });

    return new Response(JSON.stringify({ success: true, bookingId }), {
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
