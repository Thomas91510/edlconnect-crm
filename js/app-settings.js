// === Lokentia CRM — app-settings.js ===
// Composer IA, agents EDL, reglages, initialisation, admin
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

function toggleClaudePanel(){
  const p = document.getElementById('claude-panel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
  if(p.style.display === 'block'){
    // Pré-remplir le prompt avec le contexte (destinataire, objet)
    const to    = document.getElementById('to-f')?.value || '';
    const subj  = document.getElementById('subj-f')?.value || '';
    const prompt = document.getElementById('claude-prompt');
    if(!prompt.value && (to || subj)){
      prompt.value = `Email professionnel pour ${to||'une agence immobilière'}${subj?' concernant : '+subj:''}.`;
    }
    prompt.focus();
  }
}

async function generateWithClaude(){
  const prompt  = document.getElementById('claude-prompt').value.trim();
  const to      = document.getElementById('to-f')?.value || '';
  const subjEl  = document.getElementById('subj-f');
  const bodyEl  = document.getElementById('body-f');
  const btn     = document.getElementById('claude-gen-btn');
  const label   = document.getElementById('claude-gen-label');
  const status  = document.getElementById('claude-gen-status');

  if(!prompt){ notify('Décris ce que tu veux dire avant de générer','warn'); return; }

  btn.disabled = true;
  label.textContent = 'Génération…';
  status.textContent = '⏳ Claude rédige…';

  // Rédaction par Claude (api/redaction-ia.js) : les prompts sont construits
  // côté serveur avec l'identité d'envoi du compte ; on n'envoie que la
  // consigne, le destinataire et le brouillon en cours.
  try {
    const response = await fetch('/api/redaction-ia', {
      method : 'POST',
      headers: await _authHeaders({ 'Content-Type' : 'application/json' }),
      body: JSON.stringify({ consigne: prompt, destinataire: to, brouillon: bodyEl ? bodyEl.value : '' })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      if(response.status === 503 || response.status === 403){
        status.textContent = '⚠️ ' + (data.error || 'Rédaction IA indisponible');
        generateLocalEmail(prompt, to, subjEl, bodyEl);
        btn.disabled = false; label.textContent = 'Générer';
        return;
      }
      throw new Error(data.error || 'Erreur de la rédaction IA');
    }
    const objetVal = data.objet || '';
    const bodyText = data.corps || '';
    if(objetVal && subjEl && !subjEl.value) subjEl.value = objetVal;
    if(bodyText && bodyEl) bodyEl.value = bodyText;

    status.textContent = '✅ Email généré !';
    notify('✨ Email rédigé par Claude !');
    setTimeout(()=>{
      document.getElementById('claude-panel').style.display='none';
      status.textContent='';
    }, 2000);

  } catch(err) {
    console.error('Claude API error:', err);
    status.textContent = '❌ ' + err.message;
    // Fallback mode local
    generateLocalEmail(prompt, to, subjEl, bodyEl);
  }

  btn.disabled = false;
  label.textContent = 'Générer';
}

function generateLocalEmail(prompt, to, subjEl, bodyEl){
  const p = prompt.toLowerCase();
  // Identité propre au compte connecté (jamais EDL IDF en dur : ce mode de
  // secours sert tous les abonnés du CRM, pas seulement EDL IDF).
  const societe = CFG.companyName || CFG.expediteurNom || '';
  const prefixe = societe ? societe + ' — ' : '';
  const nomSignature = CFG.expediteurSignature || CFG.expediteurNom || CFG.companyName || 'Lokentia';
  const sousTitre = [CFG.expediteurNom, CFG.companyName].find(v => v && v !== nomSignature) || '';
  const contactLigne = [CFG.expediteurTel, CFG.expediteurEmail].filter(Boolean).join(' | ');
  const signature = (intro) => `${intro}\n${nomSignature}` + (sousTitre ? `\n${sousTitre}` : '') + (contactLigne ? `\n📞 ${contactLigne}` : '');

  let objet = '';
  let body  = '';

  // Détecter le type d'email demandé et générer le bon template
  if(p.includes('facture') || p.includes('règlement') || p.includes('reglement') || p.includes('paiement')){
    objet = prefixe + 'Confirmation de réception de votre règlement';
    body  = `Bonjour,

Je vous confirme la bonne réception de votre règlement et vous en remercie.

Vous trouverez en pièce jointe la facture acquittée correspondante à notre prestation d'état des lieux.

N'hésitez pas à me contacter pour toute question.

${signature('Cordialement,')}`;

  } else if(p.includes('relance') || p.includes('pas répondu') || p.includes('pas repondu') || p.includes('suivi')){
    objet = prefixe + 'Suite à notre échange';
    body  = `Bonjour,

Je me permets de revenir vers vous suite à mon précédent message, sans vouloir vous importuner.

Notre service d'états des lieux externalisés permet à de nombreuses agences de gagner 2 à 3 heures par dossier. Seriez-vous disponible pour un échange rapide de 15 minutes ?

${signature('Cordialement,')}`;

  } else if(p.includes('rdv') || p.includes('rendez-vous') || p.includes('rendez vous') || p.includes('réunion')){
    objet = prefixe + 'Confirmation de rendez-vous';
    body  = `Bonjour,

Je vous confirme notre rendez-vous à la date et l'heure convenues.

N'hésitez pas à me contacter si vous avez des questions en amont.

${signature('À très bientôt,')}`;

  } else if(p.includes('devis') || p.includes('tarif') || p.includes('prix')){
    objet = prefixe + 'Votre devis personnalisé';
    body  = `Bonjour,

Suite à notre échange, veuillez trouver ci-joint notre proposition tarifaire pour la réalisation de vos états des lieux.

Nos prestations comprennent l'EDL entrant, sortant et le pré-état des lieux, avec remise du rapport sous 24h.

Je reste disponible pour tout renseignement complémentaire.

${signature('Cordialement,')}`;

  } else if(p.includes('confirmation') || p.includes('confirmer') || p.includes('mission')){
    objet = prefixe + 'Confirmation de votre mission';
    body  = `Bonjour,

Je vous confirme la prise en charge de votre mission d'état des lieux.

Nous vous contacterons dans les plus brefs délais pour convenir des modalités d'intervention.

${signature('Cordialement,')}`;

  } else {
    // Générique
    objet = prefixe + 'Externalisation de vos états des lieux';
    body  = `Bonjour,

Je me permets de vous contacter au sujet de l'externalisation de vos états des lieux.

Nous accompagnons les agences immobilières pour réaliser leurs états des lieux entrants et sortants, avec rapport remis sous 24h.

Seriez-vous disponible pour un échange de 15 minutes ?

${signature('Cordialement,')}`;
  }

  if(subjEl && !subjEl.value) subjEl.value = objet;
  if(bodyEl) bodyEl.value = body;
  notify('✅ Email généré (active Gemini dans Paramètres pour la rédaction IA personnalisée)');
}

function populateExpertDropdown(selectedId){
  const sel = document.getElementById('confirm-rdv-expert');
  if(!sel) return;
  const agents = DB.agents || [];
  sel.innerHTML = '<option value="">— Non précisé —</option>' +
    agents.map(a => `<option value="${a.id}"${a.id===selectedId?' selected':''}>${a.nom}${a.tel ? ' — ' + a.tel : ''}</option>`).join('');
}

// ─── AGENTS EDL ────────────────────────────────────────────
let _editingAgentId = null;

const AGENT_PHOTOS_BUCKET_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co/storage/v1/object/public/agent-photos/';
const AGENCY_LOGOS_BUCKET_URL = 'https://pvuctwflxvvxdawsxceu.supabase.co/storage/v1/object/public/agency-logos/';

function initialesAgent(nom){
  return String(nom || '?').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

// Bloc "Zones d'intervention" d'un agent, sous sa ligne principale :
// - "attente" → demande de l'agent en attente, avec Approuver/Refuser ;
// - "valide"/"refuse" → petit rappel de l'état, sans action (l'agent
//   modifie et resoumet depuis son espace s'il veut changer).
function blocZonesAgent(a){
  const nbPrimaire = (a.secteurPrimaire || []).length;
  const nbSecondaire = (a.secteurSecondaire || []).length;
  if(!a.zoneStatut) return '';
  if(a.zoneStatut === 'attente'){
    return `
      <div style="width:100%;margin-top:8px;padding:8px 10px;border-radius:var(--radius);background:var(--amber-bg);color:var(--amber-text);font-size:11.5px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span>📍 Demande de zones en attente — ${nbPrimaire} code${nbPrimaire>1?'s':''} primaire, ${nbSecondaire} secondaire${nbSecondaire>1?'s':''}</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="btn btn-sm" onclick="approuverZonesAgent('${a.id}')"><i class="ti ti-check"></i> Approuver</button>
          <button class="btn btn-sm" onclick="refuserZonesAgent('${a.id}')" style="color:#c0392b;border-color:#c0392b"><i class="ti ti-x"></i> Refuser</button>
        </span>
      </div>`;
  }
  if(a.zoneStatut === 'valide'){
    return `<div style="width:100%;margin-top:8px;font-size:11px;color:var(--green-text)">✓ Zones validées — ${nbPrimaire} primaire, ${nbSecondaire} secondaire</div>`;
  }
  if(a.zoneStatut === 'refuse'){
    return `<div style="width:100%;margin-top:8px;font-size:11px;color:#c0392b">✕ Zones refusées${a.zoneRefusMotif ? ' — ' + esc(a.zoneRefusMotif) : ''}</div>`;
  }
  return '';
}

function renderAgentsSettings(){
  // Grille de rémunération par défaut (T1 à T7+) tant qu'aucun agent n'est
  // en cours d'édition et que le formulaire n'a pas encore été rempli.
  const lignesRem = document.getElementById('rem-typo-lignes');
  if(lignesRem && !lignesRem.children.length && !_editingAgentId) renderLignesRemuneration(null);
  const wrap = document.getElementById('agents-list');
  if(!wrap) return;
  renderRemunerationsAgents();
  if(!DB.agents || !DB.agents.length){
    wrap.innerHTML = '<div style="font-size:11px;color:var(--text3)">Aucun agent enregistré pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = DB.agents.map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;flex-wrap:wrap">
      ${a.photoPath
        ? `<img src="${AGENT_PHOTOS_BUCKET_URL}${a.photoPath}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:32px;height:32px;border-radius:50%;background:var(--blue-bg);color:var(--blue-text);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${esc(initialesAgent(a.nom))}</div>`}
      <div style="flex:1;min-width:160px">
        <div style="font-size:12px;font-weight:600">${esc(a.nom)}</div>
        <div style="font-size:11px;color:var(--text2)">📱 ${esc(a.tel) || '—'}${a.email ? ' · 📅 ' + esc(a.email) : ''}${a.adresse ? ' · 🏠 ' + esc(a.adresse) : ''}${a.secteurs ? ' · 📍 ' + esc(a.secteurs) : ''}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px"><i class="ti ti-coin-euro"></i> ${esc(resumeRemunerationAgent(a.remuneration))}</div>
      </div>
      <label class="btn btn-sm" style="cursor:pointer" title="${a.contratPath ? 'Remplacer le contrat déposé' : 'Déposer le contrat signé (PDF)'}">
        <i class="ti ${a.contratPath ? 'ti-file-check' : 'ti-file-upload'}"></i> Contrat
        <input type="file" accept="application/pdf" style="display:none" onchange="televerserDocumentAgent('${a.id}','contrat',this)">
      </label>
      <label class="btn btn-sm" style="cursor:pointer" title="${a.avenantPath ? 'Remplacer l\'avenant déposé' : 'Déposer un avenant (PDF)'}">
        <i class="ti ${a.avenantPath ? 'ti-file-check' : 'ti-file-upload'}"></i> Avenant
        <input type="file" accept="application/pdf" style="display:none" onchange="televerserDocumentAgent('${a.id}','avenant',this)">
      </label>
      <button class="btn btn-sm" onclick="editerAgent('${a.id}')"><i class="ti ti-pencil"></i></button>
      <button class="btn btn-sm" onclick="removeAgent('${a.id}')" style="color:#c0392b;border-color:#c0392b"><i class="ti ti-trash"></i></button>
      ${blocZonesAgent(a)}
    </div>`).join('');
}

// Approuver/refuser la demande de secteurs d'un agent (voir blocZonesAgent
// ci-dessus) — ne touche jamais aux codes soumis : seul le statut change,
// pour que l'historique de la demande reste visible côté agent en cas de
// refus (il peut alors ajuster et resoumettre depuis son espace).
function approuverZonesAgent(id){
  const a = DB.agents.find(x => x.id === id);
  if(!a) return;
  a.zoneStatut = 'valide';
  a.zoneRefusMotif = '';
  saveToStorage();
  persistAgents();
  renderAgentsSettings();
  notify('✅ Zones validées pour ' + a.nom);
}

function refuserZonesAgent(id){
  const a = DB.agents.find(x => x.id === id);
  if(!a) return;
  const motif = prompt('Motif du refus (visible par l\'agent) :', '') || '';
  a.zoneStatut = 'refuse';
  a.zoneRefusMotif = motif.trim();
  saveToStorage();
  persistAgents();
  renderAgentsSettings();
  notify('Zones refusées pour ' + a.nom, 'warn');
}

// ─── Barème frais de déplacement ────────────────────────────
// Cases entièrement libres (intitulé + montant) : l'agence peut en
// ajouter, en supprimer et renommer chaque ligne. Stocké dans
// settings.data.baremeDeplacement (comme les agents), lu en lecture seule
// par l'agent dans son espace (voir api/agent-missions.js).
const BAREME_PAR_DEFAUT = [
  { label: 'Secteur primaire', montant: '0' },
  { label: 'Secteur secondaire', montant: '18' },
  { label: 'Hors secteurs', montant: 'Sur devis' },
];

function renderBaremeSettings(){
  const wrap = document.getElementById('bareme-rows');
  if(!wrap) return;
  const lignes = (DB.baremeDeplacement && DB.baremeDeplacement.length) ? DB.baremeDeplacement : BAREME_PAR_DEFAUT;
  wrap.innerHTML = lignes.map((l, i) => `
    <div style="display:grid;grid-template-columns:1fr 140px 32px;gap:8px;margin-bottom:6px" data-bareme-row>
      <input class="bareme-label-input" value="${esc(l.label)}" placeholder="Intitulé">
      <input class="bareme-montant-input" value="${esc(l.montant)}" placeholder="Montant ou texte" style="text-align:right">
      <button class="btn btn-sm" onclick="this.closest('[data-bareme-row]').remove()" title="Supprimer cette case" style="color:#c0392b;border-color:#c0392b">✕</button>
    </div>`).join('');
}

function ajouterLigneBareme(){
  const wrap = document.getElementById('bareme-rows');
  if(!wrap) return;
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 140px 32px;gap:8px;margin-bottom:6px';
  row.setAttribute('data-bareme-row', '');
  row.innerHTML = `
    <input class="bareme-label-input" placeholder="Intitulé">
    <input class="bareme-montant-input" placeholder="Montant ou texte" style="text-align:right">
    <button class="btn btn-sm" onclick="this.closest('[data-bareme-row]').remove()" title="Supprimer cette case" style="color:#c0392b;border-color:#c0392b">✕</button>`;
  wrap.appendChild(row);
  row.querySelector('.bareme-label-input').focus();
}

function sauvegarderBareme(){
  const lignes = Array.from(document.querySelectorAll('#bareme-rows [data-bareme-row]')).map(row => ({
    label: row.querySelector('.bareme-label-input').value.trim(),
    montant: row.querySelector('.bareme-montant-input').value.trim(),
  })).filter(l => l.label !== '');
  if(!lignes.length){ notify('⚠️ Ajoutez au moins une case avec un intitulé', 'warn'); return; }
  DB.baremeDeplacement = lignes;
  saveToStorage();
  persistBareme();
  renderBaremeSettings();
  notify('✅ Barème frais de déplacement enregistré');
}

async function persistBareme(){
  if(typeof saveSettingsToSupabase !== 'function') return;
  try{
    if(!_supaReady || !_currentUser) return;
    const { data } = await supabaseClient.from('settings').select('data').eq('user_id', _currentUser.id).maybeSingle();
    const s = (data && data.data) ? data.data : {};
    s.baremeDeplacement = DB.baremeDeplacement || [];
    await saveSettingsToSupabase(s);
  }catch(e){ console.warn('persistBareme:', e); }
}

// Dépôt du contrat signé / d'un avenant pour un agent (PDF, réservé à
// l'agence) — voir api/upload-agent-document.js. Met à jour DB.agents
// localement à partir de la réponse plutôt que de recharger tous les
// settings, pour que l'icône passe immédiatement à "déposé".
async function televerserDocumentAgent(agentId, type, inputEl){
  const fichier = inputEl.files && inputEl.files[0];
  inputEl.value = '';
  if(!fichier) return;
  if(fichier.type && fichier.type !== 'application/pdf'){ notify('⚠️ Le fichier doit être un PDF', 'warn'); return; }

  notify('⏳ Envoi du document…');
  try{
    const form = new FormData();
    form.append('file', fichier);
    form.append('agentId', agentId);
    form.append('type', type);
    const authHeaders = await _authHeaders();
    delete authHeaders['Content-Type']; // laisser le navigateur fixer le boundary multipart
    const resp = await fetch('/api/upload-agent-document', { method: 'POST', headers: authHeaders, body: form });
    const data = await resp.json().catch(() => ({}));
    if(!resp.ok || !data.success){ notify('❌ ' + (data.error || 'Échec du dépôt'), 'err'); return; }

    const agent = (DB.agents || []).find(a => a.id === agentId);
    if(agent) agent[type + 'Path'] = data.path;
    renderAgentsSettings();
    notify('✅ Document déposé');
  }catch(e){ notify('❌ Erreur réseau lors du dépôt', 'err'); }
}

// ─── Rémunération (référence financière de la fiche agent) ──
// Lue côté serveur par api/_lib/agent-remuneration.js pour l'onglet
// « Rémunération » de l'espace agent. Champs vides = pas de tarif.
const CHAMPS_REM_TYPE = ['entrant','sortant','simultane','autre'];
// Grille par bien : lignes libres (libellé, typologies cochées, type de
// bien, surface) avec un tarif « nue » et un tarif « meublée », sur le
// modèle de l'annexe 2 du contrat. La première ligne dont les critères
// correspondent à la mission s'applique (api/_lib/agent-remuneration.js).
const TYPOS_REM = ['T1','T2','T3','T4','T5','T6','T7+'];
const BIENS_REM = ['Appartement','Maison','Studio','Garage','Parking','Local commercial'];
const typosLigne = l => Array.isArray(l.typos) ? l.typos : (l.typo ? [l.typo] : []);
const _valRem = v => v == null ? '' : v;
function htmlLigneRemuneration(l){
  const opt = (val, lib, actuel) => `<option value="${esc(val)}"${val === actuel ? ' selected' : ''}>${esc(lib)}</option>`;
  // Anciennes lignes bêta (simple / meuble) affichées dans les bonnes colonnes.
  const nue = l.nue != null ? l.nue : (l.meuble !== 'meuble' ? l.simple : '');
  const meublee = l.meublee != null ? l.meublee : (l.meuble === 'meuble' ? l.simple : '');
  return `<div class="rem-ligne" data-rem-ligne>
    <input class="rem-l-label" value="${esc(l.label || '')}" placeholder="Ex : Appartement T2" aria-label="Libellé de la ligne">
    <fieldset class="rem-l-typos"><legend class="sr-only">Typologies (aucune cochée = toutes)</legend>${TYPOS_REM.map(t => `<label class="rem-typo-chip"><input type="checkbox" value="${t}"${typosLigne(l).includes(t) ? ' checked' : ''}><span>${t}</span></label>`).join('')}</fieldset>
    <select class="rem-l-bien" aria-label="Type de bien">${opt('', 'Tous', l.bien || '')}${BIENS_REM.map(b => opt(b, b, l.bien)).join('')}</select>
    <span class="rem-l-surface"><input class="rem-l-smin" inputmode="decimal" value="${esc(_valRem(l.surfaceMin))}" placeholder="de" aria-label="Surface minimale (m²)"><input class="rem-l-smax" inputmode="decimal" value="${esc(_valRem(l.surfaceMax))}" placeholder="à" aria-label="Surface maximale (m²)"></span>
    <input class="rem-l-nue" inputmode="decimal" value="${esc(_valRem(nue))}" placeholder="€" aria-label="Tarif location nue">
    <input class="rem-l-meublee" inputmode="decimal" value="${esc(_valRem(meublee))}" placeholder="€" aria-label="Tarif location meublée">
    <span class="rem-ligne-actions">
      <button type="button" class="btn btn-sm" title="Monter (priorité plus haute)" aria-label="Monter la ligne" onclick="monterLigneRemuneration(this)">↑</button>
      <button type="button" class="btn btn-sm" title="Supprimer la ligne" aria-label="Supprimer la ligne" style="color:#c0392b;border-color:#c0392b" onclick="this.closest('[data-rem-ligne]').remove()">✕</button>
    </span>
  </div>`;
}
// Grille de l'annexe 2 du contrat (définie dans api/_lib/agent-remuneration.js,
// exposée par js/app-remuneration.js).
function grilleContrat(){ return (window.Remuneration && window.Remuneration.GRILLE_CONTRAT_2026) || { mode:'typologie', lignes: [] }; }
function renderLignesRemuneration(lignes){
  const wrap = document.getElementById('rem-typo-lignes');
  if(!wrap) return;
  const liste = (lignes && lignes.length) ? lignes : grilleContrat().lignes;
  wrap.innerHTML = liste.map(htmlLigneRemuneration).join('');
}
// Pré-remplit tout le formulaire avec la grille de l'annexe 2 du contrat.
function chargerGrilleContrat(){
  const g = JSON.parse(JSON.stringify(grilleContrat()));
  remplirFormulaireRemuneration(g);
  notify('Grille du contrat 2026 chargée — vérifiez puis enregistrez');
}
function ajouterLigneRemuneration(){
  const wrap = document.getElementById('rem-typo-lignes');
  if(!wrap) return;
  wrap.insertAdjacentHTML('beforeend', htmlLigneRemuneration({}));
  wrap.lastElementChild.querySelector('.rem-l-label').focus();
}
function monterLigneRemuneration(btn){
  const ligne = btn.closest('[data-rem-ligne]');
  if(ligne && ligne.previousElementSibling) ligne.parentNode.insertBefore(ligne, ligne.previousElementSibling);
}
function lireLignesRemuneration(){
  return Array.from(document.querySelectorAll('#rem-typo-lignes [data-rem-ligne]')).map(r => ({
    label: r.querySelector('.rem-l-label').value.trim(),
    typos: Array.from(r.querySelectorAll('.rem-l-typos input:checked')).map(c => c.value),
    bien: r.querySelector('.rem-l-bien').value,
    surfaceMin: r.querySelector('.rem-l-smin').value.trim(),
    surfaceMax: r.querySelector('.rem-l-smax').value.trim(),
    nue: r.querySelector('.rem-l-nue').value.trim(),
    meublee: r.querySelector('.rem-l-meublee').value.trim(),
  })).filter(l => l.label || l.nue || l.meublee);
}
function lignesDepuisReference(r){
  if(Array.isArray(r.lignes)) return r.lignes;
  if(r.parTypo) return TYPOS_REM.map(t => Object.assign({ label: t, typos: [t] }, r.parTypo[t] || {}));
  return null;
}
function majFormulaireRemuneration(){
  const mode = (document.getElementById('new-agent-rem-mode')||{}).value || 'forfait';
  const f = document.getElementById('agent-rem-forfait');
  const t = document.getElementById('agent-rem-typologie');
  const p = document.getElementById('agent-rem-pourcentage');
  if(f) f.style.display = mode === 'forfait' ? '' : 'none';
  if(t) t.style.display = mode === 'typologie' ? '' : 'none';
  if(p) p.style.display = mode === 'pourcentage' ? '' : 'none';
}
function lireFormulaireRemuneration(){
  const val = id => ((document.getElementById(id)||{}).value || '').trim();
  const parType = {};
  CHAMPS_REM_TYPE.forEach(k => { parType[k] = val('new-agent-rem-' + k); });
  return {
    mode: val('new-agent-rem-mode') || 'typologie', parType, lignes: lireLignesRemuneration(),
    typoAutre: val('new-agent-rem-typo-autre'), coefSortantEntrant: val('new-agent-rem-coef'),
    pourcentage: val('new-agent-rem-pct'), unite: val('new-agent-rem-unite') || 'HT', note: val('new-agent-rem-note'),
    fraisZone: { primaire: val('new-agent-rem-zone-primaire'), secondaire: val('new-agent-rem-zone-secondaire'), hors: val('new-agent-rem-zone-hors') },
    deplacementInfructueux: val('new-agent-rem-infructueux'),
  };
}
function remplirFormulaireRemuneration(rem){
  // Agent sans référence : la grille du contrat est proposée d'office (elle
  // n'est enregistrée qu'au clic sur « Enregistrer »), entièrement modifiable.
  const r = rem || JSON.parse(JSON.stringify(grilleContrat()));
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.value = v == null ? '' : v; };
  set('new-agent-rem-mode', ['pourcentage','forfait'].includes(r.mode) ? r.mode : 'typologie');
  set('new-agent-rem-coef', r.coefSortantEntrant);
  const fz = r.fraisZone || {};
  set('new-agent-rem-zone-primaire', fz.primaire);
  set('new-agent-rem-zone-secondaire', fz.secondaire);
  set('new-agent-rem-zone-hors', fz.hors);
  set('new-agent-rem-infructueux', r.deplacementInfructueux);
  renderLignesRemuneration(lignesDepuisReference(r));
  set('new-agent-rem-typo-autre', r.typoAutre);
  set('new-agent-rem-unite', r.unite || 'HT');
  CHAMPS_REM_TYPE.forEach(k => set('new-agent-rem-' + k, (r.parType || {})[k]));
  set('new-agent-rem-pct', r.pourcentage);
  set('new-agent-rem-note', r.note);
  majFormulaireRemuneration();
}
// Résumé affiché dans la liste des agents.
function resumeRemunerationAgent(rem){
  if(!rem) return 'Rémunération non renseignée';
  const unite = rem.unite === 'net' ? '€ net' : '€ ' + (rem.unite || 'HT');
  if(rem.mode === 'pourcentage') return rem.pourcentage ? 'Rémunération : ' + rem.pourcentage + ' % du montant HT' : 'Rémunération non renseignée';
  if(rem.mode === 'typologie'){
    const lignes = (lignesDepuisReference(rem) || []).filter(l => [l.nue, l.meublee, l.simple].some(v => v !== '' && v != null));
    if(!lignes.length) return 'Rémunération non renseignée';
    const fz = rem.fraisZone || {};
    const frais = ['primaire','secondaire','hors'].filter(z => fz[z] !== '' && fz[z] != null);
    return 'Rémunération : grille par bien, ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '')
      + (frais.length ? ' · déplacement ' + frais.map(z => ({primaire:'zone 1', secondaire:'zone 2', hors:'hors zone'})[z] + ' ' + fz[z] + ' ' + unite).join(', ') : '');
  }
  const lib = { entrant:'entrant', sortant:'sortant', simultane:'sortant+entrant', autre:'autre' };
  const parts = CHAMPS_REM_TYPE.filter(k => (rem.parType || {})[k] !== '' && (rem.parType || {})[k] != null).map(k => lib[k] + ' ' + rem.parType[k] + ' ' + unite);
  return parts.length ? 'Rémunération : ' + parts.join(' · ') : 'Rémunération non renseignée';
}

// ─── Suivi des paiements des rémunérations (Réglages › Agents EDL) ───
// Montants calculés par window.Remuneration (js/app-remuneration.js, généré
// depuis le calcul du serveur : mêmes montants que dans l'espace agent).
// Le statut est stocké sur la mission (remuPayee, remuPayeeLe) et
// synchronisé comme toute modification de mission.
function _eurosRemu(n, unite){
  if(n === null || n === undefined) return '—';
  const u = unite === 'net' ? '€ net' : '€ ' + (unite || 'HT');
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' ' + u;
}
function _libMoisRemu(cle){
  const [a, m] = String(cle).split('-').map(Number);
  if(!a || !m) return 'Date inconnue';
  const t = new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Secteurs de l'agent (zones validées) pour les frais de déplacement.
function zonesAgent(a){ return { primaire: a.secteurPrimaire, secondaire: a.secteurSecondaire, statut: a.zoneStatut }; }
function renderRemunerationsAgents(){
  const box = document.getElementById('remu-agents-contenu');
  const sel = document.getElementById('remu-agent-select');
  if(!box || !sel || typeof window.Remuneration === 'undefined') return;
  const agents = DB.agents || [];
  if(!agents.length){ sel.innerHTML = ''; box.innerHTML = '<div class="empty">Aucun agent enregistré.</div>'; return; }
  const choisi = agents.some(a => a.id === sel.value) ? sel.value : agents[0].id;
  sel.innerHTML = agents.map(a => `<option value="${esc(a.id)}"${a.id === choisi ? ' selected' : ''}>${esc(a.nom)}</option>`).join('');
  const agent = agents.find(a => a.id === choisi);
  const filtre = (document.getElementById('remu-filtre') || {}).value || 'apayer';
  const missions = (DB.missions || []).filter(m => m.expertId === agent.id);
  const r = window.Remuneration.calculerRemuneration(missions, agent.remuneration, new Date(), zonesAgent(agent));
  const sansGrille = agents.filter(a => !a.remuneration).length;
  const boutonContrat = sansGrille ? `<button type="button" class="btn btn-sm" style="margin-bottom:14px" onclick="appliquerGrilleContratAgentsSansGrille()"><i class="ti ti-file-text"></i> Appliquer la grille du contrat 2026 aux ${sansGrille} agent${sansGrille > 1 ? 's' : ''} sans grille</button>` : '';
  if(!r.reference.configuree){
    box.innerHTML = boutonContrat + `<div class="info-box warn">${esc(agent.nom)} n'a pas encore de référence financière : renseignez-la dans sa fiche (crayon ci-dessus) ou appliquez la grille du contrat.</div>` + blocFacturesAgent(agent);
    return;
  }
  const u = r.reference.unite;
  const acquises = r.lignes.filter(l => l.etat === 'acquise')
    .filter(l => filtre === 'toutes' || (filtre === 'payees' ? l.payee : !l.payee));
  const parMois = {};
  acquises.forEach(l => { const k = String(l.date).slice(0, 7) || 'inconnu'; (parMois[k] = parMois[k] || []).push(l); });
  const mois = Object.keys(parMois).sort().reverse();
  const lignesHTML = mois.map(k => {
    const ls = parMois[k];
    const total = ls.reduce((s, l) => s + (l.montant || 0), 0);
    const aPayer = ls.filter(l => !l.payee && l.montant !== null).length;
    return `<tr class="remu-mois-entete"><td colspan="4">${esc(_libMoisRemu(k))} · ${ls.length} mission${ls.length > 1 ? 's' : ''}</td>
        <td style="text-align:right">${esc(_eurosRemu(Math.round(total * 100) / 100, u))}</td>
        <td>${aPayer ? `<button type="button" class="btn btn-sm" onclick="marquerMoisRemuPaye('${esc(agent.id)}','${esc(k)}')">Tout marquer payé</button>` : ''}</td></tr>`
      + ls.map(l => `<tr>
        <td>${esc(l.date ? new Date(l.date).toLocaleDateString('fr-FR') : '—')}</td>
        <td>${esc(l.adresse || '—')}</td>
        <td>${esc(l.type || '—')}</td>
        <td>${esc(l.ligneGrille || (l.typologie !== 'Non renseignée' ? l.typologie : '—'))}</td>
        <td style="text-align:right;font-weight:600">${esc(_eurosRemu(l.montant, u))}${l.frais ? `<div style="font-size:11.5px;font-weight:400;color:var(--text2)">dont ${esc(_eurosRemu(l.frais, u))} dépl. (${esc((window.Remuneration.ZONES || {})[l.zone] || '')})</div>` : ''}</td>
        <td><label class="remu-paye"${l.montant === null ? ' title="Pas de tarif dans la grille de l’agent"' : ''}>
          <input type="checkbox"${l.payee ? ' checked' : ''}${l.montant === null ? ' disabled' : ''} onchange="marquerRemuPayee('${esc(l.id)}', this.checked)">
          ${l.payee ? 'Payée' + (l.payeeLe ? ' le ' + esc(new Date(l.payeeLe).toLocaleDateString('fr-FR')) : '') : 'À payer'}
        </label></td></tr>`).join('');
  }).join('');
  box.innerHTML = `
    <div class="remu-tuiles">
      <div><b>${esc(_eurosRemu(r.paiements.resteAPayer, u))}</b><span>Reste à payer (${r.paiements.nbAPayer} mission${r.paiements.nbAPayer > 1 ? 's' : ''})</span></div>
      <div><b>${esc(_eurosRemu(r.moisCourant.paye, u))}</b><span>Payé ce mois-ci</span></div>
      <div><b>${esc(_eurosRemu(r.moisCourant.acquis, u))}</b><span>Acquis ce mois-ci</span></div>
    </div>
    ${r.nonCouvertes ? `<div class="info-box warn" style="margin-bottom:14px">${r.nonCouvertes} mission${r.nonCouvertes > 1 ? 's' : ''} sans tarif dans la grille de ${esc(agent.nom)}.</div>` : ''}
    ${acquises.length ? `<div style="overflow-x:auto"><table class="tbl tbl-remu"><thead><tr><th>Date</th><th>Adresse</th><th>Type</th><th>Bien</th><th style="text-align:right">Montant</th><th>Paiement</th></tr></thead><tbody>${lignesHTML}</tbody></table></div>`
      : `<div class="empty">${filtre === 'apayer' ? 'Rien à payer : tout est à jour.' : 'Aucune mission terminée à afficher.'}</div>`}
    ${blocAnnuleesRemu(agent, missions, u)}
    ${blocFacturesAgent(agent)}`;
  if(boutonContrat) box.insertAdjacentHTML('afterbegin', boutonContrat);
}
// Factures envoyées par l'agent depuis son espace (onglet « Facturation »,
// api/agent-facture-envoyer.js) et ses informations juridiques — lecture
// seule ici : c'est l'agent qui les saisit et qui émet la facture.
function blocFacturesAgent(agent){
  const factures = Array.isArray(agent.factures) ? agent.factures : [];
  const i = agent.infosLegales || {};
  const juridique = [i.raisonSociale, i.statut, i.siret ? 'SIRET ' + i.siret : '', i.rcs, i.tvaIntra ? 'TVA ' + i.tvaIntra : '', i.regimeTva === 'franchise' ? 'TVA non applicable (art. 293 B)' : (i.regimeTva === 'assujetti' ? 'TVA ' + (i.tauxTva || 20) + ' %' : '')].filter(Boolean);
  return `<div style="margin-top:22px">
    <div style="font-weight:600;font-size:14px;margin-bottom:6px"><i class="ti ti-file-invoice"></i> Factures de ${esc(agent.nom)}</div>
    <div style="font-size:12.5px;color:var(--text2);margin-bottom:10px">${juridique.length ? esc(juridique.join(' · ')) : 'Informations juridiques non renseignées par l’agent (il les complète dans son espace, « Mon compte »).'}</div>
    ${factures.length ? `<div style="overflow-x:auto"><table class="tbl tbl-remu"><thead><tr><th>N°</th><th>Mois</th><th>Missions</th><th style="text-align:right">HT</th><th style="text-align:right">TTC</th><th>Reçue le</th><th></th></tr></thead><tbody>${factures.map(f => `<tr>
      <td style="font-weight:600">${esc(f.numero)}</td>
      <td>${esc(f.mois ? _libMoisRemu(f.mois) : '—')}</td>
      <td>${esc(f.nbLignes || 0)}</td>
      <td style="text-align:right">${esc(_eurosRemu(f.totalHT, 'HT'))}</td>
      <td style="text-align:right;font-weight:600">${esc(_eurosRemu(f.totalTTC, 'HT').replace(' HT', ''))}</td>
      <td>${esc(f.envoyeeLe ? new Date(f.envoyeeLe).toLocaleDateString('fr-FR') : '—')}</td>
      <td>${f.chemin ? `<button type="button" class="btn btn-sm" onclick="telechargerFactureAgent('${esc(agent.id)}','${esc(f.numero)}')"><i class="ti ti-download"></i> PDF</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty" style="padding:12px 0">Aucune facture reçue pour l’instant.</div>'}
  </div>`;
}
async function telechargerFactureAgent(agentId, numero){
  try{
    const token = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const resp = await fetch('/api/agent-facture-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ agentId, numero }),
    });
    const data = await resp.json();
    if(!resp.ok){ notify(data.error || 'Téléchargement impossible', 'error'); return; }
    window.open(data.url, '_blank', 'noopener');
  }catch(e){ notify('Erreur réseau', 'error'); }
}
// Missions annulées de l'agent : l'agence peut cocher « déplacement
// infructueux » (l'agent s'est déplacé pour rien) — payé selon sa fiche.
function blocAnnuleesRemu(agent, missions, u){
  const annulees = missions.filter(m => String(m.statut || '').toLowerCase().includes('annul'))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20);
  if(!annulees.length) return '';
  const tarif = window.Remuneration.normaliserReference(agent.remuneration).deplacementInfructueux;
  return `<details style="margin-top:18px"><summary style="cursor:pointer;font-weight:600;font-size:13.5px">Missions annulées (${annulees.length}) — déplacement infructueux</summary>
    <div style="font-size:12.5px;color:var(--text2);margin:8px 0">Cochez si l'agent s'est déplacé pour rien${tarif !== null ? ' : ' + esc(_eurosRemu(tarif, u)) + ' lui sont dus' : ' (tarif à renseigner dans sa fiche)'}.</div>
    ${annulees.map(m => `<label class="remu-paye" style="display:flex;padding:6px 0">
      <input type="checkbox"${m.deplacementInfructueux ? ' checked' : ''} onchange="marquerDeplacementInfructueux('${esc(m.id)}', this.checked)">
      ${esc(m.date ? new Date(m.date).toLocaleDateString('fr-FR') : '—')} · ${esc(m.adresse || '—')} · ${esc(m.type || '')}
    </label>`).join('')}
  </details>`;
}
function marquerDeplacementInfructueux(missionId, oui){
  const m = (DB.missions || []).find(x => String(x.id) === String(missionId));
  if(!m) return;
  m.deplacementInfructueux = !!oui;
  if(!oui){ m.remuPayee = false; m.remuPayeeLe = ''; }
  if(typeof pushToSupabase === 'function') pushToSupabase('missions', m);
  saveToStorage();
  renderRemunerationsAgents();
  notify(oui ? 'Déplacement infructueux enregistré' : 'Déplacement infructueux retiré');
}
// Applique la grille de l'annexe 2 du contrat aux agents qui n'ont pas
// encore de référence (jamais à ceux qui en ont une, pour ne rien écraser).
function appliquerGrilleContratAgentsSansGrille(){
  const cibles = (DB.agents || []).filter(a => !a.remuneration);
  if(!cibles.length || !confirm(`Appliquer la grille du contrat 2026 à ${cibles.length} agent${cibles.length > 1 ? 's' : ''} (${cibles.map(a => a.nom).join(', ')}) ? Elle restera modifiable dans chaque fiche.`)) return;
  cibles.forEach(a => { a.remuneration = JSON.parse(JSON.stringify(grilleContrat())); });
  saveToStorage();
  persistAgents();
  renderAgentsSettings();
  notify('✅ Grille du contrat appliquée à ' + cibles.length + ' agent' + (cibles.length > 1 ? 's' : ''));
}
function _enregistrerPaiementMission(m, payee){
  m.remuPayee = !!payee;
  m.remuPayeeLe = payee ? new Date().toISOString() : '';
  if(typeof pushToSupabase === 'function') pushToSupabase('missions', m);
}
function marquerRemuPayee(missionId, payee){
  const m = (DB.missions || []).find(x => String(x.id) === String(missionId));
  if(!m) return;
  _enregistrerPaiementMission(m, payee);
  saveToStorage();
  renderRemunerationsAgents();
  notify(payee ? '✅ Mission marquée payée' : 'Mission repassée « à payer »');
}
function marquerMoisRemuPaye(agentId, mois){
  const agent = (DB.agents || []).find(a => a.id === agentId);
  if(!agent || typeof window.Remuneration === 'undefined') return;
  const r = window.Remuneration.calculerRemuneration((DB.missions || []).filter(m => m.expertId === agentId), agent.remuneration, new Date(), zonesAgent(agent));
  const ids = r.lignes.filter(l => l.etat === 'acquise' && !l.payee && l.montant !== null && String(l.date).slice(0, 7) === mois).map(l => String(l.id));
  if(!ids.length || !confirm(`Marquer ${ids.length} mission${ids.length > 1 ? 's' : ''} de ${_libMoisRemu(mois).toLowerCase()} comme payée${ids.length > 1 ? 's' : ''} ?`)) return;
  (DB.missions || []).filter(m => ids.includes(String(m.id))).forEach(m => _enregistrerPaiementMission(m, true));
  saveToStorage();
  renderRemunerationsAgents();
  notify('✅ ' + ids.length + ' mission' + (ids.length > 1 ? 's' : '') + ' marquée' + (ids.length > 1 ? 's' : '') + ' payée' + (ids.length > 1 ? 's' : ''));
}

function editerAgent(id){
  const agent = (DB.agents || []).find(a => a.id === id);
  if(!agent) return;
  _editingAgentId = id;
  document.getElementById('new-agent-nom').value = agent.nom || '';
  document.getElementById('new-agent-tel').value = agent.tel || '';
  const emailEl = document.getElementById('new-agent-email');
  const secteursEl = document.getElementById('new-agent-secteurs');
  if(emailEl) emailEl.value = agent.email || '';
  if(secteursEl) secteursEl.value = agent.secteurs || '';
  remplirFormulaireRemuneration(agent.remuneration);
  const submitBtn = document.getElementById('agent-submit-btn');
  if(submitBtn) submitBtn.innerHTML = '<i class="ti ti-check"></i> Enregistrer les modifications';
  const cancelBtn = document.getElementById('agent-cancel-btn');
  if(cancelBtn) cancelBtn.style.display = '';
  document.getElementById('new-agent-nom').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function annulerEditionAgent(){
  _editingAgentId = null;
  document.getElementById('new-agent-nom').value = '';
  document.getElementById('new-agent-tel').value = '';
  const emailEl = document.getElementById('new-agent-email');
  const secteursEl = document.getElementById('new-agent-secteurs');
  if(emailEl) emailEl.value = '';
  if(secteursEl) secteursEl.value = '';
  remplirFormulaireRemuneration(null);
  const submitBtn = document.getElementById('agent-submit-btn');
  if(submitBtn) submitBtn.innerHTML = '<i class="ti ti-user-plus"></i> Ajouter cet agent';
  const cancelBtn = document.getElementById('agent-cancel-btn');
  if(cancelBtn) cancelBtn.style.display = 'none';
}

function addAgent(){
  const nomEl = document.getElementById('new-agent-nom');
  const telEl = document.getElementById('new-agent-tel');
  const emailEl = document.getElementById('new-agent-email');
  const secteursEl = document.getElementById('new-agent-secteurs');
  const nom = nomEl.value.trim();
  const tel = telEl.value.trim();
  const email = (emailEl ? emailEl.value : '').trim();
  const secteurs = (secteursEl ? secteursEl.value : '').trim();
  if(!nom){ notify('⚠️ Le nom de l\'agent est requis', 'warn'); return; }
  const remuneration = lireFormulaireRemuneration();
  if(!DB.agents) DB.agents = [];

  // Note : "adresse" n'est jamais écrit ici — c'est l'agent qui la renseigne
  // lui-même depuis son espace (Mon compte), pas l'agence. Object.assign ne
  // portant que sur les clés listées, une modification admin ne l'efface pas.
  const estUneCreation = !_editingAgentId;
  if(_editingAgentId){
    const agent = DB.agents.find(a => a.id === _editingAgentId);
    if(agent){ Object.assign(agent, { nom, tel, email, secteurs, remuneration }); }
    _editingAgentId = null;
  } else {
    DB.agents.push({ id: 'agent_' + Date.now(), nom, tel, email, secteurs, remuneration });
  }

  saveToStorage();
  persistAgents();
  annulerEditionAgent();
  renderAgentsSettings();
  notify('✅ Agent enregistré');

  // Envoie automatiquement le lien de l'espace agent à la création (jamais
  // lors d'une simple modification, pour ne pas renvoyer l'email à chaque
  // correction de coordonnées). Best-effort : un échec d'envoi ne doit
  // jamais bloquer ni annuler la création de l'agent elle-même.
  if(estUneCreation && email) envoyerBienvenueAgent(email, nom);
}

async function envoyerBienvenueAgent(email, nom){
  try{
    const headers = await _authHeaders({ 'Content-Type': 'application/json' });
    await fetch('/api/send-welcome-agent', { method: 'POST', headers, body: JSON.stringify({ email, nom }) });
  }catch(e){ console.warn('envoyerBienvenueAgent:', e); }
}

// Sauvegarde ciblée des agents dans Supabase (settings), sans lire le
// formulaire de réglages — évite d'écraser des champs si le formulaire
// n'est pas affiché. Fusionne avec les settings existants côté serveur.
async function persistAgents(){
  if(typeof saveSettingsToSupabase !== 'function') return;
  try{
    if(!_supaReady || !_currentUser) return;
    const { data } = await supabaseClient.from('settings').select('data').eq('user_id', _currentUser.id).maybeSingle();
    const s = (data && data.data) ? data.data : {};
    s.agents = DB.agents || [];
    await saveSettingsToSupabase(s);
  }catch(e){ console.warn('persistAgents:', e); }
}

function removeAgent(id){
  if(!confirm('Retirer cet agent de la liste ?')) return;
  DB.agents = DB.agents.filter(a => a.id !== id);
  saveToStorage();
  persistAgents();
  if(_editingAgentId === id) annulerEditionAgent();
  renderAgentsSettings();
}

// ─── SETTINGS ─────────────────────────────────────────────
function loadSettingsForm(){
  renderAgentsSettings();
  renderBaremeSettings();
  document.getElementById('set-notion-token').value=CFG.notionToken||'';
  document.getElementById('set-notion-page').value=CFG.notionPageId||'';
  document.getElementById('set-brevo-key').value=CFG.brevoKey||'';
  // Profil et identite d'envoi
  const _set=(id,v)=>{const e=document.getElementById(id); if(e) e.value=v||'';};
  _set('set-name',CFG.userName);
  _set('set-email',CFG.userEmail);
  _set('set-company',CFG.companyName);
  _set('set-legal-raison',CFG.legalRaisonSociale);
  _set('set-legal-adresse',CFG.legalAdresse);
  _set('set-legal-rcs',CFG.legalRcs);
  _set('set-legal-siret',CFG.legalSiret);
  _set('set-legal-tva',CFG.legalTvaIntra);
  _set('set-exp-nom',CFG.expediteurNom);
  _set('set-exp-email',CFG.expediteurEmail);
  _set('set-exp-tel',CFG.expediteurTel);
  _set('set-exp-signature',CFG.expediteurSignature);
  _set('set-exp-partenaire',CFG.expediteurPartenaire);
  _set('set-exp-avis-google',CFG.avisGoogleLien);
  _set('set-couleur',CFG.couleurPrimaire);
  _set('set-couleur-hex',CFG.couleurPrimaire);
  afficherApercuLogo(CFG.logoPath ? AGENCY_LOGOS_BUCKET_URL+CFG.logoPath : '');
  const ck=document.getElementById('set-claude-key');
  if(ck) ck.value=localStorage.getItem('edl_claude_key')||'';
  // Afficher une alerte si les clés ne sont pas configurées
  if(!CFG.brevoKey){
    setTimeout(()=>notify('⚠️ Clé API Brevo non configurée — va dans Paramètres','warn'),1000);
  }
}
function saveSettings(){
  CFG.notionToken=document.getElementById('set-notion-token').value.trim();
  CFG.notionPageId=document.getElementById('set-notion-page').value.trim();
  CFG.brevoKey=document.getElementById('set-brevo-key').value.trim();
  // Profil et identite d'envoi
  const _get=id=>{const e=document.getElementById(id); return e?e.value.trim():'';};
  CFG.userName=_get('set-name');
  CFG.userEmail=_get('set-email');
  CFG.companyName=_get('set-company')||CFG.companyName;
  CFG.legalRaisonSociale=_get('set-legal-raison');
  CFG.legalAdresse=_get('set-legal-adresse');
  CFG.legalRcs=_get('set-legal-rcs');
  CFG.legalSiret=_get('set-legal-siret');
  CFG.legalTvaIntra=_get('set-legal-tva');
  CFG.expediteurNom=_get('set-exp-nom');
  CFG.expediteurEmail=_get('set-exp-email');
  CFG.expediteurTel=_get('set-exp-tel');
  CFG.expediteurSignature=_get('set-exp-signature');
  CFG.expediteurPartenaire=_get('set-exp-partenaire');
  CFG.avisGoogleLien=_get('set-exp-avis-google');
  CFG.couleurPrimaire=_get('set-couleur')||'#1A5FA8';
  appliquerCouleurMarque(CFG.couleurPrimaire);
  afficherExpediteurCompose();
  const claudeKey=document.getElementById('set-claude-key')?.value.trim();
  if(claudeKey) localStorage.setItem('edl_claude_key', claudeKey);
  // Sauvegarder dans Supabase (lié au user_id)
  const settingsData={
    brevoKey:CFG.brevoKey,
    notionToken:CFG.notionToken,
    notionPageId:CFG.notionPageId,
    claudeKey:claudeKey||'',
   // Nom de societe : champ "Societe" (set-company), pas le nom personnel
    // (set-name). Cette valeur sert de nom d'expediteur cote serveur.
    companyName:CFG.companyName,
    legalRaisonSociale:CFG.legalRaisonSociale||'',
    legalAdresse:CFG.legalAdresse||'',
    legalRcs:CFG.legalRcs||'',
    legalSiret:CFG.legalSiret||'',
    legalTvaIntra:CFG.legalTvaIntra||'',
    userName:CFG.userName||'',
    userEmail:CFG.userEmail||'',
    expediteurNom:CFG.expediteurNom||'',
    expediteurEmail:CFG.expediteurEmail||'',
    expediteurTel:CFG.expediteurTel||'',
    expediteurSignature:CFG.expediteurSignature||'',
    expediteurPartenaire:CFG.expediteurPartenaire||'',
    avisGoogleLien:CFG.avisGoogleLien||'',
    couleurPrimaire:CFG.couleurPrimaire||'',
    agents:DB.agents||[]
  };
  saveSettingsToSupabase(settingsData);
  // Rafraîchir le nom de la sidebar
  const sidebarName = document.getElementById('sidebar-company-name');
  if(sidebarName && settingsData.companyName) sidebarName.textContent = settingsData.companyName;
  notify('✅ Paramètres enregistrés et synchronisés !');
}

// ─── IDENTITÉ VISUELLE (couleur + logo) ───────────────────
function onCouleurSwatchChange(hex){
  const champHex=document.getElementById('set-couleur-hex');
  if(champHex) champHex.value=hex;
  appliquerCouleurMarque(hex);
}
function onCouleurHexChange(valeur){
  const hex=(valeur||'').trim();
  if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return; // en cours de saisie, on attend un hex complet
  const swatch=document.getElementById('set-couleur');
  if(swatch) swatch.value=hex;
  appliquerCouleurMarque(hex);
}
function afficherApercuLogo(url){
  const img=document.getElementById('set-logo-apercu');
  const retirer=document.getElementById('set-logo-retirer');
  if(!img) return;
  if(url){ img.src=url; img.style.display=''; if(retirer) retirer.style.display=''; }
  else { img.style.display='none'; img.removeAttribute('src'); if(retirer) retirer.style.display='none'; }
}
async function televerserLogoAgence(inputEl){
  const fichier=inputEl.files && inputEl.files[0];
  if(!fichier) return;
  try{
    const form=new FormData();
    form.append('file',fichier);
    const authHeaders=await _authHeaders();
    delete authHeaders['Content-Type']; // laisser le navigateur fixer le boundary multipart
    const resp=await fetch('/api/upload-agency-logo',{ method:'POST', headers:authHeaders, body:form });
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok || !data.success){ notify('❌ '+(data.error||'Échec du dépôt du logo'),'err'); return; }
    CFG.logoPath=data.path;
    afficherApercuLogo(data.url);
    appliquerLogoMarque(data.url);
    notify('✅ Logo mis à jour');
  }catch(e){ notify('❌ Erreur réseau lors du dépôt du logo','err'); }
  finally{ inputEl.value=''; }
}
async function retirerLogoAgence(){
  try{
    const resp=await fetch('/api/upload-agency-logo',{ method:'DELETE', headers:await _authHeaders() });
    if(!resp.ok){ notify('❌ Échec du retrait du logo','err'); return; }
    CFG.logoPath='';
    afficherApercuLogo('');
    appliquerLogoMarque('');
    notify('✅ Logo retiré');
  }catch(e){ notify('❌ Erreur réseau lors du retrait du logo','err'); }
}
function majAffichageIdentiteVisuelle(){
  const verrou=document.getElementById('identite-visuelle-verrou');
  const controles=document.getElementById('identite-visuelle-controles');
  if(!verrou || !controles) return;
  const plan=(_userPlan && _userPlan.plan) || 'free';
  const autorise=isAdmin() || plan!=='free';
  verrou.style.display=autorise?'none':'';
  controles.style.display=autorise?'':'none';
}

// ─── DOUBLE AUTHENTIFICATION (TOTP) ────────────────────────
// Réservée à qui l'active soi-même (aucun rôle codé en dur) : Supabase
// n'exige un second facteur (aal2) qu'aux comptes ayant un facteur TOTP
// vérifié — les autres comptes ne voient jamais l'écran de vérification.
let _mfaFactorId = null;         // facteur actif (activé et vérifié)
let _mfaEnrollFactorId = null;   // facteur en cours d'activation (pas encore confirmé)
let _mfaPendingUser = null;      // utilisateur en attente du code, entre signInWithPassword et challengeAndVerify

async function mfaChallengeRequis(){
  try{
    const { data, error } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if(error || !data) return null;
    if(data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'){
      const { data: facteurs } = await supabaseClient.auth.mfa.listFactors();
      const facteur = (facteurs?.totp || []).find(f => f.status === 'verified');
      if(facteur) return { factorId: facteur.id };
    }
  }catch(e){ /* en cas d'erreur, ne jamais bloquer la connexion */ }
  return null;
}

// Point d'entrée unique après un signInWithPassword ou une restauration de
// session : ouvre le CRM directement, ou intercale l'écran de code si ce
// compte a activé la double authentification.
async function tenterOuvrirSession(user){
  const besoin = await mfaChallengeRequis();
  if(besoin){
    _mfaPendingUser = user;
    afficherEcranMfa(besoin.factorId);
  } else {
    onAuthSuccess(user);
  }
}

function afficherEcranMfa(factorId){
  _mfaFactorId = factorId;
  document.getElementById('auth-login').style.display = 'none';
  document.getElementById('auth-signup').style.display = 'none';
  document.querySelectorAll('.auth-tab').forEach(t => t.style.display = 'none');
  document.getElementById('auth-error').classList.remove('show');
  document.getElementById('auth-success').classList.remove('show');
  document.getElementById('auth-mfa').style.display = 'block';
  const champ = document.getElementById('mfa-code');
  champ.value = '';
  champ.focus();
}
async function verifierCodeMfa(){
  const code = document.getElementById('mfa-code').value.trim();
  if(!/^\d{6}$/.test(code)){ showAuthError('Code à 6 chiffres requis'); return; }
  const btn = document.getElementById('mfa-verify-btn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Vérification…';
  try{
    const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId: _mfaFactorId, code });
    if(error) throw error;
    document.getElementById('auth-mfa').style.display = 'none';
    const user = _mfaPendingUser;
    _mfaPendingUser = null;
    onAuthSuccess(user);
  }catch(e){
    showAuthError('Code invalide ou expiré — réessayez');
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-check"></i> Vérifier';
}
async function annulerMfa(){
  _mfaPendingUser = null;
  await supabaseClient.auth.signOut();
  document.getElementById('auth-mfa').style.display = 'none';
  document.querySelectorAll('.auth-tab').forEach(t => t.style.display = '');
  authTab('login', document.querySelector('.auth-tab'));
}

// ── Activation depuis Paramètres → Sécurité (compte admin uniquement) ──
async function chargerEtatMfa(){
  if(!document.getElementById('securite-section')) return;
  try{
    const { data, error } = await supabaseClient.auth.mfa.listFactors();
    if(error) throw error;
    const facteur = (data?.totp || []).find(f => f.status === 'verified');
    afficherEtatMfa(facteur || null);
  }catch(e){ console.warn('Erreur chargement état MFA:', e); }
}
function afficherEtatMfa(facteur){
  const statut = document.getElementById('mfa-statut');
  const zoneActivee = document.getElementById('mfa-zone-activee');
  const zoneInactive = document.getElementById('mfa-zone-inactive');
  const zoneEnrolement = document.getElementById('mfa-zone-enrolement');
  if(zoneEnrolement) zoneEnrolement.style.display = 'none';
  if(facteur){
    _mfaFactorId = facteur.id;
    if(statut) statut.innerHTML = '<span style="color:var(--green,#2F8F5B)"><i class="ti ti-shield-check"></i> Activée</span>';
    if(zoneActivee) zoneActivee.style.display = '';
    if(zoneInactive) zoneInactive.style.display = 'none';
  } else {
    if(statut) statut.innerHTML = '<span style="color:var(--text2)"><i class="ti ti-shield-off"></i> Désactivée</span>';
    if(zoneActivee) zoneActivee.style.display = 'none';
    if(zoneInactive) zoneInactive.style.display = '';
  }
}
async function demarrerEnrolementMfa(){
  try{
    const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: 'totp' });
    if(error) throw error;
    _mfaEnrollFactorId = data.id;
    document.getElementById('mfa-qr').src = data.totp.qr_code;
    document.getElementById('mfa-secret').textContent = data.totp.secret;
    const erreur = document.getElementById('mfa-enrol-erreur');
    if(erreur){ erreur.classList.remove('show'); erreur.textContent = ''; }
    document.getElementById('mfa-enrol-code').value = '';
    document.getElementById('mfa-zone-enrolement').style.display = '';
  }catch(e){
    notify('❌ ' + (e.message || 'Impossible de démarrer l\'activation'), 'err');
  }
}
async function confirmerEnrolementMfa(){
  const code = document.getElementById('mfa-enrol-code').value.trim();
  const erreur = document.getElementById('mfa-enrol-erreur');
  if(!/^\d{6}$/.test(code)){
    if(erreur){ erreur.textContent = 'Code à 6 chiffres requis'; erreur.classList.add('show'); }
    return;
  }
  const btn = document.getElementById('mfa-enrol-confirmer-btn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Vérification…';
  try{
    const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId: _mfaEnrollFactorId, code });
    if(error) throw error;
    _mfaEnrollFactorId = null;
    notify('✅ Double authentification activée');
    await chargerEtatMfa();
  }catch(e){
    if(erreur){ erreur.textContent = 'Code invalide — réessayez'; erreur.classList.add('show'); }
  }
  btn.disabled = false; btn.innerHTML = 'Confirmer';
}
function annulerEnrolementMfa(){
  document.getElementById('mfa-zone-enrolement').style.display = 'none';
  // Retirer le facteur non confirmé pour ne pas laisser un facteur "unverified" trainer
  if(_mfaEnrollFactorId){
    supabaseClient.auth.mfa.unenroll({ factorId: _mfaEnrollFactorId }).catch(()=>{});
    _mfaEnrollFactorId = null;
  }
}
async function desactiverMfa(){
  if(!_mfaFactorId) return;
  if(!confirm('Désactiver la double authentification ?')) return;
  try{
    const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: _mfaFactorId });
    if(error) throw error;
    _mfaFactorId = null;
    notify('Double authentification désactivée');
    await chargerEtatMfa();
  }catch(e){
    notify('❌ ' + (e.message || 'Erreur lors de la désactivation'), 'err');
  }
}

// ─── INIT ─────────────────────────────────────────────────
// Charger la clé Brevo depuis brevo_config.json (persistance même si localStorage effacé)
(async () => {
  try {
    const r = { ok: false }; // /api/config supprimé (sécurité);
    if(r.ok){
      const cfg = await r.json();
      if(cfg.brevo_api_key){
        window._brevoKeyFromFile = cfg.brevo_api_key;
        // Si pas encore dans localStorage, l'y mettre
        if(!localStorage.getItem('edl_brevo_key')){
          localStorage.setItem('edl_brevo_key', cfg.brevo_api_key);
          console.log('✅ Clé Brevo chargée depuis brevo_config.json');
        }
      }
    }
  } catch(e){ console.warn('brevo_config.json non trouvé:', e); }
})();
document.addEventListener('DOMContentLoaded', function() {
  loadFromStorage();
  renderDashboard();
  renderCalendar();
  updateBackupDate();
  // Montrer l'écran login immédiatement
  const authScreen = document.getElementById('auth-screen');
  const crmEl = document.querySelector('.crm');
  if(authScreen) authScreen.classList.add('show');
  if(crmEl) crmEl.style.display='none';
  // Puis vérifier si session existante
  checkAuth();
});

// ─── INIT SUPABASE (cloud sync multi-appareils) ────────────
// Le chargement Supabase se fait après auth dans onAuthSuccess
(async () => {
  if(!window._EXTRANET_MODE) subscribeRealtime();
})();

// Charger objectifs CA sauvegardés
setTimeout(()=>{
  const om=document.getElementById('obj-mensuel');const ot=document.getElementById('obj-trim');const oa=document.getElementById('obj-annuel');
  if(om)om.value=localStorage.getItem('edl_obj_mensuel')||'';
  if(ot)ot.value=localStorage.getItem('edl_obj_trim')||'';
  if(oa)oa.value=localStorage.getItem('edl_obj_annuel')||'';
},500);
// Démarrer la sync automatique toutes les 5 min (seulement en mode CRM,
// et réservé à l'admin — voir api/brevo-contacts.js)
setTimeout(()=>{
  if(window._EXTRANET_MODE || !isAdmin()) return;
  startAutoSync();
  silentSyncBrevo(); // Sync immédiate au démarrage
}, 2000);
function scrollToHelp(id){
  const el=document.getElementById(id);
  if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
}
function searchHelp(val){
  const q=val.toLowerCase();
  const sections=document.querySelectorAll('#help-content .settings-section');
  sections.forEach(s=>{
    s.style.display=(!q||s.textContent.toLowerCase().includes(q))?'block':'none';
  });
}
// ─── ONBOARDING ───────────────────────────────────────────
// ─── ADMIN ────────────────────────────────────────────────
const ADMIN_EMAILS = ['contact@edl-idf.com'];
const PLAN_LIMITS = {
  free    : { contacts: 100, missions: 20,  label: 'Gratuit'  },
  starter : { contacts: 500, missions: 100, label: 'Starter'  },
  pro     : { contacts: Infinity, missions: Infinity, label: 'Pro' }
};

let _userPlan = null; // plan de l'utilisateur connecté

function isAdmin(){ return _currentUser && ADMIN_EMAILS.includes(_currentUser.email); }

async function loadUserPlan(){
  if(!_supaReady || !_currentUser) return;
  try{
    const { data } = await supabaseClient
      .from('user_plans')
      .select('*')
      .eq('user_id', _currentUser.id)
      .maybeSingle();
    _userPlan = data || { plan: 'free', status: 'active' };
  } catch(e){
    _userPlan = { plan: 'free', status: 'active' };
  }
  majAffichageAbonnement();
}

// ─── ABONNEMENT (Stripe Checkout) ─────────────────────────
function majAffichageAbonnement(){
  // Valeurs de plan/rôle — calculées en premier car elles pilotent aussi
  // le badge de la sidebar, qui doit se mettre à jour sur TOUTES les pages
  // (pas seulement quand la section Abonnement des Réglages est affichée).
  const role = (_userPlan && _userPlan.role) || 'expert';
  const plan = (_userPlan && _userPlan.plan) || 'free';
  const status = (_userPlan && _userPlan.status) || 'active';
  const libelle = { free:'Gratuit', starter:'Starter', pro:'Pro' }[plan] || plan;

  // Sous-titre de la sidebar (au lieu de "CRM Pro" figé)
  const sidebarSub = document.getElementById('sidebar-user-email');
  if(sidebarSub){
    if(isAdmin()) sidebarSub.textContent = 'Administrateur';
    else if(role === 'agence') sidebarSub.textContent = 'Espace agence';
    else sidebarSub.textContent = 'CRM ' + libelle;
  }

  // Badge "Pro · Actif" (ciblé par sa classe, pas d'id nécessaire)
  const badge = document.querySelector('.logo-badges .lbadge-green');
  if(badge){
    let texte, afficher = true;
    if(isAdmin()){ texte = 'Admin'; }
    else if(role === 'agence'){ afficher = false; }
    else if(plan === 'free'){ texte = 'Gratuit'; }
    else if(status === 'active'){ texte = libelle + ' · Actif'; }
    else if(status === 'suspended'){ texte = libelle + ' · Suspendu'; }
    else { texte = libelle; }
    if(afficher){
      badge.style.display = '';
      badge.innerHTML = '<span class="lbadge-active-dot"></span>' + texte;
    } else {
      badge.style.display = 'none';
    }
  }

  // Identité visuelle (couleur + logo) : verrouillée aux agences gratuites,
  // indépendamment de la section Abonnement ci-dessous.
  majAffichageIdentiteVisuelle();

  // À partir d'ici : gestion de la section Abonnement (Réglages uniquement).
  const info = document.getElementById('abo-plan-actuel');
  const offres = document.getElementById('abo-offres');
  const gerer = document.getElementById('abo-gerer');
  if(!info) return;

  // Les agences ne voient jamais la section Abonnement.
  const section = info.closest('.settings-section');
  if(role === 'agence'){
    if(section) section.style.display = 'none';
    return;
  } else if(section){
    section.style.display = '';
  }

  if(isAdmin()){
    info.innerHTML = 'Compte administrateur — accès complet sans abonnement.';
    if(offres) offres.style.display = 'none';
    if(gerer) gerer.style.display = 'none';
    return;
  }

  let statutTxt = '';
  if(status === 'suspended') statutTxt = ' <span style="color:var(--red)">(suspendu — paiement en échec)</span>';
  else if(status === 'active' && plan !== 'free') statutTxt = ' <span style="color:var(--green,#2F8F5B)">(actif)</span>';
  info.innerHTML = 'Votre formule actuelle : <strong>' + libelle + '</strong>' + statutTxt;

  // Offres visibles si gratuit ou suspendu ; sinon message "gérer"
  const montrerOffres = (plan === 'free' || status === 'suspended');
  if(offres) offres.style.display = montrerOffres ? 'block' : 'none';
  if(gerer) gerer.style.display = montrerOffres ? 'none' : 'block';
}

async function souscrire(formule){
  const err = document.getElementById('abo-erreur');
  if(err){ err.style.display = 'none'; err.textContent = ''; }
  try{
    const resp = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ formule })
    });
    const data = await resp.json();
    if(!resp.ok || !data.url){
      if(err){ err.textContent = '⚠️ ' + (data.error || 'Erreur lors de la création du paiement'); err.style.display = 'block'; }
      return;
    }
    // Redirection vers la page de paiement Stripe
    window.location.href = data.url;
  }catch(e){
    if(err){ err.textContent = '⚠️ ' + e.message; err.style.display = 'block'; }
  }
}

function checkPlanLimit(type){
  if(!_userPlan) return true; // pas encore chargé → laisser passer
  if(isAdmin()) return true;  // admin sans limite
  const limits = PLAN_LIMITS[_userPlan.plan] || PLAN_LIMITS.free;
  if(_userPlan.status !== 'active'){
    notify('⚠️ Votre abonnement est suspendu — contactez le support','warn');
    return false;
  }
  if(type === 'contact' && DB.contacts.length >= limits.contacts){
    notify(`⚠️ Limite atteinte : ${limits.contacts} contacts max (plan ${limits.label}). Passez au plan supérieur !`,'warn');
    return false;
  }
  if(type === 'mission' && DB.missions.length >= limits.missions){
    notify(`⚠️ Limite atteinte : ${limits.missions} missions max (plan ${limits.label}). Passez au plan supérieur !`,'warn');
    return false;
  }
  return true;
}

function getPlanBadge(plan, status){
  if(status === 'suspended') return '<span class="badge b-red">Suspendu</span>';
  if(status === 'expired')   return '<span class="badge b-gray">Expiré</span>';
  if(status === 'signed')    return '<span class="badge b-green">✅ Client signé</span>';
  if(plan === 'pro')         return '<span class="badge b-green">Pro</span>';
  if(plan === 'starter')     return '<span class="badge b-blue">Starter</span>';
  return '<span class="badge b-amber">Gratuit</span>';
}

async function loadAdminData(){
  if(!isAdmin()){ notify('Accès refusé','err'); return; }
  try{
    const { data: plans } = await supabaseClient
      .from('user_plans')
      .select('*')
      .order('created_at', { ascending: false });

    const list = plans || [];
    const active = list.filter(p=>p.status==='active');
    const proCount = list.filter(p=>p.plan==='pro'&&p.status==='active').length;
    const starterCount = list.filter(p=>p.plan==='starter'&&p.status==='active').length;
    const freeCount = list.filter(p=>p.plan==='free'||!p.plan).length;
    const payingCount = proCount + starterCount;
    const mrr = (proCount * 35) + (starterCount * 15);
    const arr = mrr * 12;
    const convRate = list.length > 0 ? Math.round(payingCount / list.length * 100) : 0;

    // Inscriptions ce mois
    const now = new Date();
    const thisMonth = list.filter(p=>{
      if(!p.created_at) return false;
      const d = new Date(p.created_at);
      return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    }).length;

    document.getElementById('adm-total').textContent   = list.length;
    document.getElementById('adm-active').textContent  = active.length;
    document.getElementById('adm-pro').textContent     = proCount;
    document.getElementById('adm-free').textContent    = freeCount;
    document.getElementById('adm-mrr').textContent     = mrr.toLocaleString('fr-FR') + ' €';
    document.getElementById('adm-arr').textContent     = arr.toLocaleString('fr-FR') + ' €';
    document.getElementById('adm-conversion').textContent = convRate + '%';
    document.getElementById('adm-new-month').textContent  = thisMonth;

    // Graphique répartition plans
    const total = list.length || 1;
    const planChart = document.getElementById('adm-plan-chart');
    if(planChart){
      const plans_data = [
        {label:'Pro', count:proCount, color:'var(--blue)'},
        {label:'Starter', count:starterCount, color:'var(--teal)'},
        {label:'Gratuit', count:freeCount, color:'var(--amber)'},
      ];
      planChart.innerHTML = plans_data.map(p=>`
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
            <span style="font-weight:500">${p.label}</span>
            <span style="color:var(--text2)">${p.count} (${Math.round(p.count/total*100)}%)</span>
          </div>
          <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${Math.round(p.count/total*100)}%;background:${p.color};border-radius:4px;transition:width .4s"></div>
          </div>
        </div>`).join('');
    }

    // Inscriptions par mois (6 derniers mois)
    const monthChart = document.getElementById('adm-monthly-chart');
    if(monthChart){
      const months = [];
      for(let i=5;i>=0;i--){
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
        const count = list.filter(p=>{
          if(!p.created_at) return false;
          const pd = new Date(p.created_at);
          return pd.getMonth()===d.getMonth() && pd.getFullYear()===d.getFullYear();
        }).length;
        months.push({label:d.toLocaleDateString('fr-FR',{month:'short'}), count});
      }
      const maxCount = Math.max(...months.map(m=>m.count), 1);
      monthChart.innerHTML = `<div style="display:flex;align-items:flex-end;gap:6px;height:80px">
        ${months.map(m=>`
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <div style="font-size:10px;color:var(--text2)">${m.count||''}</div>
            <div style="width:100%;background:var(--blue);border-radius:3px 3px 0 0;height:${Math.round(m.count/maxCount*60)+4}px;opacity:${m.count?1:0.2}"></div>
            <div style="font-size:9px;color:var(--text2)">${m.label}</div>
          </div>`).join('')}
      </div>`;
    }

    document.getElementById('admin-tbody').innerHTML = list.length ? list.map(p=>`
      <tr>
        <td style="font-size:11px;font-weight:500">${p.email||'—'}</td>
        <td>${getPlanBadge(p.plan, p.status)}</td>
        <td><span class="badge ${p.status==='active'?'b-green':p.status==='suspended'?'b-red':'b-gray'}">${p.status||'active'}</span></td>
        <td style="font-size:11px">${p.expires_at?new Date(p.expires_at).toLocaleDateString('fr-FR'):'—'}</td>
        <td style="font-size:11px;color:var(--text2)">${p.created_at?new Date(p.created_at).toLocaleDateString('fr-FR'):'—'}</td>
        <td style="font-size:11px;color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis">${p.notes||'—'}</td>
        <td>
          <button class="btn btn-sm" onclick="editAdminPlan('${p.user_id}','${p.email||''}','${p.plan||'free'}','${p.status||'active'}','${p.expires_at||''}','${(p.notes||'').replace(/'/g,'')}')">
            <i class="ti ti-edit" style="font-size:11px"></i>
          </button>
        </td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">Aucun client enregistré</td></tr>';
  } catch(e){
    notify('Erreur chargement admin: '+e.message,'err');
  }
}

let _editingUserId = null;
function editAdminPlan(userId, email, plan, status, expires, notes){
  _editingUserId = userId;
  document.getElementById('adm-email').value   = email;
  document.getElementById('adm-email').readOnly = true;
  document.getElementById('adm-plan').value    = plan;
  document.getElementById('adm-status').value  = status;
  document.getElementById('adm-status').dataset.prevStatus = status;
  document.getElementById('adm-expires').value = expires ? expires.split('T')[0] : '';
  document.getElementById('adm-notes').value   = notes;
  openModal('modal-add-plan');
}

async function saveAdminPlan(){
  if(!isAdmin()) return;
  const email   = document.getElementById('adm-email').value.trim();
  const plan    = document.getElementById('adm-plan').value;
  const status  = document.getElementById('adm-status').value;
  const expires = document.getElementById('adm-expires').value;
  const notes   = document.getElementById('adm-notes').value.trim();
  if(!email){ notify('Email requis','warn'); return; }
  try{
    const prevStatus = document.getElementById('adm-status').dataset.prevStatus || '';

    // Écriture faite côté serveur (api/admin-set-plan), jamais directement
    // depuis le navigateur — la vérification admin y est refaite, et c'est
    // la clé service qui écrit, plutôt que de dépendre du seul RLS.
    const resp = await fetch('/api/admin-set-plan', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        userId: _editingUserId || null,
        email, plan, status, notes,
        expiresAt: expires ? new Date(expires).toISOString() : null
      })
    });
    const result = await resp.json();
    if(!resp.ok){
      notify('⚠️ ' + (result.error || 'Erreur lors de la mise à jour'), 'warn');
      return;
    }

    // Envoyer email de bienvenue si passage en "Client signé"
    if(status === 'signed' && prevStatus !== 'signed') {
      try {
        await fetch('/api/send-welcome-agency', {
          method: 'POST',
          headers: await _authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ email, companyName: document.getElementById('adm-notes').value.trim() || email.split('@')[0] })
        });
        notify('✅ Plan mis à jour + email de bienvenue envoyé !');
      } catch(e) {
        notify('✅ Plan mis à jour (email non envoyé : ' + e.message + ')');
      }
    } else {
      notify('✅ Plan mis à jour !');
    }
    closeModal('modal-add-plan');
    _editingUserId = null;
    document.getElementById('adm-email').readOnly = false;
    loadAdminData();
  } catch(e){
    notify('Erreur: '+e.message,'err');
  }
}

