// === Lokentia CRM — app-emails.js ===
// Campagnes, composition des emails, sync automatique
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

function renderCampaigns(){
  const ts=DB.campaigns.reduce((s,c)=>s+c.envoyes,0);
  const to=DB.campaigns.reduce((s,c)=>s+c.ouverts,0);
  const tc=DB.campaigns.reduce((s,c)=>s+c.clics,0);
  document.getElementById('k-sent').textContent=ts;
  document.getElementById('k-open').textContent=ts?Math.round(to/ts*100)+'%':'0%';
  document.getElementById('k-click').textContent=ts?Math.round(tc/ts*100)+'%':'0%';
  document.getElementById('campaigns-tbody').innerHTML=DB.campaigns.map(c=>`<tr>
    <td style="font-weight:600;font-size:11px">${c.nom}</td>
    <td>${c.envoyes}</td>
    <td>${c.ouverts} <span style="color:var(--text2);font-size:10px">(${Math.round(c.ouverts/c.envoyes*100)}%)</span></td>
    <td>${c.clics} <span style="color:var(--text2);font-size:10px">(${Math.round(c.clics/c.envoyes*100)}%)</span></td>
    <td>${c.reponses}</td>
    <td style="font-size:11px">${fmtDate(c.date)}</td>
    <td>${statusBadge(c.statut)}</td>
  </tr>`).join('')||'<tr><td colspan="7" class="empty">Aucune campagne</td></tr>';
}

// ─── COMPOSE ──────────────────────────────────────────────
function renderTracking(){
  const statColor={'Envoyé':'#888','Ouvert':'#3B6D11','Cliqué':'#1A5FA8','Répondu':'#854F0B','Sans suite':'#A32D2D'};
  document.getElementById('tracking-list').innerHTML=DB.trackings.length?DB.trackings.slice(0,20).map(t=>`<div class="tracking-item" style="cursor:pointer" onclick="openFicheByEmail('${(t.email||'').replace(/'/g,"\\'")}')">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;font-weight:600">${t.contact||t.email||'—'}</span>
      <span><span class="t-dot" style="background:${statColor[t.statut]||'#888'}"></span><span style="font-size:10px;color:var(--text2)">${t.statut}</span></span>
    </div>
    <div style="font-size:10px;color:var(--text2)">${t.objet||'—'}</div>
    <div style="font-size:10px;color:var(--text3)">${fmtDT(t.date)}</div>
  </div>`).join(''):'<div class="empty">Aucun email envoyé</div>';
}
function autocompleteContact(val){
  const box=document.getElementById('to-suggest');
  if(!val||val.length<2){box.style.display='none';return;}
  const q=val.toLowerCase();
  const matches=DB.contacts.filter(c=>
    (c.entreprise||'').toLowerCase().includes(q)||
    (c.contact||'').toLowerCase().includes(q)||
    (c.email||'').toLowerCase().includes(q)
  ).slice(0,8);
  if(!matches.length){box.style.display='none';return;}
  box.style.display='block';
  box.innerHTML=matches.map(c=>`
    <div onclick="selectContact('${(c.email||'').replace(/'/g,"\\'")}','${(c.entreprise||c.contact||'').replace(/'/g,"\\'")}','${c.id}')"
      style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;gap:8px"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
      <div style="width:24px;height:24px;border-radius:50%;background:var(--blue-bg);color:var(--blue-text);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;flex-shrink:0">${initials(c.entreprise||c.contact)}</div>
      <div>
        <div style="font-weight:600">${c.entreprise||c.contact||'—'}</div>
        <div style="font-size:10px;color:var(--text2)">${c.email||'Pas d\'email'} ${c.tel?'· '+c.tel:''}</div>
      </div>
    </div>`).join('');
}

function selectContact(email,nom,id){
  document.getElementById('to-f').value=email;
  document.getElementById('to-suggest').style.display='none';
  // Pré-remplir l'objet si vide
  const subj=document.getElementById('subj-f');
  if(!subj.value)subj.value=`📋 EDL IDF — ${nom}`;
  notify(`✅ Contact sélectionné : ${nom}`);
}

