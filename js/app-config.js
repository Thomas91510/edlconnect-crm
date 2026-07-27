// === Lokentia CRM — app-config.js ===
// Configuration, tarifs, HT/TTC, envoi Brevo, signature email
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

// ─── CONFIG ───────────────────────────────────────────────
// Les clés API sont stockées uniquement dans localStorage (jamais en dur ici)
const CFG={
  get notionToken(){return localStorage.getItem('edl_notion_token')||'';},
  set notionToken(v){localStorage.setItem('edl_notion_token',v);},
  get notionPageId(){return localStorage.getItem('edl_notion_page')||'';},
  set notionPageId(v){localStorage.setItem('edl_notion_page',v);},
  get brevoKey(){return localStorage.getItem('edl_brevo_key')||window._brevoKeyFromFile||'';},
  set brevoKey(v){localStorage.setItem('edl_brevo_key',v);},
  // ── Infos société pour la facturation ──
  get companyName(){return localStorage.getItem('edl_co_name')||'EDL IDF';},
  set companyName(v){localStorage.setItem('edl_co_name',v);},
  get companyAddress(){return localStorage.getItem('edl_co_address')||'18 Grande Rue, 91510 Lardy';},
  set companyAddress(v){localStorage.setItem('edl_co_address',v);},
  get companySiret(){return localStorage.getItem('edl_co_siret')||'';},
  set companySiret(v){localStorage.setItem('edl_co_siret',v);},
  get companyTva(){return localStorage.getItem('edl_co_tva')||'';},
  set companyTva(v){localStorage.setItem('edl_co_tva',v);},
  get companyCapital(){return localStorage.getItem('edl_co_capital')||'';},
  set companyCapital(v){localStorage.setItem('edl_co_capital',v);},
  get companyIban(){return localStorage.getItem('edl_co_iban')||'';},
  set companyIban(v){localStorage.setItem('edl_co_iban',v);},
  get companyBic(){return localStorage.getItem('edl_co_bic')||'';},
  set companyBic(v){localStorage.setItem('edl_co_bic',v);},
  get companyPaymentTerms(){return localStorage.getItem('edl_co_payterms')||'Paiement à réception de facture';},
  set companyPaymentTerms(v){localStorage.setItem('edl_co_payterms',v);},
  get companyLogo(){return localStorage.getItem('edl_co_logo')||'';}, // base64
  set companyLogo(v){localStorage.setItem('edl_co_logo',v);},
  get invoiceNextNumber(){return parseInt(localStorage.getItem('edl_invoice_next')||'1',10);},
  set invoiceNextNumber(v){localStorage.setItem('edl_invoice_next',String(v));},
  proxy:'https://api.allorigins.win/raw?url='
};

// ─── HT / TTC ─────────────────────────────────────────────
const TVA=0.20;
let taxMode='HT';
function ttc(m){return Math.round((m||0)*1.20*100)/100;}
function tva(m){return Math.round((m||0)*0.20*100)/100;}
function fmtHT(m){return (m||0).toLocaleString('fr-FR')+' € HT';}
function fmtTTC(m){return ttc(m).toLocaleString('fr-FR')+' € TTC';}
function fmtTVA(m){return tva(m).toLocaleString('fr-FR')+' €';}
function fmtMontant(m){return taxMode==='TTC'?fmtTTC(m):fmtHT(m);}
function toggleTaxMode(){
  taxMode=taxMode==='HT'?'TTC':'HT';
  const lbl=document.getElementById('ca-mode-label');
  if(lbl)lbl.textContent=taxMode;
  renderDashboard();
  if(document.getElementById('view-missions').classList.contains('active'))renderMissions();
  if(document.getElementById('ca-panel')?.style.display!=='none')renderCAPanel();
  notify(`Affichage en ${taxMode}`);
}

const PROSP_STAGES=[
  {key:'a_contacter',label:'À contacter',color:'#888780',bg:'#F1F0EC'},
  {key:'email_envoye',label:'Email envoyé',color:'#1A5FA8',bg:'#F4F7FA'},
  {key:'email_ouvert',label:'Email ouvert',color:'#378ADD',bg:'#EAF3FB'},
  {key:'reponse_recue',label:'Réponse reçue',color:'#639922',bg:'#EAF3DE'},
  {key:'rdv_planifie',label:'RDV planifié',color:'#854F0B',bg:'#FAEEDA'},
  {key:'devis_envoye',label:'Devis envoyé',color:'#5B3DA5',bg:'#EEEDFE'},
  {key:'gagne',label:'Gagné ✅',color:'#3B6D11',bg:'#D6EDCA'},
  {key:'perdu',label:'Perdu ❌',color:'#A32D2D',bg:'#FCEBEB'}
];

