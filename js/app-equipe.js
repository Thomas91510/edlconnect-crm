// === Lokentia CRM — app-equipe.js ===
// Rôles (administrateur / assistante), droits par rubrique, aperçu
// « voir comme l'assistante », rubriques des Réglages et page Version.
// Chargé APRÈS app-settings.js (utilise CFG, nav, esc, notify).
//
// ÉTAT V1 (refonte, version de test) : les droits de l'assistante sont
// enregistrés sur l'appareil (localStorage) et servent à l'aperçu. Un vrai
// compte assistante — connexion séparée, double authentification, accès
// aux données du titulaire — demande la migration
// supabase/migrations/20261006_equipe_roles.sql (NON appliquée) : masquer
// un menu ne protège pas les données, seules les règles côté base le font.

// ─── CATALOGUE DES DROITS ─────────────────────────────────
// adminSeul : jamais délégable. defaut : valeur pour une assistante.
const DROITS_CATALOGUE = [
  { groupe:'Activité',       cle:'reservations', label:'Confirmer les réservations en ligne', defaut:true },
  { groupe:'Activité',       cle:'missions',     label:'Voir, créer et modifier les missions et l’agenda', defaut:true },
  { groupe:'Finances',       cle:'facturation',  label:'Générer et envoyer les factures', defaut:true },
  { groupe:'Finances',       cle:'ca',           label:'Voir le chiffre d’affaires et les analyses', defaut:false },
  { groupe:'Commercial',     cle:'clients',      label:'Voir et modifier les clients', defaut:true },
  { groupe:'Commercial',     cle:'fusion',       label:'Fusionner ou supprimer des clients (doublons)', defaut:false },
  { groupe:'Commercial',     cle:'prospection',  label:'Accéder à la prospection', defaut:false },
  { groupe:'Commercial',     cle:'emails',       label:'Écrire des emails', defaut:true },
  { groupe:'Commercial',     cle:'campagnes',    label:'Lancer des campagnes', defaut:false },
  { groupe:'Administration', cle:'agents',       label:'Gérer les agents (zones, barème, documents)', defaut:false },
  { groupe:'Administration', cle:'reglages',     label:'Modifier le profil, l’identité et les intégrations', defaut:false },
  { groupe:'Administration', cle:'export',       label:'Sauvegarder et restaurer les données', defaut:false },
  { groupe:'Administration', cle:'utilisateurs', label:'Gérer les utilisateurs et les droits', adminSeul:true, defaut:false }
];
// Droits toujours accordés (accueil, aide).
const DROITS_TOUJOURS = ['dashboard'];

// Vue → droit requis pour l'ouvrir. Vue absente = libre.
const VUE_DROIT = {
  reservations:'reservations', missions:'missions', agenda:'missions',
  contacts:'clients', rapports:'clients', espaces:'clients', prospection:'prospection',
  compose:'emails', campaigns:'campagnes', brevo:'utilisateurs'
};

// Rubrique des Réglages → droit requis (absent = visible par tous).
const RUBRIQUES_REGLAGES = [
  { cle:'identite',     label:'Profil & identité',  icone:'ti-id-badge-2',  droit:'reglages' },
  { cle:'equipe',       label:'Équipe & droits',    icone:'ti-users-group' },
  { cle:'agents',       label:'Agents EDL',         icone:'ti-map-pin',     droit:'agents' },
  { cle:'integrations', label:'Intégrations',       icone:'ti-plug',        droit:'reglages' },
  { cle:'securite',     label:'Sécurité',           icone:'ti-shield-lock' },
  { cle:'sauvegarde',   label:'Sauvegarde',         icone:'ti-device-floppy', droit:'export' },
  { cle:'version',      label:'À propos & version', icone:'ti-info-circle' }
];

const CLE_DROITS_ASSISTANTE = 'lokentia-droits-assistante';
const CLE_APERCU_ROLE = 'lokentia-apercu-role';

function _lireStockage(store, cle){ try { return store.getItem(cle); } catch(e){ return null; } }
function _ecrireStockage(store, cle, val){ try { val===null ? store.removeItem(cle) : store.setItem(cle, val); } catch(e){} }

