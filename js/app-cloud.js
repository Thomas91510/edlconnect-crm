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
    const{error}=await supabaseClient.from('settings').upsert({
      user_id:_currentUser.id,
      data:settingsData,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(error)console.warn('Erreur save settings:',error.message);
  }catch(e){console.warn('Erreur saveSettingsToSupabase:',e);}
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
async function pushToSupabase(dbKey, item){
  if(!_supaReady || _supaSyncing) return;
  const table = SUPA_TABLES[dbKey];
  if(!table) return;
  try{
    const userId = _currentUser?.id || null;
    const row = { id: String(item.id), data: item, updated_at: new Date().toISOString(), user_id: userId };
    const { error } = await supabaseClient.from(table).upsert(row, { onConflict: 'id' });
    if(error) console.warn(`Erreur push ${dbKey}:`, error.message);
  }catch(e){
    console.warn('Erreur pushToSupabase:', e);
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

        // Sauvegarder en local aussi + re-render
        try{ localStorage.setItem('edl_crm_db', JSON.stringify(DB)); }catch(e){}
        if(typeof renderAll === 'function') renderAll();
        else {
          if(typeof renderDashboard==='function') renderDashboard();
          if(typeof renderProspection==='function') renderProspection();
          if(typeof renderMissions==='function') renderMissions();
          if(typeof renderPipeline==='function') renderPipeline();
          if(typeof renderCalendar==='function') renderCalendar();
        }
      })
      .subscribe();
  });
}

// ═══════════════════════════════════════════════════════════
