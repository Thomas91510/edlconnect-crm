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
  agents:[],
  // Missions réalisées pour des clients hors CRM (ex. un partenaire dont les
  // dossiers ne passent pas par des fiches "mission" individuelles) : un
  // volume d'EDL + un CA ajoutés par mois, pour que les totaux du dashboard
  // reflètent l'activité réelle sans forcer la saisie d'une mission par dossier.
  ajustementsExternes:[]
};

let UI={contactFilter:'all',contactSearch:'',missionFilter:'all',calMonth:new Date().getMonth(),calYear:new Date().getFullYear()};

// Cumule le nombre d'EDL et le CA des ajustements externes (clients hors
// CRM) pour un mois donne ('YYYY-MM') ou pour tous les mois ('all').
// Utilise par le dashboard (app-contacts.js) et les stats missions
// (app-missions.js) pour que ces totaux "manuels" se fondent dans les
// compteurs globaux et respectent le meme filtre de mois que le reste.
function ajustementsPourMois(mois){
  const liste = Array.isArray(DB.ajustementsExternes) ? DB.ajustementsExternes : [];
  const filtres = mois === 'all' ? liste : liste.filter(a => a.mois === mois);
  return filtres.reduce((acc, a) => {
    acc.nb += Number(a.nbEdl) || 0;
    acc.ca += Number(a.ca) || 0;
    return acc;
  }, { nb: 0, ca: 0 });
}

// Prévient par email le client (agence ou particulier) que son rapport
// d'état des lieux est disponible dans l'extranet — sans quoi ce statut,
// corrigé côté extranet, reste invisible tant que le client ne pense pas à
// se reconnecter de lui-même. Le rapport EDL (Edouard) se synchronisant en
// temps réel avec les locataires, on informe dès que la mission est
// terminée/facturée, sans palier intermédiaire. Best-effort : une erreur
// ici ne doit jamais bloquer le flux appelant (changement de statut,
// génération de facture).
async function notifierChangementStatutCommande(mission){
  if(!mission || !mission.emailClient) return;
  if(!['terminée','facturée'].includes(mission.statut)) return;
  try{
    if(typeof _authHeaders !== 'function' || !_supaReady) return;
    await fetch('/api/notify-order-status', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        missionId: mission.id,
        emailClient: mission.emailClient,
        adresse: mission.adresse || '',
        type: mission.type || '',
        date: mission.date || '',
        agence: mission.agence || ''
      })
    });
  }catch(e){ console.warn('notifierChangementStatutCommande:', e); }
}

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
// Échappement HTML — à appliquer à TOUTE donnée utilisateur insérée via innerHTML,
// pour empêcher l'injection de code (XSS). Priorité : données externes (agences,
// locataires, réservations issues des formulaires publics).
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function statusBadge(s){
  const m={'Client actif':'b-green','Client signé ✅':'b-green','Cible potentielle':'b-blue','Partenaire':'b-teal','Inactif':'b-gray','planifiée':'b-blue','en cours':'b-amber','terminée':'b-teal','facturée':'b-green','Gagné':'b-green','Négociation':'b-amber','Proposé':'b-blue','Qualifié':'b-teal','Prospect':'b-gray','Terminée':'b-gray','Active':'b-green','subscribed':'b-green','unsubscribed':'b-amber','bounced':'b-red','blocked':'b-red'};
  return `<span class="badge badge-status ${m[s]||'b-gray'}">${esc(s)||'—'}</span>`;
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
// du navigateur (limite ~5 Mo). Elles restent en memoire le temps de la session
// et sont rechargees depuis Supabase a chaque connexion (loadFromSupabase).
// Les exclure evite de figer l'interface a chaque enregistrement : la
// serialisation JSON + l'ecriture localStorage sont synchrones et bloquantes.
const CLES_NON_PERSISTEES = ['brevoContacts', 'contacts', 'prospects', 'trackings'];

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
  const expectedArrays=['contacts','deals','missions','campaigns','rdvs','invoices','trackings','prospects','dups','brevoContacts','agents','ajustementsExternes'];
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

// ─── RECHERCHE GLOBALE (Cmd+K / Ctrl+K) ──────────────────────────────
// Cherche a travers les contacts et les missions deja charges en memoire
// (DB.contacts, DB.missions) : tout est deja cote client, pas d'appel
// serveur necessaire. Un resultat clique ouvre directement la fiche/le
// modal existant (openFiche, editMission), sans passer par un nouvel
// ecran dedie.
let _gsResults = [];
let _gsIndex = -1;

function openGlobalSearch(){
  document.querySelectorAll('.modal-bg.open').forEach(el=>el.classList.remove('open'));
  openModal('modal-global-search');
  const input = document.getElementById('global-search-input');
  input.value = '';
  renderGlobalSearchResults('');
  setTimeout(()=>input.focus(), 30);
}

function closeGlobalSearch(){
  closeModal('modal-global-search');
}

function _gsNormalise(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
}

function renderGlobalSearchResults(q){
  const terme = _gsNormalise(q).trim();
  const box = document.getElementById('global-search-results');
  _gsIndex = -1;

  if(!terme){
    box.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--text2);text-align:center">Tape pour chercher un contact ou une mission…</div>';
    _gsResults = [];
    return;
  }

  const contacts = (DB.contacts||[]).filter(c=>
    _gsNormalise([c.entreprise,c.contact,c.email,c.tel].filter(Boolean).join(' ')).includes(terme)
  ).slice(0,8).map(c=>({
    type:'contact', id:c.id,
    titre: c.entreprise||c.contact||'—',
    sousTitre: [c.contact, c.email].filter(Boolean).join(' · '),
    icone:'ti-building-store'
  }));

  const missions = (DB.missions||[]).filter(m=>
    _gsNormalise([m.agence,m.adresse,m.type,m.emailClient].filter(Boolean).join(' ')).includes(terme)
  ).slice(0,8).map(m=>({
    type:'mission', id:m.id,
    titre: m.adresse || m.agence || '—',
    sousTitre: [m.agence, fmtDT(m.date)].filter(Boolean).join(' · '),
    icone:'ti-clipboard-list'
  }));

  _gsResults = [...contacts, ...missions];

  if(!_gsResults.length){
    box.innerHTML = '<div style="padding:14px;font-size:12px;color:var(--text2);text-align:center">Aucun résultat pour « '+esc(q)+' »</div>';
    return;
  }

  box.innerHTML = _gsResults.map((r,i)=>`
    <div class="gs-result" onclick="ouvrirResultatRecherche(${i})" onmouseenter="_gsSurligner(${i})"
      style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer">
      <i class="ti ${r.icone}" style="font-size:16px;color:var(--text2);flex-shrink:0"></i>
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.titre)}</div>
        <div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.sousTitre)}</div>
      </div>
      <span style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.03em;flex-shrink:0">${r.type==='contact'?'Contact':'Mission'}</span>
    </div>`).join('');

  _gsSurligner(0);
}