function syncTrackingFromBrevo(){
  DB.contacts.forEach(c=>{
    const email=(c.email||'').toLowerCase();
    if(!email||!c.opens)return;
    if(c.history&&c.history.length>0&&c.opens>0){
      const lastEmail=c.history.find(e=>e.statut==='Envoyé');
      if(lastEmail)lastEmail.statut=c.clicks>0?'Cliqué':'Ouvert';
    }
  });
  saveToStorage();
}

function openFicheByEmail(email){
  const c=DB.contacts.find(x=>(x.email||'').toLowerCase()===(email||'').toLowerCase());
  if(c)openFiche(c.id);
  else notify('Contact non trouvé dans la base','warn');
}
function applyTpl(key){const t=TEMPLATES[key];document.getElementById('subj-f').value=t.subj;document.getElementById('body-f').value=t.body;}

// Données pièce jointe
let _attachData = null;
let _attachName = null;
let _attachType = null;

function handleAttachment(event){
  const file = event.target.files[0];
  if(!file) return;
  if(file.size > 25 * 1024 * 1024){
    notify('⚠️ Fichier trop volumineux (max 25 Mo)','warn');
    return;
  }
  _attachName = file.name;
  _attachType = file.type;
  const reader = new FileReader();
  reader.onload = e => {
    _attachData = e.target.result.split(',')[1]; // base64
    const sizeMo = (file.size/1024/1024).toFixed(2);
    document.getElementById('attach-info').innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--blue)">📎 ${file.name}</div>
      <div style="font-size:11px;color:var(--text2)">${sizeMo} Mo</div>`;
    document.getElementById('attach-clear-btn').style.display = 'inline-block';
    notify('📎 Pièce jointe ajoutée : ' + file.name);
  };
  reader.readAsDataURL(file);
}

function clearAttachment(e){
  e.stopPropagation();
  _attachData = null;
  _attachName = null;
  _attachType = null;
  document.getElementById('attach-input').value = '';
  document.getElementById('attach-info').innerHTML = `
    <div style="font-size:12px;color:var(--text2)">Cliquer pour ajouter une pièce jointe</div>
    <div style="font-size:11px;color:var(--text3)">PDF, Word, Excel, Image — max 25 Mo</div>`;
  document.getElementById('attach-clear-btn').style.display = 'none';
}

async function sendEmail(){
  const to=document.getElementById('to-f').value.trim();
  const subj=document.getElementById('subj-f').value.trim();
  const body=document.getElementById('body-f').value.trim();
  if(!to||!subj){notify('⚠️ Destinataire et objet requis','warn');return;}

  // ── Toast annulation 15 secondes ──
  let cancelled=false;
  let countdown=15;

  // Créer le toast d'annulation
  const toast=document.createElement('div');
  toast.id='cancel-toast';
  toast.style.cssText=`position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:12px;z-index:9999;display:flex;align-items:center;gap:12px;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,.3);min-width:320px`;
  toast.innerHTML=`
    <div style="flex:1">
      <div style="font-weight:600;margin-bottom:2px">📤 Envoi dans <span id="toast-count">15</span>s</div>
      <div style="font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">À : ${to} — ${subj}</div>
      <div style="margin-top:6px;height:3px;background:#333;border-radius:2px;overflow:hidden">
        <div id="toast-bar" style="height:100%;width:100%;background:#1A5FA8;border-radius:2px;transition:width 1s linear"></div>
      </div>
    </div>
    <button onclick="document.getElementById('cancel-toast-btn').click()" id="cancel-toast-btn" style="background:#E24B4A;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap">✕ Annuler</button>`;
  document.body.appendChild(toast);

  // Lancer le compte à rebours
  const timer=setInterval(()=>{
    countdown--;
    const countEl=document.getElementById('toast-count');
    const barEl=document.getElementById('toast-bar');
    if(countEl)countEl.textContent=countdown;
    if(barEl)barEl.style.width=(countdown/15*100)+'%';
    if(countdown<=0)clearInterval(timer);
  },1000);

  // Bouton annuler
  const cancelBtn=document.getElementById('cancel-toast-btn');
  cancelBtn.addEventListener('click',()=>{
    cancelled=true;
    clearInterval(timer);
    toast.remove();
    notify('❌ Envoi annulé','warn');
  });

  // Attendre 15 secondes
  await new Promise(resolve=>setTimeout(resolve,15000));
  clearInterval(timer);
  try{if(toast.parentNode)toast.parentNode.removeChild(toast);}catch(e){}
  if(cancelled)return;

  // ── Envoi réel ──
  const emailLower=to.toLowerCase();
  const now=new Date();
  const entry={
    id:'email_'+Date.now(),
    contact:to.includes('@')?to.split('@')[0]:to,
    email:emailLower,
    objet:subj,
    corps:body,
    date:now.toISOString(),
    statut:'Envoyé'
  };

  notify('📤 Envoi en cours…');
  try{
    const brevoUrl='/api/send-email';
    const payload={
      sender:{name:'EDL IDF',email:'contact@edl-idf.com'},
      to:[{email:to}],
      subject:subj,
      htmlContent:`<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${body.replace(/\n/g,'<br>')}${EMAIL_SIGNATURE}</div>`,
      textContent:body,
      headers:{'X-CRM-ID':entry.id}
    };
    // Ajouter la pièce jointe si présente
    if(_attachData && _attachName){
      payload.attachment=[{content:_attachData, name:_attachName}];
      entry.objet += ' 📎';
    }
    const _tk3=(await supabaseClient.auth.getSession()).data?.session?.access_token||'';
    const resp=await fetch(brevoUrl,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tk3},
      body:JSON.stringify(payload)
    });
    const respStatus=resp.status;
    console.log('Brevo response status:', respStatus);
    if(respStatus===200||respStatus===201){
      entry.statut='Envoyé (Brevo)';
      notify(`✅ Email envoyé via Brevo — tracking actif !`);
    } else {
      const errText=await resp.text();
      console.log('Brevo error:', errText);
      entry.statut='Envoyé (local)';
      notify('⚠️ Erreur Brevo ('+respStatus+') — email non envoyé','warn');
    }
  } catch(e){
    console.log('Send error:', e);
    entry.statut='Envoyé (local)';
    notify('⚠️ Serveur local non joignable — relance brevo_sync.py','warn');
  }

  // Logger dans le tracking global
  DB.trackings.unshift(entry);

  // Classer dans la fiche contact + mettre à jour dernier contact
  const contact=DB.contacts.find(c=>(c.email||'').toLowerCase()===emailLower);
  if(contact){
    if(!contact.history)contact.history=[];
    contact.history.unshift(entry);
    // Mise à jour automatique dernier contact
    contact.lastContact=now.toISOString().split('T')[0];
    contact.moyenContact='📧 Email';
    notify(`✅ Email classé dans la fiche de ${contact.entreprise||contact.contact} !`);
  } else {
    notify('✅ Email envoyé ! (contact non trouvé dans la base)');
  }

  saveToStorage();
  renderTracking();
  document.getElementById('to-f').value='';
  document.getElementById('subj-f').value='';
  document.getElementById('body-f').value='';
  clearAttachment({stopPropagation:()=>{}});
}

// ─── SYNC AUTO TOUTES LES 5 MINUTES ──────────────────────
let autoSyncInterval=null;

function startAutoSync(){
  if(autoSyncInterval)clearInterval(autoSyncInterval);
  autoSyncInterval=setInterval(async()=>{
    console.log('🔄 Sync auto Brevo…');
    await silentSyncBrevo();
  }, 5*60*1000); // 5 minutes
  console.log('✅ Sync auto activée (toutes les 5 min)');
}

async function silentSyncBrevo(){
  if(window._EXTRANET_MODE) return;
  try{
    let resp;
    try{
      const _tk4=(await supabaseClient.auth.getSession()).data?.session?.access_token||'';
      resp=await fetch('/api/brevo-contacts?t='+Date.now(),{headers:{'Authorization':'Bearer '+_tk4}});
    }catch(fetchErr){
      // Serveur Python injoignable → afficher dans le footer
      const el=document.getElementById('sync-text');
      if(el){el.textContent='⚠️ Sync hors ligne';el.style.color='var(--amber)';}
      return;
    }
    if(!resp.ok){
      const el=document.getElementById('sync-text');
      if(el){el.textContent='⚠️ Sync hors ligne';el.style.color='var(--amber)';}
      return;
    }
    const fresh=await resp.json();
    if(!fresh||!fresh.length)return;

    // Mettre à jour les stats ouvertures/clics pour chaque contact
    let updated=0;
    fresh.forEach(bc=>{
      const email=(bc.email||'').toLowerCase();
      const contact=DB.contacts.find(c=>(c.email||'').toLowerCase()===email);
      if(contact){
        const prevOpens=contact.opens||0;
        const prevClicks=contact.clicks||0;
        contact.opens=bc.opens||0;
        contact.clicks=bc.clicks||0;
        contact.lastOpen=bc.lastOpen||contact.lastOpen;

        // Si nouvelles ouvertures → mettre à jour le statut dans l'historique
        if(bc.opens>prevOpens&&contact.history&&contact.history.length>0){
          const lastSent=contact.history.find(e=>e.statut==='Envoyé'||e.statut==='Envoyé (Brevo)');
          if(lastSent){lastSent.statut='Ouvert';updated++;}
        }
        if(bc.clicks>prevClicks&&contact.history&&contact.history.length>0){
          const lastOpen=contact.history.find(e=>e.statut==='Ouvert'||e.statut==='Envoyé (Brevo)');
          if(lastOpen){lastOpen.statut='Cliqué';updated++;}
        }

        // Mettre à jour aussi dans DB.trackings global
        DB.trackings.filter(t=>(t.email||'').toLowerCase()===email).forEach(t=>{
          if((t.statut==='Envoyé'||t.statut==='Envoyé (Brevo)')&&bc.opens>0)t.statut='Ouvert';
          if(t.statut==='Ouvert'&&bc.clicks>0)t.statut='Cliqué';
        });
      }
    });

    if(updated>0){
      saveToStorage();
      notify(`🔄 Sync auto : ${updated} statut(s) mis à jour`);
      renderTracking();
    }

    // Mettre à jour l'indicateur de sync
    document.getElementById('sync-text').textContent='Sync: '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.log('Sync auto erreur:',e);
  }
}
function sendCampaign(){
  const nom=document.getElementById('camp-name').value.trim();
  if(!nom){notify('⚠️ Nom requis','warn');return;}
  const seg=document.getElementById('camp-seg').value;
  let count=DB.contacts.length;
  if(seg.includes('Cibles'))count=DB.contacts.filter(c=>c.statut==='Cible potentielle').length;
  else if(seg.includes('Clients'))count=DB.contacts.filter(c=>c.statut==='Client actif').length;
  else if(seg.includes('Brevo'))count=DB.contacts.filter(c=>c.presence==='brevo'||c.presence==='both').length;
  DB.campaigns.unshift({id:DB.campaigns.length+1,nom,envoyes:count||1,ouverts:0,clics:0,reponses:0,date:new Date().toISOString().split('T')[0],statut:'Active'});
  saveToStorage();notify(`✅ Campagne "${nom}" créée — ${count} contacts`);
  document.getElementById('camp-name').value='';renderCampaigns();
}
function composeTab(tab,btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');
  document.getElementById('compose-single').style.display=tab==='single'?'block':'none';
  document.getElementById('compose-campaign').style.display=tab==='campaign'?'block':'none';
}

// ─── AGENDA ───────────────────────────────────────────────