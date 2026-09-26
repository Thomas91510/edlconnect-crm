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
  // Nom de société : sert aussi de repli pour le nom d'expéditeur des
  // emails (cf. identiteAbonne() côté serveur) quand expediteurNom est vide.
  get companyName(){return localStorage.getItem('edl_co_name')||'EDL IDF';},
  set companyName(v){localStorage.setItem('edl_co_name',v);},
  // ── Profil de l'abonne ──
  get userName(){return localStorage.getItem('edl_user_name')||'';},
  set userName(v){localStorage.setItem('edl_user_name',v);},
  get userEmail(){return localStorage.getItem('edl_user_email')||'';},
  set userEmail(v){localStorage.setItem('edl_user_email',v);},
  // ── Identite d'envoi des emails (marque blanche) ──
  // Ces cles correspondent exactement a celles ecrites par
  // loadSettingsFromSupabase() dans app-cloud.js : sans ces accesseurs,
  // loadSettingsForm() lisait undefined et laissait les champs vides,
  // puis saveSettings() ecrasait les valeurs enregistrees par du vide.
  get expediteurNom(){return localStorage.getItem('edl_exp_nom')||'';},
  set expediteurNom(v){localStorage.setItem('edl_exp_nom',v);},
  get expediteurEmail(){return localStorage.getItem('edl_exp_email')||'';},
  set expediteurEmail(v){localStorage.setItem('edl_exp_email',v);},
  get expediteurTel(){return localStorage.getItem('edl_exp_tel')||'';},
  set expediteurTel(v){localStorage.setItem('edl_exp_tel',v);},
  get expediteurSignature(){return localStorage.getItem('edl_exp_signature')||'';},
  set expediteurSignature(v){localStorage.setItem('edl_exp_signature',v);},
  get expediteurPartenaire(){return localStorage.getItem('edl_exp_partenaire')||'';},
  set expediteurPartenaire(v){localStorage.setItem('edl_exp_partenaire',v);},
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

// proba : chance de signature estimée à ce stade du pipeline (%), utilisée
// pour le CA pondéré (renderCAPanel). Valeurs par défaut raisonnables pour
// une activité d'EDL — à ajuster ici si l'expérience terrain donne d'autres taux.
const PROSP_STAGES=[
  {key:'a_contacter',label:'À contacter',color:'#888780',bg:'#F1F0EC',proba:5},
  {key:'email_envoye',label:'Email envoyé',color:'#1A5FA8',bg:'#F4F7FA',proba:10},
  {key:'email_ouvert',label:'Email ouvert',color:'#378ADD',bg:'#EAF3FB',proba:20},
  {key:'reponse_recue',label:'Réponse reçue',color:'#639922',bg:'#EAF3DE',proba:35},
  {key:'rdv_planifie',label:'RDV planifié',color:'#854F0B',bg:'#FAEEDA',proba:50},
  {key:'devis_envoye',label:'Devis envoyé',color:'#5B3DA5',bg:'#EEEDFE',proba:65},
  {key:'negociation',label:'Négociation',color:'#B45309',bg:'#FEF3E2',proba:80},
  {key:'gagne',label:'Gagné ✅',color:'#3B6D11',bg:'#D6EDCA',proba:100},
  {key:'perdu',label:'Perdu ❌',color:'#A32D2D',bg:'#FCEBEB',proba:0}
];

// Nombre de jours sans action au-delà duquel une carte active (pas
// Gagné/Perdu) est considérée comme stagnante (alerte dashboard + badge kanban).
const STAGNATION_JOURS=14;

function joursDepuis(dateISO){
  if(!dateISO)return null;
  const d=new Date(dateISO);
  if(isNaN(d))return null;
  return Math.floor((Date.now()-d.getTime())/(24*60*60*1000));
}

function prospectsStagnants(){
  return DB.prospects.filter(p=>{
    if(['gagne','perdu'].includes(p.etape))return false;
    const j=joursDepuis(p.lastAction||p.createdAt);
    return j!==null&&j>=STAGNATION_JOURS;
  });
}

