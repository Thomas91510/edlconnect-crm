// === Lokentia CRM — app-contacts.js ===
// Fiche contact, navigation, dashboard, contacts, pipeline
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

let currentFicheId=null;

// ─── Email(s) / Téléphone(s) multiples avec type ────────────────────────
// c.email/c.tel restent les champs principaux (utilisés tels quels ailleurs
// dans le CRM : recherche de commandes liées, email de bienvenue, détection
// de doublons) — c.emailsAutres/c.telsAutres ne stockent que les entrées
// SUPPLÉMENTAIRES, chacune avec son type. Rien d'autre dans le CRM n'a besoin
// de connaître ces tableaux : ils sont uniquement affichés/édités ici.
const TYPES_EMAIL=[['pro','Pro'],['perso','Perso'],['autre','Autre']];
const TYPES_TEL=[['fixe','Fixe'],['mobile','Mobile'],['autre','Autre']];

function optionsType(types,selection){
  return types.map(([v,l])=>`<option value="${v}"${v===selection?' selected':''}>${l}</option>`).join('');
}

function renderEmailRows(c){
  const principal=`<div class="fiche-multi-row">
      <select onchange="quickUpdateContact('${jsq(c.id)}','emailType',this.value)">${optionsType(TYPES_EMAIL,c.emailType||'pro')}</select>
      <input type="email" placeholder="email@exemple.fr" value="${esc(c.email||'')}" onchange="quickUpdateContact('${jsq(c.id)}','email',this.value)">
    </div>`;
  const autres=(Array.isArray(c.emailsAutres)?c.emailsAutres:[]).map((e,i)=>`
    <div class="fiche-multi-row">
      <select onchange="modifierEmailAutre('${jsq(c.id)}',${i},'type',this.value)">${optionsType(TYPES_EMAIL,e.type||'autre')}</select>
      <input type="email" placeholder="email@exemple.fr" value="${esc(e.valeur||'')}" onchange="modifierEmailAutre('${jsq(c.id)}',${i},'valeur',this.value)">
      <button type="button" class="btn-mini-remove" onclick="retirerEmailAutre('${jsq(c.id)}',${i})" title="Retirer"><i class="ti ti-x"></i></button>
    </div>`).join('');
  return principal+autres;
}

function renderTelRows(c){
  const principal=`<div class="fiche-multi-row">
      <select onchange="quickUpdateContact('${jsq(c.id)}','telType',this.value)">${optionsType(TYPES_TEL,c.telType||'mobile')}</select>
      <input placeholder="06 12 34 56 78" value="${esc(c.tel||'')}" onchange="quickUpdateContact('${jsq(c.id)}','tel',this.value)">
    </div>`;
  const autres=(Array.isArray(c.telsAutres)?c.telsAutres:[]).map((t,i)=>`
    <div class="fiche-multi-row">
      <select onchange="modifierTelAutre('${jsq(c.id)}',${i},'type',this.value)">${optionsType(TYPES_TEL,t.type||'autre')}</select>
      <input placeholder="06 12 34 56 78" value="${esc(t.valeur||'')}" onchange="modifierTelAutre('${jsq(c.id)}',${i},'valeur',this.value)">
      <button type="button" class="btn-mini-remove" onclick="retirerTelAutre('${jsq(c.id)}',${i})" title="Retirer"><i class="ti ti-x"></i></button>
    </div>`).join('');
  return principal+autres;
}

function ajouterEmailContact(id){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  const liste=Array.isArray(c.emailsAutres)?c.emailsAutres.slice():[];
  liste.push({type:'autre',valeur:''});
  quickUpdateContact(id,'emailsAutres',liste);
  const wrap=document.getElementById('fiche-emails-rows');
  if(wrap)wrap.innerHTML=renderEmailRows(c);
}

function modifierEmailAutre(id,index,champ,valeur){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  const liste=Array.isArray(c.emailsAutres)?c.emailsAutres.slice():[];
  if(!liste[index])return;
  liste[index]={...liste[index],[champ]:valeur};
  quickUpdateContact(id,'emailsAutres',liste);
}

function retirerEmailAutre(id,index){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  const liste=Array.isArray(c.emailsAutres)?c.emailsAutres.slice():[];
  liste.splice(index,1);
  quickUpdateContact(id,'emailsAutres',liste);
  const wrap=document.getElementById('fiche-emails-rows');
  if(wrap)wrap.innerHTML=renderEmailRows(c);
}

function ajouterTelContact(id){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  const liste=Array.isArray(c.telsAutres)?c.telsAutres.slice():[];
  liste.push({type:'autre',valeur:''});
  quickUpdateContact(id,'telsAutres',liste);
  const wrap=document.getElementById('fiche-tels-rows');
  if(wrap)wrap.innerHTML=renderTelRows(c);
}

function modifierTelAutre(id,index,champ,valeur){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  const liste=Array.isArray(c.telsAutres)?c.telsAutres.slice():[];
  if(!liste[index])return;
  liste[index]={...liste[index],[champ]:valeur};
  quickUpdateContact(id,'telsAutres',liste);
}

function retirerTelAutre(id,index){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  const liste=Array.isArray(c.telsAutres)?c.telsAutres.slice():[];
  liste.splice(index,1);
  quickUpdateContact(id,'telsAutres',liste);
  const wrap=document.getElementById('fiche-tels-rows');
  if(wrap)wrap.innerHTML=renderTelRows(c);
}

