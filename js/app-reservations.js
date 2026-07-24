// === Lokentia CRM — app-reservations.js ===
// Reservations, confirmation RDV, sync Edouard, saisie manuelle
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

// ═══════════════════════════════════════════════════════════
let _allReservations = [];

// Auto-refresh réservations toutes les 2 minutes
let _resaAutoRefreshInterval = null;
let _resaLastCount = 0;

function startResaAutoRefresh(){
  if(_resaAutoRefreshInterval) clearInterval(_resaAutoRefreshInterval);
  _resaAutoRefreshInterval = setInterval(async () => {
    await silentRefreshReservations();
  }, 2 * 60 * 1000); // toutes les 2 minutes
}

async function silentRefreshReservations(){
  if(!_supaReady || !_currentUser) return;
  try {
    const _tk1 = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const resp = await fetch('/api/get-reservations', { headers: { 'Authorization': 'Bearer ' + _tk1 } });
    if(!resp.ok) return;
    const rows = await resp.json();
    const newList = (rows || [])
      .filter(r => r.statut !== 'importee')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Détecter les nouvelles réservations
    const newCount = newList.length;
    if(_resaLastCount > 0 && newCount > _resaLastCount) {
      const diff = newCount - _resaLastCount;
      // Alerte sonore
      playNotificationSound();
      // Notification visuelle dans le CRM
      notify(`🔔 ${diff} nouvelle${diff > 1 ? 's' : ''} réservation${diff > 1 ? 's' : ''} reçue${diff > 1 ? 's' : ''} !`);
      // Notification push navigateur
      sendPushNotification(
        '📥 Nouvelle réservation Lokentia',
        `${diff} nouvelle${diff > 1 ? 's' : ''} demande${diff > 1 ? 's' : ''} d'état des lieux reçue${diff > 1 ? 's' : ''} !`
      );
      // Badge nav
      const pending = newList.filter(r => !r.rdvConfirme).length;
      const badge = document.getElementById('resa-nav-badge');
      if(pending > 0){ badge.style.display='inline'; badge.textContent=pending; }
      // Mettre à jour si on est sur l'onglet réservations
      if(document.getElementById('view-reservations').classList.contains('active')){
        _allReservations = newList;
        updateReservationsKPIs();
        renderReservations(_allReservations);
      }
    }
    _resaLastCount = newCount;
    _allReservations = newList;
  } catch(e) { /* silencieux */ }
}

function playNotificationSound(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Jouer 3 bips courts
    [0, 0.2, 0.4].forEach(delay => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch(e) { /* pas de son si non supporté */ }
}

async function loadReservations(){
  if(!_supaReady || !_currentUser) { notify('⚠️ Connexion Supabase requise', 'warn'); return; }

  document.getElementById('resa-loading').innerHTML = '<div style="font-size:32px;margin-bottom:12px">⏳</div>Chargement des réservations…';
  document.getElementById('resa-table-wrap').style.display = 'none';

  try {
    // Lire les réservations booking via l'API dédiée
    const _tk2 = (await supabaseClient.auth.getSession()).data?.session?.access_token || '';
    const resp = await fetch('/api/get-reservations', {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _tk2 }
    });

    if(!resp.ok) throw new Error('Erreur chargement réservations');
    const rows = await resp.json();

    _allReservations = (rows || [])
      .filter(r => r.statut !== 'importee')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    updateReservationsKPIs();
    renderReservations(_allReservations);
    renderResaStats();
    checkNotifPermission();

    // Badge nav
    const pending = _allReservations.filter(r => !r.rdvConfirme).length;
    const badge = document.getElementById('resa-nav-badge');
    if(pending > 0){ badge.style.display='inline'; badge.textContent=pending; }
    else badge.style.display='none';

    // Démarrer l'auto-refresh
    _resaLastCount = _allReservations.length;
    startResaAutoRefresh();

  } catch(e) {
    document.getElementById('resa-loading').innerHTML = '<div style="color:var(--red)">❌ Erreur : ' + e.message + '</div>';
  }
}

