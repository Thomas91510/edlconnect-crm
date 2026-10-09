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
  // Accroche affichée à côté du nom de la société dans les emails
  // (bandeau, signature, modèles) — « Expert en État des Lieux » par défaut.
  get slogan(){const v=localStorage.getItem('edl_slogan');return v===null?'Expert en État des Lieux':v;},
  set slogan(v){localStorage.setItem('edl_slogan',v);},
  get expediteurPartenaire(){return localStorage.getItem('edl_exp_partenaire')||'';},
  set expediteurPartenaire(v){localStorage.setItem('edl_exp_partenaire',v);},
  get avisGoogleLien(){return localStorage.getItem('edl_avis_google_lien')||'';},
  set avisGoogleLien(v){localStorage.setItem('edl_avis_google_lien',v);},
  // Couleur de marque de l'agence (Paramètres) — recolore le CRM, l'espace
  // agent et la page publique de réservation. #1A5FA8 = bleu par défaut.
  get couleurPrimaire(){return localStorage.getItem('edl_couleur_primaire')||'#1A5FA8';},
  set couleurPrimaire(v){localStorage.setItem('edl_couleur_primaire',v);},
  // Chemin de stockage du logo (bucket public "agency-logos") — vide si
  // aucun logo déposé, auquel cas le logo Lokentia par défaut reste affiché.
  get logoPath(){return localStorage.getItem('edl_logo_path')||'';},
  set logoPath(v){localStorage.setItem('edl_logo_path',v);},
  // Identité légale de l'agence — destinataire des factures des agents.
  get legalRaisonSociale(){return localStorage.getItem('edl_legal_raison')||'';},
  set legalRaisonSociale(v){localStorage.setItem('edl_legal_raison',v);},
  get legalAdresse(){return localStorage.getItem('edl_legal_adresse')||'';},
  set legalAdresse(v){localStorage.setItem('edl_legal_adresse',v);},
  get legalRcs(){return localStorage.getItem('edl_legal_rcs')||'';},
  set legalRcs(v){localStorage.setItem('edl_legal_rcs',v);},
  get legalSiret(){return localStorage.getItem('edl_legal_siret')||'';},
  set legalSiret(v){localStorage.setItem('edl_legal_siret',v);},
  get legalTvaIntra(){return localStorage.getItem('edl_legal_tva')||'';},
  set legalTvaIntra(v){localStorage.setItem('edl_legal_tva',v);},
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

// Colonnes affichées dans le tableau de prospection (refonte V2) : chaque
// colonne regroupe une ou plusieurs étapes de PROSP_STAGES.
const COLONNES_PIPELINE=[
  {key:'a_contacter', label:'À contacter',          etapes:['a_contacter']},
  {key:'discussion',  label:'En discussion',        etapes:['email_envoye','email_ouvert','reponse_recue']},
  {key:'rdv',         label:'RDV planifié',         etapes:['rdv_planifie']},
  {key:'devis',       label:'Devis & négociation',  etapes:['devis_envoye','negociation']},
  {key:'gagne',       label:'Gagné',                etapes:['gagne']}
];
const COLONNE_PERDUS={key:'perdu',label:'Perdu',etapes:['perdu']};
let _afficherPerdus=false;
function colonneSuivante(cle){
  const i=COLONNES_PIPELINE.findIndex(c=>c.key===cle);
  return i>=0&&i<COLONNES_PIPELINE.length-1?COLONNES_PIPELINE[i+1]:null;
}
function basculerProspectsPerdus(){ _afficherPerdus=!_afficherPerdus; renderProspection(); }

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