function droitsAssistanteParDefaut(){
  const d = {};
  DROITS_CATALOGUE.forEach(x=>{ d[x.cle] = !x.adminSeul && !!x.defaut; });
  return d;
}
// Droits de l'assistante : valeurs par défaut, complétées par les choix
// enregistrés. Un droit adminSeul reste toujours refusé, même si le
// stockage a été modifié à la main.
function droitsAssistante(){
  const d = droitsAssistanteParDefaut();
  let enregistres = {};
  try { enregistres = JSON.parse(_lireStockage(localStorage, CLE_DROITS_ASSISTANTE) || '{}') || {}; } catch(e){}
  DROITS_CATALOGUE.forEach(x=>{
    if(!x.adminSeul && typeof enregistres[x.cle] === 'boolean') d[x.cle] = enregistres[x.cle];
  });
  return d;
}
function enregistrerDroitAssistante(cle, valeur){
  const def = DROITS_CATALOGUE.find(x=>x.cle===cle);
  if(!def || def.adminSeul) return;
  const d = droitsAssistante();
  d[cle] = !!valeur;
  _ecrireStockage(localStorage, CLE_DROITS_ASSISTANTE, JSON.stringify(d));
}

// Rôle effectif. V1 : tout compte connecté est administrateur de son
// espace ; l'aperçu permet de voir l'interface avec les droits assistante.
function roleCourant(){
  return _lireStockage(sessionStorage, CLE_APERCU_ROLE) === 'assistante' ? 'assistante' : 'admin';
}
function enApercu(){ return roleCourant() !== 'admin'; }

// Droits calculés pour un rôle donné (pur : utilisé aussi par les tests).
function droitsPourRole(role, droitsAssist){
  if(role === 'admin'){
    const tout = {};
    DROITS_CATALOGUE.forEach(x=>{ tout[x.cle] = true; });
    return tout;
  }
  return Object.assign({}, droitsAssist || droitsAssistanteParDefaut());
}
function peut(cle){
  if(!cle || DROITS_TOUJOURS.includes(cle)) return true;
  if(roleCourant() === 'admin') return true;
  return !!droitsAssistante()[cle];
}
function vueAutorisee(v){
  const d = VUE_DROIT[v];
  return !d || peut(d);
}

// ─── APPLICATION À L'INTERFACE ────────────────────────────
function appliquerDroits(){
  document.querySelectorAll('[data-perm]').forEach(el=>{
    if(peut(el.getAttribute('data-perm'))) el.removeAttribute('data-perm-masque');
    else el.setAttribute('data-perm-masque', '');
  });
  // Blocs créés à la volée par d'autres scripts (ex. statistiques détaillées
  // des missions sur l'accueil, qui affichent du chiffre d'affaires).
  document.body.classList.toggle('sans-ca', !peut('ca'));
  const role = roleCourant();
  const pill = document.getElementById('sidebar-role');
  if(pill){
    pill.textContent = role === 'admin' ? 'Admin' : 'Assistante · aperçu';
    pill.classList.toggle('apercu', role !== 'admin');
  }
  const bandeau = document.getElementById('apercu-role-bandeau');
  if(bandeau) bandeau.classList.toggle('show', role !== 'admin');
  // La vue ouverte n'est plus autorisée → retour à l'accueil.
  const active = document.querySelector('.view.active');
  const v = active ? active.id.replace('view-','') : 'dashboard';
  if(!vueAutorisee(v) && typeof nav === 'function') nav('dashboard');
}

function demarrerApercuRole(role){
  _ecrireStockage(sessionStorage, CLE_APERCU_ROLE, role);
  appliquerDroits();
  if(typeof nav === 'function') nav('dashboard');
  if(typeof notify === 'function') notify('Aperçu : vous voyez le CRM comme l’assistante');
}
function quitterApercuRole(){
  _ecrireStockage(sessionStorage, CLE_APERCU_ROLE, null);
  appliquerDroits();
  if(typeof nav === 'function') nav('settings');
  ouvrirRubriqueReglages('equipe');
}

// ─── RÉGLAGES : RUBRIQUES ─────────────────────────────────
let _rubriqueReglages = 'identite';
let _roleAffiche = 'assistante';

