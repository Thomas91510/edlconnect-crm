// === Lokentia CRM — app-missions.js ===
// Missions et moteur de facturation
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

// ─── Repliage des groupes mensuels ────────────────────────────────────
// Avec plusieurs dizaines de missions par mois, la liste devient longue a
// parcourir. Chaque en-tete de mois est donc cliquable. Les mois revolus
// sont replies d'office : au chargement, on voit le mois courant et les
// suivants, c'est-a-dire ce qui reste a faire.
let _moisReplies = null; // Set des cles de mois fermees ; null = pas encore initialise

function cleMoisCourant(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Identifiant utilisable dans une classe CSS et un attribut HTML
function slugMois(cle){
  return String(cle).replace(/[^a-zA-Z0-9]/g, '_');
}

function toggleMoisMissions(cle){
  if(!_moisReplies) _moisReplies = new Set();
  if(_moisReplies.has(cle)) _moisReplies.delete(cle);
  else _moisReplies.add(cle);
  renderMissions();
}

function renderMissions(){
  const list=(UI.missionFilter==='all'?DB.missions:DB.missions.filter(m=>m.statut===UI.missionFilter))
    .slice()
    .sort((a,b)=>{
      const da=a.date?new Date(a.date).getTime():Infinity;
      const db=b.date?new Date(b.date).getTime():Infinity;
      return da-db;
    });

  if(!list.length){
    document.getElementById('missions-tbody').innerHTML='<tr><td colspan="10" class="empty">Aucune mission</td></tr>';
    return;
  }

  // Regroupement par mois (clé YYYY-MM, "Sans date" en dernier)
  const groups=new Map();
  list.forEach(m=>{
    let key='Sans date',label='Sans date';
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

  // Premier rendu : replier les mois deja passes, garder le mois courant
  // et les mois a venir ouverts.
  if(_moisReplies === null){
    _moisReplies = new Set();
    const courant = cleMoisCourant();
    groups.forEach((g, key) => {
      if(key !== 'Sans date' && key < courant) _moisReplies.add(key);
    });
  }

  document.getElementById('missions-tbody').innerHTML=[...groups.entries()].map(([key, group])=>{
    const totalHT=group.items.reduce((s,m)=>s+(m.montant||0),0);
    const totalTTC=group.items.reduce((s,m)=>s+ttc(m.montant||0),0);
    const replie=_moisReplies.has(key);
    const slug=slugMois(key);
    const chevron=replie?'▸':'▾';
    const header=`<tr style="background:var(--bg2);cursor:pointer" onclick="toggleMoisMissions('${key}')" title="${replie?'Afficher':'Masquer'} les missions de ${group.label}">
      <td colspan="10" style="font-weight:700;font-size:12px;padding:9px 10px">
        <span style="display:inline-block;width:14px;color:var(--text2);font-size:11px">${chevron}</span>📅 ${group.label} — ${group.items.length} mission${group.items.length>1?'s':''} · <span style="color:var(--blue)">${totalHT.toLocaleString('fr-FR')} € HT</span> · <span style="color:var(--green)">${totalTTC.toLocaleString('fr-FR')} € TTC</span>${replie?'<span style="color:var(--text3);font-weight:400;font-size:11px;margin-left:8px">(replié)</span>':''}
      </td></tr>`;
    if(replie) return header;
    const rows=group.items.map(m=>{
      const realIdx=DB.missions.indexOf(m);
      return `<tr class="mrow-${slug}">
      <td style="font-weight:600;font-size:11px">${m.agence}</td>
      <td style="font-size:10px;color:var(--text2)">${m.adresse||'—'}</td>
      <td style="font-size:10px">${m.type}</td>
      <td style="font-size:10px;color:var(--text2)">${[m.bienType,m.bienTypo,m.bienMeuble].filter(Boolean).join(' · ')||'—'}</td>
      <td style="font-size:11px">${fmtDT(m.date)}</td>
      <td style="font-weight:600;color:var(--blue)">${(m.montant||0).toLocaleString('fr-FR')} € <span style="font-size:9px;color:var(--text2)">HT</span></td>
      <td style="font-size:10px;color:var(--text2)">${fmtTVA(m.montant)}</td>
      <td style="font-weight:600;color:var(--green)">${fmtTTC(m.montant)}</td>
      <td>${statusBadge(m.statut)}</td>
      <td><select style="font-size:10px;padding:3px 5px;width:auto" onchange="updateMissionStatus(${realIdx},this.value)">
        ${['planifiée','en cours','terminée','facturée'].map(s=>`<option${s===m.statut?' selected':''}>${s}</option>`).join('')}
      </select></td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="openConfirmRdvModal('${m.id}')" title="Confirmer le RDV et envoyer les convocations" style="padding:3px 7px;background:var(--blue-bg);color:var(--blue-text);border-color:var(--blue)"><i class="ti ti-calendar-check" style="font-size:12px"></i></button>
        <button class="btn btn-sm" onclick="generateInvoice(${realIdx})" title="${m.invoiceNumber?'Re-télécharger la facture '+m.invoiceNumber:'Générer la facture'}" style="padding:3px 7px;${m.invoiceNumber?'color:var(--green-text);border-color:var(--green-text);background:var(--green-bg)':''}"><i class="ti ti-file-invoice" style="font-size:12px"></i></button>
        <button class="btn btn-sm" onclick="editMission(${realIdx})" title="Modifier" style="padding:3px 7px"><i class="ti ti-edit" style="font-size:12px"></i></button>
        <button class="btn btn-sm" onclick="deleteMission(${realIdx})" title="Supprimer" style="padding:3px 7px;color:var(--red-text);border-color:var(--red-text);background:var(--red-bg)"><i class="ti ti-trash" style="font-size:12px"></i></button>
      </td>
    </tr>`;}).join('');
    return header+rows;
  }).join('');
}
function filterMissions(f,btn){
  UI.missionFilter=f;
  document.querySelectorAll('#mission-filter-btns .btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderMissions();
}
function updateMissionStatus(i,v){DB.missions[i].statut=v;saveToStorage();notify('✅ Statut mis à jour');renderMissions();}
function deleteMission(i){
  const m=DB.missions[i];
  if(!m)return;
  if(!confirm(`Supprimer la mission "\n${m.agence} — ${m.type}\n${fmtDT(m.date)}\n\nCette action est irréversible."`))return;
  DB.missions.splice(i,1);
  saveToStorage();
  deleteFromSupabase('missions', m.id);
  notify('🗑️ Mission supprimée');
  renderMissions();
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════
// ─── FACTURATION — Moteur unifié (mission / mensuelle / particulier) ──
// ═══════════════════════════════════════════════════════════
function nextInvoiceNumber(){
  const year=new Date().getFullYear();
  const num=CFG.invoiceNextNumber;
  CFG.invoiceNextNumber=num+1;
  return `FACT-${year}-${String(num).padStart(4,'0')}`;
}

// Construit et télécharge le PDF à partir d'un objet facture générique
// invoice = {number, date, clientName, clientEmail, clientAddress, lineItems:[{designation, qty, puHT}]}
function renderInvoicePdf(invoice){
  if(typeof window.jspdf==='undefined'){notify('⚠️ Bibliothèque PDF non chargée — vérifie ta connexion internet','warn');return false;}
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const pageW=210, marginL=18, marginR=18;
  let y=18;

  // ── Logo / nom société ──
  if(CFG.companyLogo){
    try{
      const imgProps=doc.getImageProperties(CFG.companyLogo);
      const logoH=18, logoW=(imgProps.width/imgProps.height)*logoH;
      doc.addImage(CFG.companyLogo,'PNG',marginL,y,Math.min(logoW,50),logoH);
    }catch(e){
      doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(20,30,60);
      doc.text(CFG.companyName,marginL,y+8);
    }
  }else{
    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(20,30,60);
    doc.text(CFG.companyName,marginL,y+8);
  }

  // ── Coordonnées société (haut droite) ──
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(80,80,80);
  const coLines=[
    CFG.companyName,
    CFG.companyAddress,
    CFG.companySiret?`SIRET : ${CFG.companySiret}`:null,
    CFG.companyTva?`TVA intracom. : ${CFG.companyTva}`:null,
    CFG.companyCapital?`Capital social : ${CFG.companyCapital}`:null
  ].filter(Boolean);
  coLines.forEach((line,idx)=>doc.text(line,pageW-marginR,y+(idx*4.2),{align:'right'}));

  y=46;
  doc.setDrawColor(220,220,220);doc.line(marginL,y,pageW-marginR,y);
  y+=10;

  // ── Titre facture ──
  doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(20,30,60);
  doc.text('FACTURE',marginL,y);
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(60,60,60);
  doc.text(`N° ${invoice.number}`,marginL,y+7);
  doc.text(`Date d'émission : ${new Date(invoice.date).toLocaleDateString('fr-FR')}`,marginL,y+13);

  // ── Bloc client (droite) ──
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(20,30,60);
  doc.text('FACTURÉ À',pageW-marginR,y,{align:'right'});
  doc.setFont('helvetica','normal');doc.setTextColor(60,60,60);
  const clientLines=[invoice.clientName,invoice.clientEmail||null,invoice.clientAddress||null].filter(Boolean);
  clientLines.forEach((line,idx)=>doc.text(line,pageW-marginR,y+6+(idx*4.5),{align:'right'}));

  y+=Math.max(20,6+clientLines.length*4.5+8);

  // ── Tableau prestations (1 ou plusieurs lignes) ──
  doc.setFillColor(20,30,60);
  doc.rect(marginL,y,pageW-marginL-marginR,8,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(255,255,255);
  doc.text('DÉSIGNATION',marginL+3,y+5.5);
  doc.text('QTÉ',132,y+5.5);
  doc.text('PRIX U. HT',150,y+5.5);
  doc.text('TOTAL HT',pageW-marginR-3,y+5.5,{align:'right'});
  y+=8;

  let totalHT=0;
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(40,40,40);
  invoice.lineItems.forEach(li=>{
    const qty=li.qty||1, lineTotal=qty*(li.puHT||0);
    totalHT+=lineTotal;
    const desigLines=doc.splitTextToSize(li.designation||'',108);
    const rowH=Math.max(12,desigLines.length*4.5+6);
    doc.setDrawColor(230,230,230);
    doc.rect(marginL,y,pageW-marginL-marginR,rowH);
    doc.text(desigLines,marginL+3,y+6);
    doc.text(String(qty),132,y+6);
    doc.text(`${(li.puHT||0).toLocaleString('fr-FR')} €`,150,y+6);
    doc.text(`${lineTotal.toLocaleString('fr-FR')} €`,pageW-marginR-3,y+6,{align:'right'});
    y+=rowH;
  });
  y+=8;

  // ── Totaux ──
  const tvaAmt=tva(totalHT), ttcAmt=ttc(totalHT);
  const totW=70, totX=pageW-marginR-totW;
  doc.setFontSize(9);doc.setTextColor(60,60,60);
  doc.text('Total HT',totX,y);
  doc.text(`${totalHT.toLocaleString('fr-FR')} €`,pageW-marginR,y,{align:'right'});
  y+=6;
  doc.text('TVA (20%)',totX,y);
  doc.text(`${tvaAmt.toLocaleString('fr-FR')} €`,pageW-marginR,y,{align:'right'});
  y+=6;
  doc.setDrawColor(20,30,60);doc.line(totX,y,pageW-marginR,y);
  y+=6;
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(20,30,60);
  doc.text('Total TTC',totX,y);
  doc.text(`${ttcAmt.toLocaleString('fr-FR')} €`,pageW-marginR,y,{align:'right'});

  y+=18;
  if(y>250)y=250; // garde-fou si beaucoup de lignes

  // ── Conditions de paiement + IBAN ──
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(20,30,60);
  doc.text('Conditions de paiement',marginL,y);
  doc.setFont('helvetica','normal');doc.setTextColor(60,60,60);
  doc.text(CFG.companyPaymentTerms,marginL,y+5);
  y+=12;

  if(CFG.companyIban){
    doc.setFont('helvetica','bold');doc.setTextColor(20,30,60);
    doc.text('Coordonnées bancaires',marginL,y);
    doc.setFont('helvetica','normal');doc.setTextColor(60,60,60);
    doc.text(`IBAN : ${CFG.companyIban}`,marginL,y+5);
    if(CFG.companyBic) doc.text(`BIC : ${CFG.companyBic}`,marginL,y+10);
  }

  // ── Mentions légales obligatoires (bas de page) ──
  const legalY=270;
  doc.setDrawColor(230,230,230);doc.line(marginL,legalY-6,pageW-marginR,legalY-6);
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(120,120,120);
  const mentions=[
    "En cas de retard de paiement, une pénalité égale à 3 fois le taux d'intérêt légal sera appliquée (article L441-10 du Code de commerce),",
    "ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € (article D441-5 du Code de commerce). Aucun escompte pour paiement anticipé.",
    `${CFG.companyName} — SIRET ${CFG.companySiret||'—'} — TVA intracom. ${CFG.companyTva||'—'}${CFG.companyCapital?' — Capital social : '+CFG.companyCapital:''}`
  ];
  mentions.forEach((line,idx)=>doc.text(line,marginL,legalY+(idx*4)));

  doc.save(`${invoice.number}_${(invoice.clientName||'client').replace(/[^a-zA-Z0-9]/g,'_')}.pdf`);
  return true;
}

// ── Facture pour une seule mission (bouton dans la liste des missions) ──
function generateInvoice(i){
  const m=DB.missions[i];
  if(!m){notify('⚠️ Mission introuvable','warn');return;}

  let invoice=m.invoiceId?DB.invoices.find(inv=>inv.id===m.invoiceId):null;
  if(!invoice){
    invoice={
      id:'inv_'+Date.now(),
      number:nextInvoiceNumber(),
      date:new Date().toISOString(),
      type:'mission',
      clientName:m.agence,
      clientEmail:m.emailClient||'',
      clientAddress:m.adresse||'',
      missionIds:[m.id],
      lineItems:[{
        designation:`${m.type||'État des lieux'}${[m.bienType,m.bienTypo,m.bienMeuble].filter(Boolean).length?' — '+[m.bienType,m.bienTypo,m.bienMeuble].filter(Boolean).join(' '):''}${m.adresse?' — '+m.adresse:''}${m.date?' ('+new Date(m.date).toLocaleDateString('fr-FR')+')':''}`,
        qty:1, puHT:m.montant||0
      }]
    };
    DB.invoices.push(invoice);
    m.invoiceId=invoice.id;
    m.invoiceNumber=invoice.number;
    if(m.statut!=='facturée'){m.statut='facturée';}
  }

  if(renderInvoicePdf(invoice)){
    saveToStorage();
    syncDirtyToSupabase();
    notify(`✅ Facture ${invoice.number} générée`);
    renderMissions();
  }
}

// ── Facture mensuelle groupée (toutes les missions non-facturées d'un client sur un mois) ──
function generateMonthlyInvoiceFor(agence, yearMonth){
  // yearMonth format "YYYY-MM"
  if(!agence||!yearMonth){notify('⚠️ Client et mois requis','warn');return;}
  const [year,month]=yearMonth.split('-').map(Number);
  const candidates=DB.missions.filter(m=>{
    if((m.agence||'').trim().toLowerCase()!==agence.trim().toLowerCase())return false;
    if(m.invoiceId)return false; // déjà facturée individuellement ou dans un groupe précédent
    if(!m.date)return false;
    const d=new Date(m.date);
    return d.getFullYear()===year && (d.getMonth()+1)===month;
  });
  if(!candidates.length){
    notify('⚠️ Aucune mission non-facturée pour ce client sur ce mois','warn');
    return;
  }
  const contact=DB.contacts.find(c=>(c.entreprise||'').trim().toLowerCase()===agence.trim().toLowerCase());
  const invoice={
    id:'inv_'+Date.now(),
    number:nextInvoiceNumber(),
    date:new Date().toISOString(),
    type:'mensuelle',
    clientName:agence,
    clientEmail:contact?.email||candidates[0].emailClient||'',
    clientAddress:contact?.adresse||'',
    missionIds:candidates.map(m=>m.id),
    lineItems:candidates.map(m=>({
      designation:`${m.type||'État des lieux'}${[m.bienType,m.bienTypo,m.bienMeuble].filter(Boolean).length?' — '+[m.bienType,m.bienTypo,m.bienMeuble].filter(Boolean).join(' '):''}${m.adresse?' — '+m.adresse:''}${m.date?' ('+new Date(m.date).toLocaleDateString('fr-FR')+')':''}`,
      qty:1, puHT:m.montant||0
    }))
  };
  DB.invoices.push(invoice);
  candidates.forEach(m=>{m.invoiceId=invoice.id;m.invoiceNumber=invoice.number;m.statut='facturée';});

  if(renderInvoicePdf(invoice)){
    saveToStorage();
    syncDirtyToSupabase();
    notify(`✅ Facture groupée ${invoice.number} générée (${candidates.length} mission${candidates.length>1?'s':''})`);
    renderMissions();
    closeModal('modal-invoice-monthly');
  }
}

function openMonthlyInvoiceModal(prefillAgence){
  const now=new Date();
  document.getElementById('inv-month-month').value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('inv-month-client').value=prefillAgence||'';
  openModal('modal-invoice-monthly');
}
function confirmMonthlyInvoice(){
  const agence=document.getElementById('inv-month-client').value.trim();
  const ym=document.getElementById('inv-month-month').value;
  generateMonthlyInvoiceFor(agence, ym);
}

// ── Facture pour un particulier (hors mission, saisie manuelle) ──
function openParticulierInvoiceModal(){
  document.getElementById('inv-p-nom').value='';
  document.getElementById('inv-p-email').value='';
  document.getElementById('inv-p-adresse').value='';
  document.getElementById('inv-p-designation').value='État des lieux';
  document.getElementById('inv-p-montant').value='';
  document.getElementById('inv-p-date').value=new Date().toISOString().slice(0,10);
  openModal('modal-invoice-particulier');
}
function confirmParticulierInvoice(){
  const nom=document.getElementById('inv-p-nom').value.trim();
  const montant=Number(document.getElementById('inv-p-montant').value)||0;
  if(!nom){notify('⚠️ Nom du client requis','warn');return;}
  if(!montant){notify('⚠️ Montant requis','warn');return;}
  const designation=document.getElementById('inv-p-designation').value.trim()||'État des lieux';
  const dateP=document.getElementById('inv-p-date').value;

  const invoice={
    id:'inv_'+Date.now(),
    number:nextInvoiceNumber(),
    date:new Date().toISOString(),
    type:'particulier',
    clientName:nom,
    clientEmail:document.getElementById('inv-p-email').value.trim(),
    clientAddress:document.getElementById('inv-p-adresse').value.trim(),
    missionIds:[],
    lineItems:[{designation:`${designation}${dateP?' ('+new Date(dateP).toLocaleDateString('fr-FR')+')':''}`, qty:1, puHT:montant}]
  };
  DB.invoices.push(invoice);

  if(renderInvoicePdf(invoice)){
    saveToStorage();
    syncDirtyToSupabase();
    notify(`✅ Facture ${invoice.number} générée`);
    closeModal('modal-invoice-particulier');
  }
}

// ── Ré-imprimer une facture déjà émise depuis son enregistrement ──
function redownloadInvoice(invoiceId){
  const invoice=DB.invoices.find(inv=>inv.id===invoiceId);
  if(!invoice){notify('⚠️ Facture introuvable','warn');return;}
  renderInvoicePdf(invoice);
}

let _editMissionIdx = null;

function editMission(i){
  const m = DB.missions[i];
  if(!m) return;
  _editMissionIdx = i;

  // Remplir le modal avec les données existantes
  document.getElementById('m-agence').value    = m.agence    || '';
  document.getElementById('m-email').value     = m.emailClient || '';
  document.getElementById('m-adresse').value   = m.adresse   || '';
  document.getElementById('m-montant').value   = m.montant   || '';
  document.getElementById('m-notes').value     = m.notes     || '';
  const bt=document.getElementById('m-bien-type');if(bt)bt.value=m.bienType||'';
  const btypo=document.getElementById('m-bien-typo');if(btypo)btypo.value=m.bienTypo||'';
  const bm=document.getElementById('m-bien-meuble');if(bm)bm.value=m.bienMeuble||'';

  // Selects
  const tc = document.getElementById('m-type-client');
  if(tc) tc.value = m.typeClient || 'Professionnel';
  const ty = document.getElementById('m-type');
  if(ty) ty.value = m.type || 'EDL entrant';
  const st = document.getElementById('m-statut');
  if(st) st.value = m.statut || 'planifiée';

  // Date : convertir en format datetime-local (YYYY-MM-DDTHH:MM)
  if(m.date){
    try{
      const d = new Date(m.date);
      const pad = n => String(n).padStart(2,'0');
      document.getElementById('m-date').value =
        `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }catch(e){}
  } else {
    document.getElementById('m-date').value = '';
  }

  // Changer le titre et le bouton
  document.getElementById('modal-mission-title').textContent = '✏️ Modifier la mission';
  const btn = document.getElementById('mission-save-btn');
  btn.innerHTML = '<i class="ti ti-check"></i>Mettre à jour';
  btn.onclick = saveEditMission;

  openModal('modal-mission');
}

function saveEditMission(){
  if(_editMissionIdx === null) return;
  const m = DB.missions[_editMissionIdx];
  if(!m) return;

  m.agence      = document.getElementById('m-agence').value.trim();
  m.emailClient = document.getElementById('m-email').value.trim();
  m.adresse     = document.getElementById('m-adresse').value.trim();
  m.montant     = Number(document.getElementById('m-montant').value) || 0;
  m.notes       = document.getElementById('m-notes').value.trim();
  m.typeClient  = document.getElementById('m-type-client')?.value || 'Professionnel';
  m.type        = document.getElementById('m-type').value;
  m.bienType    = document.getElementById('m-bien-type')?.value || '';
  m.bienTypo    = document.getElementById('m-bien-typo')?.value || '';
  m.bienMeuble  = document.getElementById('m-bien-meuble')?.value || '';
  m.statut      = document.getElementById('m-statut').value;
  m.date        = document.getElementById('m-date').value;

  saveToStorage();
  closeModal('modal-mission');
  notify('✅ Mission mise à jour !');
  _editMissionIdx = null;

  // Réinitialiser le modal pour les prochains ajouts
  document.getElementById('modal-mission-title').textContent = 'Nouvelle mission EDL';
  const btn = document.getElementById('mission-save-btn');
  btn.innerHTML = '<i class="ti ti-check"></i>Enregistrer';
  btn.onclick = saveMission;

  renderMissions();
  renderDashboard();
}

// ─── STATISTIQUES EDL DU TABLEAU DE BORD ──────────────────────────────
// Bloc injecte dynamiquement dans #view-dashboard (evite de modifier
// index.html, trop volumineux). Appele depuis renderDashboard().
// Respecte le filtre de mois du tableau de bord (_dashMonth).

// Normalise le type d'EDL : les libelles varient selon la source
// (formulaire public, saisie manuelle, import) — "EDL Sortant / Entrant",
// "EDL sortant/entrant", etc. doivent compter dans la meme categorie.
function statCategorieEdl(type){
  const t = String(type || '').toLowerCase();
  const entrant = t.includes('entrant');
  const sortant = t.includes('sortant');
  if(t.includes('pré') || t.includes('pre-') || t.includes('pré-')) return 'Pré-état des lieux';
  if(entrant && sortant) return 'Sortant / Entrant';
  if(entrant) return 'EDL entrant';
  if(sortant) return 'EDL sortant';
  return 'Autre / non précisé';
}

function statMeuble(m){
  const v = String(m.bienMeuble || '').toLowerCase();
  if(!v) return 'Non renseigné';
  // "Non meublé" contient "meubl" : tester l'exclusion en premier
  if(v.includes('non') || v.includes('vide') || v === 'nu') return 'Nu / vide';
  if(v.includes('meubl')) return 'Meublé';
  return 'Non renseigné';
}

function statTypeClient(m){
  const v = String(m.typeClient || '').toLowerCase();
  if(v.includes('particulier')) return 'Particulier';
  if(v.includes('profession')) return 'Agence / pro';
  // Repli : une mission sans typeClient renseigne est rattachee au contact
  const ref = String(m.agence || '').toLowerCase();
  if(ref.includes('particulier')) return 'Particulier';
  const c = (typeof DB !== 'undefined' && DB.contacts)
    ? DB.contacts.find(x => (x.entreprise || '').toLowerCase() === ref)
    : null;
  if(c && String(c.typeClient || '').toLowerCase().includes('particulier')) return 'Particulier';
  return 'Agence / pro';
}

// Une ligne de repartition : libelle, barre proportionnelle, effectif, CA
function statBarre(libelle, nb, total, couleur, ca){
  const pct = total > 0 ? Math.round(nb / total * 100) : 0;
  return `<div style="margin-bottom:9px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:11px;margin-bottom:3px">
      <span style="font-weight:500">${libelle}</span>
      <span style="color:var(--text2)"><strong style="color:var(--text)">${nb}</strong> · ${pct}%${ca ? ' · ' + ca.toLocaleString('fr-FR') + ' € HT' : ''}</span>
    </div>
    <div style="height:7px;background:var(--bg3);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${couleur};border-radius:4px;transition:width .4s"></div>
    </div>
  </div>`;
}

// Agrege les missions selon une fonction de classement, trie par effectif
function statGrouper(missions, classer){
  const acc = {};
  missions.forEach(m => {
    const k = classer(m);
    if(!acc[k]) acc[k] = { nb: 0, ca: 0 };
    acc[k].nb++;
    acc[k].ca += (m.montant || 0);
  });
  return Object.entries(acc).sort((a, b) => b[1].nb - a[1].nb);
}

function renderStatsMissions(){
  const vue = document.getElementById('view-dashboard');
  if(!vue) return;

  // Creer le conteneur au premier appel, juste avant le bloc "Pipeline commercial"
  let bloc = document.getElementById('dash-stats-edl');
  if(!bloc){
    bloc = document.createElement('div');
    bloc.id = 'dash-stats-edl';
    bloc.className = 'card';
    bloc.style.marginBottom = '14px';
    const pipeline = document.getElementById('dash-pipeline');
    const cible = pipeline ? pipeline.closest('#view-dashboard > div') : null;
    if(cible) vue.insertBefore(bloc, cible);
    else vue.appendChild(bloc);
  }

  const toutes = (typeof DB !== 'undefined' && DB.missions) ? DB.missions : [];
  const missions = (typeof filterByMonth === 'function') ? filterByMonth(toutes, 'date') : toutes;
  const total = missions.length;

  // ── Volumes de reference (independants du filtre de mois) ──
  const maintenant = new Date();
  const anneeCourante = maintenant.getFullYear();
  const cleMois = anneeCourante + '-' + String(maintenant.getMonth() + 1).padStart(2, '0');
  const cetteAnnee = toutes.filter(m => m.date && String(m.date).slice(0, 4) === String(anneeCourante));
  const ceMois = toutes.filter(m => m.date && String(m.date).slice(0, 7) === cleMois);

  // Moyenne mensuelle : sur les mois reellement couverts, pas sur 12 par defaut
  const moisDistincts = new Set(toutes.filter(m => m.date).map(m => String(m.date).slice(0, 7)));
  const moyenneMois = moisDistincts.size > 0 ? Math.round(toutes.filter(m => m.date).length / moisDistincts.size * 10) / 10 : 0;

  const caPeriode = missions.reduce((s, m) => s + (m.montant || 0), 0);
  const panierMoyen = total > 0 ? Math.round(caPeriode / total) : 0;

  const parType = statGrouper(missions, m => statCategorieEdl(m.type));
  const parMeuble = statGrouper(missions, statMeuble);
  const parClient = statGrouper(missions, statTypeClient);

  const couleursType = {
    'EDL entrant': '#1A5FA8',
    'EDL sortant': '#B4750F',
    'Sortant / Entrant': '#5B3DA5',
    'Pré-état des lieux': '#0F6E56',
    'Autre / non précisé': '#8494A1'
  };
  const couleursMeuble = { 'Meublé': '#2F7A3E', 'Nu / vide': '#1A5FA8', 'Non renseigné': '#8494A1' };
  const couleursClient = { 'Agence / pro': '#1A5FA8', 'Particulier': '#0F6E56' };

  const kpi = (etiq, val, sous, couleur) => `<div style="flex:1;min-width:130px;padding:12px 14px;border-left:3px solid ${couleur};background:var(--bg2);border-radius:0 var(--radius) var(--radius) 0">
    <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${etiq}</div>
    <div style="font-size:21px;font-weight:700;line-height:1.1">${val}</div>
    <div style="font-size:10px;color:var(--text3);margin-top:2px">${sous}</div>
  </div>`;

  const colonne = (titre, lignes) => `<div>
    <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${titre}</div>
    ${lignes || '<div style="font-size:11px;color:var(--text3)">Aucune donnée</div>'}
  </div>`;

  bloc.innerHTML = `
    <div class="card-head">
      <span>📊 Volume et répartition des états des lieux</span>
      <span style="font-size:10px;font-weight:400;color:var(--text2)">${total} mission${total > 1 ? 's' : ''} sur la période affichée</span>
    </div>
    <div style="padding:16px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
        ${kpi('Volume total', toutes.length, 'depuis le début', '#0F1E2E')}
        ${kpi('Cette année', cetteAnnee.length, String(anneeCourante), '#1A5FA8')}
        ${kpi('Ce mois-ci', ceMois.length, 'en cours', '#2F7A3E')}
        ${kpi('Moyenne mensuelle', moyenneMois, 'EDL / mois', '#B4750F')}
        ${kpi('Panier moyen', panierMoyen.toLocaleString('fr-FR') + ' €', 'HT par EDL', '#5B3DA5')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px">
        ${colonne('Par type d\'EDL', parType.map(([k, v]) => statBarre(k, v.nb, total, couleursType[k] || '#8494A1', v.ca)).join(''))}
        ${colonne('Meublé / Nu', parMeuble.map(([k, v]) => statBarre(k, v.nb, total, couleursMeuble[k] || '#8494A1', v.ca)).join(''))}
        ${colonne('Particulier / Agence', parClient.map(([k, v]) => statBarre(k, v.nb, total, couleursClient[k] || '#8494A1', v.ca)).join(''))}
      </div>
    </div>`;
}

// ─── CAMPAIGNS ────────────────────────────────────────────
