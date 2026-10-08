export const config = { runtime: 'edge' };

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_lib/supabase.js';
import { origineAutorisee } from './_lib/cors.js';
import { escapeIlike } from './_lib/ilike.js';
import { ADMIN_EMAILS } from './_lib/admin.js';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': origineAutorisee(req),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
    }

    // 1) Vérifier le token et récupérer l'email du client connecté
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!userResp.ok) {
      return new Response(JSON.stringify({ error: 'Session invalide, merci de vous reconnecter.' }), { status: 401 });
    }

    const userData = await userResp.json();
    const callerEmail = (userData.email || '').toLowerCase().trim();

    if (!callerEmail) {
      return new Response(JSON.stringify({ error: 'Email introuvable sur ce compte.' }), { status: 400 });
    }

    // ── Aperçu admin : un administrateur peut consulter les commandes d'un
    // autre client (ex. vérifier ce qu'une agence voit avec ses rapports),
    // en précisant "clientEmail" dans le corps — jamais accepté pour un
    // appelant non-admin, qui ne voit toujours que ses propres commandes.
    let userEmail = callerEmail;
    if (ADMIN_EMAILS.includes(callerEmail)) {
      let body = {};
      try { body = await req.json(); } catch (_) {}
      const clientEmail = (body && body.clientEmail || '').toLowerCase().trim();
      if (clientEmail) userEmail = clientEmail;
    }

    const supaHeaders = {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    };

    // 2) Récupérer uniquement les commandes liées à cette adresse email
    //    (filtre direct côté base, on ne renvoie jamais les données des autres clients)
    // Filtre sur la colonne JSONB "data" — syntaxe PostgREST correcte
    const filterUrl = `${SUPABASE_URL}/rest/v1/bookings?select=id,data,created_at&data->email=eq.%22${encodeURIComponent(userEmail)}%22&order=created_at.desc`;

    const bookingsResp = await fetch(filterUrl, { headers: supaHeaders });

    if (!bookingsResp.ok) {
      return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des commandes.' }), { status: 500 });
    }

    const rows = await bookingsResp.json();

    // Récupérer aussi les missions liées à cet email pour synchroniser le statut "réalisé"
    // Insensible à la casse : « Agence@x.fr » sur la mission et « agence@x.fr »
    // pour le compte extranet désignent bien la même agence.
    const missionsUrl = `${SUPABASE_URL}/rest/v1/missions?select=id,data&data->>emailClient=ilike.${encodeURIComponent(escapeIlike(userEmail))}`;
    let missionRows = [];
    try {
      const mResp = await fetch(missionsUrl, { headers: supaHeaders });
      if(mResp.ok) missionRows = await mResp.json();
    } catch(_){}

    // Index des missions par missionId pour lookup rapide
    const missionMap = {};
    (missionRows || []).forEach(m => {
      if(m.data?.missionId) missionMap[m.data.missionId] = m.data;
      if(m.id) missionMap[m.id] = m.data;
    });

    // Documents (rapports Edouard ou ajoutés à la main) taggés avec la
    // mission exacte à laquelle ils appartiennent — permet de proposer un
    // lien direct vers CE rapport plutôt qu'une liste de documents non
    // reliée à la demande consultée.
    const docsParMission = {};
    try {
      const docsResp = await fetch(
        `${SUPABASE_URL}/rest/v1/contacts?select=data&data->>email=ilike.${encodeURIComponent(escapeIlike(userEmail))}`,
        { headers: supaHeaders }
      );
      if (docsResp.ok) {
        const contactRows = await docsResp.json();
        (contactRows || []).forEach(c => {
          (c.data?.documents || []).forEach(d => {
            if (d && d.url && d.missionId) docsParMission[d.missionId] = d;
          });
        });
      }
    } catch(_){}

    const missions = (missionRows || []).map(m => ({ ...(m.data || {}), id: m.id }));
    const missionsLiees = new Set();
    const normAdr = (a) => String(a || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const jour = (d) => String(d || '').slice(0, 10);
    // Réservation → mission : par missionId (écrit à la confirmation), sinon
    // même adresse et même jour (missionId absent sur d'anciennes
    // réservations : sans ce repli, elles restaient « Rendez-vous confirmé »
    // pour toujours, rapport compris).
    const missionDe = (r) => {
      const parId = missionMap[r.data?.missionId];
      if (parId) return parId;
      const adr = normAdr(r.data?.adresse);
      const j = jour(r.data?.dateSouhaitee);
      if (!adr) return null;
      return missions.find(m => !missionsLiees.has(m.id) && normAdr(m.adresse) === adr && (!j || !m.date || jour(m.date) === j)) || null;
    };
    // Rapports d'une mission : document rattaché à la fiche, sinon ceux
    // enregistrés sur la mission par la relève Edouard.
    const rapportsDe = (m) => {
      if (!m) return [];
      const liste = Array.isArray(m.rapports) && m.rapports.length ? m.rapports
        : (m.rapportUrl ? [{ nom: 'Rapport', url: m.rapportUrl }] : []);
      const out = liste.filter(x => x && x.url).map(x => ({ nom: String(x.nom || 'Rapport'), url: x.url, type: x.type || null, date: x.date || '' }));
      const doc = m.id ? docsParMission[m.id] : null;
      if (doc && !out.some(x => x.url === doc.url)) out.unshift({ nom: doc.nom || 'Rapport', url: doc.url, type: null, date: '' });
      return out;
    };

    const orders = (rows || []).map(r => {
      // Une mission liée est-elle réellement effectuée ? "terminée" est
      // désormais le seul statut que le CRM écrit pour une mission achevée
      // ("facturée" a disparu avec la génération de factures dans le CRM ;
      // "réalisée" n'est plus écrit par la synchro Edouard depuis le 12/09,
      // mais reste accepté ici pour les missions déjà marquées ainsi avant
      // ce correctif). Le rapport EDL (Edouard) se synchronise en temps réel
      // avec les locataires : pas de palier intermédiaire "réalisé sans
      // rapport" à afficher, on passe directement à "rapport disponible".
      const linkedMission = missionDe(r);
      if (linkedMission && linkedMission.id) missionsLiees.add(linkedMission.id);
      const missionAnnulee = linkedMission && linkedMission.statut === 'annulée';
      const missionEffectuee = linkedMission && ['terminée', 'réalisée'].includes(linkedMission.statut);
      let statut = r.data?.statut || 'en_attente';
      let rapportUrl = '';
      let rapports = [];
      // Le statut de la reservation elle-meme (r.data.statut, ecrit une
      // seule fois a la confirmation) ne se met jamais a jour tout seul si
      // la mission liee change ensuite — on le derive donc en direct du
      // statut ACTUEL de la mission des qu'il devient terminal (annulee ou
      // rapport disponible), plutot que de se fier a la valeur figee.
      if (missionAnnulee) {
        statut = 'annulee';
      } else if (missionEffectuee) {
        statut = 'rapport_dispo';
        rapports = rapportsDe(linkedMission);
        rapportUrl = rapports.length ? rapports[rapports.length - 1].url : '';
      }
      // L'avenant est un champ direct sur la mission (m-avenant-url côté
      // CRM), pas un document rattaché — indépendant de docsParMission qui
      // ne gère qu'un seul document (le rapport) par mission.
      const avenantUrl = (linkedMission && linkedMission.avenantUrl) || '';

      return {
        id: r.id,
        typeEdl: r.data?.typeEdl || '',
        adresse: r.data?.adresse || '',
        bienType: r.data?.bienType || '',
        bienTypo: r.data?.bienTypo || '',
        meuble: r.data?.meuble || '',
        superficie: r.data?.superficie || '',
        acces: r.data?.acces || '',
        proprietaire: r.data?.proprietaire || '',
        statut,
        rapportUrl,
        rapports,
        avenantUrl,
        dateSouhaitee: r.data?.dateSouhaitee || '',
        heure: r.data?.heure || '',
        locataireNom: r.data?.locataireNom || (r.data?.locataire?.nom) || '',
        locataireTel: r.data?.locataireTel || (r.data?.locataire?.tel) || '',
        createdAt: r.created_at
      };
    });

    // Missions saisies directement dans le CRM (sans réservation) pour cette
    // agence : elles apparaissent aussi dans son espace, rapports compris.
    missions.filter(m => !missionsLiees.has(m.id)).forEach(m => {
      const st = String(m.statut || '').toLowerCase();
      const statut = st.includes('annul') ? 'annulee'
        : (['terminée', 'réalisée'].includes(m.statut) ? 'rapport_dispo' : (m.date ? 'confirmee' : 'en_attente'));
      const rapports = statut === 'rapport_dispo' ? rapportsDe(m) : [];
      orders.push({
        id: 'm_' + m.id,
        typeEdl: m.type || '',
        adresse: m.adresse || '',
        bienType: m.bienType || '',
        bienTypo: m.bienTypo || '',
        meuble: m.bienMeuble || '',
        superficie: m.superficie || '',
        acces: m.acces || '',
        proprietaire: m.proprietaire || '',
        statut,
        rapportUrl: rapports.length ? rapports[rapports.length - 1].url : '',
        rapports,
        avenantUrl: m.avenantUrl || '',
        dateSouhaitee: m.date || '',
        heure: m.date && /T\d{2}:\d{2}/.test(m.date) ? String(m.date).slice(11, 16) : '',
        locataireNom: m.locataireNom || '',
        locataireTel: m.locataireTel || '',
        createdAt: m.createdAt || m.date || '',
      });
    });

    return new Response(JSON.stringify(orders), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origineAutorisee(req) }
    });
  }
}
