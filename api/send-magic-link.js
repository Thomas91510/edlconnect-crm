const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: 'Email requis' }); return; }

    const magicLinkResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'magiclink',
        email: email,
        options: { redirect_to: 'https://app.edlconnect.fr/extranet-app' }
      })
    });

    if (!magicLinkResp.ok) {
      const err = await magicLinkResp.json();
      res.status(500).json({ error: err.message || 'Erreur génération lien' });
      return;
    }

    const linkData = await magicLinkResp.json();
    const magicLink = linkData.action_link;
    if (!magicLink) { res.status(500).json({ error: 'Lien magique non généré' }); return; }

    const htmlContent = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8f8f6;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;padding:20px 0"><div style="background:#185FA5;padding:24px;border-radius:12px 12px 0 0;text-align:center"><div style="color:#fff;font-size:20px;font-weight:700">EDL IDF Expert en État des Lieux</div><div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px">Espace client EDLConnect</div></div><div style="background:#fff;padding:32px;border:1px solid #e5e5e2;border-top:none;border-radius:0 0 12px 12px"><p style="font-size:15px;color:#1a1a1a;font-weight:600;margin:0 0 8px 0">🔑 Votre lien de connexion</p><p style="font-size:13px;color:#444;line-height:1.8;margin:0 0 24px 0">Vous avez demandé à accéder à votre espace client.<br>Cliquez sur le bouton ci-dessous pour vous connecter — ce lien est valable <strong>10 minutes</strong> et ne peut être utilisé qu'une seule fois.</p><div style="text-align:center;margin-bottom:24px"><a href="${magicLink}" style="display:inline-block;background:#185FA5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Accéder à mon espace client →</a></div><div style="background:#E6F1FB;border-radius:8px;padding:14px;margin-bottom:24px;font-size:12px;color:#0C447C;line-height:1.8">🔒 <strong>Lien sécurisé :</strong> Si vous n'avez pas demandé ce lien, ignorez simplement cet email.<br>Ce lien expire automatiquement après 10 minutes.</div><div style="background:#f8f8f6;border-radius:8px;padding:16px;margin-bottom:20px"><div style="font-size:12px;font-weight:600;color:#185FA5;margin-bottom:8px">Dans votre espace client vous retrouverez :</div><div style="font-size:12px;color:#444;line-height:2">✅ Historique de vos commandes et statuts<br>✅ Passer une nouvelle commande<br>✅ Vos statistiques mensuelles<br>✅ Vos documents partagés</div></div><div style="border-top:2px solid #185FA5;padding-top:16px;font-size:12px;color:#185FA5"><strong>Thomas LANGLADE</strong><br><span style="color:#6b6b6b">Directeur Général — EDL IDF Expert en État des Lieux</span><br><span style="color:#6b6b6b">📞 01 89 29 14 29 · ✉️ contact@edl-idf.com</span></div></div><div style="text-align:center;font-size:11px;color:#999;padding:16px">EDL IDF Expert en État des Lieux · 18 Grande Rue, 91510 Lardy</div></div></body></html>`;

    const brevoResp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'EDL IDF Expert en État des Lieux', email: 'contact@edl-idf.com' },
        to: [{ email }],
        subject: '🔑 Votre lien de connexion — Espace client EDLConnect',
        htmlContent
      })
    });

    if (!brevoResp.ok) {
      const err = await brevoResp.json();
      res.status(500).json({ error: err.message || 'Erreur envoi email' });
      return;
    }

    res.status(200).json({ success: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
