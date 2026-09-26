// Fait progresser (jamais reculer) l'étape d'un prospect du pipeline
// commercial (table Supabase "prospects", voir js/app-config.js /
// PROSP_STAGES) à partir d'un signal d'engagement email — envoi, clic —
// provenant de la séquence de prospection automatique (table "prospection",
// prospection-cron.js / prospection-click.js). Avant ce module, les deux
// tables ne se parlaient pas : un prospect pouvait être relancé plusieurs
// fois par la séquence email sans jamais apparaître dans le pipeline
// commercial.
//
// Même logique de progression que celle déjà utilisée côté client
// (js/app-config.js, syncFromBrevoSender / autoFillAllContacts) : un signal
// plus avancé fait avancer la carte, un signal en retrait (ex. un email
// ré-ouvert après un RDV déjà planifié) ne la fait jamais reculer.
import { escapeIlike } from './ilike.js';

export const ETAPE_ORDER = ['a_contacter', 'email_envoye', 'email_ouvert', 'reponse_recue', 'rdv_planifie', 'devis_envoye', 'negociation', 'gagne', 'perdu'];

// Résolu une seule fois par invocation (voir edouard-cron.js, même pattern) :
// l'intégration est réservée au compte administrateur de la plateforme.
export async function resoudreAdminUserId(SUPABASE_URL, SUPABASE_SERVICE_KEY) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=user_id&data->>userEmail=eq.contact@edl-idf.com&limit=1`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    if (!resp.ok) return '';
    const rows = await resp.json();
    return (rows && rows[0] && rows[0].user_id) || '';
  } catch (e) { return ''; }
}

// Best-effort : une erreur ici (réseau, RLS, etc.) ne doit jamais bloquer
// l'envoi d'un email de prospection ni la capture d'un clic Brevo.
export async function avancerEtapeProspect(SUPABASE_URL, SUPABASE_SERVICE_KEY, userId, email, nouvelleEtape, extra) {
  if (!email || !userId) return;
  const headers = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };
  const rangNouveau = ETAPE_ORDER.indexOf(nouvelleEtape);
  if (rangNouveau < 0) return;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/prospects?select=id,data&user_id=eq.${encodeURIComponent(userId)}&data->>email=ilike.${encodeURIComponent(escapeIlike(email))}&limit=1`,
      { headers }
    );
    if (!resp.ok) return;
    const rows = await resp.json();
    const existant = rows && rows[0];

    if (existant) {
      const d = existant.data || {};
      if (ETAPE_ORDER.indexOf(d.etape) >= rangNouveau) return; // jamais en arrière
      await fetch(`${SUPABASE_URL}/rest/v1/prospects?id=eq.${encodeURIComponent(existant.id)}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { ...d, etape: nouvelleEtape, lastAction: new Date().toISOString().split('T')[0] },
          updated_at: new Date().toISOString()
        })
      });
    } else {
      const id = 'p_prospection_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const data = {
        id,
        agence: (extra && extra.agence) || email.split('@')[0],
        contact: '', email, tel: '', dept: '',
        etape: nouvelleEtape,
        notes: (extra && extra.notes) || '',
        source: 'Séquence prospection',
        createdAt: new Date().toISOString(),
        lastAction: new Date().toISOString().split('T')[0]
      };
      await fetch(`${SUPABASE_URL}/rest/v1/prospects?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ id, data, user_id: userId, updated_at: new Date().toISOString() }])
      });
    }
  } catch (e) { /* best-effort : voir commentaire en tête de fonction */ }
}