function openFiche(id){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  currentFicheId=id;
  const _cbEspace=document.getElementById('fiche-espace-actif'); if(_cbEspace) _cbEspace.checked=espaceActif(c);
  if(typeof chargerEspacesHistoriques==='function') chargerEspacesHistoriques();
  document.getElementById('fiche-avatar').textContent=initials(c.entreprise||c.contact||'?');
  document.getElementById('fiche-name').textContent=c.entreprise||c.contact||'—';
  document.getElementById('fiche-sub').textContent=[c.contact,c.source].filter(Boolean).join(' · ')||'';
  // Onglet Informations — tout éditable en direct, groupé par thème (plus
  // d'onglet "Modifier" séparé qui rééditait presque les mêmes champs).
  document.getElementById('fiche-fields').innerHTML=`
    <div class="fiche-section">
      <div class="fiche-section-title">Coordonnées</div>
      <div class="fiche-grid">
        <div class="fiche-inline-field"><label>Entreprise</label>
          <input value="${esc(c.entreprise||'')}" onchange="quickUpdateContact('${jsq(c.id)}','entreprise',this.value)">
        </div>
        <div class="fiche-inline-field"><label>Contact</label>
          <input value="${esc(c.contact||'')}" onchange="quickUpdateContact('${jsq(c.id)}','contact',this.value)">
        </div>
        <div class="fiche-inline-field fiche-field-wide">
          <label>Email(s)</label>
          <div id="fiche-emails-rows">${renderEmailRows(c)}</div>
          <button type="button" class="btn btn-sm btn-mini-add" onclick="ajouterEmailContact('${jsq(c.id)}')"><i class="ti ti-plus"></i> Ajouter un email</button>
        </div>
        <div class="fiche-inline-field fiche-field-wide">
          <label>Téléphone(s)</label>
          <div id="fiche-tels-rows">${renderTelRows(c)}</div>
          <button type="button" class="btn btn-sm btn-mini-add" onclick="ajouterTelContact('${jsq(c.id)}')"><i class="ti ti-plus"></i> Ajouter un numéro</button>
        </div>
      </div>
    </div>

    <div class="fiche-section">
      <div class="fiche-section-title">Suivi commercial</div>
      <div class="fiche-grid">
        <div class="fiche-inline-field"><label>Statut</label>
          <select onchange="quickUpdateContact('${jsq(c.id)}','statut',this.value)">
            ${['Cible potentielle','Client actif','Client signé ✅','Partenaire','Inactif'].map(v=>`<option${v===(c.statut||'Cible potentielle')?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="fiche-inline-field"><label>Type client</label>
          <select onchange="quickUpdateContact('${jsq(c.id)}','typeClient',this.value)">
            ${['Professionnel','Particulier'].map(v=>`<option${v===(c.typeClient||'Professionnel')?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="fiche-inline-field"><label>Source</label>
          <select onchange="quickUpdateContact('${jsq(c.id)}','source',this.value)">
            ${['Démarchage','Recommandation','Relation','Site web','Brevo','Excel','Cal.com'].map(v=>`<option${v===(c.source||'Démarchage')?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="fiche-inline-field"><label>Dernier contact</label>
          <input type="date" value="${c.lastContact||''}" onchange="quickUpdateContact('${jsq(c.id)}','lastContact',this.value)">
        </div>
        <div class="fiche-inline-field"><label>Moyen de contact</label>
          <select onchange="quickUpdateContact('${jsq(c.id)}','moyenContact',this.value)">
            ${['— Non renseigné —','📧 Email','📞 Téléphone','💬 SMS','👤 Rendez-vous physique','💻 Visio','📱 WhatsApp','🔗 LinkedIn'].map(v=>`<option${v===(c.moyenContact||'')?' selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="fiche-inline-field"><label>Présence</label>
          <div style="padding-top:5px">${presenceBadge(c.presence||'notion')}</div>
        </div>
      </div>
    </div>

    <div class="fiche-section">
      <div class="fiche-section-title">Tracking email</div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="stat-pill pill-open"><i class="ti ti-eye" style="font-size:10px"></i><span id="fiche-suivi-opens">${statsSuiviContact(c).opens}</span> ouvertures</span>
        <span class="stat-pill pill-click"><i class="ti ti-mouse" style="font-size:10px"></i><span id="fiche-suivi-clicks">${statsSuiviContact(c).clicks}</span> clics</span>
        <span id="fiche-suivi-maj" style="font-size:11px;color:var(--text3)">Mis à jour automatiquement</span>
      </div>
    </div>

    <div class="fiche-section">
      <div class="fiche-section-title">Notes</div>
      <textarea style="width:100%;min-height:60px;font-size:12.5px;padding:8px 10px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--bg);font-family:inherit" placeholder="Remarques, historique, infos importantes…" onchange="quickUpdateContact('${jsq(c.id)}','notes',this.value)">${esc(c.notes||'')}</textarea>
    </div>
  `;
  document.getElementById('fiche-email-btn').onclick=()=>{
    closeModal('modal-fiche');
    nav('compose');
    setTimeout(()=>{
      document.getElementById('to-f').value=c.email||'';
      document.getElementById('subj-f').value=prefixeSociete('📋 ', c.entreprise||'');
    },100);
  };

  // Rendu emails via fonction dédiée (inclut Gmail)
  renderFicheEmails(c);
  suivreEmailsFiche(c.id);
  feRenderDocs(c.documents || []);
  const msgBadge=document.getElementById('ftab-messages-count');
  if(msgBadge){
    const nonLus=(Array.isArray(c.messages)?c.messages:[]).filter(m=>m.sender==='client'&&!m.lu).length;
    msgBadge.textContent=nonLus>0?nonLus:'';
  }
  ficheTab('infos',document.getElementById('ftab-infos'));
  renderFicheCommandes(c);
  openModal('modal-fiche');
}
function ficheTab(tab,btn){
  ['infos','commandes','taches','emails','messages','docs'].forEach(t=>{
    const el=document.getElementById('fiche-'+t);
    if(el)el.style.display='none';
  });
  document.querySelectorAll('#modal-fiche .tab').forEach(t=>t.classList.remove('active'));
  const el=document.getElementById('fiche-'+tab);
  if(el)el.style.display='block';
  if(btn)btn.classList.add('active');
  if(tab==='taches') renderContactTasks();
  if(tab==='messages') renderContactMessages();
}

// ─── MESSAGERIE CLIENT ↔ EXPERT ────────────────────────────
// Stockée dans contacts.data.messages (même schéma que "documents"), lue
// et écrite par le même mécanisme de synchronisation Supabase que le
// reste de la fiche contact — pas d'API dédiée côté CRM.
function contactMessagesCount(c){
  return Array.isArray(c?.messages) ? c.messages : [];
}

function renderContactMessages(){
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  const wrap = document.getElementById('fiche-messages-thread');
  if(!c || !wrap) return;
  const msgs = contactMessagesCount(c).slice().sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
  wrap.innerHTML = msgs.length ? msgs.map(m=>{
    const moi = m.sender === 'expert';
    return `<div style="align-self:${moi?'flex-end':'flex-start'};max-width:78%">
      <div style="padding:9px 13px;border-radius:14px;font-size:12.5px;line-height:1.4;${moi?'background:var(--blue);color:#fff;border-bottom-right-radius:4px':'background:var(--bg2);border:1px solid var(--border);border-bottom-left-radius:4px'}">${esc(m.body||'')}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px;padding:0 4px;text-align:${moi?'right':'left'}">${moi?'Vous':'Client'} · ${fmtDT ? fmtDT(m.createdAt) : new Date(m.createdAt).toLocaleString('fr-FR')}</div>
    </div>`;
  }).join('') : '<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px 0">Aucun message pour l\'instant.</div>';
  wrap.scrollTop = wrap.scrollHeight;

  // Marquer les messages du client comme lus (badge de l'onglet).
  const aMarquer = contactMessagesCount(c).some(m=>m.sender==='client' && !m.lu);
  if(aMarquer){
    c.messages = contactMessagesCount(c).map(m=> m.sender==='client' ? {...m, lu:true} : m);
    saveToStorage();
    if(typeof pushToSupabase === 'function') pushToSupabase('contacts', c);
    renderContactsMessagesBadges();
  }
}

function sendContactMessage(){
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  const input = document.getElementById('fiche-message-input');
  if(!c || !input) return;
  const texte = input.value.trim();
  if(!texte) return;
  if(!Array.isArray(c.messages)) c.messages = [];
  c.messages.push({ sender:'expert', body:texte, createdAt:new Date().toISOString(), lu:false });
  input.value = '';
  saveToStorage();
  if(typeof pushToSupabase === 'function') pushToSupabase('contacts', c);
  renderContactMessages();
}

// Compte total des messages client non lus, tous contacts confondus —
// affiché en badge sur l'onglet "Messages" de la fiche déjà ouverte, et
// peut servir à un badge global (ex: dans la nav Contacts).
function renderContactsMessagesBadges(){
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  const badge = document.getElementById('ftab-messages-count');
  if(badge && c){
    const nonLus = contactMessagesCount(c).filter(m=>m.sender==='client' && !m.lu).length;
    badge.textContent = nonLus > 0 ? nonLus : '';
  }
}

function addContactTask(){
  const titre = document.getElementById('new-task-titre').value.trim();
  if(!titre){ notify('⚠️ Le titre est requis', 'warn'); return; }
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  if(!c) return;
  if(!c.tasks) c.tasks = [];
  const date = document.getElementById('new-task-date').value;
  const heure = document.getElementById('new-task-heure').value;
  c.tasks.push({
    id: 'task_' + Date.now(),
    titre,
    date,
    heure,
    notes: document.getElementById('new-task-notes').value.trim(),
    done: false,
    createdAt: new Date().toISOString(),
    contactId: currentFicheId,
    contactNom: c.entreprise || c.contact || ''
  });
  saveToStorage();
  document.getElementById('new-task-titre').value = '';
  document.getElementById('new-task-date').value = '';
  document.getElementById('new-task-heure').value = '';
  document.getElementById('new-task-notes').value = '';
  renderContactTasks();
  updateFicheTachesCount();
  renderCalendar(); // rafraîchir l'agenda
  notify('✅ Tâche ajoutée');
}

function renderContactTasks(){
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  const tasks = (c && c.tasks) ? c.tasks : [];
  const el = document.getElementById('fiche-taches-list');
  if(!el) return;
  if(!tasks.length){
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Aucune tâche pour ce contact.</div>';
    return;
  }
  const sorted = [...tasks].sort((a,b) => {
    if(a.done !== b.done) return a.done ? 1 : -1;
    return (a.date||'9999') < (b.date||'9999') ? -1 : 1;
  });
  el.innerHTML = sorted.map(t => {
    const isOverdue = t.date && !t.done && new Date(t.date + (t.heure?'T'+t.heure:'')) < new Date();
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--radius);background:${t.done?'var(--bg2)':'var(--bg)'};border:1px solid var(--border);margin-bottom:6px;opacity:${t.done?'0.6':'1'}">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTask('${jsq(t.id)}')" style="margin-top:2px;cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;${t.done?'text-decoration:line-through;color:var(--text3)':''}">${esc(t.titre)}</div>
        ${t.date?`<div style="font-size:11px;color:${isOverdue?'var(--red-text)':'var(--text2)'};margin-top:2px">📅 ${esc(t.date)}${t.heure?' à '+esc(t.heure):''}${isOverdue?' — En retard ⚠️':''}</div>`:''}
        ${t.notes?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${esc(t.notes)}</div>`:''}
      </div>
      <button onclick="deleteTask('${jsq(t.id)}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;padding:2px" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

function toggleTask(taskId){
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  if(!c || !c.tasks) return;
  const t = c.tasks.find(x=>x.id===taskId);
  if(t){ t.done = !t.done; saveToStorage(); renderContactTasks(); updateFicheTachesCount(); renderCalendar(); }
}

function deleteTask(taskId){
  if(!confirm('Supprimer cette tâche ?')) return;
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  if(!c || !c.tasks) return;
  c.tasks = c.tasks.filter(x=>x.id!==taskId);
  saveToStorage(); renderContactTasks(); updateFicheTachesCount(); renderCalendar();
}

function openTaskFromCalendar(contactId, taskId){
  // Ouvrir la fiche contact sur l'onglet Tâches
  const c = DB.contacts.find(x => x.id === contactId);
  if(!c) return;
  openFiche(contactId);
  setTimeout(() => {
    ficheTab('taches', document.getElementById('ftab-taches'));
  }, 150);
}

function updateFicheTachesCount(){
  const c = DB.contacts.find(x=>x.id===currentFicheId);
  const tasks = (c && c.tasks) ? c.tasks : [];
  const pending = tasks.filter(t=>!t.done).length;
  const el = document.getElementById('ftab-taches-count');
  if(el) el.textContent = pending > 0 ? pending : '';
}
async function quickUpdateContact(id,field,value){
  const c=DB.contacts.find(x=>x.id===id);
  if(!c)return;
  const prevValue = c[field];
  c[field]=value;
  saveToStorage();
  notify('✅ Mis à jour !');
  // Entreprise/contact modifiés en direct : garder l'en-tête de la fiche à jour.
  if((field==='entreprise'||field==='contact') && id===currentFicheId){
    const nameEl=document.getElementById('fiche-name');
    const subEl=document.getElementById('fiche-sub');
    const avatarEl=document.getElementById('fiche-avatar');
    if(nameEl)nameEl.textContent=c.entreprise||c.contact||'—';
    if(subEl)subEl.textContent=[c.contact,c.source].filter(Boolean).join(' · ')||'';
    if(avatarEl)avatarEl.textContent=initials(c.entreprise||c.contact||'?');
  }
  // Entreprise/email modifiés en direct : la détection de doublons doit se
  // recalculer (avant, seul saveContactEdit() le faisait au moment du Save).
  if((field==='entreprise'||field==='email') && typeof detectDuplicates==='function'){
    detectDuplicates();
  }
  // Déclencher email si passage à "Client signé"
  if(field === 'statut' && value === 'Client signé ✅' && prevValue !== 'Client signé ✅'){
    if(c.email && confirm('Envoyer l\'email de bienvenue à ' + (c.entreprise||c.contact) + ' ?')){
      try {
        await fetch('/api/send-welcome-agency', {
          method:'POST', headers: await _authHeaders({'Content-Type':'application/json'}),
          body: JSON.stringify({ email:c.email, companyName:c.entreprise||c.contact||'', contactName:c.contact||'' })
        });
        notify('✅ Email de bienvenue envoyé !');
      } catch(e){ notify('⚠️ Erreur envoi email','warn'); }
    }
  }
  // Rafraîchir le tableau contacts si visible
  if(document.getElementById('view-contacts').classList.contains('active'))renderContacts();
  renderDashboard();
}

function renderFicheCommandes(c){
  // Trouver les missions liées à ce contact par email OU par nom d'agence
  const email=(c.email||'').toLowerCase();
  const nom=(c.entreprise||'').toLowerCase();

  const missions=DB.missions.filter(m=>{
    const mEmail=(m.emailClient||'').toLowerCase();
    const mAgence=(m.agence||'').toLowerCase();
    if(email&&mEmail&&mEmail===email) return true;
    if(nom&&mAgence&&(mAgence.includes(nom)||nom.includes(mAgence))) return true;
    return false;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));

  // Badge nombre commandes
  const countEl=document.getElementById('ftab-commandes-count');
  if(countEl)countEl.textContent=missions.length>0?`(${missions.length})`:'';

  // Badge tâches en attente
  updateFicheTachesCount();

  // CA total ce contact
  const caTotal=missions.filter(m=>m.statut==='terminée').reduce((s,m)=>s+(m.montant||0),0);

  if(!missions.length){
    document.getElementById('fiche-commandes-list').innerHTML=`
      <div class="empty" style="padding:24px">
        <div style="font-size:28px;margin-bottom:8px">📋</div>
        <div style="font-weight:500;margin-bottom:4px">Aucune commande trouvée</div>
        <div style="font-size:11px">Les missions Cal.com apparaîtront ici automatiquement<br>ou ajoute-en une manuellement</div>
      </div>`;
    return;
  }

  // Regroupement par mois (le plus récent en premier)
  const groups=new Map();
  missions.forEach(m=>{
    let key='zzz_sans_date',label='Sans date';
    if(m.date){
      const d=new Date(m.date);
      if(!isNaN(d)){
        key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        label=d.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
        label=label.charAt(0).toUpperCase()+label.slice(1);
      }
    }
    if(!groups.has(key))groups.set(key,{label,items:[]});
    groups.get(key).items.push(m);
  });

  document.getElementById('fiche-commandes-list').innerHTML=`
    <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap">
      <div style="background:var(--green-bg);border-radius:var(--radius);padding:8px 12px;font-size:12px">
        <div style="font-size:10px;color:var(--green-text);font-weight:600;margin-bottom:2px">CA TOTAL</div>
        <div style="font-size:16px;font-weight:700;color:var(--green)">${caTotal.toLocaleString('fr-FR')} €</div>
      </div>
      <div style="background:var(--blue-bg);border-radius:var(--radius);padding:8px 12px;font-size:12px">
        <div style="font-size:10px;color:var(--blue-text);font-weight:600;margin-bottom:2px">MISSIONS</div>
        <div style="font-size:16px;font-weight:700;color:var(--blue)">${missions.length}</div>
      </div>
      <div style="background:var(--bg2);border-radius:var(--radius);padding:8px 12px;font-size:12px">
        <div style="font-size:10px;color:var(--text2);font-weight:600;margin-bottom:2px">DERNIÈRE</div>
        <div style="font-size:13px;font-weight:600">${fmtDate(missions[0]?.date)}</div>
      </div>
    </div>
    ${[...groups.values()].map(group=>{
      const totalHT=group.items.reduce((s,m)=>s+(m.montant||0),0);
      return `
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.03em">📅 ${group.label} — ${totalHT.toLocaleString('fr-FR')} € HT</div>
      ${group.items.map(m=>`
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:50%;background:${m.statut==='annulée'?'var(--red-bg)':m.statut==='terminée'?'var(--blue-bg)':m.statut==='en cours'?'var(--amber-bg)':'var(--bg2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">
          ${m.statut==='annulée'?'❌':m.statut==='terminée'?'🏁':m.statut==='en cours'?'⏳':'📅'}
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;margin-bottom:2px">${esc(m.type||'EDL')}</div>
          <div style="font-size:11px;color:var(--text2)">${esc(m.adresse||'Adresse non renseignée')}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${fmtDT(m.date)}${m.locataireNom?' · '+esc(m.locataireNom):''}</div>
          ${rapportsDeMission(m).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${rapportsDeMission(m).map(r => { const href = _urlSureApercuExtranet(r.url); return href ? `<a href="${href}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:#0F6E56;background:#E3F5EF;padding:3px 9px;border-radius:20px;text-decoration:none"><i class="ti ti-file-download"></i>Rapport${r.type === 1 ? ' d’entrée' : r.type === 2 ? ' de sortie' : ''}</a>` : ''; }).join('')}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:14px;font-weight:700;color:var(--green)">${(m.montant||0)} €</div>
          <div>${statusBadge(m.statut)}</div>
        </div>
      </div>`).join('')}`;
    }).join('')}
  `;
}

function addMissionToFiche(){
  // Pré-remplir la modal mission avec l'agence du contact courant
  const c=DB.contacts.find(x=>x.id===currentFicheId);
  closeModal('modal-fiche');
  setTimeout(()=>{
    openNewMissionModal();
    if(c){
      document.getElementById('m-agence').value=c.entreprise||'';
      document.getElementById('m-email').value=c.email||'';
    }
  },100);
}

function deleteContact(){
  if(!confirm('Supprimer ce contact ?'))return;
  const idToDelete=currentFicheId;
  DB.contacts=DB.contacts.filter(x=>x.id!==currentFicheId);
  detectDuplicates();saveToStorage();closeModal('modal-fiche');
  deleteFromSupabase('contacts', idToDelete);
  notify('Contact supprimé');renderContacts();renderDashboard();
}

// ─── Suivi des emails dans la fiche : automatique ─────────────
// Ouvert / cliqué viennent de Brevo (rafraîchi à l'ouverture de la fiche
// puis toutes les 2 minutes tant qu'elle reste ouverte) : plus de menu à
// régler à la main.
function emailsDuContact(c){
  const emailLower=(c.email||'').toLowerCase();
  const fromHistory=(c.history||[]);
  const fromTracking=(DB.trackings||[]).filter(t=>(t.email||'').toLowerCase()===emailLower&&!fromHistory.find(h=>h.id===t.id));
  return [...fromHistory,...fromTracking].sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function statsSuiviContact(c){
  const emails = emailsDuContact(c);
  const somme = (k) => emails.reduce((n, e) => n + (Number(e[k]) || 0), 0);
  const ouverts = emails.filter(e => e.statut === 'Ouvert' || e.statut === 'Cliqué' || e.statut === 'Répondu').length;
  return { opens: Math.max(somme('opens'), ouverts, Number(c.opens) || 0), clicks: Math.max(somme('clicks'), Number(c.clicks) || 0) };
}
let _minuteurSuiviFiche = null;
async function suivreEmailsFiche(id){
  clearInterval(_minuteurSuiviFiche);
  const maj = async (force) => {
    const modal = document.getElementById('modal-fiche');
    if(currentFicheId !== id || (modal && !modal.classList.contains('open'))){ clearInterval(_minuteurSuiviFiche); return; }
    if(typeof rafraichirSuiviEmails === 'function') await rafraichirSuiviEmails(force, 60 * 1000);
    const c = (DB.contacts || []).find(x => x.id === id);
    if(!c || currentFicheId !== id) return;
    const st = statsSuiviContact(c);
    const o = document.getElementById('fiche-suivi-opens'); if(o) o.textContent = st.opens;
    const k = document.getElementById('fiche-suivi-clicks'); if(k) k.textContent = st.clicks;
    const m = document.getElementById('fiche-suivi-maj'); if(m) m.textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    renderFicheEmails(c);
  };
  // Sans connexion au cloud (tests, mode hors ligne) : pas de relève.
  if(typeof supabaseClient === 'undefined' || !supabaseClient) return;
  maj(false);
  _minuteurSuiviFiche = setInterval(() => maj(true), 2 * 60 * 1000);
}
const _STYLE_STATUT_EMAIL = { 'Envoyé':['#F2F4F7','#475467','ti-send'], 'Ouvert':['#EAF3DE','#3B6D11','ti-eye'], 'Cliqué':['#E8F0FB','#1A5FA8','ti-mouse'], 'Répondu':['#FFF4E5','#854F0B','ti-message-reply'], 'Reçu':['#E8F0FB','#0C447C','ti-inbox'], 'Échec':['#FEF3F2','#B42318','ti-alert-triangle'], 'Spam':['#FEF3F2','#B42318','ti-alert-triangle'], 'Désabonné':['#F2F4F7','#475467','ti-user-off'], 'Sans suite':['#FEF3F2','#A32D2D','ti-x'] };
function badgeStatutEmail(t){
  const [bg, fg, ic] = _STYLE_STATUT_EMAIL[t.statut] || _STYLE_STATUT_EMAIL['Envoyé'];
  const det = [t.opens ? t.opens + ' ouv.' : '', t.clicks ? t.clicks + ' clic' + (t.clicks > 1 ? 's' : '') : ''].filter(Boolean).join(' · ');
  return `<span title="Statut suivi automatiquement (Brevo)" style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;background:${bg};color:${fg};padding:3px 8px;border-radius:20px;white-space:nowrap;margin-left:8px;flex-shrink:0"><i class="ti ${ic}" style="font-size:11px"></i>${esc(t.statut || 'Envoyé')}${det ? ' · ' + esc(det) : ''}</span>`;
}
function renderFicheEmails(c){
  const allEmails=emailsDuContact(c);
  const gmailBtnHtml=''; // Gmail désactivé (invalid_client)
  const emailsHtml=allEmails.length?allEmails.map((t,i)=>`
    <div style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden;${t.direction==='recu'?'border-left:3px solid var(--blue)':''}">
      <div style="padding:10px 12px;background:var(--bg2);display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            ${t.direction==='recu'?'<span style="font-size:9px;background:var(--blue-bg);color:var(--blue-text);padding:1px 5px;border-radius:3px">REÇU</span>':'<span style="font-size:9px;background:var(--bg3);color:var(--text2);padding:1px 5px;border-radius:3px">ENVOYÉ</span>'}
            <div style="font-weight:600;font-size:12px">${esc(t.objet||t.subject||'—')}</div>
          </div>
          <div style="font-size:10px;color:var(--text2)">${fmtDT(t.date)}${t.from&&t.direction==='recu'?' · De : '+t.from:''}</div>
        </div>
        ${badgeStatutEmail(t)}
      </div>
      ${t.corps?`<div style="padding:8px 12px;font-size:11px;color:var(--text2);border-top:1px solid var(--border);max-height:80px;overflow-y:auto;white-space:pre-wrap">${esc(t.corps.substring(0,300))}${t.corps.length>300?'…':''}</div>`:''}
    </div>`).join('')
  :`<div class="empty">Aucun email — utilise le bouton ci-dessus pour charger les emails Gmail ou envoie un email depuis le bas</div>`;
  document.getElementById('fiche-emails-list').innerHTML=gmailBtnHtml+emailsHtml;
}

function updateEmailStatus(contactId,emailId,newStatut){
  const c=DB.contacts.find(x=>x.id===contactId);
  if(c&&c.history){
    const email=c.history.find(e=>e.id===emailId);
    if(email){email.statut=newStatut;saveToStorage();notify('✅ Statut mis à jour');}
  }
  const t=DB.trackings.find(x=>x.id===emailId);
  if(t){t.statut=newStatut;saveToStorage();}
}

// ─── NAV ──────────────────────────────────────────────────
// Refonte V2 : le menu ne compte plus que 5 rubriques. Une rubrique peut
// regrouper plusieurs vues historiques (ex. Missions = Réservations +
// Missions + Agenda), présentées alors comme des onglets en tête de page.
// Les vues gardent leurs identifiants (view-xxx) : seule la navigation change.
const SECTIONS_NAV = {
  aujourdhui : { vues:[{v:'dashboard',  label:"Aujourd'hui"}] },
  missions   : { vues:[{v:'reservations',label:'Réservations', badge:'resa-nav-badge', perm:'reservations'},
                       {v:'missions',   label:'Missions', perm:'missions'},
                       {v:'agenda',     label:'Agenda', perm:'missions'}] },
  espaces    : { vues:[{v:'espaces',    label:'Espaces agences'}] },
  clients    : { vues:[{v:'contacts',   label:'Clients'},
                       {v:'rapports',   label:'Rapports', perm:'clients'}] },
  prospection: { vues:[{v:'prospection',label:'Prospection'}] },
  emails     : { vues:[{v:'compose',    label:'Écrire', perm:'emails'},
                       {v:'campaigns',  label:'Campagnes', perm:'campagnes'},
                       {v:'brevo',      label:'Synchronisation Brevo', siVisible:'nav-brevo'}] },
  reglages   : { vues:[{v:'settings',   label:'Réglages'}] },
  aide       : { vues:[{v:'help',       label:'Aide'}] },
  admin      : { vues:[{v:'admin',      label:'Plateforme'}] }
};
function sectionDeVue(v){
  for(const cle in SECTIONS_NAV){
    if(SECTIONS_NAV[cle].vues.some(x=>x.v===v)) return cle;
  }
  return null;
}
// Onglets visibles d'une rubrique : ceux autorisés par le rôle courant
// (peut(), js/app-equipe.js — absent des tests : tout est alors autorisé)
// et, pour Brevo, seulement si le compte y a droit (bouton #nav-brevo affiché).
function ongletsVisibles(section){
  const def=SECTIONS_NAV[section];
  if(!def) return [];
  return def.vues.filter(x=>{
    if(x.perm && typeof peut==='function' && !peut(x.perm)) return false;
    if(x.siVisible){
      const el=document.getElementById(x.siVisible);
      if(!el || el.style.display==='none') return false;
    }
    return true;
  });
}
function renderSectionTabs(v){
  const barre=document.getElementById('section-tabs-bar');
  const conteneur=document.getElementById('section-tabs');
  if(!barre||!conteneur) return;
  const onglets=ongletsVisibles(sectionDeVue(v));
  if(onglets.length<2){ barre.classList.remove('show'); conteneur.innerHTML=''; return; }
  barre.classList.add('show');
  conteneur.innerHTML=onglets.map(o=>{
    const actif=o.v===v;
    let badge='';
    if(o.badge){
      const b=document.getElementById(o.badge);
      if(b && b.style.display!=='none' && b.textContent) badge=` <span class="nav-badge nb-red">${esc(b.textContent)}</span>`;
    }
    return `<button type="button" role="tab" class="section-tab${actif?' active':''}" aria-selected="${actif}" onclick="nav('${jsq(o.v)}')">${esc(o.label)}${badge}</button>`;
  }).join('');
}
function nav(v){
  // Une rubrique interdite au rôle courant renvoie vers l'accueil (le menu
  // la masque déjà ; ceci couvre les accès par lien ou raccourci).
  if(typeof vueAutorisee==='function' && !vueAutorisee(v)) v='dashboard';
  // Fermer toute fenêtre modale restée ouverte pour éviter qu'elle ne bloque l'affichage d'une future fenêtre
  document.querySelectorAll('.modal-bg.open').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  const section=sectionDeVue(v);
  document.querySelectorAll('.nav-item').forEach(el=>{
    const s=el.getAttribute('data-section');
    if(s ? s===section : (el.getAttribute('onclick')||'').includes("'"+v+"'")) el.classList.add('active');
  });
  renderSectionTabs(v);
  if(v==='dashboard')renderDashboard();
  if(v==='contacts'){detectDuplicates();renderContacts();}
  if(v==='prospection'){
    // Toujours charger si moins de 10 prospects (localStorage corrompu ou vide)
    if(DB.prospects.length<10){
      autoFillAllContacts();
    } else {
      renderProspection();
    }
  }
  if(v==='missions')renderMissions();
  if(v==='rapports')renderRapports();
  if(v==='espaces'){renderBlocEspacesAgences();chargerEspacesHistoriques();}
  if(v==='campaigns')renderCampaigns();
  if(v==='compose'){renderTracking();rafraichirSuiviEmails();}
  if(v==='agenda')renderCalendar();
  if(v==='reservations')loadReservations();
  if(v!=='reservations' && _resaAutoRefreshInterval) silentRefreshReservations();
  if(v==='settings'){loadSettingsForm(); if(typeof renderReglagesV2==='function') renderReglagesV2();}
  if(v==='help'){}
  // Barre mobile : les rubriques sans raccourci allument "Plus".
  const raccourcis={aujourdhui:'dashboard',missions:'missions',clients:'contacts',emails:'compose'};
  updateMobileNav(raccourcis[section]||'plus');
  const main=document.querySelector('.main'); if(main) main.scrollTop=0;
  closeMobileSidebar(); // ferme le menu mobile après navigation
}

// ─── MENU MOBILE ──────────────────────────────────────────
function toggleMobileSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function updateMobileNav(v){
  document.querySelectorAll('#mobile-nav-bar button').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('mnav-'+v);
  if(btn)btn.classList.add('active');
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

function openNewMissionModal(){
  _editMissionIdx=null;
  document.getElementById('modal-mission-title').textContent='Nouvelle mission EDL';{const cb=document.getElementById('mission-confirm-rdv-btn');if(cb)cb.style.display='none';}
  const btn=document.getElementById('mission-save-btn');
  if(btn){btn.innerHTML='<i class="ti ti-check"></i>Enregistrer';btn.onclick=saveMission;}
  document.getElementById('m-agence').value='';
  document.getElementById('m-type-client').value='Professionnel';
  const emailEl=document.getElementById('m-email');if(emailEl)emailEl.value='';
  document.getElementById('m-type').value='EDL entrant';
  document.getElementById('m-adresse').value='';
  document.getElementById('m-date').value='';
  document.getElementById('m-bien-type').value='';
  document.getElementById('m-bien-typo').value='';
  document.getElementById('m-bien-meuble').value='';
  document.getElementById('m-montant').value='';
  document.getElementById('m-statut').value='planifiée';
  document.getElementById('m-notes').value='';
  const box=document.getElementById('m-agence-suggest');if(box)box.style.display='none';
  openModal('modal-mission');
}
function openModal(id){
  // Fermer toute autre fenêtre déjà ouverte avant d'en afficher une nouvelle (évite qu'une fenêtre cachée n'en bloque une autre)
  document.querySelectorAll('.modal-bg.open').forEach(el=>{if(el.id!==id)el.classList.remove('open');});
  document.getElementById(id).classList.add('open');
}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  // Réinitialiser le modal mission si on le ferme en mode édition
  if(id==='modal-mission' && _editMissionIdx!==null){
    _editMissionIdx=null;
    document.getElementById('modal-mission-title').textContent='Nouvelle mission EDL';{const cb=document.getElementById('mission-confirm-rdv-btn');if(cb)cb.style.display='none';}
    const btn=document.getElementById('mission-save-btn');
    if(btn){btn.innerHTML='<i class="ti ti-check"></i>Enregistrer';btn.onclick=saveMission;}
  }
}
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));

// ─── DASHBOARD ────────────────────────────────────────────
// ─── FILTRE MOIS DASHBOARD ────────────────────────────────
let _dashMonth = 'all'; // 'all' ou 'YYYY-MM'

function buildMonthOptions(){
  // Construire la liste des mois depuis les missions + trackings
  const months = new Set();
  DB.missions.forEach(m=>{
    if(m.date){const d=new Date(m.date);if(!isNaN(d))months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  });
  DB.trackings.forEach(t=>{
    if(t.date){const d=new Date(t.date);if(!isNaN(d))months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  });
  const sel = document.getElementById('dash-month-select');
  if(!sel) return;
  const sorted = [...months].sort().reverse();
  sel.innerHTML = '<option value="all">— Tous les mois —</option>' +
    sorted.map(m=>{
      const [y,mo] = m.split('-');
      const label = new Date(y, mo-1, 1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
      return `<option value="${m}">${label}</option>`;
    }).join('');
  sel.value = _dashMonth;
}

function setDashMonth(val){
  _dashMonth = val;
  // Mettre à jour le bouton "Tout"
  const btnAll = document.getElementById('dash-btn-all');
  if(btnAll){
    btnAll.style.background = val==='all' ? 'var(--blue)' : '';
    btnAll.style.color      = val==='all' ? '#fff' : '';
    btnAll.style.borderColor= val==='all' ? 'var(--blue)' : '';
  }
  const sel = document.getElementById('dash-month-select');
  if(sel) sel.value = val;
  renderDashboard();
}

function filterByMonth(arr, dateField){
  if(_dashMonth === 'all') return arr;
  const [y,m] = _dashMonth.split('-').map(Number);
  return arr.filter(item=>{
    const d = new Date(item[dateField]);
    return !isNaN(d) && d.getFullYear()===y && d.getMonth()+1===m;
  });
}

function renderDashboard(){
  document.getElementById('today-label').textContent=new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Accueil personnalisé : "Bonjour Thomas" (prénom tiré du nom saisi dans
  // Réglages › Profil), à défaut le simple titre de la rubrique.
  const titreAccueil=document.getElementById('dash-greeting');
  if(titreAccueil){
    const prenom=((typeof CFG!=='undefined'&&CFG&&CFG.userName)||'').trim().split(/\s+/)[0];
    titreAccueil.textContent=prenom?'Bonjour '+prenom:"Aujourd'hui";
  }
  detectDuplicates();
  buildMonthOptions();
  renderAujourdhui();
  syncEmailKpisToggle();

  // Bannière période sélectionnée
  const banner = document.getElementById('dash-period-banner');
  if(_dashMonth === 'all'){
    banner.style.display='none';
  } else {
    const [y,m] = _dashMonth.split('-').map(Number);
    const label = new Date(y,m-1,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
    banner.style.display='block';
    banner.textContent = `📅 Période affichée : ${label}`;
  }

  // Contacts — toujours global (pas de date sur les contacts)
  document.getElementById('k-contacts').textContent=DB.contacts.length;
  document.getElementById('k-contacts-sub').textContent=DB.contacts.filter(c=>c.statut==='Client actif').length+' clients actifs';

  // Missions filtrées
  const missions = filterByMonth(DB.missions, 'date');
  // Ajustements externes (clients hors CRM, ex. un partenaire) pour la
  // période affichée — se fondent dans les totaux plutôt que de forcer une
  // fiche mission par dossier. cf. ajustementsPourMois() dans app-core.js.
  const ajPeriode = ajustementsPourMois(_dashMonth);
  document.getElementById('k-missions').textContent=missions.length + ajPeriode.nb;

  // États des lieux — compteur global (toutes missions, tous statuts, indépendant
  // du filtre de mois), mis à jour à chaque rendu du dashboard donc à chaque
  // sync temps réel (voir subscribeRealtime dans app-cloud.js) ou action locale.
  const ajTous = ajustementsPourMois('all');
  document.getElementById('k-edl-total').textContent=DB.missions.length + ajTous.nb;
  const now=new Date();
  const cleMoisCourant = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const edlCeMois=DB.missions.filter(m=>{
    if(!m.date)return false;
    const d=new Date(m.date);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  }).length + ajustementsPourMois(cleMoisCourant).nb;
  document.getElementById('k-edl-total-sub').textContent=edlCeMois+' ce mois-ci';
  const caHT=missions.reduce((s,m)=>s+(m.montant||0),0) + ajPeriode.ca;
  document.getElementById('k-ca').textContent=(taxMode==='TTC'?ttc(caHT):caHT).toLocaleString('fr-FR');
  document.getElementById('k-ca-sub').textContent=taxMode==='HT'?`TTC : ${fmtTTC(caHT)}`:`HT : ${caHT.toLocaleString('fr-FR')} €`;

  // KPIs email tracking filtrés
  let allEmails=[...DB.trackings];
  DB.contacts.forEach(c=>{
    (c.history||[]).forEach(h=>{
      if(!allEmails.find(e=>e.id===h.id))allEmails.push(h);
    });
  });
  allEmails = filterByMonth(allEmails, 'date');
  const total=allEmails.length;
  const opened=allEmails.filter(e=>['Ouvert','Cliqué','Répondu'].includes(e.statut)).length;
  const clicked=allEmails.filter(e=>['Cliqué','Répondu'].includes(e.statut)).length;
  const replied=allEmails.filter(e=>e.statut==='Répondu').length;
  const noReply=allEmails.filter(e=>e.statut==='Sans suite').length;

  document.getElementById('k-sent-total').textContent=total||'—';
  document.getElementById('k-opened').textContent=opened||'—';
  document.getElementById('k-opened-pct').textContent=total>0?`Taux : ${Math.round(opened/total*100)}%`:'';
  document.getElementById('k-clicked').textContent=clicked||'—';
  document.getElementById('k-clicked-pct').textContent=total>0?`Taux : ${Math.round(clicked/total*100)}%`:'';
  document.getElementById('k-replied').textContent=replied||'—';
  document.getElementById('k-replied-pct').textContent=replied>0?`${Math.round(replied/total*100)}% des envois`:'';
  document.getElementById('k-no-reply').textContent=noReply||'—';
  document.getElementById('k-no-reply-pct').textContent=noReply>0?`${Math.round(noReply/total*100)}% des envois`:'Aucun';

  // Mêmes 5 colonnes que le tableau de prospection (COLONNES_PIPELINE).
  const colCounts=COLONNES_PIPELINE.map(c=>({label:c.label,n:DB.prospects.filter(p=>c.etapes.includes(p.etape)).length}));
  const maxC=Math.max(...colCounts.map(c=>c.n),1);
  document.getElementById('dash-pipeline').innerHTML=colCounts.map(c=>`<div class="stat-row" style="margin-bottom:14px"><span style="font-size:13px;width:150px;flex-shrink:0">${c.label}</span><div class="progress-bar" style="height:8px;border-radius:4px;background:#F0F1F3"><div class="progress-fill" style="width:${Math.round(c.n/maxC*100)}%"></div></div><span style="font-size:13px;min-width:24px;text-align:right;color:var(--text2)">${c.n}</span></div>`).join('');

  // Missions dans le tableau — filtrées
  document.getElementById('dash-missions').innerHTML=missions.slice(-5).reverse().map(m=>{ const nom=typeof nomAgenceMission==='function'?nomAgenceMission(m):m.agence; return `<tr><td><div class="d-titre" title="${esc(m.agence||'')}">${esc(nom)}</div><div class="d-sous">${esc(m.type||'')}</div></td><td>${(m.montant||0).toLocaleString('fr-FR')} €</td><td>${statusBadge(m.statut)}</td></tr>`; }).join('')||'<tr><td colspan="3" class="empty">Aucune</td></tr>';
  document.getElementById('dash-contacts').innerHTML=DB.contacts.slice(0,6).map(c=>`<tr><td><div class="d-titre">${esc(c.entreprise||c.contact||'—')}</div><div class="d-sous" title="${esc(c.email||'')}">${esc(c.email||'—')}</div></td><td>${statusBadge(c.statut)}</td></tr>`).join('')||'<tr><td colspan="2" class="empty">Aucun</td></tr>';
  const today=new Date();
  const upcoming=DB.rdvs.filter(r=>new Date(r.date)>=today).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);
  document.getElementById('dash-rdv').innerHTML=upcoming.length?upcoming.map(r=>{
    const url=googleCalLink(r.titre,r.date,r.duree,r.contact,r.type);
    const idx=DB.rdvs.indexOf(r);
    return `<div style="border-left:3px solid var(--blue);padding:5px 9px;margin-bottom:7px;border-radius:0 var(--radius) var(--radius) 0;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <div style="font-size:11px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.titre)}</div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${url?`<a href="${url}" target="_blank" title="Google Agenda" style="font-size:11px;text-decoration:none;line-height:1.6">📅</a>`:''}
          <button onclick="deleteRdvDash(${idx})" title="Supprimer" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px;padding:0 2px;line-height:1">✕</button>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text2)">${fmtDT(r.date)} · ${esc(r.duree||'—')}${r.contact?' · '+esc(r.contact):''}</div>
    </div>`;}).join(''):'<div class="empty">Aucun RDV à venir</div>';

  // Statistiques EDL (volume, typologie, particulier/agence) — definies
  // dans app-missions.js, injectees dans le tableau de bord.
  if(typeof renderStatsMissions === 'function') renderStatsMissions();
}

function deleteRdvDash(idx){
  const r=DB.rdvs[idx];
  if(!r)return;
  if(!confirm(`Supprimer ce RDV ?\n\n"${r.titre}"\n${fmtDT(r.date)}`))return;
  DB.rdvs.splice(idx,1);
  saveToStorage();
  deleteFromSupabase('rdvs', r.id);
  notify('🗑️ RDV supprimé');
  renderDashboard();
  renderCalendar();
}

// ─── CONTACTS ─────────────────────────────────────────────
function getFilteredContacts(){
  let list=DB.contacts;
  if(UI.contactFilter==='dups')list=list.filter((_,i)=>isDup(i));
  else if(UI.contactFilter==='brevo')list=list.filter(c=>c.presence==='brevo'||c.presence==='both');
  else if(UI.contactFilter==='notion')list=list.filter(c=>c.presence==='notion'||c.presence==='both');
  else if(UI.contactFilter!=='all')list=list.filter(c=>c.statut===UI.contactFilter);
  if(UI.contactSearch){const q=UI.contactSearch.toLowerCase();list=list.filter(c=>((c.entreprise||'')+(c.contact||'')+(c.email||'')).toLowerCase().includes(q));}
  return list;
}
function cleanName(v){
  if(!v) return '';
  const s=String(v).trim();
  if(!s || s.toLowerCase()==='undefined' || s.toLowerCase()==='null') return '';
  return s;
}
function displayEntreprise(ct){
  const ent=cleanName(ct.entreprise);
  if(ent) return {name:ent, muted:false};
  const contact=cleanName(ct.contact);
  if(contact) return {name:contact, muted:false};
  const email=cleanName(ct.email);
  if(email) return {name:email.split('@')[0], muted:true};
  return {name:'Sans nom', muted:true};
}
// ─── SÉLECTION MULTIPLE + ENVOI EN MASSE ──────────────────
const _selectedEmails = new Set();

function toggleContactSelect(email, checked){
  if(!email) return;
  const key = email.toLowerCase();
  if(checked) _selectedEmails.add(key);
  else _selectedEmails.delete(key);
  updateSelectionBar();
  syncSelectAllCheckbox();
}

// Cocher / décocher tous les contacts visibles (filtrés)
function toggleSelectAllContacts(checked){
  const list = getFilteredContacts();
  list.forEach(c=>{
    if(cleanName(c.email)){
      const key = c.email.toLowerCase();
      if(checked) _selectedEmails.add(key);
      else _selectedEmails.delete(key);
    }
  });
  renderContacts();
}

function syncSelectAllCheckbox(){
  const master = document.getElementById('contacts-select-all');
  if(!master) return;
  const list = getFilteredContacts().filter(c=>cleanName(c.email));
  const allSelected = list.length>0 && list.every(c=>_selectedEmails.has(c.email.toLowerCase()));
  master.checked = allSelected;
}

function updateSelectionBar(){
  const bar = document.getElementById('selection-bar');
  const countEl = document.getElementById('selection-count');
  if(!bar) return;
  const n = _selectedEmails.size;
  if(n>0){
    bar.style.display = 'flex';
    if(countEl) countEl.textContent = n + ' contact' + (n>1?'s':'') + ' sélectionné' + (n>1?'s':'');
  } else {
    bar.style.display = 'none';
  }
  syncSelectAllCheckbox();
}

function clearContactSelection(){
  _selectedEmails.clear();
  renderContacts();
}

// Envoyer un email au groupe sélectionné : ouvre Composer pré-rempli
function emailSelectedContacts(){
  if(_selectedEmails.size===0){ notify('Aucun contact sélectionné','warn'); return; }
  const emails = Array.from(_selectedEmails).join(', ');
  nav('compose');
  setTimeout(()=>{
    const toField = document.getElementById('to-f');
    if(toField) toField.value = emails;
    notify('✉️ '+_selectedEmails.size+' destinataire(s) pré-remplis — relisez avant d\'envoyer');
  },100);
}

function renderContacts(){
  const list=getFilteredContacts();
  document.getElementById('contacts-count').textContent=list.length+' contacts';
  document.getElementById('contacts-tbody').innerHTML=list.length?list.map(c=>{
    const gi=DB.contacts.indexOf(c);const dup=isDup(gi);
    const disp=displayEntreprise(c);
    const empty='<span style="color:var(--text3,#c8c8c8);font-size:11px">—</span>';
    const contactCell=cleanName(c.contact)?`<span style="font-size:11px">${esc(cleanName(c.contact))}</span>`:empty;
    const emailOk=cleanName(c.email);
    const checked=emailOk && _selectedEmails.has(c.email.toLowerCase())?'checked':'';
    const checkbox=emailOk?`<input type="checkbox" class="contact-check" ${checked} onclick="event.stopPropagation();toggleContactSelect('${jsq(c.email)}',this.checked)" style="cursor:pointer;width:15px;height:15px">`:'';
    const nomContact=cleanName(c.contact);
    const tel=cleanName(c.tel);
    const moyen=cleanName(c.moyenContact);
    return `<tr class="clickable ${dup?'dup-row':''}" onclick="openFiche('${jsq(c.id)}')">
      <td style="text-align:center" onclick="event.stopPropagation()">${checkbox}</td>
      <td data-label="Client"><div class="c-client"><div class="avatar" style="font-size:9px;flex-shrink:0;${dup?'background:var(--amber-bg);color:var(--amber-text)':''}">${initials(disp.name)}</div><div><div class="c-titre" style="${disp.muted?'color:var(--text2);font-style:italic;font-weight:500':''}" title="${esc(disp.name)}">${esc(disp.name)}${dup?' <span class="badge b-amber" style="font-size:9px">doublon</span>':''}</div>${nomContact?`<div class="c-sous">${esc(nomContact)}</div>`:''}</div></div></td>
      <td data-label="Coordonnées">${emailOk?`<div class="c-sous"><a href="mailto:${encodeURIComponent(c.email)}" style="color:var(--blue);text-decoration:none" onclick="event.stopPropagation()" title="${esc(c.email)}">${esc(c.email)}</a></div>`:''}${tel?`<div class="c-sous">${esc(tel)}</div>`:''}${!emailOk&&!tel?empty:''}</td>
      <td data-label="Type"><span class="badge ${c.typeClient==='Particulier'?'b-teal':'b-blue'}" style="font-size:9px">${esc(c.typeClient||'Pro')}</span></td>
      <td data-label="Statut">${statusBadge(c.statut)}</td>
      <td data-label="Dernier contact">${c.lastContact?`<div class="c-sous" style="color:var(--text)">${fmtDate(c.lastContact)}</div>`:''}${moyen?`<div class="c-sous">${esc(moyen)}</div>`:''}${!c.lastContact&&!moyen?empty:''}</td>
      <td class="tbl-cards-actions"><button class="btn btn-sm" onclick="event.stopPropagation();emailContactQuick('${jsq(c.email)}')" title="Écrire un email"><i class="ti ti-mail" style="font-size:12px"></i></button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="7" class="empty">Aucun contact</td></tr>';
  updateSelectionBar();
}
function filterContactsTab(f,btn){
  UI.contactFilter=f;
  if(btn){document.querySelectorAll('#contact-filter-btns .btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
  renderContacts();
}
function searchContacts(v){UI.contactSearch=v;renderContacts();}
function emailContactQuick(email){nav('compose');setTimeout(()=>{document.getElementById('to-f').value=email;},100);}

// ─── Aperçu extranet (admin) ────────────────────────────────
// Montre exactement ce qu'un client donné voit dans son espace extranet
// (commandes, statuts, rapports, documents), sans avoir besoin de son email
// pour se connecter à sa place — utile pour vérifier ce qui s'affiche une
// fois un rapport disponible. Réutilise l'admin override de
// /api/client-orders et /api/client-documents (paramètre clientEmail,
// n'a d'effet que pour l'email admin authentifié côté serveur).
function previewExtranetClient(){
  const c = DB.contacts.find(x => x.id === currentFicheId);
  if(!c){ notify('Contact introuvable', 'warn'); return; }
  if(!c.email){ notify("⚠️ Ce contact n'a pas d'email renseigné", 'warn'); return; }
  closeModal('modal-fiche');
  document.getElementById('extranet-preview-email').textContent = c.email;
  document.getElementById('extranet-preview-body').innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2)"><i class="ti ti-loader"></i> Chargement…</div>';
  openModal('modal-extranet-preview');
  chargerApercuExtranet(c.email);
}

// Même garde-fou que urlSure() dans extranet-app.html : n'accepte que les
// URL http(s), et ne transforme jamais une valeur vide en URL de la racine
// du site (cf. le bug corrigé où "Ouvrir mon rapport" ouvrait le CRM).
function _urlSureApercuExtranet(u){
  if(!u) return '';
  try{
    const parsed = new URL(String(u), window.location.origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  }catch(e){ return ''; }
}

async function chargerApercuExtranet(email){
  const body = document.getElementById('extranet-preview-body');
  try{
    const token = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const [ordersResp, docsResp] = await Promise.all([
      fetch('/api/client-orders', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ clientEmail: email }) }),
      fetch('/api/client-documents', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ clientEmail: email }) })
    ]);
    if(!ordersResp.ok) throw new Error('HTTP ' + ordersResp.status);
    const orders = await ordersResp.json();
    const docs = docsResp.ok ? await docsResp.json() : [];

    if(!orders.length && !docs.length){
      body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text2)">Aucune commande ni document trouvé pour cet email.</div>';
      return;
    }

    const badge = (s) => {
      if(s === 'rapport_dispo') return '<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap">📄 Rapport disponible</span>';
      if(s === 'confirmee' || s === 'importee') return '<span style="background:#F4F7FA;color:#0C447C;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap">📅 Confirmé</span>';
      return '<span style="background:#FFF3CD;color:#8a5a00;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap">⏳ En attente</span>';
    };

    const cartesCommandes = orders.map(o => {
      const dateRdv = o.dateSouhaitee ? new Date(o.dateSouhaitee).toLocaleDateString('fr-FR',{day:'numeric',month:'long'}) : '';
      const lienRapport = _urlSureApercuExtranet(o.rapportUrl);
      const boutonRapport = lienRapport ? `<a href="${lienRapport}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:5px;color:#0F6E56;text-decoration:none;font-size:11px;font-weight:600;background:#E3F5EF;padding:4px 10px;border-radius:20px;margin-top:8px;width:fit-content"><i class="ti ti-file-download" style="font-size:12px"></i> Ouvrir mon rapport</a>` : '';
      return `<div style="background:#fff;border:1px solid var(--border);border-radius:12px;margin-bottom:10px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
          <div style="font-weight:600;font-size:13px">${esc(o.typeEdl||'État des lieux')}</div>
          ${badge(o.statut)}
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px"><i class="ti ti-map-pin" style="font-size:11px"></i> ${esc(o.adresse||'—')}</div>
        ${dateRdv?`<div style="font-size:11px;color:#0C447C;margin-bottom:4px"><i class="ti ti-calendar" style="font-size:11px"></i> ${dateRdv}${o.heure?' à '+esc(o.heure):''}</div>`:''}
        <div style="font-size:11px;color:var(--text3)">Demandé le ${o.createdAt?new Date(o.createdAt).toLocaleDateString('fr-FR'):'—'}</div>
        ${boutonRapport}
      </div>`;
    }).join('');

    const docsUtiles = docs.map(d => ({ nom: d.nom, href: _urlSureApercuExtranet(d.url) })).filter(d => d.href);
    const cartesDocs = docsUtiles.length ? `
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 8px">Mes documents</div>
      ${docsUtiles.map(d => `<a href="${d.href}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;text-decoration:none;color:var(--text);border:1px solid var(--border);margin-bottom:6px;background:#F4F7FA"><span style="font-size:16px">📄</span><span style="flex:1;font-size:12px;font-weight:500">${esc(d.nom)}</span><span style="font-size:11px;color:#0C447C">Ouvrir →</span></a>`).join('')}` : '';

    body.innerHTML = (cartesCommandes || '<div style="text-align:center;padding:20px;color:var(--text2)">Aucune commande.</div>') + cartesDocs;
  }catch(e){
    body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--red-text)">Erreur lors du chargement de l\'aperçu.</div>';
  }
}


// ─── Rapports par client ────────────────────────────────────
// Rapports d'état des lieux déjà enregistrés sur les missions (anciennes
// relèves Edouard — désactivées, les rapports s'ajoutent désormais à la main
// dans la fiche client › Documents) — m.rapports, ou l'ancien champ unique
// m.rapportUrl — regroupés par client (agence).
function rapportsDeMission(m){
  const liste = Array.isArray(m.rapports) && m.rapports.length ? m.rapports
    : (m.rapportUrl ? [{ nom: 'Rapport EDL', url: m.rapportUrl, date: m.rapportRecupereAt || '' }] : []);
  return liste.filter(r => r && r.url);
}
function clientDeMission(m){
  const email = String(m.emailClient || '').trim().toLowerCase();
  const c = email ? (DB.contacts || []).find(x => String(x.email || '').toLowerCase() === email) : null;
  const nom = (c && (c.entreprise || c.contact)) || m.agence || email || 'Client non renseigné';
  return { cle: email || String(nom).toLowerCase(), nom, email, contactId: c ? c.id : '' };
}
function renderRapports(){
  const box = document.getElementById('rapports-contenu');
  if(!box) return;
  const releve = document.getElementById('rapports-releve');
  const q = String((document.getElementById('rapports-recherche') || {}).value || '').trim().toLowerCase();
  const groupes = {};
  let derniere = '';
  (DB.missions || []).forEach(m => {
    const rapports = rapportsDeMission(m);
    if(!rapports.length) return;
    if(m.rapportRecupereAt && String(m.rapportRecupereAt) > derniere) derniere = String(m.rapportRecupereAt);
    const cl = clientDeMission(m);
    const texte = [cl.nom, cl.email, m.adresse, m.locataireNom, m.type].join(' ').toLowerCase();
    if(q && !texte.includes(q)) return;
    const g = groupes[cl.cle] || (groupes[cl.cle] = { ...cl, missions: [] });
    g.missions.push(m);
  });
  if(releve) releve.textContent = derniere ? 'Dernier rapport reçu : ' + new Date(derniere).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
  const liste = Object.values(groupes).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
  if(!liste.length){ box.innerHTML = '<div class="empty">' + (q ? 'Aucun rapport ne correspond.' : 'Aucun rapport enregistré. Ajoutez les rapports à la main dans la fiche client › Documents.') + '</div>'; return; }
  box.innerHTML = liste.map(g => {
    g.missions.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const nb = g.missions.reduce((n, m) => n + rapportsDeMission(m).length, 0);
    return `<details class="rapports-client" open>
      <summary><span class="rapports-client-nom">${esc(g.nom)}</span><span class="rapports-client-meta">${g.email ? esc(g.email) + ' · ' : ''}${nb} rapport${nb > 1 ? 's' : ''}</span>
        ${g.contactId ? `<button type="button" class="btn btn-sm" onclick="event.preventDefault();openFiche('${jsq(g.contactId)}')">Fiche</button>` : ''}
        ${g.email ? `<button type="button" class="btn btn-sm" onclick="event.preventDefault();ouvrirEspaceAgence('${jsq(g.email)}')"><i class="ti ti-building-store"></i>Son espace</button>` : ''}
      </summary>
      <div style="overflow-x:auto"><table class="tbl tbl-remu"><thead><tr><th>Date</th><th>Adresse</th><th>Type</th><th>Locataire</th><th>Rapport(s)</th></tr></thead><tbody>
      ${g.missions.map(m => `<tr>
        <td>${esc(m.date ? new Date(m.date).toLocaleDateString('fr-FR') : '—')}</td>
        <td>${esc(m.adresse || '—')}</td>
        <td>${esc(m.type || '—')}</td>
        <td>${esc(m.locataireNom || '—')}</td>
        <td>${rapportsDeMission(m).map(r => { const href = _urlSureApercuExtranet(r.url); return href ? `<a class="btn btn-sm" href="${href}" target="_blank" rel="noopener"><i class="ti ti-file-download"></i>${esc(r.type === 1 ? 'Entrée' : r.type === 2 ? 'Sortie' : 'PDF')}${r.date ? ' · ' + esc(new Date(r.date).toLocaleDateString('fr-FR')) : ''}</a>` : ''; }).join(' ')}</td>
      </tr>`).join('')}
      </tbody></table></div>
    </details>`;
  }).join('');
}

// ─── Espaces agences (menu de gauche) ────────────────────────
// Liste les agences (contacts avec email) et ouvre leur extranet réel en
// mode aperçu (/extranet-app?apercu=email) : lecture seule, réservé côté
// serveur au compte administrateur — pour dépanner une agence ou vérifier
// son paramétrage sans se connecter à sa place.
function agencesAvecEspace(){
  return (DB.contacts || []).filter(c => c && String(c.email || '').includes('@'))
    .sort((a, b) => String(a.entreprise || a.contact || a.email).localeCompare(String(b.entreprise || b.contact || b.email), 'fr'));
}
// Ancien point d'entrée (fenêtre) : ouvre désormais la page « Espaces agences ».
function ouvrirEspacesAgences(){ nav('espaces'); }
// Page « Espaces agences » (bouton du menu de gauche) : seulement les
// clients dont l'espace extranet est ACTIVÉ (interrupteur dans la fiche
// client ou ici) ; les autres s'activent depuis « Activer l'espace d'un
// autre client ».
// Agences qui utilisaient déjà leur extranet avant l'interrupteur
// (api/espaces-agences-statuts.js) : activées tant qu'on ne les désactive
// pas — même règle que le serveur (api/_lib/espace-agence.js).
let _espacesHistoriques = new Set();
let _espacesHistoriquesCharges = false;
async function chargerEspacesHistoriques(){
  if(_espacesHistoriquesCharges) return;
  _espacesHistoriquesCharges = true;
  try{
    const r = await fetch('/api/espaces-agences-statuts', { headers: await _authHeaders() });
    // Session pas encore prête (ouverture rapide d'une fiche) : on réessaiera.
    if(!r.ok){ _espacesHistoriquesCharges = false; return; }
    const d = await r.json();
    _espacesHistoriques = new Set((d.historiques || []).map(e => String(e).toLowerCase()));
    renderBlocEspacesAgences();
    const cb = document.getElementById('fiche-espace-actif');
    const c = (DB.contacts || []).find(x => x.id === currentFicheId);
    if(cb && c) cb.checked = espaceActif(c);
  }catch(e){ _espacesHistoriquesCharges = false; }
}
const SEUIL_RECHERCHE_ESPACES = 8;
function espaceActif(c){
  if(!c) return false;
  if(c.espaceActif === false) return false;
  if(c.espaceActif === true) return true;
  return _espacesHistoriques.has(String(c.email || '').trim().toLowerCase());
}
function basculerEspaceAgence(id, oui){
  const c = (DB.contacts || []).find(x => x.id === id);
  if(!c) return;
  if(oui && !String(c.email || '').includes('@')){
    notify("⚠️ Renseignez d'abord l'email de ce client : c'est son identifiant de connexion à l'extranet.", 'warn');
    const cb = document.getElementById('fiche-espace-actif'); if(cb && currentFicheId === id) cb.checked = false;
    renderBlocEspacesAgences();
    return;
  }
  // Toutes les fiches du même email (doublons) basculent ensemble : côté
  // serveur, un « désactivé » sur l'une d'elles bloquerait l'accès.
  const email = String(c.email || '').trim().toLowerCase();
  const fiches = email ? (DB.contacts || []).filter(x => String(x.email || '').trim().toLowerCase() === email) : [c];
  fiches.forEach(f => {
    quickUpdateContact(f.id, 'espaceActif', !!oui);
    // Enregistré tout de suite dans le cloud (pas seulement dans le navigateur).
    if(typeof pushToSupabase === 'function') pushToSupabase('contacts', f);
  });
  renderBlocEspacesAgences();
}
function renderBlocEspacesAgences(){
  const box = document.getElementById('dash-espaces-liste');
  if(!box) return;
  const q = String((document.getElementById('dash-espaces-recherche') || {}).value || '').trim().toLowerCase();
  const correspond = c => !q || [c.entreprise, c.contact, c.email, c.ville].some(v => String(v || '').toLowerCase().includes(q));
  const tous = agencesAvecEspace();
  const actifs = tous.filter(espaceActif);
  const compte = document.getElementById('espaces-agences-compte');
  if(compte) compte.textContent = actifs.length + ' espace' + (actifs.length > 1 ? 's' : '') + ' activé' + (actifs.length > 1 ? 's' : '');
  // Recherche affichée seulement quand les agences activées deviennent nombreuses.
  const champ = document.getElementById('dash-espaces-recherche');
  if(champ) champ.style.display = (actifs.length > SEUIL_RECHERCHE_ESPACES || q) ? '' : 'none';
  const liste = actifs.filter(correspond);
  box.innerHTML = liste.length ? liste.map(c => `<div class="espaces-agences-carte-wrap">
      <button type="button" class="espaces-agences-carte" onclick="ouvrirEspaceAgence('${jsq(c.email)}')" title="Ouvrir l'espace de ${esc(c.entreprise || c.email)} (lecture seule)">
        <span style="min-width:0;flex:1"><b>${esc(c.entreprise || c.contact || c.email)}</b><span>${esc(c.email)}</span></span><i class="ti ti-external-link"></i></button>
      <button type="button" class="espaces-agences-off" title="Désactiver l'espace de ${esc(c.entreprise || c.email)}" aria-label="Désactiver l'espace" onclick="basculerEspaceAgence('${jsq(c.id)}', false)">Désactiver</button>
    </div>`).join('')
    : `<div class="espaces-agences-vide">${q ? 'Aucun espace activé ne correspond.' : 'Aucun espace activé pour l’instant : activez-en un ci-dessous ou depuis la fiche du client.'}</div>`;
  const inactifs = tous.filter(c => !espaceActif(c));
  const nbI = document.getElementById('espaces-inactifs-compte');
  if(nbI) nbI.textContent = '(' + inactifs.length + ')';
  const boxI = document.getElementById('espaces-inactifs-liste');
  if(boxI){
    // Clients non activés : jamais toute la liste d'un coup — on cherche
    // l'agence à activer (2 lettres minimum).
    const qi = String((document.getElementById('espaces-inactifs-recherche') || {}).value || '').trim().toLowerCase();
    const champI = `<input type="search" class="espaces-agences-recherche" id="espaces-inactifs-recherche" placeholder="Rechercher le client à activer…" value="${esc(qi)}" oninput="renderBlocEspacesAgences()">`;
    if(!document.getElementById('espaces-inactifs-recherche')) boxI.insertAdjacentHTML('beforebegin', champI);
    const trouves = qi.length >= 2 ? inactifs.filter(c => [c.entreprise, c.contact, c.email, c.ville].some(v => String(v || '').toLowerCase().includes(qi))) : [];
    const vus = trouves.slice(0, 30);
    if(qi.length < 2){ boxI.innerHTML = '<div class="espaces-agences-vide" style="padding:8px 4px">Tapez le nom ou l’email du client pour l’activer.</div>'; return; }
    boxI.innerHTML = vus.length ? vus.map(c => `<div class="espaces-agences-inactif"><span><b style="color:#F4F7FA">${esc(c.entreprise || c.contact || c.email)}</b> · ${esc(c.email)}</span>
        <button type="button" onclick="basculerEspaceAgence('${jsq(c.id)}', true)">Activer</button></div>`).join('')
      + (trouves.length > vus.length ? '<div class="espaces-agences-vide" style="padding:8px 4px">Affinez la recherche pour voir les autres.</div>' : '')
      : '<div class="espaces-agences-vide" style="padding:8px 4px">Aucun client ne correspond.</div>';
  }
}
function ouvrirEspaceFicheCourante(){
  const c = (DB.contacts || []).find(x => x.id === currentFicheId);
  if(c && c.email) ouvrirEspaceAgence(c.email);
  else notify("⚠️ Ce contact n'a pas d'email renseigné", 'warn');
}
function ouvrirEspaceAgence(email){
  window.open('/extranet-app?apercu=' + encodeURIComponent(String(email || '').trim().toLowerCase()), '_blank', 'noopener');
}
async function supprimerAnciennesFacturesAgences(){
  try{
    const token = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const appel = (corps) => fetch('/api/factures-agences-purge', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token }, body: JSON.stringify(corps) }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
    const sim = await appel({ simulation: true });
    if(!sim.ok){ notify(sim.data.error || 'Vérification impossible', 'error'); return; }
    if(!sim.data.factures){ notify('Aucune ancienne facture à supprimer.'); return; }
    if(!confirm(`Supprimer définitivement ${sim.data.factures} ancienne(s) facture(s) sur ${sim.data.fiches} fiche(s) client, ainsi que les fichiers PDF ? Cette action est irréversible.`)) return;
    const res = await appel({});
    if(!res.ok){ notify(res.data.error || 'Suppression impossible', 'error'); return; }
    // Même nettoyage dans la copie locale, pour qu'une sauvegarde ultérieure
    // de la fiche ne remette pas les anciennes entrées.
    (DB.contacts || []).forEach(c => { if(Array.isArray(c.documents)) c.documents = c.documents.filter(d => !(d && d.type === 'facture')); });
    if(typeof saveToStorage === 'function') saveToStorage();
    notify(`✅ ${res.data.factures} facture(s) supprimée(s) — ${res.data.fichiersSupprimes || 0} fichier(s) PDF effacé(s)`);
  }catch(e){ notify('Erreur réseau', 'error'); }
}


// ─── MISSIONS ─────────────────────────────────────────────
