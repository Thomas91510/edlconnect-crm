export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Sécurité : vérifier le token Vercel Cron
  const authHeader = req.headers.get('authorization');
  if(authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const BREVO_KEY = process.env.BREVO_API_KEY;
  const SUPA_URL  = process.env.SUPABASE_URL;
  const SUPA_KEY  = process.env.SUPABASE_SERVICE_KEY;

  if(!BREVO_KEY || !SUPA_URL || !SUPA_KEY) {
    return new Response(JSON.stringify({ error: 'Variables manquantes' }), { status: 500 });
  }

  try {
    // Calculer la date J+13 (inscriptions il y a 13 jours)
    const now = new Date();
    const j13start = new Date(now);
    j13start.setDate(j13start.getDate() - 13);
    j13start.setHours(0, 0, 0, 0);
    const j13end = new Date(j13start);
    j13end.setHours(23, 59, 59, 999);

    // Récupérer les utilisateurs inscrits il y a exactement 13 jours
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/user_plans?created_at=gte.${j13start.toISOString()}&created_at=lte.${j13end.toISOString()}&plan=eq.free&status=eq.active&select=email,created_at`,
      {
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const users = await resp.json();
    if(!users || !users.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'Aucun utilisateur à J+13' }), { status: 200 });
    }

    let sent = 0;
    for(const user of users) {
      if(!user.email) continue;

      const emailResp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_KEY
        },
        body: JSON.stringify({
          sender: { name: 'Lokentia', email: 'contact@lokentia.fr' },
          to: [{ email: user.email }],
          subject: '⏰ Votre essai gratuit Lokentia se termine demain',
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
              <div style="background:#1A5FA8;padding:24px;text-align:center;border-radius:12px 12px 0 0">
                <div style="background:#F4F7FA;display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:11px;margin-bottom:8px">
                  <span style="font-size:22px;font-weight:700;color:#1A5FA8">ED</span>
                </div>
                <div style="color:#fff;font-size:20px;font-weight:700">Lokentia</div>
              </div>
              <div style="background:#fff;padding:32px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px">
                <h2 style="font-size:20px;margin-bottom:12px">⏰ Votre essai se termine demain !</h2>
                <p style="color:#6b6b6b;line-height:1.7;margin-bottom:20px">
                  Votre période d'essai gratuit d'Lokentia arrive à son terme dans <strong>24 heures</strong>.
                </p>
                <p style="color:#6b6b6b;line-height:1.7;margin-bottom:24px">
                  Pour continuer à gérer vos missions, contacts et factures sans interruption, 
                  choisissez le plan qui vous convient :
                </p>
                <div style="background:#f8f8f6;border-radius:8px;padding:16px;margin-bottom:24px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #e5e5e2">
                    <div>
                      <div style="font-weight:600">Starter</div>
                      <div style="font-size:12px;color:#6b6b6b">500 contacts · 100 missions</div>
                    </div>
                    <div style="font-weight:700;color:#1A5FA8;font-size:18px">15 €/mois</div>
                  </div>
                  <div style="display:flex;justify-content:space-between">
                    <div>
                      <div style="font-weight:600">Pro</div>
                      <div style="font-size:12px;color:#6b6b6b">Illimité · IA · Support prioritaire</div>
                    </div>
                    <div style="font-weight:700;color:#1A5FA8;font-size:18px">35 €/mois</div>
                  </div>
                </div>
                <div style="text-align:center;margin-bottom:24px">
                  <a href="https://app.lokentia.fr" 
                     style="background:#1A5FA8;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
                    Choisir mon abonnement →
                  </a>
                </div>
                <p style="font-size:12px;color:#999;text-align:center">
                  Des questions ? Contactez-nous : 
                  <a href="mailto:contact@lokentia.fr" style="color:#1A5FA8">contact@lokentia.fr</a> · 
                  <a href="tel:0185460033" style="color:#1A5FA8">01 85 46 00 33</a>
                </p>
              </div>
            </div>
          `
        })
      });

      if(emailResp.ok) sent++;
    }

    // ── Sauvegarde quotidienne automatique (ne doit jamais bloquer le cron) ──
    let sauvegarde = null;
    try {
      const bResp = await fetch('https://app.lokentia.fr/api/backup-auto', {
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` }
      });
      const bj = await bResp.json();
      sauvegarde = bj.journal || { erreur: 'HTTP ' + bResp.status };
    } catch(e) {
      sauvegarde = { erreur: String(e && e.message || e) };
    }

    return new Response(JSON.stringify({ sent, total: users.length, sauvegarde }), { status: 200 });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