// Correspondance label → key
function etapeToKey(etape){
  const map={'À contacter':'a_contacter','Email envoyé':'email_envoye','Email ouvert':'email_ouvert','Réponse reçue':'reponse_recue','RDV planifié':'rdv_planifie','Devis envoyé':'devis_envoye','Négociation':'negociation','Gagné':'gagne','Perdu':'perdu'};
  return map[etape]||'a_contacter';
}
function keyToEtape(key){
  const map={a_contacter:'À contacter',email_envoye:'Email envoyé',email_ouvert:'Email ouvert',reponse_recue:'Réponse reçue',rdv_planifie:'RDV planifié',devis_envoye:'Devis envoyé',negociation:'Négociation',gagne:'Gagné',perdu:'Perdu'};
  return map[key]||'À contacter';
}

// Le kanban (9 étapes) est plus large que la plupart des écrans : on ne
// peut pas le faire défiler en cliquant-glissant à la souris nativement
// (contrairement au doigt sur mobile), donc on rejoue le même geste avec
// mousedown/mousemove. Lié une seule fois (dataset.dragBound) car
// renderProspection() ne fait que réécrire le innerHTML des colonnes, pas
// #prosp-board lui-même : les listeners posés ici survivent aux rendus suivants.
function initProspBoardDragScroll(board){
  if(!board||board.dataset.dragBound)return;
  board.dataset.dragBound='1';
  let down=false,startX=0,startScroll=0,moved=false;
  board.addEventListener('mousedown',e=>{
    if(e.target.closest('button,a,input,select,textarea'))return;
    down=true;moved=false;board.classList.add('dragging');
    startX=e.clientX;startScroll=board.scrollLeft;
  });
  window.addEventListener('mouseup',()=>{down=false;board.classList.remove('dragging');});
  window.addEventListener('mousemove',e=>{
    if(!down)return;
    const dx=e.clientX-startX;
    if(Math.abs(dx)>5)moved=true;
    board.scrollLeft=startScroll-dx;
  });
  // Empeche le clic d'ouvrir une carte quand le mousedown/mouseup a servi
  // a glisser le kanban (capture : intercepte avant l'onclick de la carte).
  board.addEventListener('click',e=>{
    if(moved){e.preventDefault();e.stopPropagation();moved=false;}
  },true);
}

