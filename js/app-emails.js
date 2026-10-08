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
// Champ "De" (readonly) : purement informatif — l'expéditeur réel est
// toujours décidé côté serveur par identiteAbonne() (api/send-email.js
// ignore le sender envoyé par le client, précisément pour empêcher un
// abonné d'usurper l'identité d'un autre). On rejoue ici la même règle
// (domaine vérifié -> propre adresse, sinon expéditeur neutre Lokentia)
// uniquement pour que ce champ affiche ce qui sera vraiment utilisé,
// au lieu de l'ancienne valeur "contact@edl-idf.com" figée en dur qui
// s'affichait à l'identique pour tous les comptes.
const DOMAINES_VERIFIES_AFFICHAGE = ['edl-idf.com', 'lokentia.fr'];
function afficherExpediteurCompose(){
  const champ = document.getElementById('compose-from');
  if(!champ) return;
  const mail = (CFG.expediteurEmail || CFG.userEmail || '').trim();
  const domaine = mail.includes('@') ? mail.split('@')[1].toLowerCase() : '';
  champ.value = (domaine && DOMAINES_VERIFIES_AFFICHAGE.includes(domaine)) ? mail : 'contact@lokentia.fr';
}

// Signature ajoutée en bas des emails envoyés via le Composer — auparavant
// un bloc HTML figé avec les coordonnées personnelles de Thomas (EDL IDF),
// ajouté à l'identique à TOUS les emails envoyés par TOUS les comptes. On
// la reconstruit ici à partir de l'identité propre à ce compte (Paramètres
// → "Identité de vos emails" + "Identité visuelle"), et on ne renvoie rien
// si l'abonné n'a encore rien configuré (pas de signature générique inventée).
function genererSignatureEmail(){
  const nom = CFG.expediteurSignature || CFG.expediteurNom || CFG.companyName || '';
  const sousTitre = [CFG.expediteurNom, CFG.companyName].find(v => v && v !== nom) || '';
  const tel = CFG.expediteurTel || '';
  const email = CFG.expediteurEmail || '';
  const logo = CFG.logoPath ? (AGENCY_LOGOS_BUCKET_URL + CFG.logoPath) : '';
  if(!nom && !tel && !email && !logo) return '';

  const couleur = /^#[0-9a-fA-F]{6}$/.test(CFG.couleurPrimaire || '') ? CFG.couleurPrimaire : '#1A5FA8';
  const blocLogo = logo
    ? `<td style="padding-right:16px;vertical-align:middle"><img src="${esc(logo)}" alt="${esc(nom||sousTitre)}" style="width:120px;max-height:70px;height:auto;display:block"></td>`
    : '';

  return `
<br><br>
<div style="font-family:Arial,sans-serif;font-size:13px;color:${couleur};border-top:2px solid ${couleur};padding-top:12px;margin-top:12px">
  <table cellpadding="0" cellspacing="0">
    <tr>
      ${blocLogo}
      <td style="vertical-align:middle;${logo?`padding-left:16px;border-left:1px solid ${couleur}`:''}">
        ${nom ? `<div style="font-weight:700;font-size:14px;color:${couleur}">${esc(nom)}</div>` : ''}
        ${sousTitre ? `<div style="color:#333;font-size:12px">${esc(sousTitre)}</div>` : ''}
        <div style="margin-top:6px;font-size:12px;color:#555">
          ${tel ? `📞 <a href="tel:${esc(tel.replace(/[^0-9+]/g,''))}" style="color:#555;text-decoration:none">${esc(tel)}</a><br>` : ''}
          ${email ? `✉️ <a href="mailto:${esc(email)}" style="color:${couleur};text-decoration:none">${esc(email)}</a>` : ''}
        </div>
      </td>
    </tr>
  </table>
</div>`;
}