function updateReservationsKPIs(){
  const total = _allReservations.length;
  const pending = _allReservations.filter(r => !r.rdvConfirme).length;
  const confirmed = _allReservations.filter(r => r.rdvConfirme).length;
  const today = _allReservations.filter(r => {
    if(!r.createdAt) return false;
    const d = new Date(r.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  document.getElementById('resa-total').textContent = total || '0';
  document.getElementById('resa-pending').textContent = pending || '0';
  document.getElementById('resa-confirmed').textContent = confirmed || '0';
  document.getElementById('resa-today').textContent = today || '0';
}

function filterReservations(){
  const filter = document.getElementById('resa-filter').value;
  let list = _allReservations;
  if(filter === 'pending') list = list.filter(r => !r.rdvConfirme);
  if(filter === 'confirmed') list = list.filter(r => r.rdvConfirme);
  renderReservations(list);
}

function renderReservations(list){
  document.getElementById('resa-loading').style.display = 'none';
  document.getElementById('resa-table-wrap').style.display = 'block';
  document.getElementById('resa-count').textContent = list.length + ' réservation' + (list.length > 1 ? 's' : '');

  if(!list.length){
    document.getElementById('resa-tbody').innerHTML = '<tr><td colspan="9" class="empty">Aucune réservation trouvée</td></tr>';
    return;
  }

  document.getElementById('resa-tbody').innerHTML = list.map(r => {
    const dateDemande = r.createdAt ? fmtDate(r.createdAt) : '—';
    const dateSouhaitee = r.dateSouhaitee ? new Date(r.dateSouhaitee).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'2-digit'}) + (r.heure ? ' ' + r.heure : '') : '—';
    const locataire = r.locataire ? (r.locataireNom || r.locataire.nom || '—') + '<br><span style="font-size:10px;color:var(--text2)">' + (r.locataire.tel || '') + '</span>' : '—';
    const statut = r.rdvConfirme
      ? '<span class="badge b-green">✅ Confirmé</span>'
      : '<span class="badge b-amber">⏳ En attente</span>';

    return `<tr>
      <td style="font-size:11px">${dateDemande}</td>
      <td style="font-weight:600;font-size:12px">${r.agence || '—'}</td>
      <td style="font-size:11px">${r.typeEdl || r.type || '—'}</td>
      <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.adresse || '—'}</td>
      <td style="font-size:11px;font-weight:600;color:var(--blue)">${dateSouhaitee}</td>
      <td style="font-size:11px">${locataire}</td>
      <td style="font-size:11px">${r.proprietaire ? r.proprietaire : '<span style="color:var(--text3,#c8c8c8)">—</span>'}</td>
      <td>${statut}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="confirmRdvFromReservation('${r.id || r._supaId}')" title="Confirmer le RDV, envoyer les convocations et créer la mission" style="padding:3px 7px;background:var(--blue-bg);color:var(--blue-text);border-color:var(--blue);font-size:10px">
          <i class="ti ti-calendar-check" style="font-size:11px"></i> Confirmer & Créer
        </button>
      </td>
    </tr>`;
  }).join('');
}

function confirmRdvFromReservation(id){
  const r = _allReservations.find(x => (x.id || x._supaId) === id);
  if(!r){ notify('Réservation introuvable', 'warn'); return; }

  // Créer un objet mission temporaire depuis la réservation
  const tempMission = {
    id: r.id || r._supaId,
    agence: r.agence || '',
    emailClient: r.email || '',
    type: r.typeEdl || r.type || 'EDL entrant',
    adresse: r.adresse || '',
    bienType: r.bienType || '',
    bienTypo: r.bienTypo || '',
    bienMeuble: r.meuble || '',
    superficie: r.superficie || '',
    dateEntree: r.dateEntree || '',
    acces: r.acces || '',
    proprietaire: r.proprietaire || '',
    date: r.dateSouhaitee || '',
    locataireNom: r.locataireNom || (r.locataire && r.locataire.nom) || '',
    locataireTel: r.locataireTel || (r.locataire && r.locataire.tel) || '',
    locataireEmail: r.locataireEmail || (r.locataire && r.locataire.email) || '',
    locataireCivilite: r.locataireCivilite || (r.locataire && r.locataire.civilite) || '',
    locataires: r.locataires || [],
    locatairesEntrants: r.locatairesEntrants || [],
    expertId: r.expertId || ''
  };

  // Stocker temporairement et ouvrir la modal
  _confirmRdvMissionId = '__resa__' + id;
  window._tempResaMission = tempMission;
  window._tempResaId = id;

  // Remplir la modal
  const dateObj = r.dateSouhaitee ? new Date(r.dateSouhaitee) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : '—';
  const bien = [r.bienType, r.bienTypo, r.meuble].filter(Boolean).join(' · ') || '—';

  document.getElementById('confirm-rdv-recap').innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--blue)">📋 ${tempMission.type} — ${tempMission.agence}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><td style="color:var(--blue-dark);width:35%;padding:2px 0">📍 Adresse</td><td style="font-weight:600">${tempMission.adresse||'—'}</td></tr>
      <tr><td style="color:var(--blue-dark);padding:2px 0">🏠 Bien</td><td>${bien}</td></tr>
      <tr><td style="color:var(--blue-dark);padding:2px 0">📅 Date souhaitée</td><td style="font-weight:600">${dateStr}</td></tr>
      ${(((tempMission.locataires||[]).length) + ((tempMission.locatairesEntrants||[]).length)) > 1 ? `<tr><td style="color:var(--blue-dark);padding:2px 0">👥 Convocations</td><td>${((tempMission.locataires||[]).length) + ((tempMission.locatairesEntrants||[]).length)} convocations seront envoyées</td></tr>` : ''}
      ${tempMission.locatairesEntrants && tempMission.locatairesEntrants.length ? `<tr><td style="color:var(--blue-dark);padding:2px 0">🔑 Entrant(s)</td><td>${tempMission.locatairesEntrants.map(e => [e.prenom,e.nom].filter(Boolean).join(' ')).join(', ')}</td></tr>` : ''}
    </table>`;

  // Pré-remplir date/heure
  if(r.dateSouhaitee){
    const d = new Date(r.dateSouhaitee);
    const pad = n => String(n).padStart(2,'0');
    document.getElementById('confirm-rdv-date').value = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  }
  document.getElementById('confirm-rdv-heure').value = r.heure || '';
  document.getElementById('confirm-rdv-agent-email').value = r.email || '';
  document.getElementById('confirm-rdv-loc-email').value = tempMission.locataireEmail;
  document.getElementById('confirm-rdv-loc-nom').value = tempMission.locataireNom;
  const civEl = document.getElementById('confirm-rdv-civilite');
  if(civEl) civEl.value = tempMission.locataireCivilite || '';
  document.getElementById('confirm-rdv-message').value = '';
  populateExpertDropdown(tempMission.expertId || '');

  const btn = document.getElementById('confirm-rdv-btn');
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send"></i> Envoyer les confirmations';

  openModal('modal-confirm-rdv');
}

function createMissionFromReservation(id){
  const r = _allReservations.find(x => (x.id || x._supaId) === id);
  if(!r){ notify('Réservation introuvable', 'warn'); return; }

  // Créer la mission dans le CRM local
  const mission = {
    id: 'm_booking_' + Date.now(),
    agence: r.agence || '',
    emailClient: r.email || '',
    contact: r.contact || '',
    typeClient: 'Professionnel',
    adresse: r.adresse || '',
    bienType: r.bienType || '',
    bienTypo: r.bienTypo || '',
    bienMeuble: r.meuble || '',
    superficie: r.superficie || '',
    dateEntree: r.dateEntree || '',
    acces: r.acces || '',
    proprietaire: r.proprietaire || '',
    type: r.typeEdl || r.type || 'EDL entrant',
    date: (r.dateSouhaitee && r.heure) ? (r.dateSouhaitee + 'T' + r.heure.replace('h',':').padEnd(5,'0') + ':00') : (r.dateSouhaitee || ''),
    montant: 0,
    statut: 'planifiée',
    locataireCivilite: r.locataireCivilite || (r.locataire && r.locataire.civilite) || '',
    locataireNom: r.locataireNom || (r.locataire && r.locataire.nom) || '',
    locataireTel: r.locataireTel || (r.locataire && r.locataire.tel) || '',
    locataireEmail: r.locataireEmail || (r.locataire && r.locataire.email) || '',
    locataires: r.locataires || [],
    locatairesEntrants: r.locatairesEntrants || [],
    expertId: r.expertId || '',
    notes: 'Importé depuis réservation booking. ' + (r.notes || ''),
    source: 'booking',
    createdAt: new Date().toISOString()
  };

  DB.missions.push(mission);
  saveToStorage();

  // Retirer immédiatement de la liste locale (mise à jour optimiste,
  // pour ne pas dépendre du round-trip réseau / d'une éventuelle
  // course avec le rafraîchissement silencieux des réservations)
  const supaId = r._supaId || r.id;
  _allReservations = _allReservations.filter(x => (x._supaId || x.id) !== supaId);
  updateReservationsKPIs();
  filterReservations();

  // Marquer la réservation comme importée dans Supabase (en arrière-plan)
  if(supaId && _supaReady) {
    const updatedData = { ...r, statut: 'importee', importedAt: new Date().toISOString(), missionId: mission.id };
    supabaseClient.from('bookings').update({
      data: updatedData,
      updated_at: new Date().toISOString()
    }).eq('id', supaId).then(({ error }) => {
      if(error) console.error('Erreur marquage réservation importée :', error);
    });
  }

  notify('✅ Mission créée ! Tu peux la retrouver dans Missions EDL.');

  // Proposer d'ouvrir la confirmation RDV
  setTimeout(() => {
    if(confirm('Mission créée ! Veux-tu envoyer la confirmation de RDV maintenant ?')){
      nav('missions');
      setTimeout(() => openConfirmRdvModal(mission.id), 500);
    }
  }, 500);
}

// ─── CONFIRMATION RDV ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════
let _confirmRdvMissionId = null;

function openConfirmRdvModal(missionId){
  const m = DB.missions.find(x => x.id === missionId);
  if(!m){ notify("Mission introuvable", "warn"); return; }
  _confirmRdvMissionId = missionId;

  // Trouver le contact lié
  const contact = DB.contacts.find(c =>
    (c.email && m.emailClient && (c.email||'').toLowerCase() === (m.emailClient||'').toLowerCase()) ||
    (c.entreprise && (c.entreprise||'').toLowerCase() === (m.agence||'').toLowerCase())
  );

  // Remplir le récap
  const dateStr = m.date ? new Date(m.date).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : '—';
  const heureStr = m.date ? new Date(m.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—';
  const bien = [m.bienType, m.bienTypo, m.bienMeuble].filter(Boolean).join(' · ') || '—';

  document.getElementById('confirm-rdv-recap').innerHTML = `
    <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--blue)">📋 ${m.type} — ${m.agence}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><td style="color:var(--blue-dark);width:35%;padding:2px 0">📍 Adresse</td><td style="font-weight:600">${m.adresse||'—'}</td></tr>
      <tr><td style="color:var(--blue-dark);padding:2px 0">🏠 Bien</td><td>${bien}</td></tr>
      <tr><td style="color:var(--blue-dark);padding:2px 0">📅 Date</td><td style="font-weight:600">${dateStr}</td></tr>
      <tr><td style="color:var(--blue-dark);padding:2px 0">🕐 Heure</td><td style="font-weight:600">${heureStr}</td></tr>
      ${(((m.locataires||[]).length) + ((m.locatairesEntrants||[]).length)) > 1 ? `<tr><td style="color:var(--blue-dark);padding:2px 0">👥 Convocations</td><td>${((m.locataires||[]).length) + ((m.locatairesEntrants||[]).length)} convocations seront envoyées</td></tr>` : ''}
      ${m.locatairesEntrants && m.locatairesEntrants.length ? `<tr><td style="color:var(--blue-dark);padding:2px 0">🔑 Entrant(s)</td><td>${m.locatairesEntrants.map(e => [e.prenom,e.nom].filter(Boolean).join(' ')).join(', ')}</td></tr>` : ''}
    </table>`;

  // Pré-remplir les emails
  // Pré-remplir date et heure depuis la mission
  if(m.date){
    try{
      const d = new Date(m.date);
      const pad = n => String(n).padStart(2,'0');
      document.getElementById('confirm-rdv-date').value = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
      const h = pad(d.getHours())+'h'+pad(d.getMinutes());
      const heureEl = document.getElementById('confirm-rdv-heure');
      // Chercher l'option la plus proche
      const opts = [...heureEl.options].map(o => o.value);
      if(opts.includes(h)) heureEl.value = h;
      else heureEl.value = '';
    }catch(e){}
  }
  document.getElementById('confirm-rdv-agent-email').value = m.emailClient || contact?.email || '';
  document.getElementById('confirm-rdv-loc-email').value = m.locataireEmail || '';
  document.getElementById('confirm-rdv-loc-nom').value = m.locataireNom || '';
  const civEl = document.getElementById('confirm-rdv-civilite');
  if(civEl) civEl.value = m.locataireCivilite || '';
  document.getElementById('confirm-rdv-message').value = '';
  populateExpertDropdown(m.expertId || '');

  const btn = document.getElementById('confirm-rdv-btn');
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send"></i> Envoyer les confirmations';

  openModal('modal-confirm-rdv');
}

async function sendConfirmRdv(){
  // Gérer le cas réservation directe (sans mission importée)
  let m;
  if(_confirmRdvMissionId && _confirmRdvMissionId.startsWith('__resa__')) {
    m = window._tempResaMission;
  } else {
    m = DB.missions.find(x => x.id === _confirmRdvMissionId);
  }
  if(!m) return;

  const agentEmail = document.getElementById('confirm-rdv-agent-email').value.trim();
  if(!agentEmail){ notify('⚠️ Email de l\'agent requis', 'warn'); return; }

  const btn = document.getElementById('confirm-rdv-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Envoi en cours…';

  // Construire la date/heure définitive depuis les champs de la modal
  const rdvDate = document.getElementById('confirm-rdv-date').value;
  const rdvHeure = document.getElementById('confirm-rdv-heure').value;
  let rdvDatetime = m.date;
  if(rdvDate){
    const heureNum = rdvHeure ? rdvHeure.replace('h',':') : '09:00';
    rdvDatetime = rdvDate + 'T' + heureNum + ':00';
    // Mettre à jour la mission avec la date définitive
    m.date = rdvDatetime;
    saveToStorage();
  }

  // Expert EDL sélectionné pour se déplacer
  const expertId = document.getElementById('confirm-rdv-expert')?.value || '';
  const expertAgent = (DB.agents || []).find(a => a.id === expertId);
  m.expertId = expertId;
  // Durée estimée de l'intervention (pour email locataire + agenda)
  const dureeEstimee = document.getElementById('confirm-rdv-duree')?.value || '1h';
  m.dureeEstimee = dureeEstimee;
  if(!_confirmRdvMissionId.startsWith('__resa__')) saveToStorage();

  // Le locataire saisi dans la modal fait foi (corrections de dernière minute)
  const _locNomModal = document.getElementById('confirm-rdv-loc-nom').value.trim();
  const _locEmailModal = document.getElementById('confirm-rdv-loc-email').value.trim();
  const _locCivModal = document.getElementById('confirm-rdv-civilite')?.value || '';
  if(_locNomModal) m.locataireNom = _locNomModal;
  if(_locEmailModal) m.locataireEmail = _locEmailModal;
  if(_locCivModal) m.locataireCivilite = _locCivModal;
  if(!m.locataires || m.locataires.length === 0){
    if(_locNomModal || _locEmailModal){
      m.locataires = [{ civilite: _locCivModal, nom: _locNomModal, tel: m.locataireTel || '', email: _locEmailModal }];
    }
  } else {
    if(_locNomModal) m.locataires[0].nom = _locNomModal;
    if(_locEmailModal) m.locataires[0].email = _locEmailModal;
    if(_locCivModal) m.locataires[0].civilite = _locCivModal;
  }

  // Convocations : locataire(s) sortant(s) + locataire(s) entrant(s) éventuels
  const _convocs = (m.locataires || []).map(function(l){ return Object.assign({}, l); });
  (m.locatairesEntrants || []).forEach(function(e){
    const nomComplet = [e.prenom, e.nom].filter(Boolean).join(' ');
    if(nomComplet || e.email){
      _convocs.push({ civilite: '', nom: nomComplet, tel: e.tel || '', email: e.email || '' });
    }
  });

  const payload = {
    mission: {
      id: m.id,
      agence: m.agence,
      type: m.type,
      adresse: m.adresse,
      date: rdvDatetime,
      bienType: m.bienType,
      bienTypo: m.bienTypo,
      bienMeuble: m.bienMeuble,
      acces: m.acces || '',
      proprietaire: m.proprietaire || '',
      dureeEstimee: dureeEstimee
    },
    agentEmail,
    agentNom: document.getElementById('confirm-rdv-agent-email').value.split('@')[0],
    locataireEmail: document.getElementById('confirm-rdv-loc-email').value.trim(),
    locataireNom: document.getElementById('confirm-rdv-loc-nom').value.trim(),
    locataireCivilite: document.getElementById('confirm-rdv-civilite')?.value || '',
    locataires: _convocs,
    expertNom: expertAgent ? expertAgent.nom : '',
    expertTel: expertAgent ? expertAgent.tel : '',
    message: document.getElementById('confirm-rdv-message').value.trim()
  };

  try {
    const resp = await fetch('/api/confirm-rdv', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if(resp.ok){
      if(_confirmRdvMissionId && _confirmRdvMissionId.startsWith('__resa__')) {
        // Marquer la réservation comme confirmée dans Supabase
        const resaId = window._tempResaId;
        const r = _allReservations.find(x => (x.id || x._supaId) === resaId);
        if(r && _supaReady) {
          // Créer automatiquement la mission dans le CRM
          const mission = {
            id: 'm_booking_' + Date.now(),
            agence: r.agence || '',
            emailClient: r.email || '',
            contact: r.contact || '',
            typeClient: 'Professionnel',
            adresse: r.adresse || '',
            bienType: r.bienType || '',
            bienTypo: r.bienTypo || '',
            bienMeuble: r.meuble || '',
            superficie: r.superficie || '',
            dateEntree: r.dateEntree || '',
            acces: r.acces || '',
            proprietaire: r.proprietaire || '',
            type: r.typeEdl || r.type || 'EDL entrant',
            date: rdvDatetime,
            dureeEstimee: dureeEstimee,
            montant: 0,
            statut: 'planifiée',
            rdvConfirme: true,
            rdvConfirmeAt: new Date().toISOString(),
            locataireCivilite: r.locataireCivilite || (r.locataire && r.locataire.civilite) || '',
            locataireNom: r.locataireNom || (r.locataire && r.locataire.nom) || '',
            locataireTel: r.locataireTel || (r.locataire && r.locataire.tel) || '',
            locataireEmail: r.locataireEmail || (r.locataire && r.locataire.email) || '',
            locataires: r.locataires || [],
    locatairesEntrants: r.locatairesEntrants || [],
            expertId: expertId || '',
            notes: 'Importé automatiquement depuis réservation. ' + (r.notes || ''),
            source: 'booking',
            createdAt: new Date().toISOString()
          };
          DB.missions.push(mission);
          saveToStorage();
          pushMissionToEdouard(mission);

          // Marquer la réservation comme importée ET confirmée dans Supabase
          const updatedData = { ...r, rdvConfirme: true, statut: 'importee', rdvConfirmeAt: new Date().toISOString(), missionId: mission.id };
          supabaseClient.from('bookings').update({
            data: updatedData, updated_at: new Date().toISOString()
          }).eq('id', r._supaId || r.id).then(() => {
            _allReservations = _allReservations.filter(x => (x.id||x._supaId) !== resaId);
            updateReservationsKPIs();
            filterReservations();
          });
        }
      } else {
        m.rdvConfirme = true;
        m.rdvConfirmeAt = new Date().toISOString();
        m.dureeEstimee = dureeEstimee;
        saveToStorage();
        renderMissions();
        pushMissionToEdouard(m);
        // Mettre aussi à jour le statut dans Supabase bookings si la mission a un _supaId
        if(_supaReady && m._supaId){
          supabaseClient.from('bookings').update({
            data: { ...m, rdvConfirme: true, statut: 'confirmee', rdvConfirmeAt: new Date().toISOString() },
            updated_at: new Date().toISOString()
          }).eq('id', m._supaId).then(({ error }) => {
            if(error) console.warn('Erreur mise à jour statut confirmee:', error);
          });
        }
      }
      closeModal('modal-confirm-rdv');
      notify('✅ RDV confirmé et mission créée automatiquement dans Missions EDL !');
    } else {
      const err = await resp.json();
      notify('❌ Erreur : ' + (err.error || 'Envoi impossible'), 'err');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Envoyer les confirmations';
    }
  } catch(e) {
    notify('❌ Connexion impossible', 'err');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Envoyer les confirmations';
  }
}


// ─── SYNC EDOUARD : pousse logement + contacts vers l’API Edouard ───
async function pushMissionToEdouard(mission){
  if(!mission || !mission.adresse) return;
  if(mission.edouardAccommodationId) return; // déjà synchronisée
  try {
    const resp = await fetch('/api/edouard-push', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ mission: mission })
    });
    const data = await resp.json();
    if(resp.ok && data.success){
      const ed = data.edouard || {};
      const target = DB.missions.find(x => x.id === mission.id) || mission;
      target.edouardAccommodationId = ed.accommodationId || '';
      target.edouardTenantIds = ed.tenantIds || [];
      target.edouardOwnerId = ed.ownerId || '';
      target.edouardSyncedAt = new Date().toISOString();
      saveToStorage();
      if(ed.warnings && ed.warnings.length){
        notify('🏠 Logement créé dans Edouard (avec avertissements, voir console)', 'warn');
        console.warn('Edouard warnings:', ed.warnings);
      } else {
        notify('🏠 Logement et contacts créés dans Edouard');
      }
    } else {
      console.warn('Edouard push erreur:', data);
      notify('⚠️ Sync Edouard impossible (voir console)', 'warn');
    }
  } catch(e){
    console.warn('Edouard push exception:', e);
    notify('⚠️ Sync Edouard impossible (connexion)', 'warn');
  }
}

// ─── SAISIE MANUELLE RESERVATION ──────────────────────────
let _mrSelectedType = '';

function mrSelectType(type, btn){
  _mrSelectedType = type;
  document.querySelectorAll('.mr-type-btn').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text)';
  });
  btn.style.borderColor = 'var(--blue)';
  btn.style.background = 'var(--blue-bg)';
  btn.style.color = 'var(--blue-text)';
}

function openManualReservationModal(){
  _mrSelectedType = '';
  document.querySelectorAll('.mr-type-btn').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text)';
  });
  ['mr-agence','mr-email','mr-contact','mr-tel','mr-adresse','mr-acces','mr-loc-nom','mr-loc-tel','mr-loc-email','mr-notes'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('mr-date').value = '';
  document.getElementById('mr-superficie').value = '';
  document.getElementById('mr-date-entree').value = '';
  document.getElementById('mr-heure').value = '';
  document.getElementById('mr-submit-btn').disabled = false;
  document.getElementById('mr-submit-btn').innerHTML = '<i class="ti ti-send"></i> Créer et envoyer les emails';
  document.getElementById('manual-resa-error').style.display = 'none';
  openModal('modal-manual-resa');
}

async function submitManualReservation(){
  const errEl = document.getElementById('manual-resa-error');
  const agence = document.getElementById('mr-agence').value.trim();
  const email = document.getElementById('mr-email').value.trim();
  const adresse = document.getElementById('mr-adresse').value.trim();
  const locNom = document.getElementById('mr-loc-nom').value.trim();
  const locTel = document.getElementById('mr-loc-tel').value.trim();
  const date = document.getElementById('mr-date').value;

  if(!agence){ errEl.textContent = 'Le nom de l\'agence est requis.'; errEl.style.display='block'; return; }
  if(!email){ errEl.textContent = 'L\'email de l\'agence est requis.'; errEl.style.display='block'; return; }
  if(!_mrSelectedType){ errEl.textContent = 'Sélectionnez un type d\'état des lieux.'; errEl.style.display='block'; return; }
  if(!adresse){ errEl.textContent = 'L\'adresse du bien est requise.'; errEl.style.display='block'; return; }
  if(!locNom){ errEl.textContent = 'Le nom du locataire est requis.'; errEl.style.display='block'; return; }
  if(!locTel){ errEl.textContent = 'Le téléphone du locataire est requis.'; errEl.style.display='block'; return; }
  if(!date){ errEl.textContent = 'La date souhaitée est requise.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  const btn = document.getElementById('mr-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Envoi en cours…';

  const locataire = {
    nom: locNom,
    tel: locTel,
    email: document.getElementById('mr-loc-email').value.trim()
  };

  const payload = {
    agencyId: '',
    agence,
    contact: document.getElementById('mr-contact').value.trim() || agence,
    email,
    tel: document.getElementById('mr-tel').value.trim(),
    typeEdl: _mrSelectedType,
    adresse,
    bienType: document.getElementById('mr-bien-type').value,
    bienTypo: '',
    meuble: document.getElementById('mr-meuble').value,
    superficie: document.getElementById('mr-superficie').value || '',
    dateEntree: document.getElementById('mr-date-entree').value || '',
    acces: document.getElementById('mr-acces').value.trim(),
    dateSouhaitee: date,
    heure: document.getElementById('mr-heure').value,
    notes: document.getElementById('mr-notes').value.trim(),
    locataire,
    locataires: [locataire],
    source: 'manuel'
  };

  try {
    const resp = await fetch('/api/booking-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await resp.json();
    if(result.success || resp.ok){
      closeModal('modal-manual-resa');
      notify('✅ Réservation créée et emails envoyés à toutes les parties !');
      setTimeout(() => loadReservations(), 800);
    } else {
      errEl.textContent = result.error || 'Erreur lors de l\'envoi. Réessayez.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Créer et envoyer les emails';
    }
  } catch(e) {
    errEl.textContent = 'Erreur réseau. Vérifiez votre connexion.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Créer et envoyer les emails';
  }
}


function copyBookingLink(){
  const c = DB.contacts.find(x => x.id === currentFicheId);
  if(!c) return;
  const agencyId = (c.entreprise||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const agencyName = encodeURIComponent(c.entreprise||'');
  const link = `https://app.lokentia.fr/booking?agency=${agencyId}&name=${agencyName}&c=${encodeURIComponent(c.id)}`;
  navigator.clipboard.writeText(link).then(()=>{
    notify('✅ Lien booking copié ! ' + link);
    // Changer temporairement le texte du bouton
    const btn = document.getElementById('fiche-booking-btn');
    if(btn){ btn.innerHTML='<i class="ti ti-check"></i>Copié !'; setTimeout(()=>{ btn.innerHTML='<i class="ti ti-link"></i>Lien booking'; },2000); }
  }).catch(()=>{
    // Fallback si clipboard non disponible
    prompt('Copiez ce lien :', link);
  });
}

// checkBookingMode est appelé depuis le DOMContentLoaded principal