function renderProspection(){
  // Stats rapides
  const stats=document.getElementById('prosp-stats');
  const total=DB.prospects.length;
  const gagnes=DB.prospects.filter(p=>p.etape==='gagne').length;
  const actifs=DB.prospects.filter(p=>!['gagne','perdu'].includes(p.etape)).length;
  const taux=total>0?Math.round(gagnes/total*100):0;
  const caTotal=DB.prospects.filter(p=>p.etape==='gagne'&&p.ca).reduce((s,p)=>s+(p.ca||0),0);
  const chip=(val,lib,coul)=>`<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:10px 16px;font-size:13px;color:var(--text2)"><span style="font-weight:600;font-size:18px;color:${coul||'var(--text)'};margin-right:6px">${val}</span>${lib}</div>`;
  stats.innerHTML=chip(total,'prospects')+chip(actifs,'en cours','var(--blue)')+chip(gagnes,'gagnés','var(--green)')+chip(taux+' %','de conversion')
    +(caTotal>0?chip(caTotal.toLocaleString('fr-FR')+' €','/ mois gagnés','var(--green)'):'');

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
  // Refonte V2 : 5 colonnes au lieu de 9. Les étapes détaillées restent
  // enregistrées telles quelles (p.etape, cron de relance, CA pondéré) ;
  // seules les colonnes les regroupent, l'étape précise s'affichant en
  // étiquette sur la carte. "Perdu" est replié sous le tableau.
  const colonnes = COLONNES_PIPELINE.concat(_pStage==='perdu'||_afficherPerdus ? [COLONNE_PERDUS] : []);
  board.innerHTML=colonnes.map(col=>{
    const cards=_filtered.filter(p=>col.etapes.includes(p.etape));
    const suivante=colonneSuivante(col.key);
    return `<section class="prosp-col" aria-label="${esc(col.label)}">
      <div class="prosp-col-title">
        <span style="color:var(--text)">${esc(col.label)}</span>
        <span style="color:var(--text2);font-weight:500">${cards.length}</span>
      </div>
      ${cards.map(p=>{
        const jStagnation=['gagne','perdu'].includes(p.etape)?null:joursDepuis(p.lastAction||p.createdAt);
        const stagnant=jStagnation!==null&&jStagnation>=STAGNATION_JOURS;
        const st=PROSP_STAGES.find(x=>x.key===p.etape)||PROSP_STAGES[0];
        return `<article class="prosp-card" onclick="openProspCard('${esc(p.id)}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
          <div class="prosp-card-name" style="flex:1">${esc(p.agence)}</div>
          <button type="button" onclick="event.stopPropagation();deleteProspect('${esc(p.id)}')" title="Supprimer ce prospect" aria-label="Supprimer ${esc(p.agence)}"
            style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px;padding:0 2px;line-height:1;flex-shrink:0"><i class="ti ti-x"></i></button>
        </div>
        ${p.contact?`<div style="font-size:12px;color:var(--text2)">${esc(p.contact)}</div>`:''}
        <div class="prosp-card-email">${esc(p.email||p.tel||'—')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          ${col.etapes.length>1?`<span class="badge" style="background:var(--blue-bg);color:var(--blue)">${esc(st.label)}</span>`:''}
          ${stagnant?`<span class="badge" style="background:var(--amber-bg);color:var(--amber-text)">${jStagnation} j sans action</span>`:''}
          ${p.ca?`<span class="badge b-green">${p.ca.toLocaleString('fr-FR')} €/mois</span>`:''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid #F0F1F3">
          <span class="prosp-card-date">${p.lastAction?'Dernier contact : '+fmtDate(p.lastAction):'Aucun contact'}</span>
          <span style="display:flex;gap:4px">
            <button type="button" onclick="event.stopPropagation();emailProspect('${esc(p.id)}')" title="Écrire un email" aria-label="Écrire à ${esc(p.agence)}" class="btn btn-sm" style="height:28px;padding:0 8px"><i class="ti ti-mail"></i></button>
            ${suivante?`<button type="button" onclick="event.stopPropagation();moveProspect('${esc(p.id)}','${suivante.etapes[0]}')" title="Passer à : ${esc(suivante.label)}" class="btn btn-sm" style="height:28px;padding:0 8px"><i class="ti ti-arrow-right"></i></button>`:''}
          </span>
        </div>
      </article>`;
      }).join('')}
      <button type="button" onclick="quickAddProspect('${col.etapes[0]}')"
        style="width:100%;font-size:12.5px;height:36px;border:1px dashed var(--border2);background:none;border-radius:var(--radius);cursor:pointer;color:var(--text2);margin-top:2px">
        + Ajouter
      </button>
    </section>`;
  }).join('');
  const nbPerdus=DB.prospects.filter(p=>p.etape==='perdu').length;
  const lienPerdus=document.getElementById('prosp-perdus-toggle');
  if(lienPerdus){
    lienPerdus.style.display=nbPerdus&&_pStage!=='perdu'?'':'none';
    lienPerdus.textContent=_afficherPerdus?'Masquer les prospects perdus':`Afficher les prospects perdus (${nbPerdus})`;
  }

  // Badge nav : nombre de prospects qui stagnent (alerte actionnable), pas le
  // total des prospects actifs (devenu illisible et sans utilité depuis la
  // fusion des pipelines, ex. "2563").
  const badge=document.getElementById('prosp-badge');
  const nbStagnants=prospectsStagnants().length;
  if(nbStagnants>0){badge.style.display='inline';badge.textContent=nbStagnants;}
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
  const suggestBox=document.getElementById('pp-agence-suggest');
  if(suggestBox){ suggestBox.style.display='none'; }
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

// Suggère les agences déjà connues (fiches contact existantes) pendant la
// saisie d'un prospect, pour rattacher la carte à sa fiche au lieu de
// créer un doublon non lié — même pattern que l'autocomplete des missions
// (autocompleteMission, app-agenda.js).
function autocompleteProspectAgence(val){
  const box=document.getElementById('pp-agence-suggest');
  if(!val||val.length<2){if(box)box.style.display='none';return;}
  const q=val.toLowerCase();
  const matches=DB.contacts.filter(c=>(c.entreprise||'').toLowerCase().includes(q)||(c.contact||'').toLowerCase().includes(q)).slice(0,6);
  if(!matches.length){if(box)box.style.display='none';return;}
  if(box){
    box.style.display='block';
    box.innerHTML=matches.map(c=>`<div onclick="selectProspectContact('${esc(c.id)}')" style="padding:7px 10px;cursor:pointer;font-size:11px;border-bottom:0.5px solid var(--border)" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''"><div style="font-weight:600">${esc(c.entreprise||c.contact)}</div><div style="color:var(--text2);font-size:10px">${esc(c.email||'')} ${c.tel?'· '+esc(c.tel):''}</div></div>`).join('');
  }
}
function selectProspectContact(id){
  const c=DB.contacts.find(x=>x.id===id);if(!c)return;
  document.getElementById('pp-agence').value=c.entreprise||c.contact||'';
  document.getElementById('pp-contact').value=c.contact||'';
  document.getElementById('pp-email').value=c.email||'';
  document.getElementById('pp-tel').value=c.tel||'';
  const box=document.getElementById('pp-agence-suggest');if(box)box.style.display='none';
  // Prévisualiser tout de suite le rattachement, comme dans openProspCard.
  const lienBox=document.getElementById('pp-lien-contact');
  if(lienBox){
    lienBox.style.display='block';
    lienBox.innerHTML=`<button type="button" class="btn btn-sm" onclick="closeModal('modal-prosp');openFiche('${c.id}')" style="width:100%;justify-content:center">
      <i class="ti ti-address-book"></i> Voir la fiche contact — ${esc(c.entreprise||c.contact||'')}
    </button>`;
  }
}

function openProspCard(id){
  const p=DB.prospects.find(x=>x.id===id);
  if(!p)return;
  const etape=keyToEtape(p.etape);

  const suggestBox=document.getElementById('pp-agence-suggest');
  if(suggestBox){ suggestBox.style.display='none'; }
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

// Les modèles ci-dessous sont partagés par tous les abonnés du CRM (pas
// seulement EDL IDF) : {{SOCIETE}}, {{SOCIETE_ACCROCHE}} (« Société —
// Expert en État des Lieux ») et {{AVIS_GOOGLE_LIEN}} sont substitués
// par applyTpl() avec l'identité propre au compte connecté (Paramètres →
// "Identité de vos emails"), jamais avec des valeurs figées en dur.
// Mise en forme à l'envoi (js/app-emails.js, emailHtmlPro) : une ligne
// finissant par « : » devient un intertitre, les lignes « • » une liste.
const TEMPLATES={
  intro:{label:'Présentation de votre société',subj:'🏠 {{SOCIETE_ACCROCHE}} — vos états des lieux, sans y passer vos journées',body:`Bonjour,\n\nGérer les états des lieux en plus des visites, des signatures et des relances : c'est souvent là que les journées d'une agence débordent. C'est précisément ce que {{SOCIETE_ACCROCHE}} prend en charge.\n\n🏠 Ce que nous réalisons pour vous :\n• États des lieux d'entrée et de sortie, meublés ou non\n• Pré-états des lieux avant départ du locataire\n• Rapports photos détaillés, signés électroniquement sur place\n\n⚡ Ce qui change pour votre agence :\n• Un créneau en 48 h, y compris le samedi\n• Le rapport dans votre boîte mail le jour même\n• Un interlocuteur unique qui connaît vos dossiers\n\n📞 Je vous propose un échange de 15 minutes pour voir si nous pouvons vous faire gagner du temps dès ce mois-ci. Quel créneau vous conviendrait ?`},
  cold:{label:'Premier contact',subj:'📋 Vos états des lieux, rapport remis le jour même — {{SOCIETE}}',body:`Bonjour,\n\nAvez-vous déjà envisagé de confier vos états des lieux à un prestataire dédié ?\n\n{{SOCIETE}} réalise vos EDL d'entrée, de sortie et vos pré-états des lieux, avec un rapport photo signé électroniquement et transmis le jour même. Expert en État des Lieux, c'est notre seul métier.\n\n✅ En pratique :\n• Mise en place immédiate, sans engagement\n• Créneaux disponibles en 48 h\n• Tarifs dégressifs selon votre volume\n\n📞 Seriez-vous disponible cette semaine pour un appel de 15 minutes ?`},
  followup:{label:'Relance',subj:'🔔 Re : vos états des lieux — {{SOCIETE_ACCROCHE}}',body:`Bonjour,\n\nJe me permets de revenir vers vous au sujet de mon précédent message sur la prise en charge de vos états des lieux.\n\nSi le sujet n'est pas prioritaire en ce moment, aucun souci : dites-le-moi simplement et je ne vous relancerai pas. 👍 S'il l'est, je peux vous envoyer notre grille tarifaire ou vous appeler au moment qui vous arrange.\n\n💬 Qu'est-ce qui vous serait le plus utile ?`},
  devis:{label:'Devis',subj:'💶 Votre proposition tarifaire — {{SOCIETE_ACCROCHE}}',body:`Bonjour,\n\nComme convenu, voici notre proposition pour la prise en charge de vos états des lieux.\n\n💶 Tarifs (HT, TVA 20 % en sus) :\n• État des lieux d'entrée : à partir de 150 € HT\n• État des lieux de sortie : à partir de 160 € HT\n• Pré-état des lieux : à partir de 120 € HT\n\n🎁 Remises partenaires :\n• Dès 5 missions par mois : -5 %\n• Dès 10 missions par mois : -10 %\n• Au-delà de 20 missions : tarif sur mesure\n\n✅ Inclus dans chaque mission :\n• Rapport photo détaillé transmis le jour même\n• Signature électronique des parties\n• Créneaux 6 jours sur 7\n\nJe reste à votre disposition pour ajuster cette proposition à vos volumes.`},
  confirm_pec:{label:'Prise en charge',subj:'✅ Prise en charge confirmée — état des lieux du [DATE]',body:`Bonjour,\n\nNous prenons en charge votre demande d'état des lieux. 👍\n\n📅 Rendez-vous :\n• Date : [JOUR] [DATE]\n• Heure : [HEURE]\n• Adresse : [ADRESSE]\n\n📩 Vous recevrez une confirmation la veille, et le rapport complet le jour même de l'intervention.`},
  confirm_entrant:{label:'Confirmation EDL d\'entrée',subj:"🔑 Confirmation — état des lieux d'entrée du [DATE]",body:`Bonjour,\n\nVotre état des lieux d'entrée est confirmé. ✅\n\n📅 Rendez-vous :\n• Date : [DATE]\n• Heure : [HEURE]\n• Adresse : [ADRESSE]\n\n🔑 À prévoir pour le jour J :\n• Les clés du logement\n• Le bail signé\n• L'accès aux compteurs (eau, gaz, électricité)\n\n📄 Le rapport photo, signé par les parties, vous sera transmis le jour même.`},
  confirm_sortant:{label:'Confirmation EDL de sortie',subj:'🚪 Confirmation — état des lieux de sortie du [DATE]',body:`Bonjour,\n\nVotre état des lieux de sortie est confirmé. ✅\n\n📅 Rendez-vous :\n• Date : [DATE]\n• Heure : [HEURE]\n• Adresse : [ADRESSE]\n\n🔑 À prévoir pour le jour J :\n• L'état des lieux d'entrée, pour la comparaison\n• L'ensemble des clés du logement\n• La présence du locataire sortant, si possible\n\n📄 Vous recevrez le jour même un rapport comparatif signé, avec les éventuelles dégradations relevées pièce par pièce.`},
  remerciement:{label:'Remerciement',subj:'🙏 Merci pour votre confiance — {{SOCIETE_ACCROCHE}}',body:`Bonjour,\n\nMerci de nous avoir confié votre état des lieux. 🙏 Le rapport vous a été transmis et reste disponible à tout moment dans votre espace.\n\n💬 Une question sur le rapport, ou un prochain dossier à planifier ? Répondez simplement à ce message : nous nous en occupons.\n\nAu plaisir de travailler à nouveau ensemble.`},
  partenariat:{label:'Proposition de partenariat',subj:'🤝 Une proposition de partenariat — {{SOCIETE_ACCROCHE}}',body:`Bonjour,\n\nPlusieurs agences nous confient aujourd'hui l'ensemble de leurs états des lieux. Je souhaitais vous proposer le même fonctionnement.\n\n🤝 Ce que comprend le partenariat :\n• Tarifs préférentiels selon votre volume\n• Créneaux prioritaires, y compris en période de forte rotation\n• Un interlocuteur dédié à votre agence\n• Un espace en ligne pour commander et retrouver tous vos rapports\n• Une facturation mensuelle unique\n\n📅 Pouvons-nous en parler lors d'un court rendez-vous, à l'agence ou par téléphone ?`},
  // Reprend l'email envoyé automatiquement à J+1 par reminder-rdv.js, pour
  // les locataires dont la mission n'est pas dans le CRM.
  avis_google:{label:'Demande d\'avis Google',subj:'⭐ Comment s\'est passé votre état des lieux ?',body:`Bonjour,\n\nMerci de nous avoir accueillis pour votre état des lieux. 🙏 Chez {{SOCIETE}}, chaque retour compte : il nous aide à améliorer nos prestations et permet à d'autres de nous découvrir.\n\nAuriez-vous une minute pour partager votre expérience sur Google ?\n\n⭐ {{AVIS_GOOGLE_LIEN}}\n\nMerci d'avance, et n'hésitez pas à nous écrire pour toute question.\n\nBien cordialement,`},
  // Équivalent de la relance automatique à J+3.
  avis_google_relance:{label:'Relance avis Google',subj:'⭐ Votre avis compte pour nous',body:`Bonjour,\n\nNous revenons vers vous au sujet de votre récent état des lieux. Si vous n'avez pas encore eu l'occasion de laisser un avis, votre retour nous serait précieux — il ne prend qu'une minute :\n\n⭐ {{AVIS_GOOGLE_LIEN}}\n\nSi c'est déjà fait, un grand merci 🙏, et ne tenez pas compte de ce message.\n\nBien cordialement,`},
  summer:{label:'Offre saisonnière',subj:'☀️ Été 2026 : -10 % sur vos états des lieux — {{SOCIETE}}',body:`Bonjour,\n\nL'été arrive, et avec lui le pic des entrées et sorties de locataires. ☀️ Pour vous aider à l'absorber sereinement, nous proposons une offre dédiée.\n\n🎁 L'offre été 2026 :\n• -10 % sur toutes vos missions de juillet à août\n• Créneaux disponibles tout l'été, samedi compris\n• Rapport transmis le jour même\n\n📅 Offre valable pour tout partenariat signé avant le 30 juin. Souhaitez-vous réserver vos premiers créneaux dès maintenant ?`},
  // Version texte de l'annonce des créneaux en ligne (campagne Brevo).
  nouveaute_creneaux:{label:'Nouveauté : créneaux en ligne',subj:'🗓️ Nouveau : choisissez vous-même le créneau de vos états des lieux',body:`Bonjour,\n\nBonne nouvelle pour votre agenda 🎉 : notre formulaire de demande affiche désormais nos disponibilités réelles, en direct.\n\n⚡ Ce que ça change pour vous :\n• Vous voyez immédiatement les créneaux libres et choisissez le vôtre\n• Une demande complète en un seul passage, sans aller-retour par email\n• Une prise en charge plus rapide de chaque dossier\n\nLe reste ne change pas : mêmes informations à renseigner, et un accusé de réception immédiat. Si aucun créneau ne vous convient, vous pouvez toujours proposer une date libre.\n\nBien cordialement,`}
};

// ─── Modèles rapides : présentation par usage ─────────────
// Rendu dans le Composer (Emails › Écrire) par renderModelesRapides().
const GROUPES_MODELES = [
  { titre: 'Prospection', couleur: '#1A5FA8', modeles: [
    { cle: 'intro', icone: 'ti-building-store', desc: 'Présenter votre société à une agence' },
    { cle: 'cold', icone: 'ti-send', desc: 'Premier message court, appel à 15 min' },
    { cle: 'followup', icone: 'ti-refresh', desc: 'Relancer sans insister' },
    { cle: 'partenariat', icone: 'ti-heart-handshake', desc: 'Proposer un partenariat durable' },
    { cle: 'summer', icone: 'ti-sun', desc: 'Offre de saison à durée limitée' },
    { cle: 'nouveaute_creneaux', icone: 'ti-calendar-event', desc: 'Annoncer la réservation en ligne' },
  ]},
  { titre: 'Missions', couleur: '#0F6E56', modeles: [
    { cle: 'devis', icone: 'ti-receipt', desc: 'Grille tarifaire et remises' },
    { cle: 'confirm_pec', icone: 'ti-circle-check', desc: 'Confirmer la prise en charge' },
    { cle: 'confirm_entrant', icone: 'ti-door-enter', desc: 'Rendez-vous et pièces à prévoir' },
    { cle: 'confirm_sortant', icone: 'ti-door-exit', desc: 'Rendez-vous et comparatif de sortie' },
  ]},
  { titre: 'Fidélisation', couleur: '#B7791F', modeles: [
    { cle: 'remerciement', icone: 'ti-heart', desc: 'Remercier après la mission' },
    { cle: 'avis_google', icone: 'ti-star', desc: 'Demander un avis Google' },
    { cle: 'avis_google_relance', icone: 'ti-star-half', desc: 'Relancer la demande d\'avis' },
  ]},
];

function renderModelesRapides(){
  const box = document.getElementById('modeles-rapides');
  if(!box) return;
  box.innerHTML = GROUPES_MODELES.map(g => `<div class="modeles-groupe">
      <div class="modeles-groupe-titre" style="color:${g.couleur}">${g.titre}</div>
      ${g.modeles.filter(m => TEMPLATES[m.cle]).map(m => `<button type="button" class="modele-carte" data-tpl="${m.cle}" onclick="applyTpl('${m.cle}')" title="${TEMPLATES[m.cle].subj.replace(/"/g, '&quot;')}">
        <span class="modele-icone" style="background:${g.couleur}14;color:${g.couleur}"><i class="ti ${m.icone}"></i></span>
        <span class="modele-texte"><b>${TEMPLATES[m.cle].label}</b><span>${m.desc}</span></span>
      </button>`).join('')}
    </div>`).join('');
}

document.addEventListener('DOMContentLoaded', function(){
  setTimeout(renderModelesRapides, 0);
});

// ─── STATE ────────────────────────────────────────────────