// Correspondance label → key
function etapeToKey(etape){
  const map={'À contacter':'a_contacter','Email envoyé':'email_envoye','Email ouvert':'email_ouvert','Réponse reçue':'reponse_recue','RDV planifié':'rdv_planifie','Devis envoyé':'devis_envoye','Gagné':'gagne','Perdu':'perdu'};
  return map[etape]||'a_contacter';
}
function keyToEtape(key){
  const map={a_contacter:'À contacter',email_envoye:'Email envoyé',email_ouvert:'Email ouvert',reponse_recue:'Réponse reçue',rdv_planifie:'RDV planifié',devis_envoye:'Devis envoyé',gagne:'Gagné',perdu:'Perdu'};
  return map[key]||'À contacter';
}

function renderProspection(){
  // Stats rapides
  const stats=document.getElementById('prosp-stats');
  const total=DB.prospects.length;
  const gagnes=DB.prospects.filter(p=>p.etape==='gagne').length;
  const actifs=DB.prospects.filter(p=>!['gagne','perdu'].includes(p.etape)).length;
  const taux=total>0?Math.round(gagnes/total*100):0;
  const caTotal=DB.prospects.filter(p=>p.etape==='gagne'&&p.ca).reduce((s,p)=>s+(p.ca||0),0);
  stats.innerHTML=`
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:12px"><span style="font-weight:600;font-size:16px">${total}</span> prospects</div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:12px"><span style="font-weight:600;font-size:16px;color:#1A5FA8">${actifs}</span> en cours</div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:12px"><span style="font-weight:600;font-size:16px;color:#3B6D11">${gagnes}</span> gagnés</div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;font-size:12px"><span style="font-weight:600;font-size:16px;color:#854F0B">${taux}%</span> taux conversion</div>
    ${caTotal>0?`<div style="background:var(--green-bg);border:1px solid var(--green);border-radius:var(--radius);padding:6px 12px;font-size:12px"><span style="font-weight:600;font-size:16px;color:var(--green)">${caTotal.toLocaleString('fr-FR')} €</span>/mois CA gagné</div>`:''}`;

  // Kanban
  const board=document.getElementById('prosp-board');
  const _pSearch=(document.getElementById('prosp-search')?.value||'').toLowerCase().trim();
  const _pStage=document.getElementById('prosp-stage-filter')?.value||'all';
  const _filtered=DB.prospects.filter(p=>{
    if(_pStage!=='all'&&p.etape!==_pStage)return false;
    if(_pSearch){
      const hay=(p.agence+' '+(p.contact||'')+' '+(p.email||'')+' '+(p.tel||'')+' '+(p.dept||'')).toLowerCase();
      if(!hay.includes(_pSearch))return false;
    }
    return true;
  });
  // Afficher le compteur et le bouton effacer
  const clearBtn=document.getElementById('prosp-clear-btn');
  const countEl=document.getElementById('prosp-search-count');
  if(_pSearch||_pStage!=='all'){
    if(clearBtn)clearBtn.style.display='inline-flex';
    if(countEl)countEl.textContent=`${_filtered.length} résultat${_filtered.length>1?'s':''}`;
  } else {
    if(clearBtn)clearBtn.style.display='none';
    if(countEl)countEl.textContent='';
  }
  board.innerHTML=PROSP_STAGES.map(stage=>{
    const cards=_filtered.filter(p=>p.etape===stage.key);
    return `<div class="prosp-col" style="border-top:3px solid ${stage.color}">
      <div class="prosp-col-title" style="color:${stage.color}">
        <span>${stage.label}</span>
        <span style="background:${stage.bg};color:${stage.color};padding:1px 6px;border-radius:8px;font-size:10px">${cards.length}</span>
      </div>
      ${cards.map(p=>`<div class="prosp-card" onclick="openProspCard('${p.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px">
          <div class="prosp-card-name" style="flex:1">${p.agence}</div>
          <button onclick="event.stopPropagation();deleteProspect('${p.id}')" title="Supprimer ce prospect"
            style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px;padding:0;line-height:1;flex-shrink:0;opacity:0.6"
            onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✕</button>
        </div>
        ${p.contact?`<div style="font-size:10px;color:var(--text2)">${p.contact}</div>`:''}
        <div class="prosp-card-email">${p.email||p.tel||'—'}</div>
        ${p.ca?`<div style="font-size:11px;font-weight:600;color:#3B6D11;margin-top:2px">${p.ca.toLocaleString('fr-FR')} €/mois</div>`:''}
        <div class="prosp-card-date">${p.lastAction?'Dernier : '+fmtDate(p.lastAction):'Aucun contact'}</div>
        <div style="display:flex;gap:3px;margin-top:5px;flex-wrap:wrap">
          ${PROSP_STAGES.filter(s=>s.key!==stage.key).slice(0,3).map(s=>`
            <button onclick="event.stopPropagation();moveProspect('${p.id}','${s.key}')" 
              title="Déplacer vers ${s.label}"
              style="font-size:9px;padding:2px 5px;border:0.5px solid ${s.color};background:${s.bg};color:${s.color};border-radius:3px;cursor:pointer;white-space:nowrap">
              → ${s.label.substring(0,10)}
            </button>`).join('')}
          <button onclick="event.stopPropagation();emailProspect('${p.id}')" 
            style="font-size:9px;padding:2px 5px;border:0.5px solid var(--blue);background:var(--blue-bg);color:var(--blue-text);border-radius:3px;cursor:pointer">
            ✉️ Email
          </button>
        </div>
      </div>`).join('')}
      <button onclick="quickAddProspect('${stage.key}')" 
        style="width:100%;font-size:10px;padding:5px;border:1px dashed var(--border2);background:none;border-radius:var(--radius);cursor:pointer;color:var(--text2);margin-top:2px">
        + Ajouter
      </button>
    </div>`;
  }).join('');

  // Badge nav
  const badge=document.getElementById('prosp-badge');
  if(actifs>0){badge.style.display='inline';badge.textContent=actifs;}
  else badge.style.display='none';
}