function renderProspection(){
  initProspBoardDragScroll(document.getElementById('prosp-board'));
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
      ${cards.map(p=>{
        const jStagnation=['gagne','perdu'].includes(p.etape)?null:joursDepuis(p.lastAction||p.createdAt);
        const stagnant=jStagnation!==null&&jStagnation>=STAGNATION_JOURS;
        return `<div class="prosp-card" onclick="openProspCard('${p.id}')" style="${stagnant?'border:1px solid var(--red)':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px">
          <div class="prosp-card-name" style="flex:1">${p.agence}</div>
          <button onclick="event.stopPropagation();deleteProspect('${p.id}')" title="Supprimer ce prospect"
            style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px;padding:0;line-height:1;flex-shrink:0;opacity:0.6"
            onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6">✕</button>
        </div>
        ${p.contact?`<div style="font-size:10px;color:var(--text2)">${p.contact}</div>`:''}
        <div class="prosp-card-email">${p.email||p.tel||'—'}</div>
        ${p.ca?`<div style="font-size:11px;font-weight:600;color:#3B6D11;margin-top:2px">${p.ca.toLocaleString('fr-FR')} €/mois</div>`:''}
        ${stagnant?`<div style="font-size:10px;font-weight:600;color:var(--red);margin-top:2px">⏱ ${jStagnation}j sans action</div>`:''}
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
      </div>`;
      }).join('')}
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
  const lienBox=document.getElementById('pp-lien-contact');
  if(lienBox){ lienBox.style.display='none'; lienBox.innerHTML=''; }
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

  // CA pondéré : montant × probabilité de signature de l'étape actuelle,
  // sur tous les prospects actifs (pas seulement Gagné) — donne une
  // estimation de CA à venir, pas juste le CA déjà signé.
  const actifsAvecCA=DB.prospects.filter(p=>!['gagne','perdu'].includes(p.etape)&&p.ca>0);
  const actifsSansCA=DB.prospects.filter(p=>!['gagne','perdu'].includes(p.etape)&&!p.ca).length;
  const probaEtape=key=>{const s=PROSP_STAGES.find(s=>s.key===key);return s?s.proba:0;};
  const caPondereMensuel=actifsAvecCA.reduce((s,p)=>s+(p.ca||0)*probaEtape(p.etape)/100,0);
  const elPM=document.getElementById('ca-pondere-mensuel');
  if(elPM){
    elPM.innerHTML=`${Math.round(caPondereMensuel).toLocaleString('fr-FR')} € <span style="font-size:12px;color:#888">HT</span>`;
    document.getElementById('ca-pondere-trim').innerHTML=`${Math.round(caPondereMensuel*3).toLocaleString('fr-FR')} € <span style="font-size:12px;color:#888">HT</span>`;
    document.getElementById('ca-pondere-annuel').innerHTML=`${Math.round(caPondereMensuel*12).toLocaleString('fr-FR')} € <span style="font-size:12px;color:#888">HT</span>`;
    document.getElementById('ca-pondere-note').textContent=actifsSansCA>0
      ? `Estimation sur ${actifsAvecCA.length} prospect(s) en cours avec CA renseigné — ${actifsSansCA} autre(s) sans CA renseigné, non comptabilisé(s)`
      : `Estimation sur ${actifsAvecCA.length} prospect(s) en cours, pondérée par la probabilité de signature de chaque étape`;
  }

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
      notify(`✅ "${p.agence}" marqué Gagné — ${p.ca.toLocaleString('fr-FR')} €/mois`);
    }
  }
  // Si passage à Perdu → garder une trace du motif (au lieu de la suppression
  // pure qui existait dans l'ancien pipeline "deals", sans aucun historique).
  if(newEtape==='perdu'){
    const motif=prompt(`Pourquoi "${p.agence}" est-il perdu ?\n(optionnel — laisser vide si inconnu)`);
    if(motif) p.motifPerte=motif.trim();
  }
  saveToStorage();
  if(newEtape!=='gagne'&&newEtape!=='perdu') notify(`✅ Déplacé vers "${keyToEtape(newEtape)}"`);
  renderProspection();
  renderDashboard();
}

// Une agence qui n'avait encore aucune mission vient d'en obtenir une : elle
// vient de devenir cliente, sa carte passe automatiquement en "Gagné" (ou
// est créée si elle n'existait pas encore dans le pipeline) — sans ressaisie
// manuelle. Appelée juste après DB.missions.push(mission) aux 3 endroits qui
// créent une mission (app-agenda.js, app-reservations.js x2).
//
// Ne reporte jamais le montant de CETTE mission (un tarif ponctuel d'EDL) sur
// le CA mensuel estimé du prospect : ce sont deux grandeurs différentes (un
// seul EDL n'est pas une récurrence mensuelle) — le champ "ca" reste à
// renseigner à la main si besoin, via l'Analyse CA, comme pour un passage
// manuel en "Gagné".
function notifierPremiereMissionAgence(mission){
  if(!mission || !mission.agence) return;
  const agenceNorm=mission.agence.trim().toLowerCase();
  if(!agenceNorm) return;
  const missionsAgence=DB.missions.filter(m=>(m.agence||'').trim().toLowerCase()===agenceNorm);
  if(missionsAgence.length>1) return; // pas la première mission de cette agence

  const order=PROSP_STAGES.map(s=>s.key);
  const rangGagne=order.indexOf('gagne');
  const emailNorm=(mission.emailClient||'').trim().toLowerCase();
  let prospect=emailNorm?DB.prospects.find(p=>(p.email||'').trim().toLowerCase()===emailNorm):null;
  if(!prospect) prospect=DB.prospects.find(p=>(p.agence||'').trim().toLowerCase()===agenceNorm);

  if(prospect){
    if(order.indexOf(prospect.etape)>=rangGagne) return; // déjà Gagné, ou Perdu explicitement
    prospect.etape='gagne';
    prospect.lastAction=new Date().toISOString().split('T')[0];
  } else {
    prospect={
      id:'p_'+Date.now(),
      agence:mission.agence, contact:mission.contact||'', email:mission.emailClient||'',
      tel:'', dept:'', etape:'gagne', ca:null,
      notes:'Carte créée automatiquement à la première mission enregistrée',
      source:'Première mission', createdAt:new Date().toISOString(),
      lastAction:new Date().toISOString().split('T')[0]
    };
    DB.prospects.push(prospect);
  }
  saveToStorage();
  if(typeof pushToSupabase==='function') pushToSupabase('prospects', prospect);
  if(typeof renderProspection==='function') renderProspection();
  notify(`🎉 "${mission.agence}" ajouté au pipeline commercial — Gagné`);
}