function showOnboarding(){
  document.getElementById('onboarding-screen').style.display='flex';
}
function hideOnboarding(){
  document.getElementById('onboarding-screen').style.display='none';
}
function obUpdateSteps(currentStep){
  document.querySelectorAll('.ob-step').forEach(el=>{
    const step=parseInt(el.dataset.step);
    const circle=el.querySelector('div');
    if(step<currentStep){
      el.style.color='var(--green)';
      if(circle){circle.style.background='var(--green)';circle.style.color='#fff';circle.innerHTML='✓';}
    } else if(step===currentStep){
      el.style.color='var(--blue)';
      if(circle){circle.style.background='var(--blue)';circle.style.color='#fff';circle.textContent=step;}
    } else {
      el.style.color='var(--text3)';
      if(circle){circle.style.background='var(--bg3)';circle.style.color='var(--text3)';circle.textContent=step;}
    }
  });
}
function obNext(step){
  if(step===1){
    const company=document.getElementById('ob-company').value.trim();
    const name=document.getElementById('ob-name').value.trim();
    if(!company||!name){
      alert('Le nom de votre entreprise et votre nom sont requis.');
      return;
    }
    // Sauvegarder étape 1
    localStorage.setItem('edl_co_name', company);
    localStorage.setItem('edl_user_name', name);
    const sidebarName=document.getElementById('sidebar-company-name');
    if(sidebarName) sidebarName.textContent=company;
    document.getElementById('ob-page-1').style.display='none';
    document.getElementById('ob-page-2').style.display='block';
    obUpdateSteps(2);
  }
}
function obBack(step){
  if(step===2){
    document.getElementById('ob-page-2').style.display='none';
    document.getElementById('ob-page-1').style.display='block';
    obUpdateSteps(1);
  }
}
async function obFinish(){
  // Sauvegarder étape 2
  const brevo=document.getElementById('ob-brevo').value.trim();
  const mistral=document.getElementById('ob-mistral').value.trim();
  if(brevo) localStorage.setItem('edl_brevo_key', brevo);
  if(mistral) localStorage.setItem('edl_claude_key', mistral);
  // Marquer l'onboarding comme complété
  localStorage.setItem('edl_onboarding_done_'+(_currentUser?.id||''), '1');
  // Pousser les settings vers Supabase
  const settingsData={
    companyName: localStorage.getItem('edl_co_name')||'',
    brevoKey: brevo||'',
    claudeKey: mistral||''
  };
  await saveSettingsToSupabase(settingsData);
  // Envoyer email de bienvenue
  try {
    await fetch('/api/send-welcome', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        email: _currentUser?.email || '',
        companyName: localStorage.getItem('edl_co_name') || ''
      })
    });
  } catch(e) { console.warn('Email bienvenue non envoyé:', e); }
  hideOnboarding();
  notify('🎉 Configuration terminée — bienvenue sur Lokentia !');
  renderDashboard();
}


