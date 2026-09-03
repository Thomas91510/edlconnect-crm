// === Lokentia CRM — app-agenda.js ===
// Agenda, sync Brevo, formulaires, Google Agenda
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

// ─── AGENDA ───────────────────────────────────────────────
UI.vue='semaine';

function setVue(v){
  UI.vue=v;
  document.getElementById('btn-vue-semaine').style.cssText=v==='semaine'?'background:var(--blue);color:#fff;border-color:var(--blue)':'';
  document.getElementById('btn-vue-mois').style.cssText=v==='mois'?'background:var(--blue);color:#fff;border-color:var(--blue)':'';
  renderCalendar();
}

function chPeriod(d){
  if(UI.vue==='semaine'){
    const cur=new Date(UI.calYear,UI.calMonth,UI.calWeekStart||1);
    cur.setDate(cur.getDate()+d*7);
    UI.calYear=cur.getFullYear();UI.calMonth=cur.getMonth();UI.calWeekStart=cur.getDate();
  } else {
    UI.calMonth+=d;
    if(UI.calMonth>11){UI.calMonth=0;UI.calYear++;}
    if(UI.calMonth<0){UI.calMonth=11;UI.calYear--;}
  }
  renderCalendar();
}

// Tri chronologique des evenements a l'interieur d'une journee : sans cela
// ils s'affichaient dans l'ordre d'insertion (RDV, puis missions, puis taches),
// ce qui donnait des heures dans le desordre au sein d'une meme case.
function calTriHoraire(a, b){
  return String(a.date||'').localeCompare(String(b.date||''));
}

// ─── Alignement des colonnes du calendrier ────────────────────────────
// Les libelles de jours et les cases sont rendus dans UN SEUL conteneur
// grille (#cal-body). Auparavant ils occupaient deux grilles distinctes
// (#cal-headers et #cal-body) : deux grilles independantes ne s'alignent
// que si elles font exactement la meme largeur, et le moindre ecart de
// bordure ou de barre de defilement les decalait visuellement.
// `minmax(0, 1fr)` complete le dispositif en empechant une case au contenu
// long d'elargir sa colonne au detriment des autres.
function calFixerColonnes(el){
  if(!el) return;
  if(window.innerWidth > 820){
    el.style.display = 'grid';
    el.style.gridTemplateColumns = 'repeat(7, minmax(0, 1fr))';
    el.style.gap = '3px';
    el.style.alignItems = 'stretch';
  } else {
    // Sur mobile le CSS bascule en flex avec defilement horizontal : ne pas
    // ecraser ce comportement.
    el.style.display = '';
    el.style.gridTemplateColumns = '';
    el.style.gap = '';
    el.style.alignItems = '';
  }
}

// ─── Rendu d'une ligne dans la liste laterale des evenements ──────────
// Les missions EDL sont l'information la plus utile au quotidien : elles
// recoivent un fond teinte, un liseré plus epais, un texte plus fonce et
// une pastille, pour se distinguer nettement des RDV commerciaux.
function renderEvtListItem(e){
  const estEdl = e.evtType === 'mission';
  const gcalUrl = e.evtType === 'rdv'
    ? googleCalLink(e.titre, e.date, e.duree, e.contact, e.type)
    : googleCalLink(`EDL IDF — ${e.type||'EDL'} · ${e.agence}`, e.date, e.dureeEstimee || '2h', e.adresse, missionCalDesc(e));

  const bordure   = estEdl ? '4px solid #2F7A3E' : '3px solid #1A5FA8';
  const fond      = estEdl ? '#EDF7EF' : 'transparent';
  const graisse   = estEdl ? '700' : '600';
  const couleur   = estEdl ? '#1E5C2C' : 'var(--text)';
  const pastille  = estEdl
    ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#2F7A3E;margin-right:6px;vertical-align:middle"></span>'
    : '';

  return `<div style="border-left:${bordure};background:${fond};padding:7px 10px;margin-bottom:7px;border-radius:0 var(--radius) var(--radius) 0;cursor:pointer" onclick="openEvtDetail('${e.evtType}','${e.id||e._supaId||''}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="font-size:11px;font-weight:${graisse};color:${couleur}">${pastille}${e.titre||e.agence||'—'}</div>
      ${gcalUrl?`<a href="${gcalUrl}" target="_blank" title="Ajouter à Google Agenda" style="font-size:10px;color:#1A5FA8;text-decoration:none;flex-shrink:0;margin-left:6px" onclick="event.stopPropagation()">📅</a>`:''}
    </div>
    <div style="font-size:10px;color:var(--text2)">${fmtDT(e.date)} · ${e.duree||e.dureeEstimee||'—'}</div>
    ${e.contact?`<div style="font-size:10px;color:var(--text3)">${e.contact}</div>`:''}
  </div>`;
}