// Retrouve la fiche contact correspondant à un prospect (même email, en
// priorité, sinon même nom d'agence) — les deux collections ne sont pas
// reliées par un identifiant commun, seulement par ces champs en pratique.
function _contactLiePourProspect(p){
  if(p.email){
    const parEmail=DB.contacts.find(c=>c.email&&c.email.toLowerCase()===p.email.toLowerCase());
    if(parEmail)return parEmail;
  }
  if(p.agence){
    return DB.contacts.find(c=>c.entreprise&&c.entreprise.toLowerCase()===p.agence.toLowerCase());
  }
  return null;
}

function openProspCard(id){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p)return;
  const etape=keyToEtape(p.etape);

  const lienBox=document.getElementById('pp-lien-contact');
  const contactLie=_contactLiePourProspect(p);
  if(lienBox){
    if(contactLie){
      lienBox.style.display='block';
      lienBox.innerHTML=`<button type="button" class="btn btn-sm" onclick="closeModal('modal-prosp');openFiche('${contactLie.id}')" style="width:100%;justify-content:center">
        <i class="ti ti-address-book"></i> Voir la fiche contact — ${esc(contactLie.entreprise||contactLie.contact||'')}
      </button>`;
    } else {
      lienBox.style.display='none';
      lienBox.innerHTML='';
    }
  }

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
        const order = PROSP_STAGES.map(s => s.key);
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
    const order=PROSP_STAGES.map(s => s.key);
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
      const order=PROSP_STAGES.map(s => s.key);
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
    const order=PROSP_STAGES.map(s => s.key);
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
const MONTHS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