function saveProspect(){
  const agence=document.getElementById('pp-agence').value.trim();
  if(!agence){notify('⚠️ Agence requise','warn');return;}
  const etape=etapeToKey(document.getElementById('pp-etape').value);
  const ca=parseFloat(document.getElementById('pp-ca').value)||0;
  DB.prospects.push({
    id:'p_'+Date.now(),
    agence,
    contact:document.getElementById('pp-contact').value,
    email:document.getElementById('pp-email').value,
    tel:document.getElementById('pp-tel').value,
    dept:document.getElementById('pp-dept').value,
    etape,
    ca:ca||null,
    notes:document.getElementById('pp-notes').value,
    createdAt:new Date().toISOString(),
    lastAction:null
  });
  // Si Gagné, ajouter au pipeline commercial
  if(etape==='gagne'&&ca){
    DB.deals.push({id:'d_'+Date.now(),agence,montant:ca,etape:'Gagné',proba:100,notes:'Ajouté depuis prospection'});
  }
  saveToStorage();closeModal('modal-prosp');
  notify('✅ Prospect ajouté !');
  renderProspection();
  ['pp-agence','pp-contact','pp-email','pp-tel','pp-dept','pp-notes','pp-ca'].forEach(id=>document.getElementById(id).value='');
}

function quickAddProspect(etapeKey){
  // Vider tous les champs avant ouverture
  ['pp-agence','pp-contact','pp-email','pp-tel','pp-dept','pp-notes','pp-ca','pp-notes-short'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('pp-etape').value=keyToEtape(etapeKey);
  const btn=document.querySelector('#modal-prosp .btn-primary');
  btn.innerHTML='<i class="ti ti-check"></i>Enregistrer';
  btn.onclick=saveProspect;
  openModal('modal-prosp');
}

function toggleCAPanel(){
  const panel=document.getElementById('ca-panel');
  const isOpen=panel.style.display!=='none';
  panel.style.display=isOpen?'none':'block';
  if(!isOpen)renderCAPanel();
}

function renderCAPanel(){
  const gagnes=DB.prospects.filter(p=>p.etape==='gagne'&&p.ca>0);
  const caMensuelHT=gagnes.reduce((s,p)=>s+(p.ca||0),0);
  const caTriHT=caMensuelHT*3;
  const caAnnuelHT=caMensuelHT*12;

  document.getElementById('ca-mensuel').innerHTML=`${caMensuelHT.toLocaleString('fr-FR')} € <span style="font-size:12px;color:#888">HT</span><div style="font-size:13px;color:#1A5FA8;margin-top:2px">${fmtTTC(caMensuelHT)} TTC</div>`;
  document.getElementById('ca-trim').innerHTML=`${caTriHT.toLocaleString('fr-FR')} € <span style="font-size:12px;color:#888">HT</span><div style="font-size:13px;color:#1A5FA8;margin-top:2px">${fmtTTC(caTriHT)} TTC</div>`;
  document.getElementById('ca-annuel').innerHTML=`${caAnnuelHT.toLocaleString('fr-FR')} € <span style="font-size:12px;color:#888">HT</span><div style="font-size:13px;color:#1A5FA8;margin-top:2px">${fmtTTC(caAnnuelHT)} TTC</div>`;
  document.getElementById('ca-nb-clients').textContent=gagnes.length+' client(s) avec CA renseigné';
  document.getElementById('ca-total-mensuel').textContent=`${caMensuelHT.toLocaleString('fr-FR')} € HT | ${fmtTTC(caMensuelHT)} TTC`;
  document.getElementById('ca-total-annuel').textContent=`${caAnnuelHT.toLocaleString('fr-FR')} € HT | ${fmtTTC(caAnnuelHT)} TTC`;

  const sorted=gagnes.sort((a,b)=>(b.ca||0)-(a.ca||0));
  document.getElementById('ca-tbody').innerHTML=sorted.length?sorted.map(p=>`<tr>
    <td style="font-weight:600;font-size:12px">${p.agence}</td>
    <td style="font-size:12px;color:#3B6D11;font-weight:600">${(p.ca||0).toLocaleString('fr-FR')} € HT</td>
    <td style="font-size:11px;color:#1A5FA8">${fmtTTC(p.ca)}</td>
    <td style="font-size:12px">${((p.ca||0)*3).toLocaleString('fr-FR')} € HT</td>
    <td style="font-size:11px;color:#1A5FA8">${fmtTTC((p.ca||0)*3)}</td>
    <td style="font-size:12px">${((p.ca||0)*12).toLocaleString('fr-FR')} € HT</td>
    <td style="font-size:11px;color:var(--text2)">${fmtDate(p.lastAction)||'—'}</td>
    <td><button class="btn btn-sm" onclick="editCA('${p.id}')" title="Modifier le CA"><i class="ti ti-edit" style="font-size:11px"></i></button></td>
  </tr>`).join(''):'<tr><td colspan="8" class="empty">Aucun client gagné avec CA renseigné</td></tr>';

  updateObjectifs();
}

function editCA(id){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p)return;
  const ca=prompt(`Modifier le CA mensuel pour "${p.agence}" :\n(actuel : ${p.ca?p.ca.toLocaleString('fr-FR')+' €/mois':'non renseigné'})`,p.ca||'');
  if(ca===null)return;
  p.ca=parseFloat(ca.replace(',','.'))||0;
  // Mettre à jour aussi dans le pipeline commercial
  const deal=DB.deals.find(d=>d.agence===p.agence);
  if(deal&&p.ca)deal.montant=p.ca;
  saveToStorage();
  renderCAPanel();
  notify('✅ CA mis à jour !');
}

