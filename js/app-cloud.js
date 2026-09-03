// === Lokentia CRM — app-cloud.js ===
// Synchronisation Supabase (chargement, push, temps reel)
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

// ═══════════════════════════════════════════════════════════
// SUPABASE — Sync temps réel multi-appareils
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';

let supabaseClient = null;

// Helper : en-têtes avec jeton de session pour les appels API sécurisés
async function _authHeaders(extra){
  const t = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
  return Object.assign({ 'Authorization': 'Bearer ' + t }, extra || {});
}
let _supaReady = false;
let _supaSyncing = false; // évite les boucles infinies pendant la sync

try {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  _supaReady = true;
} catch(e) {
  console.warn('Supabase non disponible, mode localStorage uniquement', e);
}

const SUPA_TABLES = {
  contacts : 'contacts',
  missions : 'missions',
  prospects: 'prospects',
  deals    : 'deals',
  rdvs     : 'rdvs',
  campagnes: 'campagnes',
  trackings: 'trackings',
  invoices : 'invoices'
};

// ─── SETTINGS SUPABASE (clés API par utilisateur) ──────────
async function saveSettingsToSupabase(settingsData){
  if(!_supaReady||!_currentUser)return;
  try{
    // Fusionne au lieu d'écraser : la ligne settings porte aussi des champs
    // gérés ailleurs (ex. invoiceNextNumber, réservé de façon atomique par
    // reserveInvoiceNumber()) qui ne doivent pas être perdus si cet appel
    // arrive avec un instantané du formulaire ne les connaissant pas.
    const{data:existing}=await supabaseClient.from('settings').select('data').eq('user_id',_currentUser.id).maybeSingle();
    const fusion=Object.assign({},(existing&&existing.data)||{},settingsData);
    const{error}=await supabaseClient.from('settings').upsert({
      user_id:_currentUser.id,
      data:fusion,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(error)console.warn('Erreur save settings:',error.message);
  }catch(e){console.warn('Erreur saveSettingsToSupabase:',e);}
}

// ─── NUMÉROTATION ATOMIQUE DES FACTURES ────────────────────
// CFG.invoiceNextNumber (localStorage) est purement local à l'appareil : un
// abonné qui travaille depuis deux appareils/onglets voit chacun maintenir
// son propre compteur sans jamais se synchroniser, garantissant tôt ou tard
// une collision de numéro de facture (problème de conformité, pas juste un
// bug d'affichage). Le numéro est désormais réservé sur la ligne "settings"
// de l'abonné via une mise à jour conditionnelle (optimistic concurrency) :
// si un autre appareil a gagné la course entre la lecture et l'écriture, la
// condition ne matche plus, on relit et on retente — jamais deux appels ne
// peuvent obtenir le même numéro.
async function reserveInvoiceNumber(){
  if(!_supaReady || !_currentUser){
    // Repli hors-ligne : ancien compteur local (mieux qu'un blocage total,
    // mais redevient sujet à collision dès que l'abonné a plusieurs appareils).
    const num = CFG.invoiceNextNumber;
    CFG.invoiceNextNumber = num + 1;
    return num;
  }
  for(let tentative = 0; tentative < 8; tentative++){
    const { data: row } = await supabaseClient.from('settings').select('data').eq('user_id', _currentUser.id).maybeSingle();
    const existing = (row && row.data) || {};
    const current = Number(existing.invoiceNextNumber) || 1;
    const fusion = Object.assign({}, existing, { invoiceNextNumber: current + 1 });

    if(!row){
      // Aucune ligne settings pour cet abonné pour l'instant : insertion
      // directe. Fenêtre de course résiduelle infime (seulement si le tout
      // premier appel a lieu simultanément depuis deux appareils avant que
      // la ligne n'existe) — un cas bien plus étroit que la course actuelle,
      // qui se produit à chaque facture.
      const { error } = await supabaseClient.from('settings').insert({
        user_id: _currentUser.id, data: fusion, updated_at: new Date().toISOString()
      });
      if(!error) return current;
      continue; // quelqu'un d'autre vient de créer la ligne : on relit
    }

    // Mise à jour conditionnelle : ne s'applique que si invoiceNextNumber
    // vaut toujours "current" (ou est toujours absent, la toute première
    // fois) — sinon quelqu'un d'autre a déjà réservé ce numéro entre notre
    // lecture et notre écriture.
    let requete = supabaseClient.from('settings')
      .update({ data: fusion, updated_at: new Date().toISOString() })
      .eq('user_id', _currentUser.id);
    requete = (existing.invoiceNextNumber == null)
      ? requete.is('data->>invoiceNextNumber', null)
      : requete.eq('data->>invoiceNextNumber', String(existing.invoiceNextNumber));
    const { data: updated, error } = await requete.select();
    if(!error && Array.isArray(updated) && updated.length > 0) return current;
    // Course perdue (ou invoiceNextNumber absent la toute première fois) :
    // on relit au tour suivant plutôt que d'échouer.
  }
  throw new Error('Numérotation de facture indisponible (trop de tentatives concurrentes), réessaie dans un instant.');
}

async function loadSettingsFromSupabase(){
  if(!_supaReady||!_currentUser)return;
  try{
    const{data,error}=await supabaseClient.from('settings').select('data').eq('user_id',_currentUser.id).maybeSingle();
    if(error||!data)return;
    const s=data.data;
    if(!s)return;
    // Appliquer les settings chargés
    if(s.brevoKey){localStorage.setItem('edl_brevo_key',s.brevoKey);}
    if(s.notionToken){localStorage.setItem('edl_notion_token',s.notionToken);}
    if(s.notionPageId){localStorage.setItem('edl_notion_page',s.notionPageId);}
    if(s.claudeKey){localStorage.setItem('edl_claude_key',s.claudeKey);}
    if(s.companyName){localStorage.setItem('edl_co_name',s.companyName);}
    if(s.companyAddress){localStorage.setItem('edl_co_address',s.companyAddress);}
    if(s.companySiret){localStorage.setItem('edl_co_siret',s.companySiret);}
    if(s.companyTva){localStorage.setItem('edl_co_tva',s.companyTva);}
    if(s.companyIban){localStorage.setItem('edl_co_iban',s.companyIban);}
    if(s.companyBic){localStorage.setItem('edl_co_bic',s.companyBic);}
    if(s.companyLogo){localStorage.setItem('edl_co_logo',s.companyLogo);}
    if(s.companyPaymentTerms){localStorage.setItem('edl_co_payterms',s.companyPaymentTerms);}
    // Profil de l'abonné
    if(s.userName){localStorage.setItem('edl_user_name',s.userName);}
    if(s.userEmail){localStorage.setItem('edl_user_email',s.userEmail);}
    // Identité des emails (marque blanche)
    if(s.expediteurNom){localStorage.setItem('edl_exp_nom',s.expediteurNom);}
    if(s.expediteurEmail){localStorage.setItem('edl_exp_email',s.expediteurEmail);}
    if(s.expediteurTel){localStorage.setItem('edl_exp_tel',s.expediteurTel);}
    if(s.expediteurSignature){localStorage.setItem('edl_exp_signature',s.expediteurSignature);}
    if(s.expediteurPartenaire){localStorage.setItem('edl_exp_partenaire',s.expediteurPartenaire);}
    // Agents / collaborateurs (stockés dans settings, pas dans une table dédiée)
    if(Array.isArray(s.agents)){
      DB.agents = s.agents;
      try{ if(typeof renderAgentsSettings === 'function') renderAgentsSettings(); }catch(e){}
    }
    console.log('✅ Paramètres chargés depuis Supabase');
  }catch(e){console.warn('Erreur loadSettingsFromSupabase:',e);}
}

// ─── CHARGEMENT INITIAL DEPUIS SUPABASE (format JSONB) ─────
async function fetchAllRowsForUser(table){
  // Récupérer uniquement les lignes de l'utilisateur connecté
  if(!_currentUser) return { data: [], error: null };
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  while(true){
    const { data, error } = await supabaseClient
      .from(table)
      .select('id, data')
      .eq('user_id', _currentUser.id)
      .range(from, from + pageSize - 1);
    if(error) return { data: null, error };
    if(!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if(data.length < pageSize) break;
    from += pageSize;
  }
  return { data: allRows, error: null };
}

async function fetchAllRows(table){
  // Supabase limite à 1000 lignes par requête par défaut → on pagine
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  while(true){
    const { data, error } = await supabaseClient
      .from(table)
      .select('id, data')
      .range(from, from + pageSize - 1);
    if(error) return { data: null, error };
    if(!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if(data.length < pageSize) break; // dernière page atteinte
    from += pageSize;
  }
  return { data: allRows, error: null };
}

async function loadFromSupabase(){
  if(!_supaReady) return false;
  if(window._EXTRANET_MODE) return false;
  try{
    const results = await Promise.all(
      Object.entries(SUPA_TABLES).map(([dbKey, table]) =>
        fetchAllRowsForUser(table).then(r => [dbKey, r])
      )
    );

    let anyData = false;
    for(const [dbKey, result] of results){
      if(result.error){
        console.warn(`Erreur chargement ${dbKey}:`, result.error.message);
        continue;
      }
      if(result.data && result.data.length > 0){
        DB[dbKey] = result.data.map(row => ({ ...row.data, id: row.id }));
        anyData = true;
      }
    }

    if(anyData){
      console.log('✅ Données chargées depuis Supabase');
      const el = document.getElementById('sync-text');
      if(el){ el.textContent = '☁️ Sync cloud active'; el.style.color = 'var(--green)'; }
      return true;
    }
    return false;
  }catch(e){
    console.warn('Erreur Supabase loadFromSupabase:', e);
    return false;

  }
}

// ─── PUSH D'UN ITEM VERS SUPABASE (format JSONB) ───────────
// Retourne true/false : certains appelants (ex. confirmation de RDV depuis
// une réservation) doivent savoir si le push a réellement réussi avant de
// marquer une réservation comme "traitée" côté serveur — sans ce retour,
// un échec silencieux ici + une fermeture d'onglet juste après pouvait
// laisser une réservation marquée traitée sans mission correspondante
// nulle part (cas constaté le 31/07).
async function pushToSupabase(dbKey, item){
  if(!_supaReady || _supaSyncing) return false;
  const table = SUPA_TABLES[dbKey];
  if(!table) return false;
  try{
    const userId = _currentUser?.id || null;
    const row = { id: String(item.id), data: item, updated_at: new Date().toISOString(), user_id: userId };
    const { error } = await supabaseClient.from(table).upsert(row, { onConflict: 'id' });
    if(error){ console.warn(`Erreur push ${dbKey}:`, error.message); return false; }
    return true;
  }catch(e){
    console.warn('Erreur pushToSupabase:', e);
    return false;
  }
}

// ─── SUPPRESSION D'UN ITEM DANS SUPABASE ───────────────────
async function deleteFromSupabase(dbKey, id){
  if(!_supaReady) return;
  const table = SUPA_TABLES[dbKey];
  if(!table) return;
  try{
    await supabaseClient.from(table).delete().eq('id', String(id));
  }catch(e){
    console.warn('Erreur deleteFromSupabase:', e);
  }
}

// ─── PUSH COMPLET (synchronise tout DB vers Supabase) ──────
async function pushAllToSupabase(){
  if(!_supaReady) return;
  if(window._EXTRANET_MODE) return; // Ne jamais pusher en mode extranet client
  notify('☁️ Synchronisation vers le cloud…');
  _supaSyncing = true;
  try{
    for(const dbKey of Object.keys(SUPA_TABLES)){
      const items = DB[dbKey] || [];
      if(!items.length) continue;
      const table = SUPA_TABLES[dbKey];
      // Dédoublonner par ID avant push (évite l'erreur "ON CONFLICT DO UPDATE command cannot affect row a second time")
      const seen = new Set();
      const uniqueItems = [];
      for(const item of items){
        const id = String(item.id);
        if(!seen.has(id)){ seen.add(id); uniqueItems.push(item); }
      }
      const userId = _currentUser?.id || null;
      const rows = uniqueItems.map(item => ({
        id: String(item.id),
        data: item,
        updated_at: new Date().toISOString(),
        user_id: userId
      }));
      const { error } = await supabaseClient.from(table).upsert(rows, { onConflict: 'id' });
      if(error) console.warn(`Erreur push complet ${dbKey}:`, error.message);
      else {
        if(!_lastPushedCache[dbKey]) _lastPushedCache[dbKey] = {};
        uniqueItems.forEach(item => { _lastPushedCache[dbKey][String(item.id)] = JSON.stringify(item); });
      }
    }
    notify('✅ Toutes les données synchronisées vers le cloud !');
  }finally{
    _supaSyncing = false;
  }
}

// ─── ABONNEMENT TEMPS RÉEL (sync multi-appareils) ──────────
function subscribeRealtime(){
  if(!_supaReady) return;
  Object.entries(SUPA_TABLES).forEach(([dbKey, table]) => {
    supabaseClient
      .channel(`realtime-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        if(_supaSyncing) return; // éviter boucle si c'est nous qui venons d'écrire

        if(!DB[dbKey]) DB[dbKey] = [];

        if(payload.eventType === 'DELETE'){
          DB[dbKey] = DB[dbKey].filter(item => String(item.id) !== String(payload.old.id));
        } else {
          const newItem = { ...payload.new.data, id: payload.new.id };
          const idx = DB[dbKey].findIndex(item => String(item.id) === String(newItem.id));
          if(idx >= 0) DB[dbKey][idx] = newItem;
          else DB[dbKey].push(newItem);
        }

        // Sauvegarder en local via saveToStorage() : respecte CLES_NON_PERSISTEES
        // (ne jamais ecrire DB en entier ici, cela contournerait le filtre et
        // regonflerait le cache a plusieurs Mo, figeant l'interface).
        try{ if(typeof saveToStorage === 'function') saveToStorage(); }catch(e){}

        // Re-rendu de toutes les vues concernees
        if(typeof renderAll === 'function') renderAll();
        else {
          if(typeof renderDashboard==='function') renderDashboard();
          if(typeof renderContacts==='function') renderContacts();
          if(typeof renderProspection==='function') renderProspection();
          if(typeof renderMissions==='function') renderMissions();
          if(typeof renderPipeline==='function') renderPipeline();
          if(typeof renderCalendar==='function') renderCalendar();
          if(typeof renderCampaigns==='function') renderCampaigns();
          if(typeof renderTracking==='function') renderTracking();
        }
      })
      .subscribe();
  });
}

// ═══════════════════════════════════════════════════════════
