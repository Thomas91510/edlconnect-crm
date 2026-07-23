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
        <img src="data:image/png;base64,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" alt="EDL IDF" style="width:160px;height:auto;display:block">
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