function updateObjectifs(){
  const objM=parseFloat(document.getElementById('obj-mensuel')?.value)||0;
  const objT=parseFloat(document.getElementById('obj-trim')?.value)||0;
  const objA=parseFloat(document.getElementById('obj-annuel')?.value)||0;

  if(objM)localStorage.setItem('edl_obj_mensuel',objM);
  if(objT)localStorage.setItem('edl_obj_trim',objT);
  if(objA)localStorage.setItem('edl_obj_annuel',objA);

  const gagnes=DB.prospects.filter(p=>p.etape==='gagne'&&p.ca>0);
  const caM=gagnes.reduce((s,p)=>s+(p.ca||0),0);
  const caT=caM*3;
  const caA=caM*12;

  const pctBar=(val,obj,label)=>{
    if(!obj)return '';
    const pct=Math.min(Math.round(val/obj*100),100);
    const color=pct>=100?'#3B6D11':pct>=70?'#1A5FA8':pct>=40?'#854F0B':'#A32D2D';
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
        <span>${label}</span>
        <span style="font-weight:600;color:${color}">${val.toLocaleString('fr-FR')} € / ${obj.toLocaleString('fr-FR')} € (${pct}%)</span>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width .4s"></div>
      </div>
    </div>`;
  };

  const prog=document.getElementById('objectifs-progress');
  if(prog){
    prog.innerHTML=pctBar(caM,objM,'📅 Mensuel')+pctBar(caT,objT,'📊 Trimestriel')+pctBar(caA,objA,'🏆 Annuel');
  }
}

function moveProspect(id,newEtape){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p)return;
  p.etape=newEtape;
  p.lastAction=new Date().toISOString().split('T')[0];
  // Si passage à Gagné → demander le CA
  if(newEtape==='gagne'){
    const ca=prompt(`🎉 Félicitations !\n\nQuel est le CA mensuel estimé pour "${p.agence}" ?\n(en €/mois — laisser vide si inconnu)`);
    if(ca&&!isNaN(parseFloat(ca.replace(',','.')))) {
      p.ca=parseFloat(ca.replace(',','.'));
      // Créer automatiquement une opportunité dans le pipeline commercial
      const existing=DB.deals.find(d=>d.agence===p.agence);
      if(!existing){
        DB.deals.push({
          id:'d_'+Date.now(),
          agence:p.agence,
          montant:p.ca,
          etape:'Gagné',
          proba:100,
          notes:`Converti depuis prospection le ${fmtDate(new Date().toISOString())}`
        });
        notify(`✅ "${p.agence}" ajouté au pipeline commercial — ${p.ca.toLocaleString('fr-FR')} €/mois`);
      }
    }
  }
  saveToStorage();
  if(newEtape!=='gagne') notify(`✅ Déplacé vers "${keyToEtape(newEtape)}"`);
  renderProspection();
  renderDashboard();
}

function openProspCard(id){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p)return;
  const etape=keyToEtape(p.etape);
  // Réutiliser modal-prosp en mode édition — remplir TOUS les champs
  document.getElementById('pp-agence').value      = p.agence        || '';
  document.getElementById('pp-contact').value     = p.contact       || '';
  document.getElementById('pp-email').value       = p.email         || '';
  document.getElementById('pp-tel').value         = p.tel           || '';
  document.getElementById('pp-dept').value        = p.dept          || '';
  document.getElementById('pp-notes').value       = p.notes         || '';
  document.getElementById('pp-etape').value       = etape;
  document.getElementById('pp-ca').value          = p.ca != null ? p.ca : '';
  document.getElementById('pp-notes-short').value = p.notesShort    || '';
  // Changer le bouton pour update
  const btn=document.querySelector('#modal-prosp .btn-primary');
  btn.innerHTML='<i class="ti ti-check"></i>Mettre à jour';
  btn.onclick=()=>{
    p.agence      = document.getElementById('pp-agence').value.trim();
    p.contact     = document.getElementById('pp-contact').value.trim();
    p.email       = document.getElementById('pp-email').value.trim();
    p.tel         = document.getElementById('pp-tel').value.trim();
    p.dept        = document.getElementById('pp-dept').value.trim();
    p.notes       = document.getElementById('pp-notes').value.trim();
    p.notesShort  = document.getElementById('pp-notes-short').value.trim();
    p.etape       = etapeToKey(document.getElementById('pp-etape').value);
    p.ca          = parseFloat(document.getElementById('pp-ca').value.replace(',','.'))||null;
    p.lastAction  = new Date().toISOString().split('T')[0];
    saveToStorage();closeModal('modal-prosp');
    btn.innerHTML='<i class="ti ti-check"></i>Enregistrer';btn.onclick=saveProspect;
    notify('✅ Prospect mis à jour !');renderProspection();renderDashboard();
  };
  openModal('modal-prosp');
}

function filterProspection(val){
  renderProspection();
}

function clearProspSearch(){
  const si=document.getElementById('prosp-search');
  const sf=document.getElementById('prosp-stage-filter');
  if(si)si.value='';
  if(sf)sf.value='all';
  renderProspection();
}

function deleteProspect(id){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p)return;
  if(!confirm(`Supprimer ce prospect ?\n\n"${p.agence}"${p.contact?' · '+p.contact:''}\n\nCette action est irréversible.`))return;
  DB.prospects=DB.prospects.filter(x=>x.id!==id);
  saveToStorage();
  deleteFromSupabase('prospects', id);
  notify('🗑️ Prospect supprimé');
  renderProspection();
}

function emailProspect(id){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p||!p.email){notify('⚠️ Pas d\'email pour ce prospect','warn');return;}
  // Déplacer vers "Email envoyé"
  p.etape='email_envoye';
  p.lastAction=new Date().toISOString().split('T')[0];
  saveToStorage();
  // Ouvrir le composer avec l'email pré-rempli
  nav('compose');
  setTimeout(()=>{
    document.getElementById('to-f').value=p.email;
    document.getElementById('subj-f').value=`📋 EDL IDF — ${p.agence}`;
    notify(`✅ Prospect déplacé vers "Email envoyé"`);
    renderProspection();
  },150);
}

// ─── SYNC DEPUIS OUTIL ENVOI BREVO ───────────────────────
async function syncFromBrevoSender(){
  setSyncStatus('loading');
  notify('Chargement crm_sync.json…');

  let entries = [];
  try {
    const resp = await fetch('/api/crm-sync?t=' + Date.now());
    if (!resp.ok) throw new Error('Fichier non trouvé');
    entries = await resp.json();
  } catch(e) {
    notify('⚠️ crm_sync.json introuvable — place le fichier dans le dossier CRM puis réessaie','warn');
    setSyncStatus('error');
    // Fallback : sync depuis les contacts existants
    autoFillAllContacts();
    return;
  }

  if (!entries.length) {
    notify('crm_sync.json vide — envoie des emails depuis l\'outil Brevo d\'abord','warn');
    setSyncStatus('ok');
    return;
  }

  let added = 0, updated = 0;
  const existingEmails = new Set(DB.prospects.map(p => (p.email||'').toLowerCase()));

  for (const entry of entries) {
    const email = (entry.email||'').toLowerCase().trim();
    if (!email) continue;

    // Chercher dans les contacts existants pour enrichir
    const contact = DB.contacts.find(c => (c.email||'').toLowerCase() === email);
    const agence  = contact?.entreprise || entry.entreprise || email.split('@')[0];
    const nom     = contact?.contact    || entry.contact    || '';

    if (existingEmails.has(email)) {
      // Mettre à jour le statut si progression
      const p = DB.prospects.find(x => (x.email||'').toLowerCase() === email);
      if (p) {
        const order = ['a_contacter','email_envoye','email_ouvert','reponse_recue','rdv_planifie','devis_envoye','gagne','perdu'];
        if (order.indexOf('email_envoye') > order.indexOf(p.etape)) {
          p.etape = 'email_envoye';
          p.lastAction = entry.date?.split('T')[0] || new Date().toISOString().split('T')[0];
          updated++;
        }
      }
    } else {
      DB.prospects.push({
        id        : 'p_brevo_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
        agence,
        contact   : nom,
        email     : entry.email,
        tel       : contact?.tel || '',
        dept      : contact?.dept || '',
        etape     : 'email_envoye',
        notes     : entry.objet ? `Email envoyé : "${entry.objet}"` : '',
        source    : 'Envoi Brevo',
        createdAt : new Date().toISOString(),
        lastAction: entry.date?.split('T')[0] || new Date().toISOString().split('T')[0]
      });
      existingEmails.add(email);
      added++;
    }
  }

  // Dédoublonner
  const seen = new Set();
  DB.prospects = DB.prospects.filter(p => {
    const key = (p.email || p.agence || '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  saveToStorage();
  setSyncStatus('ok');
  notify(`✅ ${added} nouveaux prospects · ${updated} mis à jour depuis l'outil Brevo !`);
  renderProspection();
  renderDashboard();
}

function autoFillAllContacts(){
  console.log('Remplissage pipeline avec tous les contacts...');
  let created=0;

  // Index emails déjà dans prospects
  const existingEmails=new Set(DB.prospects.map(p=>(p.email||'').toLowerCase()));

  DB.contacts.forEach(c=>{
    const email=(c.email||'').toLowerCase();
    const key=email||c.entreprise;
    if(!key)return;
    if(email&&existingEmails.has(email))return;
    if(!email&&DB.prospects.find(p=>p.agence===c.entreprise))return;

    // Déterminer l'étape selon l'historique
    let etape='a_contacter';
    const order=['a_contacter','email_envoye','email_ouvert','reponse_recue','rdv_planifie','devis_envoye','gagne','perdu'];
    const statMap={'Envoyé (Brevo)':'email_envoye','Envoyé':'email_envoye','Ouvert':'email_ouvert','Cliqué':'email_ouvert','Répondu':'reponse_recue','Sans suite':'a_contacter'};
    let lastAction=null;

    (c.history||[]).forEach(h=>{
      const e=statMap[h.statut]||'email_envoye';
      if(order.indexOf(e)>order.indexOf(etape))etape=e;
      if(!lastAction||h.date>lastAction)lastAction=h.date?.split('T')[0];
    });

    // Vérifier aussi dans les trackings globaux
    if(email){
      DB.trackings.filter(t=>(t.email||'').toLowerCase()===email).forEach(t=>{
        const e=statMap[t.statut]||'email_envoye';
        if(order.indexOf(e)>order.indexOf(etape))etape=e;
        if(!lastAction||t.date>lastAction)lastAction=t.date?.split('T')[0];
      });
    }

    DB.prospects.push({
      id:'p_'+Date.now()+'_'+created,
      agence:c.entreprise||c.contact||email.split('@')[0],
      contact:c.contact||'',
      email:c.email||'',
      tel:c.tel||'',
      dept:c.dept||'',
      etape,
      notes:'',
      createdAt:new Date().toISOString(),
      lastAction
    });
    if(email)existingEmails.add(email);
    created++;
  });

  // Dédoublonner
  const seen=new Set();
  DB.prospects=DB.prospects.filter(p=>{
    const key=(p.email||p.agence||'').toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);return true;
  });

  saveToStorage();
  notify(`✅ ${DB.prospects.length} prospects chargés dans le pipeline !`);
  renderProspection();
}

