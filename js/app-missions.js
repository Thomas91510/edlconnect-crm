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
      <td style="font-weight:600;font-size:11px">${esc(m.agence)}</td>
      <td style="font-size:10px;color:var(--text2)">${esc(m.adresse)||'—'}</td>
      <td style="font-size:10px">${esc(m.type)}</td>
      <td style="font-size:10px;color:var(--text2)">${esc([m.bienType,m.bienTypo,m.bienMeuble].filter(Boolean).join(' · '))||'—'}</td>
      <td style="font-size:11px">${fmtDT(m.date)}</td>
      <td style="font-weight:600;color:var(--blue)">${(m.montant||0).toLocaleString('fr-FR')} € <span style="font-size:9px;color:var(--text2)">HT</span></td>
      <td style="font-size:10px;color:var(--text2)">${fmtTVA(m.montant)}</td>
      <td style="font-weight:600;color:var(--green)">${fmtTTC(m.montant)}</td>
      <td>${statusBadge(m.statut)}</td>
      <td><select style="font-size:10px;padding:3px 5px;width:auto" onchange="updateMissionStatus(${realIdx},this.value)">
        ${['planifiée','en cours','terminée'].map(s=>`<option${s===m.statut?' selected':''}>${s}</option>`).join('')}
      </select></td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="openConfirmRdvModal('${m.id}')" title="Confirmer le RDV et envoyer les convocations" style="padding:3px 7px;background:var(--blue-bg);color:var(--blue-text);border-color:var(--blue)"><i class="ti ti-calendar-check" style="font-size:12px"></i></button>
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
function updateMissionStatus(i,v){DB.missions[i].statut=v;saveToStorage();notify('✅ Statut mis à jour');renderMissions();notifierChangementStatutCommande(DB.missions[i]);}
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

// Nature du bien : maison, appartement, ou autre (local, parking...)
function statNatureBien(m){
  const v = String(m.bienType || '').toLowerCase();
  if(!v) return 'Non renseigné';
  if(v.includes('maison')) return 'Maison';
  if(v.includes('appart')) return 'Appartement';
  if(v.includes('studio')) return 'Appartement';
  return 'Autre (local, parking…)';
}

// Typologie T1 a T7+ : accepte les notations T3 et F3, et rattache le
// studio au T1, comme le veut l'usage en gestion locative. T6 et T7 sont
// distingues (formulaires de reservation alignes sur les evenements Cal.com
// dedies) ; T7+ ne sert plus que de filet pour une typologie superieure
// exceptionnelle (T8...), non proposee dans les formulaires.
function statTypologie(m){
  const v = String(m.bienTypo || '').trim().toLowerCase();
  if(!v) return 'Non renseignée';
  if(v.includes('studio')) return 'T1';
  const found = v.match(/[tf]\s*(\d+)/);
  if(found){
    const n = parseInt(found[1], 10);
    if(n >= 7) return 'T7+';
    if(n >= 1) return 'T' + n;
  }
  return 'Non renseignée';
}