function rubriquesVisibles(){
  return RUBRIQUES_REGLAGES.filter(r=>{
    if(r.droit && !peut(r.droit)) return false;
    if(r.cle === 'equipe' && enApercu()) return false;
    // Rubrique sans aucune section affichée (ex. Sécurité, réservée par
    // app-settings.js au compte administrateur de la plateforme).
    const sections = document.querySelectorAll('#view-settings .settings-section[data-rubrique="'+r.cle+'"]');
    return Array.from(sections).some(s=>s.style.display !== 'none');
  });
}
function ouvrirRubriqueReglages(cle){
  _rubriqueReglages = cle;
  renderReglagesV2();
}
function renderReglagesV2(){
  const navEl = document.getElementById('settings-nav');
  if(!navEl) return;
  renderSectionEquipe();
  renderSectionVersion();
  const rubriques = rubriquesVisibles();
  if(!rubriques.some(r=>r.cle===_rubriqueReglages) && rubriques.length) _rubriqueReglages = rubriques[0].cle;
  navEl.innerHTML = rubriques.map(r=>
    `<button type="button" class="${r.cle===_rubriqueReglages?'active':''}" aria-current="${r.cle===_rubriqueReglages?'page':'false'}" onclick="ouvrirRubriqueReglages('${jsq(r.cle)}')"><i class="ti ${r.icone}"></i>${esc(r.label)}</button>`
  ).join('');
  document.querySelectorAll('#view-settings .settings-section[data-rubrique]').forEach(s=>{
    s.hidden = s.getAttribute('data-rubrique') !== _rubriqueReglages;
  });
  // Le bouton d'enregistrement ne concerne que les formulaires des rubriques
  // Profil, Agents et Intégrations (saveSettings).
  const btn = document.getElementById('settings-save-btn');
  if(btn) btn.style.display = ['identite','integrations','agents'].includes(_rubriqueReglages) ? '' : 'none';
}

function renderSectionEquipe(){
  const box = document.getElementById('reglages-equipe');
  if(!box) return;
  const nom = (document.getElementById('sidebar-footer-name')||{}).textContent || 'Vous';
  const email = (document.getElementById('sidebar-footer-email')||{}).textContent || '';
  const role = _roleAffiche;
  const droits = droitsPourRole(role, droitsAssistante());
  const groupes = [];
  DROITS_CATALOGUE.forEach(x=>{ if(!groupes.includes(x.groupe)) groupes.push(x.groupe); });

  const lignes = groupes.map(g=>{
    const rows = DROITS_CATALOGUE.filter(x=>x.groupe===g).map(x=>{
      const verrou = role === 'admin' || x.adminSeul;
      const note = x.adminSeul && role !== 'admin' ? '<span class="perm-row-note">Réservé à l’administrateur</span>' : '';
      return `<div class="perm-row">
        <span class="perm-row-label">${esc(x.label)}${note}</span>
        <button type="button" class="switch" role="switch" aria-checked="${!!droits[x.cle]}" aria-label="${esc(x.label)}"${verrou?' disabled':''} onclick="basculerDroit('${jsq(x.cle)}')"></button>
      </div>`;
    }).join('');
    return `<div class="perm-group-title">${esc(g)}</div>${rows}`;
  }).join('');

  const menu = [
    ["Aujourd'hui", true], ['Missions', droits.missions || droits.reservations], ['Clients', droits.clients],
    ['Prospection', droits.prospection], ['Emails', droits.emails || droits.campagnes]
  ];
  const visibles = menu.filter(m=>m[1]).map(m=>m[0]);
  const masques = menu.filter(m=>!m[1]).map(m=>m[0]);

  box.innerHTML = `
    <div class="settings-title"><i class="ti ti-users-group" style="font-size:18px"></i>Équipe & droits</div>
    <div class="info-box warn" style="margin-bottom:20px">Version de test : les droits sont enregistrés sur cet appareil et servent à l’aperçu ci-dessous. L’invitation d’une assistante (compte séparé, avec double authentification) sera activée après validation de la refonte.</div>

    <div style="display:flex;flex-direction:column;margin-bottom:28px">
      <div class="perm-row" style="border-top:none">
        <span class="sidebar-user-avatar">${esc(nom.substring(0,2).toUpperCase())}</span>
        <span class="perm-row-label"><strong style="font-weight:600">${esc(nom)}</strong><span class="perm-row-note">${esc(email)} · titulaire du compte</span></span>
        <span class="badge" style="background:var(--text);color:#fff">Admin</span>
      </div>
      <div class="perm-row">
        <span class="sidebar-user-avatar" style="background:var(--violet-bg);color:var(--violet) !important">AS</span>
        <span class="perm-row-label"><strong style="font-weight:600">Assistante</strong><span class="perm-row-note">Pas encore invitée</span></span>
        <button type="button" class="btn btn-sm" disabled title="Disponible après activation côté serveur">Inviter</button>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-weight:600">Droits par rôle</div>
      <div class="seg" role="tablist" aria-label="Rôle">
        <button type="button" role="tab" aria-selected="${role==='admin'}" class="${role==='admin'?'active':''}" onclick="afficherDroitsRole('admin')">Administrateur</button>
        <button type="button" role="tab" aria-selected="${role==='assistante'}" class="${role==='assistante'?'active':''}" onclick="afficherDroitsRole('assistante')">Assistante</button>
      </div>
    </div>
    <div class="info-box" style="margin-bottom:6px">${role==='admin'
      ? 'Accès complet. Seul l’administrateur gère l’équipe, les droits et les intégrations. Ses droits ne sont pas modifiables.'
      : 'Gère le quotidien : réservations, planning, clients, emails et facturation. Activez ou retirez chaque droit ci-dessous.'}</div>
    <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">
      <div style="flex:999 1 380px;min-width:0">${lignes}</div>
      <aside style="flex:1 1 220px;min-width:0;border:1px solid var(--border);border-radius:12px;padding:16px;margin-top:18px">
        <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">Menu vu par ce rôle</div>
        ${visibles.map(m=>`<div style="height:36px;display:flex;align-items:center;padding:0 10px;border-radius:8px;background:var(--bg2);font-weight:500;margin-bottom:6px">${esc(m)}</div>`).join('')}
        ${masques.length?`<div style="font-size:12px;color:var(--text2);margin-top:8px">Masqué : ${esc(masques.join(', '))}</div>`:''}
        ${role==='assistante'?`<button type="button" class="btn btn-sm" style="margin-top:14px;width:100%;justify-content:center" onclick="demarrerApercuRole('assistante')"><i class="ti ti-eye"></i>Voir le CRM comme elle</button>`:''}
      </aside>
    </div>`;
}
function afficherDroitsRole(role){ _roleAffiche = role; renderSectionEquipe(); }
function basculerDroit(cle){
  if(_roleAffiche !== 'assistante') return;
  enregistrerDroitAssistante(cle, !droitsAssistante()[cle]);
  renderSectionEquipe();
}