function _gsSurligner(i){
  _gsIndex = i;
  document.querySelectorAll('#global-search-results .gs-result').forEach((el,idx)=>{
    el.style.background = idx===i ? 'var(--bg2)' : '';
  });
}

function ouvrirResultatRecherche(i){
  const r = _gsResults[i];
  if(!r) return;
  closeGlobalSearch();
  if(r.type==='contact'){
    openFiche(r.id);
  } else if(r.type==='mission'){
    nav('missions');
    const idx = DB.missions.findIndex(m=>m.id===r.id);
    if(idx>-1) editMission(idx);
  }
}

function handleGlobalSearchKeydown(e){
  if(e.key==='Escape'){ e.preventDefault(); closeGlobalSearch(); return; }
  if(e.key==='ArrowDown'){ e.preventDefault(); if(_gsResults.length) _gsSurligner((_gsIndex+1)%_gsResults.length); return; }
  if(e.key==='ArrowUp'){ e.preventDefault(); if(_gsResults.length) _gsSurligner((_gsIndex-1+_gsResults.length)%_gsResults.length); return; }
  if(e.key==='Enter'){ e.preventDefault(); if(_gsIndex>-1) ouvrirResultatRecherche(_gsIndex); return; }
}

document.addEventListener('keydown', function(e){
  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    openGlobalSearch();
  }
});