// Ordre de lecture naturel pour les typologies (plutot que par effectif)
const ORDRE_TYPOLOGIE = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7+', 'Non renseignée'];

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

  // Préserver la saisie en cours dans le formulaire d'ajustement externe :
  // ce bloc est reconstruit (innerHTML) à chaque changement de page vers le
  // dashboard (et à chaque sync temps réel), ce qui effaçait sinon les
  // champs mois/nb EDL/CA/note dès qu'on allait consulter une info ailleurs
  // avant de finir la saisie.
  const _ajSaisieEnCours = {
    mois: document.getElementById('aj-mois')?.value,
    nb: document.getElementById('aj-nb')?.value,
    ca: document.getElementById('aj-ca')?.value,
    note: document.getElementById('aj-note')?.value
  };

  const toutes = (typeof DB !== 'undefined' && DB.missions) ? DB.missions : [];
  const missions = (typeof filterByMonth === 'function') ? filterByMonth(toutes, 'date') : toutes;

  // ── Volumes de reference (independants du filtre de mois) ──
  const maintenant = new Date();
  const anneeCourante = maintenant.getFullYear();
  const cleMois = anneeCourante + '-' + String(maintenant.getMonth() + 1).padStart(2, '0');
  const cetteAnnee = toutes.filter(m => m.date && String(m.date).slice(0, 4) === String(anneeCourante));
  const ceMois = toutes.filter(m => m.date && String(m.date).slice(0, 7) === cleMois);

  // Ajustements externes (EDL/CA de clients hors CRM, ex. un partenaire) —
  // saisis par mois dans le panneau ci-dessous, fondus dans les totaux pour
  // que le volume et le CA reflètent l'activité réelle sans forcer une fiche
  // mission par dossier. cf. ajustementsPourMois() dans app-core.js.
  const ajustements = Array.isArray(DB.ajustementsExternes) ? DB.ajustementsExternes : [];
  const ajTous = ajustementsPourMois('all');
  const ajAnnee = ajustements.filter(a => String(a.mois).slice(0, 4) === String(anneeCourante))
    .reduce((acc, a) => { acc.nb += Number(a.nbEdl) || 0; acc.ca += Number(a.ca) || 0; return acc; }, { nb: 0, ca: 0 });
  const ajMois = ajustementsPourMois(cleMois);
  const ajPeriode = (typeof _dashMonth !== 'undefined') ? ajustementsPourMois(_dashMonth) : ajTous;

  // "total" inclut les ajustements hors CRM pour les totaux affichés (badge,
  // panier moyen) ; les repartitions par categorie ci-dessous n'ont pas cette
  // granularite pour un ajustement en montant global, donc leurs pourcentages
  // restent calcules sur les seules missions du CRM (baseMissions).
  const baseMissions = missions.length;
  const total = baseMissions + ajPeriode.nb;

  // Moyenne mensuelle : sur les mois reellement couverts, pas sur 12 par defaut
  const moisDistincts = new Set([
    ...toutes.filter(m => m.date).map(m => String(m.date).slice(0, 7)),
    ...ajustements.map(a => a.mois).filter(Boolean)
  ]);
  const volumeTotal = toutes.filter(m => m.date).length + ajTous.nb;
  const moyenneMois = moisDistincts.size > 0 ? Math.round(volumeTotal / moisDistincts.size * 10) / 10 : 0;

  const caPeriode = missions.reduce((s, m) => s + (m.montant || 0), 0) + ajPeriode.ca;
  const panierMoyen = total > 0 ? Math.round(caPeriode / total) : 0;

  const parType = statGrouper(missions, m => statCategorieEdl(m.type));
  const parMeuble = statGrouper(missions, statMeuble);
  const parClient = statGrouper(missions, statTypeClient);
  const parNature = statGrouper(missions, statNatureBien);
  // Typologies triees dans l'ordre T1 → T7+, plus lisible qu'un tri par effectif
  const parTypologie = statGrouper(missions, statTypologie)
    .sort((a, b) => ORDRE_TYPOLOGIE.indexOf(a[0]) - ORDRE_TYPOLOGIE.indexOf(b[0]));

  const couleursType = {
    'EDL entrant': '#1A5FA8',
    'EDL sortant': '#B4750F',
    'Sortant / Entrant': '#5B3DA5',
    'Pré-état des lieux': '#0F6E56',
    'Autre / non précisé': '#8494A1'
  };
  const couleursMeuble = { 'Meublé': '#2F7A3E', 'Nu / vide': '#1A5FA8', 'Non renseigné': '#8494A1' };
  const couleursClient = { 'Agence / pro': '#1A5FA8', 'Particulier': '#0F6E56' };
  const couleursNature = { 'Maison': '#B4750F', 'Appartement': '#1A5FA8', 'Autre (local, parking…)': '#5B3DA5', 'Non renseigné': '#8494A1' };
  const couleursTypo = { 'T1': '#8FBEEC', 'T2': '#5B9BD5', 'T3': '#1A5FA8', 'T4': '#0F4C81', 'T5': '#0F6E56', 'T6': '#2F7A3E', 'T7+': '#1D4F2E', 'Non renseignée': '#8494A1' };

  const kpi = (etiq, val, sous, couleur) => `<div style="flex:1;min-width:130px;padding:12px 14px;border-left:3px solid ${couleur};background:var(--bg2);border-radius:0 var(--radius) var(--radius) 0">
    <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${etiq}</div>
    <div style="font-size:21px;font-weight:700;line-height:1.1">${val}</div>
    <div style="font-size:10px;color:var(--text3);margin-top:2px">${sous}</div>
  </div>`;

  const colonne = (titre, lignes) => `<div>
    <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">${titre}</div>
    ${lignes || '<div style="font-size:11px;color:var(--text3)">Aucune donnée</div>'}
  </div>`;

  const noteAjustement = (nb) => nb > 0 ? ` <span style="color:var(--text3)">(dont ${nb} hors CRM)</span>` : '';

  const ajustementsTries = [...ajustements].sort((a, b) => String(b.mois).localeCompare(String(a.mois)));
  const listeAjustementsHtml = ajustementsTries.length
    ? ajustementsTries.map(a => {
        const [y, m] = String(a.mois || '').split('-');
        const label = (y && m) ? new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : esc(a.mois || '—');
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;font-size:12px">
          <div style="flex:1">
            <strong>${label}</strong> — ${Number(a.nbEdl) || 0} EDL · ${(Number(a.ca) || 0).toLocaleString('fr-FR')} € HT
            ${a.note ? `<div style="color:var(--text3);font-size:11px">${esc(a.note)}</div>` : ''}
          </div>
          <button class="btn btn-sm" onclick="removeAjustementExterne('${a.id}')" style="color:#c0392b;border-color:#c0392b"><i class="ti ti-trash"></i></button>
        </div>`;
      }).join('')
    : '<div style="font-size:11px;color:var(--text3)">Aucun ajustement enregistré.</div>';

  bloc.innerHTML = `
    <div class="card-head">
      <span>📊 Volume et répartition des états des lieux</span>
      <span style="font-size:10px;font-weight:400;color:var(--text2)">${total} mission${total > 1 ? 's' : ''} sur la période affichée${noteAjustement(ajPeriode.nb)}</span>
    </div>
    <div style="padding:16px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
        ${kpi('Volume total', volumeTotal, 'depuis le début' + noteAjustement(ajTous.nb), '#0F1E2E')}
        ${kpi('Cette année', cetteAnnee.length + ajAnnee.nb, String(anneeCourante) + noteAjustement(ajAnnee.nb), '#1A5FA8')}
        ${kpi('Ce mois-ci', ceMois.length + ajMois.nb, 'en cours' + noteAjustement(ajMois.nb), '#2F7A3E')}
        ${kpi('Moyenne mensuelle', moyenneMois, 'EDL / mois', '#B4750F')}
        ${kpi('Panier moyen', panierMoyen.toLocaleString('fr-FR') + ' €', 'HT par EDL', '#5B3DA5')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px 26px">
        ${colonne('Par type d\'EDL', parType.map(([k, v]) => statBarre(k, v.nb, baseMissions, couleursType[k] || '#8494A1', v.ca)).join(''))}
        ${colonne('Meublé / Nu', parMeuble.map(([k, v]) => statBarre(k, v.nb, baseMissions, couleursMeuble[k] || '#8494A1', v.ca)).join(''))}
        ${colonne('Particulier / Agence', parClient.map(([k, v]) => statBarre(k, v.nb, baseMissions, couleursClient[k] || '#8494A1', v.ca)).join(''))}
        ${colonne('Maison / Appartement', parNature.map(([k, v]) => statBarre(k, v.nb, baseMissions, couleursNature[k] || '#8494A1', v.ca)).join(''))}
        ${colonne('Typologie du bien', parTypologie.map(([k, v]) => statBarre(k, v.nb, baseMissions, couleursTypo[k] || '#8494A1', v.ca)).join(''))}
      </div>
      <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--border)">
        <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Ajustement externe (clients hors CRM)</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px">Pour un partenaire dont les dossiers ne passent pas par une fiche mission : ajoutez ici un nombre d'EDL et un CA par mois, ils viennent s'ajouter aux totaux ci-dessus.</div>
        <div id="ajustements-liste" style="margin-bottom:12px">${listeAjustementsHtml}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <div><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:3px">Mois</label>
            <input type="month" id="aj-mois" style="font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px" value="${cleMois}"></div>
          <div><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:3px">Nb EDL</label>
            <input type="number" id="aj-nb" min="0" step="1" style="width:80px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></div>
          <div><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:3px">CA (€ HT)</label>
            <input type="number" id="aj-ca" min="0" step="1" style="width:100px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></div>
          <div style="flex:1;min-width:140px"><label style="font-size:10px;color:var(--text2);display:block;margin-bottom:3px">Note (optionnel)</label>
            <input type="text" id="aj-note" placeholder="Ex. Partenaire Century 21" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></div>
          <button class="btn btn-sm" onclick="ajouterAjustementExterne()"><i class="ti ti-plus"></i>Ajouter</button>
        </div>
      </div>
    </div>`;

  // Restaurer la saisie en cours capturée avant la reconstruction du bloc
  // (cf. commentaire plus haut) — seulement les champs que l'abonné avait
  // effectivement commencé à remplir, sans écraser la valeur par défaut du
  // mois pré-rempli si rien n'avait été saisi.
  if(_ajSaisieEnCours.mois && _ajSaisieEnCours.mois !== cleMois){
    const el = document.getElementById('aj-mois'); if(el) el.value = _ajSaisieEnCours.mois;
  }
  if(_ajSaisieEnCours.nb){ const el = document.getElementById('aj-nb'); if(el) el.value = _ajSaisieEnCours.nb; }
  if(_ajSaisieEnCours.ca){ const el = document.getElementById('aj-ca'); if(el) el.value = _ajSaisieEnCours.ca; }
  if(_ajSaisieEnCours.note){ const el = document.getElementById('aj-note'); if(el) el.value = _ajSaisieEnCours.note; }
}

// Sauvegarde ciblée des ajustements externes dans Supabase (settings), sans
// lire le formulaire de réglages — même pattern que persistAgents().
async function persistAjustementsExternes(){
  if(typeof saveSettingsToSupabase !== 'function') return;
  try{
    if(!_supaReady || !_currentUser) return;
    const { data } = await supabaseClient.from('settings').select('data').eq('user_id', _currentUser.id).maybeSingle();
    const s = (data && data.data) ? data.data : {};
    s.ajustementsExternes = DB.ajustementsExternes || [];
    await saveSettingsToSupabase(s);
  }catch(e){ console.warn('persistAjustementsExternes:', e); }
}

function ajouterAjustementExterne(){
  const moisEl = document.getElementById('aj-mois');
  const nbEl = document.getElementById('aj-nb');
  const caEl = document.getElementById('aj-ca');
  const noteEl = document.getElementById('aj-note');
  const mois = moisEl ? moisEl.value : '';
  const nbEdl = Math.max(0, parseInt(nbEl ? nbEl.value : '0', 10) || 0);
  const ca = Math.max(0, parseFloat(caEl ? caEl.value : '0') || 0);
  const note = noteEl ? noteEl.value.trim() : '';
  if(!mois){ notify('⚠️ Sélectionne un mois', 'warn'); return; }
  if(!nbEdl && !ca){ notify('⚠️ Indique un nombre d\'EDL et/ou un CA', 'warn'); return; }
  if(!Array.isArray(DB.ajustementsExternes)) DB.ajustementsExternes = [];
  DB.ajustementsExternes.push({ id: 'aj_' + Date.now(), mois, nbEdl, ca, note });
  saveToStorage();
  persistAjustementsExternes();
  renderDashboard();
  notify('✅ Ajustement ajouté');
}

function removeAjustementExterne(id){
  if(!confirm('Supprimer cet ajustement ?')) return;
  DB.ajustementsExternes = (DB.ajustementsExternes || []).filter(a => a.id !== id);
  saveToStorage();
  persistAjustementsExternes();
  renderDashboard();
}

// ─── CAMPAIGNS ────────────────────────────────────────────