function renderSectionVersion(){
  const box = document.getElementById('reglages-version');
  if(!box || typeof APP_VERSION === 'undefined') return;
  const info = (typeof _versionDeploiement !== 'undefined' && _versionDeploiement) || {};
  const envLib = { production:'Production', preview:'Test (preview)', development:'Développement' }[info.env] || (info.env || '—');
  box.innerHTML = `
    <div class="settings-title"><i class="ti ti-info-circle" style="font-size:18px"></i>À propos & version</div>
    <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:center;margin-bottom:24px">
      <div style="flex:1;min-width:200px">
        <div style="font-size:13px;color:var(--text2);margin-bottom:4px">Version installée</div>
        <div class="version-big">${esc(APP_VERSION)}</div>
      </div>
      <dl style="flex:2;min-width:260px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 24px;margin:0">
        <div><dt style="font-size:12px;color:var(--text2)">Environnement</dt><dd style="margin:4px 0 0">${esc(envLib)}</dd></div>
        <div><dt style="font-size:12px;color:var(--text2)">Build</dt><dd class="mono" style="margin:4px 0 0">${esc(info.sha || '—')}</dd></div>
      </dl>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
      <div class="info-box"><div class="mono" style="font-weight:600"><span style="color:var(--blue)">2</span>.0.0</div><div style="margin-top:4px">Majeure : refonte, changement visible par tous</div></div>
      <div class="info-box"><div class="mono" style="font-weight:600">2.<span style="color:var(--blue)">1</span>.0</div><div style="margin-top:4px">Mineure : nouvelle fonctionnalité</div></div>
      <div class="info-box"><div class="mono" style="font-weight:600">2.1.<span style="color:var(--blue)">1</span></div><div style="margin-top:4px">Correctif : bug corrigé</div></div>
    </div>
    <div style="font-weight:600;margin-bottom:6px">Nouveautés</div>
    ${(typeof NOUVEAUTES!=='undefined'?NOUVEAUTES:[]).map(n=>`<div class="changelog-row"><span class="v">${esc(n.v)}</span><span style="flex:1"><strong style="font-weight:600">${esc(n.titre)}</strong><br><span style="color:var(--text2);font-size:13px">${esc(n.texte)}</span></span></div>`).join('')}`;
}

// Applique les droits dès que la page est construite (l'aperçu est
// conservé le temps de l'onglet). La barre mobile est déclarée après les
// <script> dans index.html : on attend donc DOMContentLoaded.
if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ if(document.getElementById('sidebar')) appliquerDroits(); });
  else if(document.getElementById('sidebar')) appliquerDroits();
}