function authTab(tab, btn) {
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('auth-login').style.display  = tab==='login'  ? 'block' : 'none';
  document.getElementById('auth-signup').style.display = tab==='signup' ? 'block' : 'none';
  document.getElementById('auth-error').classList.remove('show');
  document.getElementById('auth-success').classList.remove('show');
}
function showAuthError(msg){const el=document.getElementById('auth-error');el.textContent=msg;el.classList.add('show');}
function showAuthSuccess(msg){const el=document.getElementById('auth-success');el.textContent=msg;el.classList.add('show');document.getElementById('auth-error').classList.remove('show');}
async function doLogin(){
  const email=document.getElementById('auth-email').value.trim();
  const password=document.getElementById('auth-password').value;
  if(!email||!password){showAuthError('Email et mot de passe requis');return;}
  const btn=document.getElementById('login-btn');
  btn.innerHTML='<i class="ti ti-loader"></i> Connexion…';btn.disabled=true;
  try{
    const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error)throw error;
    await tenterOuvrirSession(data.user);
  }catch(e){
    showAuthError(e.message==='Invalid login credentials'?'Email ou mot de passe incorrect':e.message);
    btn.innerHTML='<i class="ti ti-login"></i> Se connecter';btn.disabled=false;
  }
}
async function doSignup(){
  const email=document.getElementById('signup-email').value.trim();
  const password=document.getElementById('signup-password').value;
  const company=document.getElementById('signup-company').value.trim();
  if(!email||!password){showAuthError('Email et mot de passe requis');return;}
  if(password.length<6){showAuthError('Mot de passe trop court (min. 6 caractères)');return;}
  const btn=document.getElementById('signup-btn');
  btn.innerHTML='<i class="ti ti-loader"></i> Création…';btn.disabled=true;
  try{
    const{data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{company_name:company}}});
    if(error)throw error;
    if(data.user&&!data.user.confirmed_at){
      showAuthSuccess('Compte créé ! Vérifiez votre email pour confirmer.');
    }else{onAuthSuccess(data.user);}
  }catch(e){showAuthError(e.message);}
  btn.innerHTML='<i class="ti ti-user-plus"></i> Créer mon compte';btn.disabled=false;
}
async function showForgotPassword(){
  const email=document.getElementById('auth-email').value.trim();
  if(!email){showAuthError('Entrez votre email');return;}
  await supabaseClient.auth.resetPasswordForEmail(email);
  showAuthSuccess('Email de réinitialisation envoyé !');
}
async function onAuthSuccess(user){
  _currentUser=user;
  // Personnaliser la sidebar avec les infos de l'utilisateur
  const companyName = user.user_metadata?.company_name || localStorage.getItem('edl_co_name') || 'Lokentia';
  const userEmail = user.email || '';
  const sidebarName = document.getElementById('sidebar-company-name');
  const sidebarSub  = document.getElementById('sidebar-user-email');
  const sidebarFooterEmail = document.getElementById('sidebar-footer-email');
  if(sidebarName) sidebarName.textContent = companyName;
  if(sidebarSub)  sidebarSub.textContent  = 'CRM';
  if(sidebarFooterEmail) sidebarFooterEmail.textContent = userEmail;
  // Mettre à jour le nom et avatar dans le footer
  const footerName = document.getElementById('sidebar-footer-name');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  const displayName = user.user_metadata?.full_name || userEmail.split('@')[0] || 'Utilisateur';
  if(footerName) footerName.textContent = displayName;
  if(sidebarAvatar) sidebarAvatar.textContent = displayName.substring(0,2).toUpperCase();
  // Mettre à jour le sync dot
  const dot=document.getElementById('sync-dot');
  const txt=document.getElementById('sync-text');
  if(dot)dot.style.background='#22c55e';
  if(txt){txt.textContent='Synchronisé';txt.style.color='';}
  document.getElementById('auth-screen').classList.remove('show');
  document.querySelector('.crm').style.display='flex';
  const footerEl=document.querySelector('.sidebar-footer div:last-child');
  if(footerEl)footerEl.textContent=user.email;
  addLogoutButton();
  notify('Connecté : '+user.email);
  checkBackupReminder();
  // Afficher le bouton admin si admin
  const navAdmin = document.getElementById('nav-admin');
  if(navAdmin && ADMIN_EMAILS.includes(user.email)) navAdmin.style.display='flex';
  // Sync Brevo : réservée à l'admin côté serveur (api/brevo-contacts.js —
  // le compte Brevo est unique et partagé, sans tag par abonné pour filtrer
  // les contacts), donc masquée pour tout autre compte.
  const navBrevo = document.getElementById('nav-brevo');
  if(navBrevo && ADMIN_EMAILS.includes(user.email)) navBrevo.style.display='flex';
  // Section Sécurité (double authentification) : réservée au compte admin
  const securiteSection = document.getElementById('securite-section');
  if(securiteSection){
    const estAdmin = ADMIN_EMAILS.includes(user.email);
    securiteSection.style.display = estAdmin ? '' : 'none';
    if(estAdmin) chargerEtatMfa();
  }
  // Charger le plan de l'utilisateur
  await loadUserPlan();
  // Gérer le retour de paiement Stripe (?abonnement=succes|annule)
  try{
    const _p = new URLSearchParams(window.location.search);
    const _abo = _p.get('abonnement');
    if(_abo === 'succes'){
      notify('✅ Merci ! Votre paiement a été pris en compte. Activation en cours…');
      // Le webhook Stripe met à jour user_plans ; on recharge après un court délai
      setTimeout(async ()=>{ await loadUserPlan(); }, 4000);
      // Nettoyer l'URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if(_abo === 'annule'){
      notify('Paiement annulé — vous pouvez réessayer quand vous voulez.', 'warn');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }catch(e){}
  // Charger les paramètres depuis Supabase d'abord
  await loadSettingsFromSupabase();
  appliquerCouleurMarque(CFG.couleurPrimaire);
  appliquerLogoMarque(CFG.logoPath ? AGENCY_LOGOS_BUCKET_URL + CFG.logoPath : '');
  afficherExpediteurCompose();
  // Puis charger les données
  loadFromSupabase().then(async synced => {
    if(synced){
      renderDashboard();
      renderCalendar();
      if(typeof renderProspection==='function') renderProspection();
      if(typeof renderMissions==='function') renderMissions();
    } else {
      // Première connexion → pousser les données locales
      pushAllToSupabase();
    }
    // Enregistrer le client dans user_plans s'il n'existe pas encore.
    // Passe par le serveur (api/register-plan) car la policy RLS "Admin only"
    // sur user_plans réserve toute écriture directe à contact@edl-idf.com.
    if(!isAdmin()){
      try{
        await fetch('/api/register-plan', {
          method: 'POST',
          headers: await _authHeaders({ 'Content-Type': 'application/json' })
        });
      } catch(e){ console.warn('Erreur enregistrement plan:', e); }
    }
    // Vérifier si l'onboarding a déjà été fait — on vérifie Supabase (pas localStorage)
    const obDone = localStorage.getItem('edl_onboarding_done_'+(user.id||''));
    if(!obDone){
      try{
        const { data: existingSettings } = await supabaseClient
          .from('settings').select('data').eq('user_id', user.id).maybeSingle();
        const hasSettings = existingSettings?.data?.companyName || existingSettings?.data?.brevoKey;
        if(!hasSettings && !isAdmin()){
          showOnboarding();
        } else {
          // Marquer comme fait pour éviter de revérifier à chaque connexion
          localStorage.setItem('edl_onboarding_done_'+(user.id||''), '1');
        }
      } catch(e){
        // En cas d'erreur, ne pas bloquer l'accès
        console.warn('Erreur vérif onboarding:', e);
      }
    }
  });
}
function addLogoutButton(){
  const footer=document.querySelector('.sidebar-footer');
  if(!footer||footer.querySelector('#logout-btn'))return;
  const btn=document.createElement('button');
  btn.id='logout-btn';btn.className='btn btn-sm';
  btn.style.cssText='width:100%;margin-top:8px;justify-content:center;font-size:11px';
  btn.innerHTML='<i class="ti ti-logout"></i> Déconnexion';
  btn.onclick=doLogout;footer.appendChild(btn);
}
async function doLogout(){
  await supabaseClient.auth.signOut();_currentUser=null;

  // Vider le cache local applicatif pour qu'aucune donnée du compte précédent
  // ne reste visible si un autre compte se connecte sur le même navigateur.
  // On ne supprime que les clés de l'app (préfixe "edl"), pas la session
  // Supabase (clés "sb-...") qui est déjà gérée par signOut().
  try{
    const aSupprimer=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && (k.indexOf('edl')===0)) aSupprimer.push(k);
    }
    aSupprimer.forEach(k=>localStorage.removeItem(k));
    // Réinitialiser les données en mémoire
    if(typeof DB==='object' && DB){
      DB.contacts=[]; DB.missions=[]; DB.campaigns=[];
      DB.rdvs=[]; DB.invoices=[]; DB.trackings=[]; DB.prospects=[];
      DB.dups=[]; DB.brevoContacts=[]; DB.agents=[];
    }
  }catch(e){ console.warn('Nettoyage localStorage:', e); }

  document.getElementById('auth-screen').classList.add('show');
  const b=document.getElementById('logout-btn');if(b)b.remove();
  notify('Déconnecté');
}
// Session expirée : informer clairement l'utilisateur et le ramener à la connexion,
// plutôt que de le laisser face à un écran vide avec des erreurs 401/403 en cascade.
let _sessionExpiredShown = false;
function handleSessionExpired(){
  if(_sessionExpiredShown) return;
  _sessionExpiredShown = true;
  _currentUser = null;
  try{ notify('⚠️ Votre session a expiré — veuillez vous reconnecter','warn'); }catch(e){}
  const authScreen = document.getElementById('auth-screen');
  const crmEl = document.querySelector('.crm');
  if(authScreen) authScreen.classList.add('show');
  if(crmEl) crmEl.style.display = 'none';
  const errEl = document.getElementById('auth-error');
  if(errEl){ errEl.textContent = 'Votre session a expiré. Reconnectez-vous pour continuer.'; errEl.classList.add('show'); }
}

async function checkAuth(){
  if(!_supaReady)return;
  // Écouter les changements d'auth EN PREMIER
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    // Si on est en mode extranet, ignorer complètement cet événement
    if(window._EXTRANET_MODE) return;
    if(event==='SIGNED_IN'&&session){_currentUser=session.user;tenterOuvrirSession(session.user);}
    if(event==='SIGNED_OUT'){
      _currentUser=null;
      document.getElementById('auth-screen').classList.add('show');
      const crmEl=document.querySelector('.crm'); if(crmEl) crmEl.style.display='none';
    }
    // Échec de rafraîchissement du jeton = session expirée : message clair
    if(event==='TOKEN_REFRESHED' && !session){
      handleSessionExpired();
    }
  });
  // Puis vérifier la session existante
  const{data:{session}}=await supabaseClient.auth.getSession();
  // En mode extranet, ne pas ouvrir le CRM même si session active
  if(window._EXTRANET_MODE) return;
  if(session){
    _currentUser=session.user;
    await tenterOuvrirSession(session.user);
  } else {
    document.getElementById('auth-screen').classList.add('show');
    document.querySelector('.crm').style.display='none';
  }
}


// ═══════════════════════════════════════════════════════════