function autoFillProspection(){
  let created=0;let updated=0;

  // 1. Depuis les trackings globaux
  DB.trackings.forEach(t=>{
    if(!t.email)return;
    const emailLow=(t.email||'').toLowerCase();
    const existing=DB.prospects.find(p=>(p.email||'').toLowerCase()===emailLow);
    const statMap={'Envoyé (Brevo)':'email_envoye','Envoyé':'email_envoye','Ouvert':'email_ouvert','Cliqué':'email_ouvert','Répondu':'reponse_recue','Sans suite':'a_contacter'};
    const newEtape=statMap[t.statut]||'email_envoye';
    if(existing){
      // Faire progresser seulement vers l'avant
      const order=['a_contacter','email_envoye','email_ouvert','reponse_recue','rdv_planifie','devis_envoye','gagne','perdu'];
      if(order.indexOf(newEtape)>order.indexOf(existing.etape)){
        existing.etape=newEtape;existing.lastAction=t.date?.split('T')[0];updated++;
      }
    } else {
      const contact=DB.contacts.find(c=>(c.email||'').toLowerCase()===emailLow);
      DB.prospects.push({
        id:'p_'+Date.now()+'_'+Math.random().toString(36).substr(2,5),
        agence:contact?.entreprise||t.contact||emailLow.split('@')[0],
        contact:contact?.contact||'',
        email:t.email,tel:contact?.tel||'',dept:contact?.dept||'',
        etape:newEtape,notes:'',
        createdAt:new Date().toISOString(),
        lastAction:t.date?.split('T')[0]||null
      });
      created++;
    }
  });

  // 2. Depuis l'historique emails de chaque contact
  DB.contacts.forEach(c=>{
    if(!(c.history&&c.history.length))return;
    const emailLow=(c.email||'').toLowerCase();
    if(!emailLow)return;
    const existing=DB.prospects.find(p=>(p.email||'').toLowerCase()===emailLow);
    // Trouver le meilleur statut dans l'historique
    const order=['a_contacter','email_envoye','email_ouvert','reponse_recue','rdv_planifie','devis_envoye','gagne','perdu'];
    const statMap={'Envoyé (Brevo)':'email_envoye','Envoyé':'email_envoye','Ouvert':'email_ouvert','Cliqué':'email_ouvert','Répondu':'reponse_recue','Sans suite':'a_contacter'};
    let bestEtape='email_envoye';
    let lastDate=null;
    c.history.forEach(h=>{
      const etape=statMap[h.statut]||'email_envoye';
      if(order.indexOf(etape)>order.indexOf(bestEtape))bestEtape=etape;
      if(!lastDate||h.date>lastDate)lastDate=h.date?.split('T')[0];
    });
    if(existing){
      if(order.indexOf(bestEtape)>order.indexOf(existing.etape)){
        existing.etape=bestEtape;if(lastDate)existing.lastAction=lastDate;updated++;
      }
    } else {
      DB.prospects.push({
        id:'p_'+Date.now()+'_'+Math.random().toString(36).substr(2,5),
        agence:c.entreprise||c.contact||emailLow.split('@')[0],
        contact:c.contact||'',email:c.email,tel:c.tel||'',dept:c.dept||'',
        etape:bestEtape,notes:'',
        createdAt:new Date().toISOString(),
        lastAction:lastDate
      });
      created++;
    }
  });

  // Dédoublonner par email
  const seen=new Set();
  DB.prospects=DB.prospects.filter(p=>{
    const key=(p.email||p.agence||'').toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);return true;
  });

  saveToStorage();
  notify(`✅ ${created} prospects créés, ${updated} mis à jour — pipeline synchronisé !`);
  renderProspection();
}
const STAGES=['Prospect','Qualifié','Proposé','Négociation','Gagné'];
const MONTHS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const TEMPLATES={
  intro:{label:'🏠 Présentation EDL IDF',subj:'🏠 EDL IDF — Votre partenaire états des lieux en Île-de-France',body:`Bonjour,\n\nJe me permets de vous contacter afin de vous présenter EDL IDF, société spécialisée dans la réalisation d'états des lieux professionnels pour les agences immobilières en Île-de-France.\n\n🏠 Nos prestations :\n• État des lieux d'entrée\n• État des lieux de sortie\n• Pré-état des lieux\n\n✅ Pourquoi choisir EDL IDF ?\n• Disponible 7j/7, matin et soir\n• Rapport numérique remis sous 24h\n• Signature électronique incluse\n• Tarifs dégressifs selon le volume\n• Couverture complète de l'Île-de-France\n\nJe serais ravi d'échanger avec vous sur vos besoins et de vous proposer une grille tarifaire adaptée.`},
  cold:{label:'📋 Prospection à froid',subj:'📋 Externalisez vos états des lieux — EDL IDF',body:`Bonjour,\n\nJe me permets de vous contacter au sujet de l'externalisation de vos états des lieux.\n\nEDL IDF réalise vos EDL entrants, sortants et pré-états des lieux en Île-de-France — rapport remis sous 24h, disponible 7j/7.\n\n✅ Simple à mettre en place\n✅ Tarifs dégressifs selon volume\n✅ Signature électronique incluse\n\nSeriez-vous disponible pour un échange de 15 min cette semaine ?`},
  followup:{label:'📞 Relance J+2',subj:'📞 Suite à mon email — EDL IDF',body:`Bonjour,\n\nJe reviens vers vous suite à mon email de l'avant-hier concernant nos prestations d'états des lieux professionnels.\n\nAvez-vous eu l'occasion d'y jeter un œil ? Je reste disponible pour un court échange téléphonique si vous souhaitez en savoir plus.\n\nN'hésitez pas à me faire signe !`},
  devis:{label:'💶 Devis',subj:'💶 Votre devis EDL IDF — États des lieux professionnels',body:`Bonjour,\n\nSuite à notre échange, veuillez trouver ci-dessous notre grille tarifaire :\n\n📋 TARIFS EDL IDF (prix en HT — TVA 20%)\n\n• État des lieux entrant — à partir de 150 € HT (180 € TTC)\n• État des lieux sortant — à partir de 160 € HT (192 € TTC)\n• Pré-état des lieux — à partir de 120 € HT (144 € TTC)\n\n🎁 Remises partenaires agences :\n• À partir de 5 missions/mois : -5%\n• À partir de 10 missions/mois : -10%\n• À partir de 20 missions/mois : sur devis\n\n✅ Rapport numérique remis sous 24h\n✅ Signature électronique incluse\n✅ Disponible 7j/7 en Île-de-France`},
    confirm_pec:{label:'📩 Confirmation prise en charge EDL',subj:'Confirmation de prise en charge EDL',body:`Bonjour,\n\nJe vous confirme la prise en charge de la mission pour l'état des lieux de sortie.\n\nLe rendez-vous est fixé le [JOUR] [DATE] à [HEURE].`},
  confirm_entrant:{label:'✅ Confirmation EDL entrant',subj:"✅ Confirmation de votre état des lieux d'entrée — EDL IDF",body:`Bonjour,\n\nJe vous confirme la prise en charge de votre état des lieux d'entrée :\n\n📅 Date : [DATE]\n🕐 Heure : [HEURE]\n📍 Adresse : [ADRESSE]\n\n🔑 Merci de prévoir :\n• Les clés du logement\n• Le bail de location signé\n• Les relevés de compteurs (eau, gaz, électricité)\n\nLe rapport vous sera transmis dans les 24h.`},
    confirm_sortant:{label:'✅ Confirmation EDL sortant',subj:'✅ Confirmation de votre état des lieux de sortie — EDL IDF',body:`Bonjour,\n\nJe vous confirme la prise en charge de votre état des lieux de sortie :\n\n📅 Date : [DATE]\n🕐 Heure : [HEURE]\n📍 Adresse : [ADRESSE]\n\n🔑 Merci de prévoir :\n• L'état des lieux d'entrée (pour comparaison)\n• L'ensemble des clés du logement\n• Les relevés de compteurs actualisés\n• Le locataire sortant (si possible)\n\nLe rapport comparatif vous sera transmis dans les 24h avec mention des éventuelles dégradations constatées et signature électronique des parties.`},
  remerciement:{label:'🙏 Remerciement après mission',subj:'🙏 Merci pour votre confiance — EDL IDF',body:`Bonjour,\n\nJe tenais à vous remercier pour la confiance que vous nous accordez.\n\nVotre état des lieux a été réalisé avec soin et le rapport vous a été transmis dans les délais convenus.\n\nNous espérons que cette prestation a répondu à vos attentes et restons à votre disposition pour toutes vos prochaines missions en Île-de-France.`},
  partenariat:{label:'🤝 Proposition partenariat',subj:'🤝 Partenariat états des lieux — EDL IDF',body:`Bonjour,\n\nJe souhaite vous proposer un partenariat durable pour la prise en charge de vos états des lieux en Île-de-France.\n\n🤝 Ce que nous proposons à nos partenaires :\n• Tarifs préférentiels dégressifs selon volume\n• Priorité de réservation sur nos créneaux\n• Interlocuteur dédié pour votre agence\n• Rapport standardisé à votre charte si souhaité\n• Facturation mensuelle groupée\n\n✅ Déjà partenaires d'agences Century 21, Orpi, Laforêt, Foncia en Île-de-France.\n\nSeriez-vous disponible pour un rendez-vous afin d'étudier ensemble les modalités d'un partenariat adapté ?`},
  avis_google:{label:'⭐ Avis Google post-prestation',subj:'⭐ Votre avis compte pour nous — EDL IDF',body:`Bonjour,\n\nNous espérons que votre état des lieux s'est déroulé à votre entière satisfaction !\n\nVotre retour est précieux pour nous aider à améliorer nos prestations et à faire connaître EDL IDF.\n\n⭐ Pourriez-vous nous laisser un avis Google en cliquant sur le lien ci-dessous ? Cela ne prend que 30 secondes :\n\n👉 [LIEN AVIS GOOGLE]\n\nMerci pour votre confiance et à très bientôt !`},
  summer:{label:'☀️ Offre estivale',subj:'☀️ Offre été 2026 — -10% sur vos EDL | EDL IDF',body:`Bonjour,\n\nL'été approche et avec lui le pic d'activité pour vos états des lieux !\n\n🎁 Offre spéciale été 2026 :\n-10% sur toutes vos missions de juillet à août 2026\n\n✅ Valable pour tout nouveau partenariat signé avant le 30 juin\n✅ Disponible 7j/7 tout l'été\n✅ Rapport remis sous 24h\n\nRéservez dès maintenant vos créneaux sur www.edl-idf.fr`}
};


