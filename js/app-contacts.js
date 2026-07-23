// === Lokentia CRM — app-contacts.js ===
// Fiche contact, navigation, dashboard, contacts, pipeline
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

let currentFicheId=null;
function openFiche(id){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  currentFicheId=id;
  document.getElementById('fiche-avatar').textContent=initials(c.entreprise||c.contact||'?');
  document.getElementById('fiche-name').textContent=c.entreprise||c.contact||'—';
  document.getElementById('fiche-sub').textContent=[c.contact,c.source].filter(Boolean).join(' · ')||'';
  // Onglet Informations — champs éditables inline
  document.getElementById('fiche-fields').innerHTML=`
    <div class="fiche-field">
      <div class="fiche-label">Email</div>
      <div class="fiche-val">${c.email?`<a href="mailto:${c.email}" style="color:var(--blue)">${c.email}</a>`:'—'}</div>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Téléphone</div>
      <div class="fiche-val">${c.tel?`<a href="tel:${c.tel}" style="color:var(--blue)">${c.tel}</a>`:'—'}</div>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Type client</div>
      <select style="width:100%;font-size:12px;padding:3px 6px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--bg)" onchange="quickUpdateContact('${c.id}','typeClient',this.value)">
        ${['Professionnel','Particulier'].map(v=>`<option${v===(c.typeClient||'Professionnel')?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Statut</div>
      <select style="width:100%;font-size:12px;padding:3px 6px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--bg)" onchange="quickUpdateContact('${c.id}','statut',this.value)">
        ${['Cible potentielle','Client actif','Partenaire','Inactif'].map(v=>`<option${v===(c.statut||'Cible potentielle')?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Source</div>
      <select style="width:100%;font-size:12px;padding:3px 6px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--bg)" onchange="quickUpdateContact('${c.id}','source',this.value)">
        ${['Démarchage','Recommandation','Relation','Site web','Brevo','Excel','Cal.com'].map(v=>`<option${v===(c.source||'Démarchage')?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Présence</div>
      <div class="fiche-val">${presenceBadge(c.presence||'notion')}</div>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Dernier contact</div>
      <input type="date" value="${c.lastContact||''}" style="width:100%;font-size:12px;padding:3px 6px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--bg)" onchange="quickUpdateContact('${c.id}','lastContact',this.value)">
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Moyen de contact</div>
      <select style="width:100%;font-size:12px;padding:3px 6px;border:1px solid var(--border2);border-radius:var(--radius);background:var(--bg)" onchange="quickUpdateContact('${c.id}','moyenContact',this.value)">
        ${['— Non renseigné —','📧 Email','📞 Téléphone','💬 SMS','👤 Rendez-vous physique','💻 Visio','📱 WhatsApp','🔗 LinkedIn'].map(v=>`<option${v===(c.moyenContact||'')?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Ouvertures Brevo</div>
      <div class="fiche-val"><span class="stat-pill pill-open"><i class="ti ti-eye" style="font-size:10px"></i>${c.opens||0} ouvertures</span></div>
    </div>
    <div class="fiche-field">
      <div class="fiche-label">Clics Brevo</div>
      <div class="fiche-val"><span class="stat-pill pill-click"><i class="ti ti-mouse" style="font-size:10px"></i>${c.clicks||0} clics</span></div>
    </div>
  `;
  document.getElementById('fiche-notes-display').innerHTML=c.notes?`<div style="font-size:11px;color:var(--text2);margin-bottom:3px">Notes</div><div style="font-size:12px">${c.notes}</div>`:'<div style="font-size:11px;color:var(--text3)">Aucune note — clique sur Modifier pour en ajouter</div>';
  document.getElementById('fiche-email-btn').onclick=()=>{
    closeModal('modal-fiche');
    nav('compose');
    setTimeout(()=>{
      document.getElementById('to-f').value=c.email||'';
      document.getElementById('subj-f').value=`📋 EDL IDF — ${c.entreprise||''}`;
    },100);
  };

  // Rendu emails via fonction dédiée (inclut Gmail)
  renderFicheEmails(c);
  document.getElementById('fe-ent').value=c.entreprise||'';
  document.getElementById('fe-contact').value=c.contact||'';
  document.getElementById('fe-email').value=c.email||'';
  document.getElementById('fe-tel').value=c.tel||'';
  document.getElementById('fe-notes').value=c.notes||'';
  feRenderDocs(c.documents || []);
  document.getElementById('fe-statut').value=c.statut||'Cible potentielle';
  document.getElementById('fe-type-client').value=c.typeClient||'Professionnel';
  document.getElementById('fe-source').value=c.source||'Démarchage';
  document.getElementById('fe-last-contact').value=c.lastContact||'';
  document.getElementById('fe-moyen-contact').value=c.moyenContact||'';
  ficheTab('infos',document.getElementById('ftab-infos'));
  renderFicheCommandes(c);
  openModal('modal-fiche');
}
function ficheTab(tab,btn){
  ['infos','commandes','taches','emails','edit'].forEach(t=>{
    const el=document.getElementById('fiche-'+t);
    if(el)el.style.display='none';
  });
  document.querySelectorAll('#modal-fiche .tab').forEach(t=>t.classList.remove('active'));
  const el=document.getElementById('fiche-'+tab);
  if(el)el.style.display='block';
  if(btn)btn.classList.add('active');
  if(tab==='taches') renderContactTasks();
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
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTask('${t.id}')" style="margin-top:2px;cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;${t.done?'text-decoration:line-through;color:var(--text3)':''}">${t.titre}</div>
        ${t.date?`<div style="font-size:11px;color:${isOverdue?'var(--red-text)':'var(--text2)'};margin-top:2px">📅 ${t.date}${t.heure?' à '+t.heure:''}${isOverdue?' — En retard ⚠️':''}</div>`:''}
        ${t.notes?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${t.notes}</div>`:''}
      </div>
      <button onclick="deleteTask('${t.id}')" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;padding:2px" title="Supprimer">✕</button>
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
  // Déclencher email si passage à "Client signé"
  if(field === 'statut' && value === 'Client signé ✅' && prevValue !== 'Client signé ✅'){
    if(c.email && confirm('Envoyer l\'email de bienvenue EDL IDF à ' + (c.entreprise||c.contact) + ' ?')){
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

  // Factures déjà émises pour ce client (par nom d'agence)
  const invoices=(DB.invoices||[]).filter(inv=>(inv.clientName||'').toLowerCase()===nom)
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  const invoicesHtml=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.03em">📄 Factures émises${invoices.length?' ('+invoices.length+')':''}</div>
      <button class="btn btn-sm" onclick="openMonthlyInvoiceModal('${(c.entreprise||'').replace(/'/g,"\\'")}')"><i class="ti ti-calendar-stats"></i>Facturer le mois</button>
    </div>
    ${invoices.length?invoices.map(inv=>{
      const totalHT=inv.lineItems.reduce((s,li)=>s+(li.qty||1)*(li.puHT||0),0);
      return `<div style="display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;margin-bottom:6px;font-size:11px">
        <div>
          <span style="font-weight:600">${inv.number}</span>
          <span style="color:var(--text2);margin-left:8px">${new Date(inv.date).toLocaleDateString('fr-FR')} · ${inv.lineItems.length} prestation${inv.lineItems.length>1?'s':''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:700;color:var(--green)">${totalHT.toLocaleString('fr-FR')} € HT</span>
          <button class="btn btn-sm" onclick="redownloadInvoice('${inv.id}')" title="Re-télécharger"><i class="ti ti-download"></i></button>
        </div>
      </div>`;
    }).join(''):'<div style="font-size:11px;color:var(--text2);margin-bottom:10px">Aucune facture émise pour ce client pour le moment.</div>'}
    <div style="height:1px;background:var(--border);margin:14px 0"></div>
  `;

  // Badge nombre commandes
  const countEl=document.getElementById('ftab-commandes-count');
  if(countEl)countEl.textContent=missions.length>0?`(${missions.length})`:'';

  // Badge tâches en attente
  updateFicheTachesCount();

  // CA total ce contact
  const caTotal=missions.filter(m=>m.statut==='facturée'||m.statut==='terminée').reduce((s,m)=>s+(m.montant||0),0);

  if(!missions.length){
    document.getElementById('fiche-commandes-list').innerHTML=invoicesHtml+`
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

  document.getElementById('fiche-commandes-list').innerHTML=invoicesHtml+`
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
        <div style="width:36px;height:36px;border-radius:50%;background:${m.statut==='facturée'?'var(--green-bg)':m.statut==='terminée'?'var(--blue-bg)':m.statut==='en cours'?'var(--amber-bg)':'var(--bg2)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">
          ${m.statut==='facturée'?'✅':m.statut==='terminée'?'🏁':m.statut==='en cours'?'⏳':'📅'}
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;margin-bottom:2px">${m.type||'EDL'}</div>
          <div style="font-size:11px;color:var(--text2)">${m.adresse||'Adresse non renseignée'}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${fmtDT(m.date)}</div>
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

async function onContactStatusChange(select){
  const newStatus = select.value;
  if(newStatus !== 'Client signé ✅') return;
  // Récupérer les infos du contact courant
  const c = DB.contacts.find(x => x.id === currentFicheId);
  if(!c) return;
  if(!c.email){ notify('⚠️ Email du contact requis pour envoyer le lien booking', 'warn'); return; }
  // Confirmer l'envoi
  if(!confirm(`Envoyer l'email de bienvenue EDL IDF à ${c.entreprise || c.contact} (${c.email}) avec son lien booking ?`)) {
    select.value = c.statut || 'Cible potentielle';
    return;
  }
  try {
    const resp = await fetch('/api/send-welcome-agency', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        email: c.email,
        companyName: c.entreprise || c.contact || '',
        contactName: c.contact || ''
      })
    });
    if(resp.ok){
      notify('✅ Email de bienvenue envoyé à ' + c.email + ' !');
    } else {
      notify('⚠️ Erreur envoi email — statut mis à jour quand même', 'warn');
    }
  } catch(e) {
    notify('⚠️ Erreur réseau : ' + e.message, 'warn');
  }
}

function saveContactEdit(){
  const c=DB.contacts.find(x=>x.id===currentFicheId);if(!c)return;
  c.entreprise=document.getElementById('fe-ent').value;
  c.contact=document.getElementById('fe-contact').value;
  c.email=document.getElementById('fe-email').value;
  c.tel=document.getElementById('fe-tel').value;
  c.statut=document.getElementById('fe-statut').value;
  c.typeClient=document.getElementById('fe-type-client').value;
  c.source=document.getElementById('fe-source').value;
  c.lastContact=document.getElementById('fe-last-contact').value;
  c.moyenContact=document.getElementById('fe-moyen-contact').value;
  c.notes=document.getElementById('fe-notes').value;
  c.documents = feGetDocs();
  detectDuplicates();saveToStorage();closeModal('modal-fiche');
  notify('✅ Contact mis à jour !');renderContacts();renderDashboard();
}
function deleteContact(){
  if(!confirm('Supprimer ce contact ?'))return;
  const idToDelete=currentFicheId;
  DB.contacts=DB.contacts.filter(x=>x.id!==currentFicheId);
  detectDuplicates();saveToStorage();closeModal('modal-fiche');
  deleteFromSupabase('contacts', idToDelete);
  notify('Contact supprimé');renderContacts();renderDashboard();
}

async function loadGmailEmails(contactId, email){
  const btn=document.getElementById(`gmail-load-btn-${contactId}`);
  const status=document.getElementById(`gmail-status-${contactId}`);
  if(btn)btn.disabled=true;
  if(status)status.textContent='Chargement…';
  try{
    const resp=await fetch(`/api/gmail-emails?email=${encodeURIComponent(email)}`,{headers:await _authHeaders()});
    if(!resp.ok){
      const err=await resp.json();
      if(status)status.textContent='❌ '+(err.error||'Erreur');
      if(btn)btn.disabled=false;
      return;
    }
    const data=await resp.json();
    const gmailEmails=data.emails||[];
    const c=DB.contacts.find(x=>x.id===contactId);
    if(c){
      if(!c.history)c.history=[];
      let added=0;
      gmailEmails.forEach(ge=>{
        if(!c.history.find(h=>h.id===ge.id)){
          c.history.push(ge);
          added++;
        }
      });
      if(added>0){saveToStorage();syncDirtyToSupabase();}
      if(gmailEmails.length===0){
        if(status)status.textContent='Aucun email Gmail trouvé pour ce contact';
      } else {
        if(status)status.textContent=`✅ ${gmailEmails.length} email${gmailEmails.length>1?'s':''} chargé${gmailEmails.length>1?'s':''}`;
      }
      renderFicheEmails(c);
    }
    if(btn)btn.disabled=false;
  }catch(e){
    if(status)status.textContent='❌ Serveur non joignable — relance START_CRM';
    if(btn)btn.disabled=false;
  }
}

function renderFicheEmails(c){
  const emailLower=(c.email||'').toLowerCase();
  const fromHistory=(c.history||[]);
  const fromTracking=DB.trackings.filter(t=>(t.email||'').toLowerCase()===emailLower&&!fromHistory.find(h=>h.id===t.id));
  const allEmails=[...fromHistory,...fromTracking].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const gmailBtnHtml=''; // Gmail désactivé (invalid_client)
  const emailsHtml=allEmails.length?allEmails.map((t,i)=>`
    <div style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden;${t.direction==='recu'?'border-left:3px solid var(--blue)':''}">
      <div style="padding:10px 12px;background:var(--bg2);display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            ${t.direction==='recu'?'<span style="font-size:9px;background:var(--blue-bg);color:var(--blue-text);padding:1px 5px;border-radius:3px">REÇU</span>':'<span style="font-size:9px;background:var(--bg3);color:var(--text2);padding:1px 5px;border-radius:3px">ENVOYÉ</span>'}
            <div style="font-weight:600;font-size:12px">${t.objet||t.subject||'—'}</div>
          </div>
          <div style="font-size:10px;color:var(--text2)">${fmtDT(t.date)}${t.from&&t.direction==='recu'?' · De : '+t.from:''}</div>
        </div>
        <select style="font-size:10px;padding:2px 6px;min-width:90px;max-width:110px;margin-left:8px;flex-shrink:0" onchange="updateEmailStatus('${c.id}','${t.id||i}',this.value)">
          ${['Envoyé','Ouvert','Cliqué','Répondu','Reçu','Sans suite'].map(s=>`<option value="${s}"${s===t.statut?' selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      ${t.corps?`<div style="padding:8px 12px;font-size:11px;color:var(--text2);border-top:1px solid var(--border);max-height:80px;overflow-y:auto;white-space:pre-wrap">${t.corps.substring(0,300)}${t.corps.length>300?'…':''}</div>`:''}
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
function nav(v){
  // Fermer toute fenêtre modale restée ouverte pour éviter qu'elle ne bloque l'affichage d'une future fenêtre
  document.querySelectorAll('.modal-bg.open').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>{if(el.getAttribute('onclick')&&el.getAttribute('onclick').includes("'"+v+"'"))el.classList.add('active');});
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
  if(v==='pipeline')renderPipeline();
  if(v==='missions')renderMissions();
  if(v==='campaigns')renderCampaigns();
  if(v==='compose')renderTracking();
  if(v==='agenda')renderCalendar();
  if(v==='reservations')loadReservations();
  if(v!=='reservations' && _resaAutoRefreshInterval) silentRefreshReservations();
  if(v==='settings')loadSettingsForm();
  if(v==='help'){}
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
  document.getElementById('modal-mission-title').textContent='Nouvelle mission EDL';
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
    document.getElementById('modal-mission-title').textContent='Nouvelle mission EDL';
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
  detectDuplicates();
  buildMonthOptions();

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
  document.getElementById('k-missions').textContent=missions.length;
  const caHT=missions.reduce((s,m)=>s+(m.montant||0),0);
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

  const stageCounts={};STAGES.forEach(s=>stageCounts[s]=DB.deals.filter(d=>d.etape===s).length);
  const maxC=Math.max(...Object.values(stageCounts),1);
  document.getElementById('dash-pipeline').innerHTML=STAGES.map(s=>`<div class="stat-row"><span style="font-size:11px;width:80px;color:var(--text2);flex-shrink:0">${s}</span><div class="progress-bar"><div class="progress-fill" style="width:${Math.round(stageCounts[s]/maxC*100)}%"></div></div><span style="font-size:11px;min-width:16px;text-align:right">${stageCounts[s]}</span></div>`).join('');

  // Missions dans le tableau — filtrées
  document.getElementById('dash-missions').innerHTML=missions.slice(-5).reverse().map(m=>`<tr><td>${m.agence}</td><td style="font-size:10px">${m.type}</td><td>${m.montant} €</td><td>${statusBadge(m.statut)}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aucune</td></tr>';
  document.getElementById('dash-contacts').innerHTML=DB.contacts.slice(0,6).map(c=>`<tr><td style="font-size:11px">${c.entreprise}</td><td style="font-size:11px;color:var(--text2)">${c.email||'—'}</td><td>${statusBadge(c.statut)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Aucun</td></tr>';
  const today=new Date();
  const upcoming=DB.rdvs.filter(r=>new Date(r.date)>=today).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);
  document.getElementById('dash-rdv').innerHTML=upcoming.length?upcoming.map(r=>{
    const url=googleCalLink(r.titre,r.date,r.duree,r.contact,r.type);
    const idx=DB.rdvs.indexOf(r);
    return `<div style="border-left:3px solid var(--blue);padding:5px 9px;margin-bottom:7px;border-radius:0 var(--radius) var(--radius) 0;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <div style="font-size:11px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.titre}</div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          ${url?`<a href="${url}" target="_blank" title="Google Agenda" style="font-size:11px;text-decoration:none;line-height:1.6">📅</a>`:''}
          <button onclick="deleteRdvDash(${idx})" title="Supprimer" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px;padding:0 2px;line-height:1">✕</button>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text2)">${fmtDT(r.date)} · ${r.duree||'—'}${r.contact?' · '+r.contact:''}</div>
    </div>`;}).join(''):'<div class="empty">Aucun RDV à venir</div>';
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
function renderContacts(){
  const list=getFilteredContacts();
  document.getElementById('contacts-count').textContent=list.length+' contacts';
  document.getElementById('contacts-tbody').innerHTML=list.length?list.map(c=>{
    const gi=DB.contacts.indexOf(c);const dup=isDup(gi);
    const disp=displayEntreprise(c);
    const empty='<span style="color:var(--text3,#c8c8c8);font-size:11px">—</span>';
    const contactCell=cleanName(c.contact)?`<span style="font-size:11px">${cleanName(c.contact)}</span>`:empty;
    return `<tr class="clickable ${dup?'dup-row':''}" onclick="openFiche('${c.id}')">
      <td><div class="flex-row"><div class="avatar" style="font-size:9px;${dup?'background:var(--amber-bg);color:var(--amber-text)':''}">${initials(disp.name)}</div><span style="font-size:11px;font-weight:500;${disp.muted?'color:var(--text2);font-style:italic':''}">${disp.name}</span>${dup?'<span class="badge b-amber" style="font-size:9px">doublon</span>':''}</div></td>
      <td>${contactCell}</td>
      <td>${cleanName(c.email)?`<a href="mailto:${c.email}" style="color:var(--blue);text-decoration:none;font-size:11px" onclick="event.stopPropagation()">${c.email}</a>`:empty}</td>
      <td>${cleanName(c.tel)?`<span style="font-size:11px">${c.tel}</span>`:empty}</td>
      <td><span class="badge ${c.typeClient==='Particulier'?'b-teal':'b-blue'}" style="font-size:9px">${c.typeClient||'Pro'}</span></td>
      <td>${statusBadge(c.statut)}</td>
      <td style="font-size:10px;color:var(--text2)">${c.lastContact?`<strong style="color:var(--text)">${fmtDate(c.lastContact)}</strong>`:empty}</td>
      <td style="font-size:10px">${cleanName(c.moyenContact)?c.moyenContact:empty}</td>
      <td><button class="btn btn-sm" onclick="event.stopPropagation();emailContactQuick('${c.email}')"><i class="ti ti-mail" style="font-size:12px"></i></button></td>
    </tr>`;
  }).join(''):'<tr><td colspan="8" class="empty">Aucun contact</td></tr>';
}
function filterContactsTab(f,btn){
  UI.contactFilter=f;
  if(btn){document.querySelectorAll('#contact-filter-btns .btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
  renderContacts();
}
function searchContacts(v){UI.contactSearch=v;renderContacts();}
function emailContactQuick(email){nav('compose');setTimeout(()=>{document.getElementById('to-f').value=email;},100);}

// ─── PIPELINE ─────────────────────────────────────────────
function renderPipeline(){
  const board=document.getElementById('pipeline-board');
  if(DB.deals.length===0){
    board.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2)">
      <div style="font-size:32px;margin-bottom:12px">📊</div>
      <div style="font-size:14px;font-weight:500;margin-bottom:8px">Pipeline vide</div>
      <div style="font-size:12px;margin-bottom:16px">Ajoute des opportunités commerciales manuellement</div>
      <button class="btn btn-primary" onclick="openModal('modal-deal')"><i class="ti ti-plus"></i>Créer ma première opportunité</button>
    </div>`;
    return;
  }
  board.innerHTML=STAGES.map(stage=>{
    const cards=DB.deals.filter(d=>d.etape===stage);
    const _annuel=d=>(d.periode==='an'?(d.montant||0):(d.montant||0)*12);
    const total=cards.reduce((s,d)=>s+_annuel(d),0);
    return `<div class="pipe-col" ondragover="event.preventDefault();this.style.background='var(--blue-bg)'" ondragleave="this.style.background=''" ondrop="dropDeal(event,'${stage}');this.style.background=''">
      <div class="pipe-col-title"><span>${stage}</span><span>${cards.length}</span></div>
      ${cards.map(d=>{
        return `<div class="pipe-card" draggable="true" ondragstart="dragDeal(event,'${d.id}')" style="cursor:grab">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px">
            <div class="pipe-card-name" style="flex:1">${d.agence}</div>
            <button onclick="deleteDeal('${d.id}')" title="Supprimer"
              style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px;padding:0;line-height:1;flex-shrink:0;opacity:0.5"
              onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">✕</button>
          </div>
          <div class="pipe-card-amount">${(d.montant||0).toLocaleString('fr-FR')} €/${d.periode==='an'?'an':'mois'}</div>
          <div class="pipe-card-meta">${d.proba}% · ${d.notes||'—'}</div>
        </div>`;
      }).join('')}
      ${total?`<div style="font-size:10px;color:var(--text2);text-align:right;margin-top:5px">${total.toLocaleString('fr-FR')} €/an</div>`:''}</div>`;
  }).join('');
}

let _dragDealId = '';
function dragDeal(event, id){ _dragDealId = id; event.dataTransfer.effectAllowed = 'move'; }
function dropDeal(event, newStage){
  event.preventDefault();
  const d = DB.deals.find(x => String(x.id) === String(_dragDealId));
  if(!d || d.etape === newStage) return;
  d.etape = newStage;
  saveToStorage();
  renderPipeline();
  renderDashboard();
  notify(`✅ Déplacé → ${newStage}`);
}

function deleteDeal(id){
  // Comparer en string pour gérer IDs numériques ET string
  const d=DB.deals.find(x=>String(x.id)===String(id));
  if(!d)return;
  if(!confirm(`Supprimer cette opportunité ?\n\n"${d.agence}"\n${(d.montant||0).toLocaleString('fr-FR')} €/mois · ${d.etape}\n\nCette action est irréversible.`))return;
  DB.deals=DB.deals.filter(x=>String(x.id)!==String(id));
  saveToStorage();
  deleteFromSupabase('deals', id);
  notify('🗑️ Opportunité supprimée');
  renderPipeline();
  renderDashboard();
}

// ─── MISSIONS ─────────────────────────────────────────────