// ─── TABLEAU DE BORD "AUJOURD'HUI" ───────────────────────────────────
// Section operationnelle du dashboard (distincte des KPI statistiques
// plus bas) : ce qui demande l'attention de l'utilisateur maintenant,
// plutot que des totaux a lire. Tout se calcule depuis DB.missions deja
// en memoire, sauf les reservations qui necessitent un appel API dedie
// (elles ne sont chargees qu'a la visite de l'onglet Reservations).
function renderAujourdhui(){
  const box = document.getElementById('dash-today-content');
  if(!box) return;

  const missions = DB.missions || [];
  const estAnnulee = m => (m.statut||'').toLowerCase().includes('annul');

  const maintenant = new Date();
  const debutAuj = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const finDemain = new Date(debutAuj.getTime() + 2*24*60*60*1000);

  // RDV dont la date tombe aujourd'hui ou demain
  const rdvProches = missions.filter(m=>{
    if(!m.date || estAnnulee(m)) return false;
    const d = new Date(m.date);
    return d >= debutAuj && d < finDemain;
  });

  // Mission passee sans rapport recupere (ni par Edouard, ni saisi a la main)
  // et pas deja facturee : signale un dossier qui reste a cloturer. Comparaison
  // au debut du jour (comme avisAttente ci-dessous), pas a l'instant present :
  // une mission prevue plus tot dans la journee ne doit pas etre signalee
  // avant meme que la journee soit terminee.
  const rapportsAttente = missions.filter(m=>{
    if(!m.date || estAnnulee(m)) return false;
    if(m.rapportUrl) return false;
    if((m.statut||'').toLowerCase()==='facturée') return false;
    return new Date(m.date) < debutAuj;
  });

  // Mission passee avec un locataire identifie, dont la premiere demande
  // d'avis (envoyee automatiquement par le cron J+1) n'est pas encore partie.
  const avisAttente = missions.filter(m=>{
    if(!m.date || estAnnulee(m)) return false;
    if(!m.locataireEmail || m.avisEnvoye) return false;
    return new Date(m.date) < debutAuj;
  });

  const items = [
    { label:"RDV aujourd'hui / demain", count: rdvProches.length, icone:'ti-calendar-event', couleur:'var(--blue)', action:"nav('missions')" },
    { label:'Rapports en attente', count: rapportsAttente.length, icone:'ti-file-alert', couleur:'var(--amber, #B45309)', action:"nav('missions')" },
    { label:'Réservations non traitées', count:'—', id:'dash-today-resa', icone:'ti-inbox', couleur:'var(--red-text, #A32D2D)', action:"nav('reservations')" },
    { label:'Avis à relancer', count: avisAttente.length, icone:'ti-star', couleur:'var(--green)', action:"nav('missions')" }
  ];

  box.innerHTML = items.map(it=>`
    <div onclick="${it.action}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border2);cursor:pointer;background:var(--bg2)">
      <i class="ti ${it.icone}" style="font-size:20px;color:${it.couleur};flex-shrink:0"></i>
      <div style="min-width:0">
        <div style="font-size:18px;font-weight:700"${it.id?` id="${it.id}"`:''}>${it.count}</div>
        <div style="font-size:10.5px;color:var(--text2)">${it.label}</div>
      </div>
    </div>`).join('');

  chargerResaPendingCount();
}

// Les reservations ne sont chargees en memoire (_allReservations) qu'a la
// premiere visite de l'onglet Reservations : sans cet appel dedie, le
// compteur du dashboard resterait a "—" pour quiconque atterrit d'abord
// sur l'accueil (le cas le plus frequent).
async function chargerResaPendingCount(){
  const el = document.getElementById('dash-today-resa');
  // renderDashboard() est aussi appele une premiere fois a l'initialisation
  // de la page, avant checkAuth() : _currentUser peut donc ne pas encore
  // exister comme variable a ce moment-la (pas seulement valoir null).
  if(!el || !_supaReady || typeof _currentUser === 'undefined' || !_currentUser) return;
  try {
    const tk = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const resp = await fetch('/api/get-reservations', { headers: { 'Authorization': 'Bearer ' + tk } });
    if(!resp.ok) return;
    const rows = await resp.json();
    const pending = (rows||[]).filter(r=>r.statut!=='importee' && !r.rdvConfirme).length;
    // Revalider l'element : le dashboard peut avoir ete re-rendu pendant l'appel
    const elApres = document.getElementById('dash-today-resa');
    if(elApres) elApres.textContent = pending;
  } catch(e) { /* best-effort, silencieux */ }
}

// Repli des KPI email tracking (moins consultes au quotidien que les KPI
// principaux) : replies par defaut, etat memorise pour rester tel quel
// d'une session a l'autre.
const CLE_EMAIL_KPIS_OUVERT = 'edl_dash_email_kpis_open';

function toggleEmailKpis(forcerOuvert){
  const grid = document.getElementById('email-kpis-grid');
  const chevron = document.getElementById('email-kpis-chevron');
  if(!grid || !chevron) return;
  const ouvert = forcerOuvert !== undefined ? forcerOuvert : (grid.style.display === 'none');
  grid.style.display = ouvert ? 'grid' : 'none';
  chevron.style.transform = ouvert ? 'rotate(90deg)' : 'rotate(0deg)';
  localStorage.setItem(CLE_EMAIL_KPIS_OUVERT, ouvert ? '1' : '0');
}

function syncEmailKpisToggle(){
  toggleEmailKpis(localStorage.getItem(CLE_EMAIL_KPIS_OUVERT) === '1');
}

// ─── FICHE CONTACT ────────────────────────────────────────