// Lien de la fiche Google Business, partage par les modeles d'avis et par
// les envois automatiques J+1 / J+3 (reminder-rdv.js).
const LIEN_AVIS_GOOGLE = 'https://g.page/r/CQOIf5lzL3xwEBM/review';

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
  // Reprend mot pour mot l'email envoye automatiquement a J+1 par
  // reminder-rdv.js, pour les locataires dont la mission n'est pas dans le CRM.
  avis_google:{label:'⭐ Avis Google post-prestation',subj:'⭐ Comment s\'est passé votre état des lieux ?',body:`Bonjour,\n\nChez EDL IDF, nous accordons une grande importance à la qualité de nos prestations et à la satisfaction des personnes que nous accompagnons. Votre retour est précieux : il nous permet d'améliorer continuellement nos services.\n\nSi vous avez quelques instants, pourriez-vous partager votre expérience sur notre page Google ? Cela ne prend que quelques minutes et nous aide énormément :\n\n⭐ ${LIEN_AVIS_GOOGLE}\n\nN'hésitez pas si vous avez la moindre question, nous restons à votre entière disposition.\n\nBien cordialement,\nL'équipe EDL IDF`},
  // Equivalent de la relance automatique a J+3.
  avis_google_relance:{label:'⭐ Avis Google — relance',subj:'⭐ Votre avis compte pour nous',body:`Bonjour,\n\nNous nous permettons de revenir vers vous au sujet de l'état des lieux réalisé récemment. Si vous n'avez pas encore eu l'occasion de nous laisser un avis, votre retour nous serait très précieux : il ne prend qu'une minute et nous aide beaucoup à faire connaître notre travail.\n\n⭐ ${LIEN_AVIS_GOOGLE}\n\nSi vous l'avez déjà fait, nous vous en remercions sincèrement et vous prions d'ignorer ce message.\n\nBien cordialement,\nL'équipe EDL IDF`},
  summer:{label:'☀️ Offre estivale',subj:'☀️ Offre été 2026 — -10% sur vos EDL | EDL IDF',body:`Bonjour,\n\nL'été approche et avec lui le pic d'activité pour vos états des lieux !\n\n🎁 Offre spéciale été 2026 :\n-10% sur toutes vos missions de juillet à août 2026\n\n✅ Valable pour tout nouveau partenariat signé avant le 30 juin\n✅ Disponible 7j/7 tout l'été\n✅ Rapport remis sous 24h\n\nRéservez dès maintenant vos créneaux sur www.edl-idf.fr`},
  // Version texte brut de l'annonce des creneaux Cal.com envoyee en campagne
  // Brevo (bandeau bleu, encart colore...) — pratique pour un renvoi ponctuel
  // depuis une fiche contact, la mise en forme visuelle restant reservee a
  // l'envoi groupe.
  nouveaute_creneaux:{label:'🗓️ Créneaux en ligne (nouveauté)',subj:'🗓️ Nouveau : ne perdez plus de temps à trouver une date pour vos états des lieux',body:`Bonjour,\n\nUne nouveauté qui va vous faire gagner du temps au quotidien : notre formulaire de demande d'état des lieux affiche désormais nos disponibilités réelles, en direct. Fini les échanges d'emails pour trouver une date qui convienne des deux côtés — vous voyez immédiatement nos créneaux libres et choisissez celui qui vous arrange.\n\n⏱️ Ce que ça change concrètement pour votre agence :\n• Plus besoin d'attendre notre retour pour savoir si une date vous convient : les créneaux affichés sont réellement disponibles\n• Une demande complète en un seul passage sur le formulaire, sans aller-retour par email ou téléphone\n• Une prise en charge plus rapide de vos dossiers, dès la première visite du formulaire\n\nLe reste ne change pas : même formulaire, mêmes informations à renseigner, et un accusé de réception immédiat par email. Si aucun créneau ne vous convient, vous pouvez toujours indiquer une date libre comme auparavant.\n\nN'hésitez pas si vous avez la moindre question, nous restons à votre entière disposition.\n\nBien cordialement,\nL'équipe EDL IDF`}
};

// ─── Boutons de modeles ajoutes apres coup ────────────────
// Injectes en JavaScript plutot que dans index.html : ce fichier fait
// ~2400 lignes et l'editer directement s'est deja avere risque.
// Chaque entree cible le bouton existant apres lequel s'inserer.
const MODELES_SUPPLEMENTAIRES = [
  { cle: 'avis_google_relance', apres: 'avis_google', icone: 'ti-star' },
  { cle: 'nouveaute_creneaux', apres: 'avis_google_relance', icone: 'ti-calendar-event' }
];

function injecterBoutonsModeles(){
  MODELES_SUPPLEMENTAIRES.forEach(function(mod){
    const tpl = TEMPLATES[mod.cle];
    if(!tpl) return;
    // Deja injecte ? (renderTracking peut relancer plusieurs fois)
    if(document.querySelector('[data-tpl="' + mod.cle + '"]')) return;
    const reference = document.querySelector('button[onclick*="applyTpl(\'' + mod.apres + '\')"]');
    if(!reference) return;
    const bouton = document.createElement('button');
    bouton.className = 'btn btn-sm';
    bouton.style.justifyContent = 'flex-start';
    bouton.setAttribute('data-tpl', mod.cle);
    bouton.innerHTML = '<i class="ti ' + mod.icone + '"></i>' + tpl.label.replace(/^[^\s]+\s/, '');
    bouton.onclick = function(){ applyTpl(mod.cle); };
    reference.parentNode.insertBefore(bouton, reference.nextSibling);
  });
}

document.addEventListener('DOMContentLoaded', function(){
  // Leger differe : les boutons du Composer sont dans index.html, deja
  // presents au chargement, mais on laisse le DOM se stabiliser.
  setTimeout(injecterBoutonsModeles, 300);
});

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