function renderCalendar(){
  const MONTHS_SHORT=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const today=new Date();
  today.setHours(0,0,0,0);

  const allTasks = DB.contacts.flatMap(c => (c.tasks||[]).filter(t=>!t.done).map(t=>({
    ...t,
    titre: `📌 ${t.titre}`,
    evtType:'task',
    date: t.date ? (t.heure ? t.date+'T'+t.heure : t.date) : null,
    duree:'—',
    contact: t.contactNom || ''
  }))).filter(t=>t.date);

  const allEvts=[
    ...DB.rdvs.map(r=>({...r,evtType:'rdv'})),
    ...DB.missions.map(m=>({...m,titre:'EDL — '+m.agence,evtType:'mission'})),
    ...allTasks
  ].filter(e=>e.date);

  if(UI.vue==='semaine'){
    // Vue 7 jours
    let startDate;
    if(UI.calWeekStart){
      startDate=new Date(UI.calYear,UI.calMonth,UI.calWeekStart);
    } else {
      // Lundi de la semaine courante
      const d=new Date();
      const dow=d.getDay();
      const diff=dow===0?-6:1-dow;
      startDate=new Date(d);startDate.setDate(d.getDate()+diff);startDate.setHours(0,0,0,0);
      UI.calYear=startDate.getFullYear();UI.calMonth=startDate.getMonth();UI.calWeekStart=startDate.getDate();
    }
    const days=[];
    for(let i=0;i<7;i++){const d=new Date(startDate);d.setDate(startDate.getDate()+i);days.push(d);}
    const endDate=days[6];
    const startStr=`${days[0].getDate()} ${MONTHS_SHORT[days[0].getMonth()]}`;
    const endStr=`${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]} ${endDate.getFullYear()}`;
    document.getElementById('cal-label').textContent=`${startStr} — ${endStr}`;
    document.getElementById('rdv-list-title').textContent='Événements de la semaine';

    // En-tetes et cases partagent desormais UNE SEULE grille (voir
    // calFixerColonnes) : deux grilles distinctes ne s'alignaient pas.
    const hdrs=document.getElementById('cal-headers');
    hdrs.innerHTML='';
    hdrs.style.display='none';

    const enTetes=days.map(d=>{
      const isT=d.getTime()===today.getTime();
      return `<div class="cal-hdr" style="${isT?'color:var(--blue);font-weight:700':''}">${DAYS[d.getDay()===0?6:d.getDay()-1]}<br><span style="font-size:13px">${d.getDate()}</span></div>`;
    }).join('');

    const body=document.getElementById('cal-body');
    body.className='cal-grid';
    calFixerColonnes(body);
    body.innerHTML=enTetes+days.map(d=>{
      const fd=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const isT=d.getTime()===today.getTime();
      const evts=allEvts.filter(e=>e.date&&e.date.startsWith(fd)).sort(calTriHoraire);
      return `<div class="cal-day${isT?' today':''}" onclick="calDayClick('${fd}',event)" style="min-height:110px">
        ${evts.map(e=>`<div class="cal-ev ${e.evtType==='mission'?'ev-green':e.evtType==='task'?'ev-amber':'ev-blue'}" title="${(e.titre||e.agence||'').replace(/"/g,'&quot;')}" style="font-size:10px;margin-bottom:2px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${e.evtType==='mission'?';font-weight:700':''}" onclick="event.stopPropagation();${e.evtType==='task'?`openTaskFromCalendar('${e.contactId}','${e.id}')`:`openEvtDetail('${e.evtType}','${e.id||e._supaId||''}')`}">${fmtDT(e.date).split(' ')[1]||''} ${e.titre||e.agence||''}${e.evtType==='mission'&&e.dureeEstimee?' ('+e.dureeEstimee+')':''}</div>`).join('')}
        ${evts.length===0?'<div style="font-size:10px;color:var(--text3);padding:4px">Libre</div>':''}
      </div>`;
    }).join('');

    // Liste événements semaine
    const weekEvts=allEvts.filter(e=>{const d=new Date(e.date);return d>=days[0]&&d<=endDate;}).sort((a,b)=>new Date(a.date)-new Date(b.date));
    document.getElementById('rdv-list').innerHTML=weekEvts.length
      ? weekEvts.map(renderEvtListItem).join('')
      : '<div class="empty">Aucun événement cette semaine</div>';

  } else {
    // Vue mois classique
    const firstDay=new Date(UI.calYear,UI.calMonth,1);
    const lastDay=new Date(UI.calYear,UI.calMonth+1,0);
    document.getElementById('cal-label').textContent=MONTHS[UI.calMonth]+' '+UI.calYear;
    document.getElementById('rdv-list-title').textContent='Événements du mois';

    const hdrs=document.getElementById('cal-headers');
    hdrs.innerHTML='';
    hdrs.style.display='none';

    let startDow=(firstDay.getDay()+6)%7;
    // Les 7 libelles de jours ouvrent la grille : meme conteneur, donc
    // alignement garanti avec les cases quelle que soit la largeur.
    let html=DAYS.map(d=>`<div class="cal-hdr">${d}</div>`).join('');
    for(let i=0;i<startDow;i++)html+='<div></div>';
    for(let d=1;d<=lastDay.getDate();d++){
      const fd=`${UI.calYear}-${String(UI.calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dt=new Date(UI.calYear,UI.calMonth,d);
      const isT=dt.getTime()===today.getTime();
      const evts=allEvts.filter(e=>e.date&&e.date.startsWith(fd)).sort(calTriHoraire);
      html+=`<div class="cal-day${isT?' today':''}" onclick="calDayClick('${fd}',event)">
        <div class="cal-day-num">${d}</div>
        ${evts.map(e=>`<div class="cal-ev ${e.evtType==='mission'?'ev-green':e.evtType==='task'?'ev-amber':'ev-blue'}" title="${(e.titre||e.agence||'').replace(/"/g,'&quot;')}" style="cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${e.evtType==='mission'?';font-weight:700':''}" onclick="event.stopPropagation();${e.evtType==='task'?`openTaskFromCalendar('${e.contactId}','${e.id}')`:`openEvtDetail('${e.evtType}','${e.id||e._supaId||''}')`}">${e.titre||e.agence||''}</div>`).join('')}
      </div>`;
    }
    const body=document.getElementById('cal-body');
    body.className='cal-grid';
    calFixerColonnes(body);
    body.innerHTML=html;

    const monthEvts=allEvts.filter(e=>{if(!e.date)return false;const dt=new Date(e.date);return dt.getMonth()===UI.calMonth&&dt.getFullYear()===UI.calYear;}).sort((a,b)=>new Date(a.date)-new Date(b.date));
    document.getElementById('rdv-list').innerHTML=monthEvts.length
      ? monthEvts.map(renderEvtListItem).join('')
      : '<div class="empty">Aucun événement ce mois</div>';
  }
}
// ─── DETAIL EVENEMENT AGENDA ──────────────────────────────
let _currentEvtType = '';
let _currentEvtId = '';

function openEvtDetail(type, id){
  _currentEvtType = type;
  _currentEvtId = id;

  const allEvts = [
    ...DB.rdvs.map(r => ({...r, evtType:'rdv'})),
    ...DB.missions.map(m => ({...m, evtType:'mission'}))
  ];
  const e = allEvts.find(x => (x.id === id || x._supaId === id || String(x.id) === id));
  if(!e) return;

  const titleEl = document.getElementById('evt-detail-title');
  const bodyEl = document.getElementById('evt-detail-body');
  const notesEl = document.getElementById('evt-detail-notes');
  const missionBtn = document.getElementById('evt-detail-mission-btn');

  titleEl.innerHTML = `${type === 'mission' ? '🏠' : '📅'} ${esc(e.titre||e.agence||'RDV')} <button class="modal-close" onclick="closeModal(\'modal-evt-detail\')"><i class="ti ti-x"></i></button>`;

  // Champs venant potentiellement d'une reservation publique (formulaire non
  // authentifie) : toujours passer par esc() avant affectation a innerHTML,
  // meme pour un simple libelle de statut.
  const rows = [
    e.agence        ? ['🏢 Agence',    esc(e.agence)]   : null,
    e.type          ? ['📋 Type EDL',  esc(e.type)]      : null,
    e.adresse       ? ['📍 Adresse',   esc(e.adresse)]   : null,
    e.date          ? ['📅 Date',      fmtDT(e.date)] : null,
    e.duree         ? ['⏱️ Durée',     esc(e.duree)]     : null,
    e.contact       ? ['👤 Contact',   esc(e.contact)]   : null,
    e.locataireNom  ? ['🧑 Locataire', `${esc(e.locataireNom)}${e.locataireTel?' — '+esc(e.locataireTel):''}`] : null,
    (e.locatairesEntrants && e.locatairesEntrants.length) ? ['🔑 Entrant(s)', fmtEntrants(e.locatairesEntrants)] : null,
    e.montant       ? ['💶 Montant',   esc(e.montant)+' € HT'] : null,
    e.statut        ? ['🔖 Statut',    esc(e.statut)]    : null,
  ].filter(Boolean);

  bodyEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    ${rows.map(([k,v]) => `<tr><td style="color:var(--text2);padding:4px 0;width:35%;vertical-align:top">${k}</td><td style="font-weight:500;padding:4px 0">${v}</td></tr>`).join('')}
  </table>`;

  notesEl.value = e.notes || '';
  missionBtn.style.display = (type === 'mission') ? 'flex' : 'none';
  openModal('modal-evt-detail');
}

function saveEvtNotes(){
  const notes = document.getElementById('evt-detail-notes').value;
  if(_currentEvtType === 'rdv'){
    const rdv = DB.rdvs.find(r => String(r.id) === String(_currentEvtId));
    if(rdv){ rdv.notes = notes; saveToStorage(); }
  } else {
    const m = DB.missions.find(x => String(x.id) === String(_currentEvtId));
    if(m){ m.notes = notes; saveToStorage(); }
  }
  notify('✅ Notes enregistrées');
  closeModal('modal-evt-detail');
  renderCalendar();
}

function goToEvtMission(){
  closeModal('modal-evt-detail');
  nav('missions');
  setTimeout(() => {
    const m = DB.missions.find(x => String(x.id) === String(_currentEvtId));
    if(m) notify(`📋 Mission : ${m.agence} — ${m.adresse||m.type||''}`);
  }, 300);
}

function chMonth(d){chPeriod(d);}

// FIX : clic sur jour calendrier — ouvre détail si événement, modal si vide
function calDayClick(dateStr,event){
  const allEvts=[
    ...DB.rdvs.map(r=>({...r,evtType:'rdv'})),
    ...DB.missions.map(m=>({...m,titre:'EDL — '+m.agence,evtType:'mission'}))
  ].filter(e=>e.date&&e.date.startsWith(dateStr));
  if(allEvts.length===0){openModal('modal-rdv');return;}
  // Si clic direct sur la case (pas sur un event chip) et qu'il y a des events, ouvrir le modal quand même
  if(event&&event.target.classList.contains('cal-ev')){return;}
  openModal('modal-rdv');
}

// FIX : debounce pour autocomplete (perf avec 1300+ contacts)
let _acTimer=null;
function debounceAC(fn,val,delay=180){
  clearTimeout(_acTimer);_acTimer=setTimeout(()=>fn(val),delay);
}
function goToday(){
  const d=new Date();
  UI.calYear=d.getFullYear();UI.calMonth=d.getMonth();UI.calWeekStart=null;
  renderCalendar();
}

// ─── BREVO SYNC ───────────────────────────────────────────
async function loadBrevo(){
  document.getElementById('brevo-status').textContent='Chargement des contacts Brevo…';
  document.getElementById('brevo-table-wrap').style.display='none';
  setSyncStatus('loading');

  // 1. Charger contacts
  let all=[];
  try{
    const _tk5=(await supabaseClient.auth.getSession()).data?.session?.access_token||'';
    const resp=await fetch('/api/brevo-contacts?t='+Date.now(),{headers:{'Authorization':'Bearer '+_tk5}});
    if(!resp.ok)throw new Error('Fichier non trouvé');
    all=await resp.json();
  }catch(e){
    document.getElementById('brevo-status').textContent='❌ Impossible de charger les contacts Brevo — vérifie ta clé API dans Paramètres.';
    setSyncStatus('error');
    notify('Erreur chargement contacts Brevo','err');
    return;
  }

  // 2. Charger l'historique emails transactionnels (Brevo statistics/events, 30j)
  try{
    const _tkTrack=(await supabaseClient.auth.getSession()).data?.session?.access_token||'';
    const resp2=await fetch('/api/brevo-tracking?t='+Date.now(),{headers:{'Authorization':'Bearer '+_tkTrack}});
    if(resp2.ok){
      const tracking=await resp2.json();
      if(tracking&&tracking.length){
        // Injecter dans DB.trackings (sans doublons)
        tracking.forEach(t=>{
          if(!DB.trackings.find(e=>e.id===t.id)){
            DB.trackings.push(t);
          }
        });
        // Injecter dans les historiques des contacts
        tracking.forEach(t=>{
          const emailLow=(t.email||'').toLowerCase();
          const contact=DB.contacts.find(c=>(c.email||'').toLowerCase()===emailLow);
          if(contact){
            if(!contact.history)contact.history=[];
            if(!contact.history.find(h=>h.id===t.id)){
              contact.history.push(t);
            }
          }
        });
        notify(`📧 ${tracking.length} emails historiques chargés depuis Brevo`);
      }
    }
  }catch(e){/* brevo_tracking.json optionnel */}

  DB.brevoContacts=all;

  // Fusion avec contacts existants — vérification par EMAIL (pas seulement par ID)
  DB.brevoContacts.forEach(bc=>{
    const bcEmail=(bc.email||'').toLowerCase();
    const existing=DB.contacts.find(c=>(c.email||'').toLowerCase()===bcEmail && bcEmail!=='');
    if(existing){
      // Mettre à jour les données Brevo sans créer de doublon
      existing.presence='both';
      existing.emailStatus=bc.emailStatus;
      existing.opens=Math.max(existing.opens||0,bc.opens||0);
      existing.clicks=Math.max(existing.clicks||0,bc.clicks||0);
      if(!existing.history)existing.history=[];
      (bc.history||[]).forEach(h=>{
        if(!existing.history.find(e=>e.id===h.id))existing.history.push(h);
      });
      bc.presence='both';
    } else {
      // Vérifier aussi par ID avant d'ajouter
      if(!DB.contacts.find(c=>(c.email&&bc.email&&(c.email||'').toLowerCase()===(bc.email||'').toLowerCase())||c.id===bc.id)){
        DB.contacts.push({...bc});
      }
    }
  });

  detectDuplicates();
  saveToStorage();
  setSyncStatus('ok');

  const bCount=DB.brevoContacts.length;
  const nCount=DB.contacts.filter(c=>c.presence==='notion').length;
  document.getElementById('bk-brevo').textContent=bCount;
  document.getElementById('bk-notion').textContent=nCount;
  document.getElementById('bk-total').textContent=DB.contacts.length;
  document.getElementById('bk-dups').textContent=DB.dups.length;

  document.getElementById('brevo-status').textContent='';
  document.getElementById('brevo-table-wrap').style.display='block';
  document.getElementById('brevo-count').textContent=bCount+' contacts chargés';
  notify(`✅ ${bCount} contacts + historique emails synchronisés !`);
  syncTrackingFromBrevo();
  renderBrevoTable();
  renderDupsTable();
  renderDashboard();
}

function renderBrevoTable(){
  document.getElementById('brevo-tbody').innerHTML=DB.brevoContacts.length?DB.brevoContacts.map(c=>`<tr class="clickable" onclick="openFiche('${c.id}')">
    <td><div class="flex-row"><div class="avatar" style="font-size:9px">${initials(c.entreprise||c.contact)}</div><div><div style="font-size:11px;font-weight:600">${c.entreprise||c.contact||'—'}</div></div></div></td>
    <td style="font-size:11px"><a href="mailto:${c.email}" style="color:var(--blue);text-decoration:none" onclick="event.stopPropagation()">${c.email||'—'}</a></td>
    <td style="font-size:11px;font-weight:500;color:var(--text)">${c.tel||'<span style="color:var(--red);font-size:10px">Manquant</span>'}</td>
    <td style="font-size:11px;color:var(--text2)">${c.ville||c.cp||'—'}</td>
    <td>${c.emailStatus?statusBadge(c.emailStatus):'—'}</td>
    <td style="font-size:11px">${c.opens||0}</td>
    <td style="font-size:11px">${c.clicks||0}</td>
  </tr>`).join(''):'<tr><td colspan="7" class="empty">Aucun contact — Lance la sync</td></tr>';
}

function renderDupsTable(){
  const wrap=document.getElementById('dups-wrap');
  if(DB.dups.length===0){wrap.style.display='none';return;}
  wrap.style.display='block';
  document.getElementById('dups-tbody').innerHTML=DB.dups.map((d,i)=>{
    const c1=DB.contacts[d.i1];const c2=DB.contacts[d.i2];
    if(!c1||!c2)return '';
    return `<tr class="dup-row"><td><div style="font-size:11px;font-weight:600">${c1.entreprise||'—'}</div><div style="font-size:10px;color:var(--text2)">${c1.email||'—'}</div></td><td><div style="font-size:11px;font-weight:600">${c2.entreprise||'—'}</div><div style="font-size:10px;color:var(--text2)">${c2.email||'—'}</div></td><td><span class="badge ${d.type==='email'?'b-blue':'b-amber'}">${d.type==='email'?'📧 email':'📞 téléphone'}</span></td><td><button class="btn btn-sm btn-danger" onclick="mergeDup(${i})"><i class="ti ti-git-merge"></i>Fusionner</button></td></tr>`;
  }).join('');
}

function mergeContactData(dst, src){
  // Complète dst avec les champs non vides de src (sans écraser l'existant)
  const fields=['entreprise','contact','email','tel','statut','source','moyenContact','lastContact','typeClient'];
  fields.forEach(f=>{
    const cur=(dst[f]||'').toString().trim();
    const alt=(src[f]||'').toString().trim();
    if((!cur||cur.toLowerCase()==='undefined')&&alt&&alt.toLowerCase()!=='undefined'){ dst[f]=src[f]; }
  });
  // Email secondaire : si les deux ont un email différent, conserver l'autre dans les notes
  const e1=(dst.email||'').toLowerCase().trim(), e2=(src.email||'').toLowerCase().trim();
  if(e1&&e2&&e1!==e2){
    const extra='Email secondaire : '+src.email;
    dst.notes=(dst.notes?dst.notes+' · ':'')+extra;
  }
  // Fusionner les notes de src si présentes
  if(src.notes&&src.notes.trim()){
    dst.notes=(dst.notes?dst.notes+' · ':'')+src.notes.trim();
  }
  return dst;
}
function mergeDup(idx){
  const d=DB.dups[idx];if(!d)return;
  const c1=DB.contacts[d.i1];
  const c2=DB.contacts[d.i2];
  const c2Id=c2?c2.id:null;
  // Fusion intelligente : compléter c1 avec les infos de c2 avant suppression
  if(c1&&c2){ mergeContactData(c1, c2); if(c1.id) pushToSupabase('contacts', c1); }
  DB.contacts.splice(d.i2,1);
  detectDuplicates();saveToStorage();
  if(c2Id)deleteFromSupabase('contacts', c2Id);
  notify('✅ Doublon fusionné');
  renderBrevoTable();renderDupsTable();renderContacts&&renderContacts();
  document.getElementById('bk-dups').textContent=DB.dups.length;
  document.getElementById('bk-total').textContent=DB.contacts.length;
}

function mergeAllDups(){
  // Fusion en masse UNIQUEMENT pour les doublons email (sûrs).
  // Les doublons téléphone se fusionnent au cas par cas (bouton individuel).
  const emailDups=DB.dups.filter(d=>d.type==='email');
  if(emailDups.length===0){ notify('Aucun doublon email à fusionner. Les doublons téléphone se fusionnent individuellement.','warn'); return; }
  // Compléter chaque i1 avec les infos de son i2 avant suppression
  emailDups.forEach(d=>{
    const c1=DB.contacts[d.i1], c2=DB.contacts[d.i2];
    if(c1&&c2){ mergeContactData(c1, c2); if(c1.id) pushToSupabase('contacts', c1); }
  });
  const toRemove=new Set(emailDups.map(d=>d.i2));
  const removedIds=DB.contacts.filter((_,i)=>toRemove.has(i)).map(c=>c.id);
  DB.contacts=DB.contacts.filter((_,i)=>!toRemove.has(i));
  detectDuplicates();saveToStorage();
  removedIds.forEach(id=>deleteFromSupabase('contacts', id));
  notify(`✅ ${emailDups.length} doublon(s) email fusionné(s) !`);
  renderBrevoTable();renderDupsTable();renderContacts&&renderContacts();
  document.getElementById('bk-dups').textContent=DB.dups.length;
  document.getElementById('bk-total').textContent=DB.contacts.length;
}

// ─── SYNC ALL ─────────────────────────────────────────────
async function syncAll(){
  setSyncStatus('loading');
  notify('Synchronisation en cours…');
  await loadBrevo();
  if(_supaReady){
    await pushAllToSupabase();
  }
  renderDashboard();
}

// ─── SAVE FORMS ───────────────────────────────────────────
function saveContact(){
  if(!checkPlanLimit('contact')) return;
  const typeClient=document.getElementById('c-type-client').value;
  const ent=document.getElementById('c-ent').value.trim();
  const contactVal=document.getElementById('c-contact').value;
  if(typeClient==='Particulier'){
    if(!contactVal.trim()){notify('⚠️ Nom du particulier requis','warn');return;}
  } else if(!ent){
    notify('⚠️ Entreprise requise','warn');return;
  }
  DB.contacts.push({id:'local_'+Date.now(),entreprise:ent,contact:contactVal,email:document.getElementById('c-email').value,tel:document.getElementById('c-tel').value,statut:document.getElementById('c-statut').value,source:document.getElementById('c-source').value,notes:document.getElementById('c-notes').value,typeClient:typeClient,presence:'notion'});
  detectDuplicates();saveToStorage();closeModal('modal-contact');notify('✅ Contact ajouté !');
  ['c-ent','c-contact','c-email','c-tel','c-notes'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('c-type-client').value='Professionnel';
  toggleContactTypeUI();
  renderContacts();renderDashboard();
}
function saveDeal(){
  const agence=document.getElementById('d-agence').value.trim();
  if(!agence){notify('⚠️ Agence requise','warn');return;}
  DB.deals.push({id:'d_'+Date.now(),agence,montant:Number(document.getElementById('d-montant').value)||0,periode:document.getElementById('d-periode').value||'mois',etape:document.getElementById('d-etape').value,proba:Number(document.getElementById('d-proba').value)||0,notes:document.getElementById('d-notes').value});
  saveToStorage();closeModal('modal-deal');notify('✅ Opportunité ajoutée !');renderPipeline();renderDashboard();
}
function autocompleteMission(val){
  const box=document.getElementById('m-agence-suggest');
  if(!val||val.length<2){if(box)box.style.display='none';return;}
  const q=val.toLowerCase();
  const matches=DB.contacts.filter(c=>(c.entreprise||'').toLowerCase().includes(q)||(c.contact||'').toLowerCase().includes(q)).slice(0,6);
  // Inclure aussi les agences déjà utilisées dans des missions mais absentes des contacts
  const matchedNames=new Set(matches.map(c=>(c.entreprise||c.contact||'').toLowerCase()));
  const missionNames=new Set();
  DB.missions.forEach(m=>{
    const name=(m.agence||'').trim();
    const lname=name.toLowerCase();
    if(name && lname.includes(q) && !matchedNames.has(lname) && !missionNames.has(lname)){
      missionNames.add(lname);
    }
  });
  const extraMatches=[...missionNames].slice(0,6-matches.length).map(lname=>{
    const m=DB.missions.find(mi=>(mi.agence||'').toLowerCase()===lname);
    return {agence:m.agence, email:m.emailClient||'', tel:''};
  });
  if(!matches.length && !extraMatches.length){if(box)box.style.display='none';return;}
  if(box){
    box.style.display='block';
    // Double echappement pour les valeurs injectees dans l'attribut onclick :
    // d'abord JS (proteger le litteral '...'), puis HTML (proteger l'attribut
    // "..." et le contenu affiche) — necessaire car agence/email peuvent
    // venir d'une reservation publique non authentifiee.
    const jsAttr = v => esc(String(v||'').replace(/'/g,"\\'"));
    const contactRows=matches.map(c=>`<div onclick="selectMissionContact('${jsAttr(c.id)}')" style="padding:7px 10px;cursor:pointer;font-size:11px;border-bottom:0.5px solid var(--border)" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''"><div style="font-weight:600">${esc(c.entreprise||c.contact)}</div><div style="color:var(--text2);font-size:10px">${esc(c.email||'')} ${c.tel?'· '+esc(c.tel):''}</div></div>`).join('');
    const missionRows=extraMatches.map(m=>`<div onclick="selectMissionAgence('${jsAttr(m.agence)}','${jsAttr(m.email)}')" style="padding:7px 10px;cursor:pointer;font-size:11px;border-bottom:0.5px solid var(--border)" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''"><div style="font-weight:600">${esc(m.agence)}</div><div style="color:var(--text2);font-size:10px">Déjà utilisé en mission · pas encore en contact</div></div>`).join('');
    box.innerHTML=contactRows+missionRows;
  }
}
function selectMissionAgence(agence,email){
  document.getElementById('m-agence').value=agence||'';
  const emailEl=document.getElementById('m-email');if(emailEl&&email)emailEl.value=email;
  const box=document.getElementById('m-agence-suggest');if(box)box.style.display='none';
}
function selectMissionContact(id){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  document.getElementById('m-agence').value=c.entreprise||c.contact||'';
  const emailEl=document.getElementById('m-email');if(emailEl)emailEl.value=c.email||'';
  const tcEl=document.getElementById('m-type-client');if(tcEl)tcEl.value=c.typeClient||'Professionnel';
  const box=document.getElementById('m-agence-suggest');if(box)box.style.display='none';
}

function saveMission(){
  if(!checkPlanLimit('mission')) return;
  const agence=document.getElementById('m-agence').value.trim();
  if(!agence){notify('⚠️ Agence/Client requis','warn');return;}
  const email=(document.getElementById('m-email')?.value||'').trim();
  const mission={
    id:'m_'+Date.now(),agence,
    emailClient:email,
    typeClient:document.getElementById('m-type-client')?.value||'Professionnel',
    adresse:document.getElementById('m-adresse').value,
    type:document.getElementById('m-type').value,
    bienType:document.getElementById('m-bien-type')?.value||'',
    bienTypo:document.getElementById('m-bien-typo')?.value||'',
    bienMeuble:document.getElementById('m-bien-meuble')?.value||'',
    date:document.getElementById('m-date').value,
    montant:Number(document.getElementById('m-montant').value)||0,
    statut:document.getElementById('m-statut').value,
    notes:document.getElementById('m-notes').value
  };
  DB.missions.push(mission);
  // Rattachement automatique au contact
  const contact=DB.contacts.find(c=>
    (email&&(c.email||'').toLowerCase()===email.toLowerCase())||
    (c.entreprise||'').toLowerCase()===(agence||'').toLowerCase()
  );
  if(contact){
    if(contact.statut==='Cible potentielle'){contact.statut='Client actif';}
    contact.lastContact=new Date().toISOString().split('T')[0];
    contact.moyenContact=contact.moyenContact||'Mission EDL';
    pushToSupabase('contacts', contact);
    notify(`✅ Mission rattachée à ${agence} — fiche mise à jour !`);
  } else {
    // Créer automatiquement le contact s'il n'existe pas
    const newContact={
      id:'c_'+Date.now(),
      entreprise:agence,
      contact:'',
      email:email||'',
      tel:'',
      ville:'',
      typeClient:document.getElementById('m-type-client')?.value||'Professionnel',
      statut:'Client actif',
      presence:'crm',
      lastContact:new Date().toISOString().split('T')[0],
      moyenContact:'Mission EDL',
      opens:0,clicks:0,history:[],
      notes:`Contact créé automatiquement lors de la mission du ${new Date().toLocaleDateString('fr-FR')}`
    };
    DB.contacts.push(newContact);
    saveToStorage();
    pushToSupabase('contacts', newContact);
    notify(`✅ Mission ajoutée — contact "${agence}" créé automatiquement !`);
    renderContacts();
  }
  saveToStorage();closeModal('modal-mission');
  ['m-agence','m-adresse','m-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const emailEl=document.getElementById('m-email');if(emailEl)emailEl.value='';
  renderMissions();renderDashboard();
}

// ─── GOOGLE AGENDA ────────────────────────────────────────
function googleCalLink(titre, date, duree, lieu, description){
  // Construire les dates au format YYYYMMDDTHHmmss
  const start = new Date(date);
  if(isNaN(start.getTime())) return null;

  // Calculer la durée en minutes
  const dureeMins = {
    '30 min':30, '1h':60, '1h30':90, '2h':120, '2h30':150, '3h':180,
    '3h30':210, '4h':240, '4h30':270, '5h':300, '5h30':330, '6h':360,
    '6h30':390, '7h':420, '7h30':450, '8h':480
  }[duree] || 60;

  const end = new Date(start.getTime() + dureeMins * 60000);

  const fmt = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const startStr = fmt(start);
  const endStr   = fmt(end);

  const params = new URLSearchParams({
    action : 'TEMPLATE',
    text   : titre || 'RDV EDL IDF',
    dates  : `${startStr}/${endStr}`,
    details: description || 'RDV via EDL IDF CRM',
    location: lieu || '',
    sf     : 'true',
    output : 'xml'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function openInGoogleCalendar(rdvId){
  const r = DB.rdvs.find(x => x.id === rdvId);
  if(!r){ notify('RDV introuvable','warn'); return; }
  const url = googleCalLink(r.titre, r.date, r.duree, r.contact, r.type);
  if(!url){ notify('Date invalide','warn'); return; }
  window.open(url, '_blank');
}

function missionCalDesc(m){
  const loc = (m.locataires && m.locataires.length)
    ? m.locataires.map(l => [l.civilite, l.nom, l.tel && ('· '+l.tel)].filter(Boolean).join(' ')).join(', ')
    : [m.locataireCivilite, m.locataireNom, m.locataireTel && ('· '+m.locataireTel)].filter(Boolean).join(' ');
  const bien = [m.bienType, m.bienTypo, m.bienMeuble].filter(Boolean).join(' · ');
  return [
    `Type : ${m.type||'EDL'}`,
    `Agence : ${m.agence||'—'}`,
    bien && `Bien : ${bien}${m.superficie ? ' · '+m.superficie+' m²' : ''}`,
    loc && `Locataire(s) : ${loc}`,
    m.locataireEmail && `Email locataire : ${m.locataireEmail}`,
    (m.locatairesEntrants && m.locatairesEntrants.length) && `Entrant(s) : ${m.locatairesEntrants.map(e => [e.prenom,e.nom].filter(Boolean).join(' ') + (e.tel ? ' · '+e.tel : '')).join(' | ')}`,
    m.proprietaire && `Propriétaire : ${m.proprietaire}`,
    m.acces && `Accès : ${m.acces}`,
    m.montant ? `Montant : ${m.montant} € HT` : null,
    `Statut : ${m.statut||'planifiée'}`
  ].filter(Boolean).join('\n');
}
function openMissionInGoogleCalendar(idx){
  const m = DB.missions[idx];
  if(!m) return;
  const titre = `EDL IDF — ${m.type} · ${m.agence}`;
  const url   = googleCalLink(titre, m.date, m.dureeEstimee || '2h', m.adresse, missionCalDesc(m));
  if(!url){ notify('Date invalide','warn'); return; }
  window.open(url, '_blank');
}

function saveRdv(){
  const titre=document.getElementById('r-titre').value.trim();
  if(!titre){notify('⚠️ Titre requis','warn');return;}
  DB.rdvs.push({id:'r_'+Date.now(),titre,date:document.getElementById('r-date').value,duree:document.getElementById('r-duree').value,type:document.getElementById('r-type').value,contact:document.getElementById('r-contact').value});
  const newRdv = DB.rdvs[DB.rdvs.length-1];
  saveToStorage();closeModal('modal-rdv');
  notify('✅ RDV ajouté !');
  renderCalendar();renderDashboard();
  // Proposer d'ajouter à Google Agenda
  setTimeout(()=>{
    const url = googleCalLink(newRdv.titre, newRdv.date, newRdv.duree, newRdv.contact, newRdv.type);
    if(url){
      const n=document.getElementById('notif');
      n.innerHTML=`✅ RDV ajouté ! <a href="${url}" target="_blank" style="color:#fff;text-decoration:underline;margin-left:8px">📅 Ajouter à Google Agenda</a>`;
      n.style.background='#1A5FA8';
      n.classList.add('show');
      setTimeout(()=>n.classList.remove('show'),6000);
    }
  },300);
}

// ─── CLAUDE AI COMPOSER ───────────────────────────────────

// === Ajout : sélecteur Professionnel / Particulier dans #modal-contact ===
(function(){
  const entField = document.getElementById('c-ent');
  if(!entField) return;
  const entWrapper = entField.parentElement;      // <div><label>Entreprise *</label><input id="c-ent"></div>
  const formGrid = entWrapper.parentElement;       // .form-grid
  if(!formGrid) return;

  const typeWrapper = document.createElement('div');
  typeWrapper.innerHTML = `
    <label>Type de client</label>
    <select id="c-type-client" onchange="toggleContactTypeUI()">
      <option>Professionnel</option>
      <option>Particulier</option>
    </select>
  `;
  formGrid.parentElement.insertBefore(typeWrapper, formGrid);
})();

function toggleContactTypeUI(){
  const typeClient=document.getElementById('c-type-client').value;
  const entField=document.getElementById('c-ent');
  const entLabel=entField.previousElementSibling;
  if(typeClient==='Particulier'){
    if(entLabel) entLabel.textContent='Entreprise';
    entField.placeholder='(optionnel pour un particulier)';
  } else {
    if(entLabel) entLabel.textContent='Entreprise *';
    entField.placeholder='Orpi Évry';
  }
}