// ─── SIGNATURE EMAIL ──────────────────────────────────────
const EMAIL_SIGNATURE = `
<br><br>
<div style="font-family:Arial,sans-serif;font-size:13px;color:#2345d4;border-top:2px solid #2345d4;padding-top:12px;margin-top:12px">
  <table cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding-right:16px;vertical-align:middle">
        <img src="https://lokentia.fr/logo-edl-idf-seul.png" alt="EDL IDF" style="width:160px;height:auto;display:block">
      </td>
      <td style="vertical-align:middle;padding-left:16px;border-left:1px solid #2345d4">
        <div style="font-weight:700;font-size:14px;color:#2345d4">Thomas LANGLADE</div>
        <div style="color:#333;font-size:12px">EDL IDF — Expert en État des lieux</div>
        <div style="margin-top:6px;font-size:12px;color:#555">
          📞 <a href="tel:+33189291429" style="color:#555;text-decoration:none">01 89 29 14 29</a><br>
          ✉️ <a href="mailto:contact@edl-idf.com" style="color:#2345d4;text-decoration:none">contact@edl-idf.com</a><br>
          📍 18 Grande Rue, 91510 LARDY<br>
          🌐 <a href="https://www.edl-idf.fr" style="color:#2345d4;text-decoration:none">www.edl-idf.fr</a>
        </div>
      </td>
    </tr>
  </table>
</div>`;

// ─── STATE ────────────────────────────────────────────────
