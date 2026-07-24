// === Lokentia CRM — app-core.js ===
// Etat global, utilitaires, sauvegarde et restauration
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

let DB={
  contacts:[],
  deals:[
    // Pas de données de démo — tes données viennent du localStorage
  ],
  missions:[
    // Pas de données de démo — tes données viennent du localStorage
  ],
  campaigns:[
    // Pas de données de démo — tes données viennent du localStorage
  ],
  rdvs:[
    // Pas de données de démo — tes données viennent du localStorage
  ],
  invoices:[
    // Pas de données de démo — tes données viennent du localStorage
  ],
  trackings:[],
  prospects:[],
  dups:[],
  brevoContacts:[],
  agents:[]
};

let UI={contactFilter:'all',contactSearch:'',missionFilter:'all',calMonth:new Date().getMonth(),calYear:new Date().getFullYear()};

// ─── UTILS ────────────────────────────────────────────────
function notify(msg,type=''){
  const n=document.getElementById('notif');
  n.textContent=msg;
  n.style.background=type==='warn'?'#854F0B':type==='err'?'#A32D2D':'#1A5FA8';
  n.classList.add('show');
  setTimeout(()=>n.classList.remove('show'),3000);
}
function setSyncStatus(s){
  const dot=document.getElementById('sync-dot');
  const txt=document.getElementById('sync-text');
  if(s==='loading'){dot.className='sync-dot loading';txt.textContent='Synchronisation…';}
  else if(s==='ok'){dot.className='sync-dot';dot.style.background='#3B6D11';txt.textContent='Synchronisé';}
  else{dot.className='sync-dot';dot.style.background='#A32D2D';txt.textContent='Hors ligne';}
}
function fmtDate(d){if(!d)return '—';try{return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'});}catch(e){return d;}}
function fmtDT(d){if(!d)return '—';try{const dt=new Date(d);return dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '+dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}catch(e){return d;}}
function initials(n){const w=(n||'?').trim().split(' ');return((w[0]||'?')[0]+((w[1]||'')[0]||'')).toUpperCase();}
function statusBadge(s){
  const m={'Client actif':'b-green','Client signé ✅':'b-green','Cible potentielle':'b-blue','Partenaire':'b-teal','Inactif':'b-gray','planifiée':'b-blue','en cours':'b-amber','terminée':'b-teal','facturée':'b-green','Gagné':'b-green','Négociation':'b-amber','Proposé':'b-blue','Qualifié':'b-teal','Prospect':'b-gray','Terminée':'b-gray','Active':'b-green','subscribed':'b-green','unsubscribed':'b-amber','bounced':'b-red','blocked':'b-red'};
  return `<span class="badge badge-status ${m[s]||'b-gray'}">${s||'—'}</span>`;
}
function presenceBadge(p){
  if(p==='brevo')return '<span class="badge b-teal">Brevo</span>';
  if(p==='notion')return '<span class="badge b-blue">Notion</span>';
  if(p==='both')return '<span class="badge b-purple">Les deux</span>';
  return '';
}
function isDup(idx){return DB.dups.some(d=>d.i1===idx||d.i2===idx);}
function normPhone(t){
  // Normalise un numéro FR : garde les chiffres, convertit +33 / 0033 en 0
  let d=String(t||'').replace(/[^0-9+]/g,'');
  d=d.replace(/^\+33/,'0').replace(/^0033/,'0');
  d=d.replace(/[^0-9]/g,'');
  return d.length>=9?d:'';
}
function detectDuplicates(){
  const dups=[];
  const emailMap={};
  const phoneMap={};
  const pairSeen=new Set();
  DB.contacts.forEach((c,i)=>{
    const email=(c.email||'').toLowerCase().trim();
    // Doublon si même email (non vide) — priorité haute
    if(email){
      if(emailMap[email]!==undefined){
        const key=emailMap[email]+'-'+i;
        if(!pairSeen.has(key)){ dups.push({i1:emailMap[email],i2:i,type:'email',val:c.email}); pairSeen.add(key); }
      } else {
        emailMap[email]=i;
      }
    }
    // Doublon si même téléphone normalisé (non vide)
    const phone=normPhone(c.tel);
    if(phone){
      if(phoneMap[phone]!==undefined){
        const a=phoneMap[phone], b=i;
        const key=a+'-'+b;
        // Éviter de doublonner une paire déjà signalée par email
        const emailA=(DB.contacts[a].email||'').toLowerCase().trim();
        const emailB=(c.email||'').toLowerCase().trim();
        const sameEmail=emailA&&emailB&&emailA===emailB;
        if(!pairSeen.has(key)&&!sameEmail){ dups.push({i1:a,i2:b,type:'téléphone',val:c.tel}); pairSeen.add(key); }
      } else {
        phoneMap[phone]=i;
      }
    }
    // Pas de détection par nom — trop de faux positifs
  });
  DB.dups=dups;
  const n=dups.length;
  const badge=document.getElementById('dup-nav-badge');
  document.getElementById('k-dups').textContent=n;
  document.getElementById('k-dups-sub').textContent=n>0?'À traiter':'Aucun';
  document.getElementById('dup-count-btn').textContent=n>0?`(${n})`:'';
  if(n>0){badge.style.display='inline';badge.textContent=n;}else badge.style.display='none';
}
// ─── NETTOYAGE D'URGENCE ─────────────────────────────────
// Recharge uniquement les contacts depuis Supabase (supprime les doublons Brevo)
async function cleanReloadContactsFromSupabase(){
  if(!_supaReady){notify('⚠️ Supabase non connecté','warn');return;}
  notify('🔄 Nettoyage en cours — rechargement depuis Supabase...');
  try{
    const rows=await fetchAllRows('contacts');
    if(rows&&rows.length){
      // Dédoublonner par email : garder la version Supabase uniquement
      const seen=new Set();
      const clean=[];
      rows.forEach(r=>{
        const email=(r.email||'').toLowerCase();
        const key=email||r.id;
        if(!seen.has(key)){
          seen.add(key);
          clean.push(r);
        }
      });
      DB.contacts=clean;
      DB.brevoContacts=[];
      detectDuplicates();
      saveToStorage();
      renderContacts();
      renderDashboard();
      notify(`✅ ${clean.length} contacts rechargés proprement depuis Supabase`);
    }
  }catch(e){
    console.error('Erreur nettoyage:',e);
    notify('❌ Erreur lors du nettoyage','err');
  }
}

// Donnees volumineuses rechargeables a la demande : jamais ecrites dans le cache
// du navigateur (limite ~5 Mo). Elles restent en memoire le temps de la session.
const CLES_NON_PERSISTEES = ['brevoContacts'];

function saveToStorage(){
  try{
    const aStocker = {};
    for(const k of Object.keys(DB)){
      aStocker[k] = CLES_NON_PERSISTEES.includes(k) ? [] : DB[k];
    }
    const data=JSON.stringify(aStocker);
    if(data.length>4*1024*1024){notify('⚠️ Base de données volumineuse — pense à faire une sauvegarde !','warn');}
    localStorage.setItem('edl_crm_db',data);
  }catch(e){
    // Dernier recours : ne conserver que l'essentiel plutot que de tout perdre
    try{
      const minimal={};
      for(const k of Object.keys(DB)){
        minimal[k] = (CLES_NON_PERSISTEES.includes(k) || k==='trackings') ? [] : DB[k];
      }
      localStorage.setItem('edl_crm_db',JSON.stringify(minimal));
      notify('⚠️ Cache local allege (les donnees restent dans le cloud)','warn');
    }catch(e2){
      notify('❌ Stockage local plein — tes donnees restent sauvegardees dans le cloud.','err');
      const el=document.getElementById('sync-text');if(el){el.textContent='⚠️ Cache plein';el.style.color='var(--red)';}
      console.error('localStorage plein :',e2);
    }
  }
  // Sync cloud en arrière-plan (non bloquant)
  if(_supaReady && !_supaSyncing){
    syncDirtyToSupabase();
  }
}

// Pousse uniquement les items modifiés récemment vers Supabase (debounced)
let _supaDebounceTimer = null;
let _lastPushedCache = {}; // dbKey -> { id: JSON string de la dernière version poussée }
function syncDirtyToSupabase(){
  clearTimeout(_supaDebounceTimer);
  _supaDebounceTimer = setTimeout(async () => {
    if(_supaSyncing) return;
    _supaSyncing = true;
    try{
      for(const dbKey of Object.keys(SUPA_TABLES)){
        const items = DB[dbKey] || [];
        if(!items.length) continue;
        const table = SUPA_TABLES[dbKey];
        if(!_lastPushedCache[dbKey]) _lastPushedCache[dbKey] = {};
        const cache = _lastPushedCache[dbKey];
        // Dédoublonner par ID avant push
        const seen = new Set();
        const uniqueItems = [];
        for(const item of items){
          const id = String(item.id);
          if(!seen.has(id)){ seen.add(id); uniqueItems.push(item); }
        }
        // Ne garder que les items dont le contenu a réellement changé depuis le dernier push
        const toPush = [];
        for(const item of uniqueItems){
          const id = String(item.id);
          const json = JSON.stringify(item);
          if(cache[id] !== json){ toPush.push({item, id, json}); }
        }
        if(!toPush.length) continue;
        const userId = _currentUser?.id || null;
        const rows = toPush.map(({item, id}) => ({
          id, data: item,
          updated_at: new Date().toISOString(),
          user_id: userId
        }));
        await supabaseClient.from(table).upsert(rows, { onConflict: 'id' });
        toPush.forEach(({id, json}) => { cache[id] = json; });
      }
    }catch(e){
      console.warn('Erreur sync cloud:', e);
    }finally{
      _supaSyncing = false;
    }
  }, 1500); // attend 1.5s après la dernière modif avant de pousser
}

function loadFromStorage(){
  try{
    const s=localStorage.getItem('edl_crm_db');
    if(s)DB=JSON.parse(s);
  }catch(e){}
  // Garde-fou : si les données sauvegardées datent d'avant l'ajout d'un champ (ex: invoices),
  // s'assurer que tous les tableaux attendus existent pour éviter les erreurs "Cannot read properties of undefined"
  const expectedArrays=['contacts','deals','missions','campaigns','rdvs','invoices','trackings','prospects','dups','brevoContacts','agents'];
  expectedArrays.forEach(key=>{ if(!Array.isArray(DB[key])) DB[key]=[]; });
  // Dédoublonner les contacts au chargement (protection permanente)
  const seen=new Set();
  DB.contacts=DB.contacts.filter(c=>{
    const key=(c.email||'').toLowerCase().trim()||c.id;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

// ─── SAUVEGARDE / RESTAURATION ────────────────────────────
function saveBackup(){
  const backup={
    version:2,
    date:new Date().toISOString(),
    contacts:DB.contacts,
    deals:DB.deals,
    missions:DB.missions,
    campaigns:DB.campaigns,
    rdvs:DB.rdvs,
    trackings:DB.trackings,
    prospects:DB.prospects,
    invoices:DB.invoices,
    agents:DB.agents
  };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const dateStr=new Date().toLocaleDateString('fr-FR').replace(/\//g,'-');
  a.href=url;a.download=`EDL_IDF_CRM_backup_${dateStr}.json`;a.click();
  URL.revokeObjectURL(url);
  saveToStorage();
  localStorage.setItem('edl_last_backup',new Date().toISOString());
  updateBackupDate();
  notify('✅ Sauvegarde téléchargée !');
}

function restoreBackup(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=(e)=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!data.contacts){notify('❌ Fichier invalide','err');return;}
      const msg=`Restaurer la sauvegarde du ${fmtDate(data.date)} ?\n\n${data.contacts?.length||0} contacts · ${data.missions?.length||0} missions · ${data.trackings?.length||0} emails · ${data.prospects?.length||0} prospects\n\nCela remplacera toutes tes données actuelles.`;
      if(!confirm(msg)){input.value='';return;}
      if(data.contacts)DB.contacts=data.contacts;
      if(data.deals)DB.deals=data.deals;
      if(data.missions)DB.missions=data.missions;
      if(data.campaigns)DB.campaigns=data.campaigns;
      if(data.rdvs)DB.rdvs=data.rdvs;
      if(data.trackings)DB.trackings=data.trackings;
      if(data.prospects)DB.prospects=data.prospects;
      if(data.invoices)DB.invoices=data.invoices;
      if(data.agents)DB.agents=data.agents;
      detectDuplicates();saveToStorage();renderDashboard();
      notify(`✅ Restauré — ${DB.contacts.length} contacts chargés !`);
      input.value='';
    }catch(err){notify('❌ Erreur lecture du fichier','err');}
  };
  reader.readAsText(file);
}

function updateBackupDate(){
  const last=localStorage.getItem('edl_last_backup');
  const el=document.getElementById('last-backup-date');
  if(!el) return;
  if(!last){
    el.textContent='⚠️ Aucune sauvegarde effectuée';
    el.style.color='var(--amber, #B45309)';
    return;
  }
  const d=new Date(last);
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const overdue = (Date.now() - d.getTime()) > SEVEN_DAYS;
  el.textContent=(overdue?'⚠️ ':'')+'Sauvegardé le '+d.toLocaleDateString('fr-FR')+' à '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  el.style.color = overdue ? 'var(--amber, #B45309)' : 'var(--text3)';
}

function checkBackupReminder(){
  const last = localStorage.getItem('edl_last_backup');
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const overdue = !last || (Date.now() - new Date(last).getTime()) > SEVEN_DAYS;
  if(overdue){
    setTimeout(() => {
      notify('💾 Pense à faire ta sauvegarde hebdomadaire (bouton "Sauvegarder" en bas du menu) !', 'warn');
    }, 2500);
  }
}

// ─── FICHE CONTACT ────────────────────────────────────────