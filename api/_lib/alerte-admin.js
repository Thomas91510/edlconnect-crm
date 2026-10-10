// Alerte par email à l'exploitant de la plateforme (ADMIN_EMAILS[0]) quand
// une tâche automatique échoue sans que personne ne regarde (sauvegarde
// quotidienne notamment). Best-effort : ne lance jamais d'exception.
import { ADMIN_EMAILS } from './admin.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function alerterAdmin(sujet, lignes, fetchFn = fetch) {
  const cle = process.env.BREVO_API_KEY;
  if (!cle || !ADMIN_EMAILS[0]) return false;
  const liste = (Array.isArray(lignes) ? lignes : [lignes]).filter(Boolean).map(l => `<li>${esc(l)}</li>`).join('');
  try {
    const r = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': cle },
      body: JSON.stringify({
        sender: { name: 'Lokentia — alerte', email: 'contact@lokentia.fr' },
        to: [{ email: ADMIN_EMAILS[0] }],
        subject: '⚠️ ' + sujet,
        htmlContent: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6"><p><strong>${esc(sujet)}</strong></p><ul>${liste}</ul><p style="color:#666;font-size:12px">Message automatique de la plateforme Lokentia (${esc(new Date().toISOString())}).</p></div>`,
      }),
    });
    return r.ok;
  } catch (_) {
    return false;
  }
}
