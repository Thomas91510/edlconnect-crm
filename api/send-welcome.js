export const config = { runtime: 'edge' };

export default async function handler(req) {
  if(req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if(req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if(!BREVO_KEY) {
    return new Response(JSON.stringify({ error: 'Clé Brevo manquante' }), { status: 500 });
  }

  try {
    const { email, companyName, agencyId } = await req.json();
    // Générer le lien booking personnalisé
    const agencySlug = (companyName||'').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const bookingLink = `https://app.edlconnect.fr/booking?agency=${agencySlug}&name=${encodeURIComponent(companyName||'')}`;
    if(!email) return new Response(JSON.stringify({ error: 'Email requis' }), { status: 400 });

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_KEY
      },
      body: JSON.stringify({
        sender: { name: 'Thomas — EDLConnect', email: 'contact@edlconnect.fr' },
        to: [{ email }],
        subject: '👋 Bienvenue sur EDLConnect — votre essai de 15 jours commence !',
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
            <div style="background:#185FA5;padding:24px;text-align:center;border-radius:12px 12px 0 0">
              <div style="background:#E6F1FB;display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;margin-bottom:10px">
                <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
                  <tr>
                    <td style="padding:0;line-height:1">
                      <span style="font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#185FA5;letter-spacing:-1px">E</span>
                    </td>
                    <td style="padding:0 0 0 1px;line-height:1">
                      <span style="font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#185FA5">D</span>
                    </td>
                    <td style="padding:0 0 4px 2px;vertical-align:bottom;line-height:1">
                      <span style="display:inline-block;width:8px;height:14px;border:2.5px solid #185FA5;border-left:none;border-radius:0 6px 6px 0"></span>
                    </td>
                  </tr>
                </table>
              </div>
              <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">EDLConnect</div>
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="font-size:22px;margin-bottom:12px">Bienvenue sur EDLConnect ! 🎉</h2>
              <p style="color:#6b6b6b;line-height:1.7;margin-bottom:20px">
                ${companyName ? `Bonjour et bienvenue <strong>${companyName}</strong> !` : 'Bonjour et bienvenue !'}
                <br>Votre essai gratuit de <strong>15 jours</strong> vient de commencer.
              </p>
              <div style="background:#E6F1FB;border-radius:8px;padding:16px;margin-bottom:24px">
                <div style="font-weight:600;color:#185FA5;margin-bottom:8px">🚀 Pour bien démarrer :</div>
                <div style="font-size:13px;color:#0C447C;line-height:1.8">
                  ✅ Configurez votre profil dans <strong>Paramètres</strong><br>
                  ✅ Ajoutez vos premiers contacts dans <strong>Contacts & Agences</strong><br>
                  ✅ Créez votre première mission dans <strong>Missions EDL</strong><br>
                  ✅ Connectez Brevo pour l'envoi d'emails
                </div>
              </div>
              <div style="text-align:center;margin-bottom:20px">
                <a href="https://app.edlconnect.fr" 
                   style="background:#185FA5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
                  Accéder à mon CRM →
                </a>
              </div>
              ${companyName ? `
              <div style="background:#EAF3DE;border-radius:8px;padding:16px;margin-bottom:20px">
                <div style="font-weight:600;color:#3B6D11;margin-bottom:6px">🔗 Votre lien de réservation personnalisé</div>
                <div style="font-size:12px;color:#27500A;margin-bottom:10px">Partagez ce lien à vos agences pour qu'elles puissent faire leurs demandes d'état des lieux directement :</div>
                <a href="${bookingLink}" style="display:block;background:#fff;border:1px solid #3B6D11;border-radius:6px;padding:10px 14px;font-size:11px;color:#185FA5;text-decoration:none;word-break:break-all">${bookingLink}</a>
              </div>` : ''}
              <div style="background:#f8f8f6;border-radius:8px;padding:14px;font-size:13px;color:#6b6b6b;line-height:1.7">
                <strong>Une question ?</strong> Je suis disponible pour vous aider à bien démarrer.<br>
                📞 <a href="tel:0185460033" style="color:#185FA5">01 85 46 00 33</a> · 
                ✉️ <a href="mailto:contact@edlconnect.fr" style="color:#185FA5">contact@edlconnect.fr</a>
              </div>
              <p style="font-size:12px;color:#999;text-align:center;margin-top:20px">
                Thomas Langlade — EDLConnect<br>
                L'outil CRM pensé pour les experts en état des lieux
              </p>
            </div>
          </div>
        `
      })
    });

    if(resp.ok) {
      return new Response(JSON.stringify({ success: true }), { 
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
      });
    } else {
      const err = await resp.json();
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