// ─── Suivi des emails (Brevo) ───────────────────────────────
// Avant : le suivi n'était chargé que par « Synchronisation Brevo » (manuel)
// et un email déjà connu n'était JAMAIS mis à jour (« Envoyé » restait
// « Envoyé » même ouvert ou cliqué ensuite), la liste n'était pas triée.
// Désormais : rafraîchi à l'ouverture d'Emails (au plus toutes les 5 min),
// statut / ouvertures / clics mis à jour, plus récents en premier.
const _RANG_STATUT_EMAIL = { 'Envoyé':1, 'Désabonné':1, 'Échec':1, 'Spam':1, 'Ouvert':2, 'Cliqué':3, 'Répondu':4 };
function fusionnerSuiviEmails(liste){
  let nouveaux = 0, majs = 0;
  const maj = (cible, t) => {
    let change = false;
    if((_RANG_STATUT_EMAIL[t.statut]||0) >= (_RANG_STATUT_EMAIL[cible.statut]||0) && t.statut !== cible.statut){ cible.statut = t.statut; change = true; }
    if((t.opens||0) > (cible.opens||0)){ cible.opens = t.opens; change = true; }
    if((t.clicks||0) > (cible.clicks||0)){ cible.clicks = t.clicks; change = true; }
    if(t.date && String(t.date) > String(cible.date||'')){ cible.date = t.date; change = true; }
    return change;
  };
  (liste || []).forEach(t => {
    if(!t || !t.id) return;
    const ex = (DB.trackings || []).find(e => e.id === t.id);
    if(ex){ if(maj(ex, t)) majs++; }
    else { DB.trackings.push({ ...t }); nouveaux++; }
    const c = (DB.contacts || []).find(x => (x.email||'').toLowerCase() === String(t.email||'').toLowerCase());
    if(c){
      if(!c.history) c.history = [];
      const h = c.history.find(e => e.id === t.id);
      if(h) maj(h, t); else c.history.push({ ...t });
    }
  });
  DB.trackings.sort((a, b) => String(b.date||'').localeCompare(String(a.date||'')));
  return { nouveaux, majs };
}
let _suiviEmailsCharge = 0;
async function rafraichirSuiviEmails(force, intervalleMs = 5 * 60 * 1000){
  if(!force && Date.now() - _suiviEmailsCharge < intervalleMs) return null;
  _suiviEmailsCharge = Date.now();
  try{
    const tk = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const resp = await fetch('/api/brevo-tracking?t=' + Date.now(), { headers: { 'Authorization': 'Bearer ' + tk } });
    if(!resp.ok) return null;
    const res = fusionnerSuiviEmails(await resp.json());
    if(res.nouveaux || res.majs){ saveToStorage(); }
    renderTracking();
    return res;
  }catch(e){ return null; }
}
function renderTracking(){
  const statColor={'Envoyé':'#888','Ouvert':'#3B6D11','Cliqué':'#1A5FA8','Répondu':'#854F0B','Sans suite':'#A32D2D'};
  const box=document.getElementById('tracking-list');
  if(!box) return;
  const tries=(DB.trackings||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  box.innerHTML=tries.length?tries.slice(0,20).map(t=>`<div class="tracking-item" style="cursor:pointer" onclick="openFicheByEmail('${(t.email||'').replace(/'/g,"\\'")}')">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:11px;font-weight:600">${esc(t.contact||t.email||'—')}</span>
      <span><span class="t-dot" style="background:${statColor[t.statut]||'#888'}"></span><span style="font-size:10px;color:var(--text2)">${esc(t.statut)}${t.opens?' · '+t.opens+' ouv.':''}${t.clicks?' · '+t.clicks+' clic'+(t.clicks>1?'s':''):''}</span></span>
    </div>
    <div style="font-size:10px;color:var(--text2)">${esc(t.objet||'—')}</div>
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
// Les modèles TEMPLATES contiennent des placeholders {{SOCIETE}} et
// {{AVIS_GOOGLE_LIEN}} (jamais "EDL IDF" en dur) : substitués ici avec
// l'identité du compte connecté, au moment où le modèle est appliqué (donc
// toujours à jour, contrairement à une valeur figée à la définition de
// TEMPLATES qui capturerait un CFG pas encore synchronisé au chargement).
function remplacerPlaceholdersModele(texte){
  const societe = CFG.companyName || CFG.expediteurNom || 'notre entreprise';
  const lienAvis = CFG.avisGoogleLien || "[votre lien d'avis Google — à renseigner dans Paramètres]";
  return texte.split('{{SOCIETE}}').join(societe).split('{{AVIS_GOOGLE_LIEN}}').join(lienAvis);
}
function applyTpl(key){
  const t=TEMPLATES[key];
  document.getElementById('subj-f').value=remplacerPlaceholdersModele(t.subj);
  document.getElementById('body-f').value=remplacerPlaceholdersModele(t.body);
}

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

  // Multi-destinataires : séparer par virgule, point-virgule, espace ou retour ligne.
  // Chaque destinataire recevra un email individuel (pas de liste visible).
  const destinataires = to.split(/[,;\s\n]+/).map(e=>e.trim()).filter(e=>e);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalides = destinataires.filter(e=>!emailRegex.test(e));
  if(invalides.length){
    notify('⚠️ Adresse(s) invalide(s) : '+invalides.join(', '),'warn');
    return;
  }
  if(destinataires.length===0){ notify('⚠️ Aucun destinataire valide','warn'); return; }

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
      <div style="font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">${destinataires.length>1?destinataires.length+' destinataires':'À : '+destinataires[0]} — ${subj}</div>
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

  // ── Envoi réel (boucle sur tous les destinataires) ──
  const now=new Date();
  const _tk3=(await supabaseClient.auth.getSession()).data?.session?.access_token||'';
  let nbOk=0, nbErr=0;

  notify(`📤 Envoi en cours… (${destinataires.length} destinataire${destinataires.length>1?'s':''})`);

  for(let i=0;i<destinataires.length;i++){
    const dest=destinataires[i];
    const destLower=dest.toLowerCase();
    const entry={
      id:'email_'+Date.now()+'_'+i,
      contact:dest.includes('@')?dest.split('@')[0]:dest,
      email:destLower,
      objet:subj,
      corps:body,
      date:new Date().toISOString(),
      statut:'Envoyé'
    };

    try{
      const payload={
        sender:{name:'EDL IDF',email:'contact@edl-idf.com'},
        to:[{email:dest}],
        subject:subj,
        htmlContent:`<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${body.replace(/\n/g,'<br>')}${genererSignatureEmail()}</div>`,
        textContent:body,
        headers:{'X-CRM-ID':entry.id}
      };
      if(_attachData && _attachName){
        payload.attachment=[{content:_attachData, name:_attachName}];
        entry.objet += ' 📎';
      }
      const resp=await fetch('/api/send-email',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+_tk3},
        body:JSON.stringify(payload)
      });
      if(resp.status===200||resp.status===201){
        entry.statut='Envoyé (Brevo)';
        nbOk++;
      } else {
        const errText=await resp.text();
        console.log('Brevo error pour '+dest+':', errText);
        entry.statut='Erreur';
        nbErr++;
      }
    } catch(e){
      console.log('Send error pour '+dest+':', e);
      entry.statut='Erreur';
      nbErr++;
    }

    // Logger dans le tracking global
    DB.trackings.unshift(entry);
    // Classer dans la fiche contact si trouvé
    const contact=DB.contacts.find(c=>(c.email||'').toLowerCase()===destLower);
    if(contact){
      if(!contact.history)contact.history=[];
      contact.history.unshift(entry);
      contact.lastContact=now.toISOString().split('T')[0];
      contact.moyenContact='📧 Email';
    }

    // Petit délai entre chaque envoi (anti-spam / ménager Brevo), sauf le dernier
    if(i < destinataires.length-1){
      await new Promise(r=>setTimeout(r, 400));
    }
  }

  // Bilan
  if(nbErr===0){
    notify(`✅ ${nbOk} email${nbOk>1?'s':''} envoyé${nbOk>1?'s':''} via Brevo — tracking actif !`);
  } else {
    notify(`⚠️ ${nbOk} envoyé(s), ${nbErr} en erreur — vérifie la console`,'warn');
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
