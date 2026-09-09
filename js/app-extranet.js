// === Lokentia CRM — app-extranet.js ===
// Documents partages par contact (fe*), mise en forme des locataires
// entrants (fmtEntrants), statistiques et notifications de reservations.
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

function feRenderDocs(docs){
  _feDocs = docs ? docs.map(d => ({...d})) : [];
  const wrap = document.getElementById('fe-docs-list');
  if(!wrap) return;
  if(!_feDocs.length){
    wrap.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:6px">Aucun document ajouté.</div>';
    return;
  }
  wrap.innerHTML = _feDocs.map((d,i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <select onchange="feUpdateDoc(${i},'type',this.value)" style="flex:0 0 auto">
        <option value="document"${(d.type||'document')==='document'?' selected':''}>📁 Document</option>
        <option value="facture"${d.type==='facture'?' selected':''}>🧾 Facture</option>
      </select>
      <input type="text" value="${esc(d.nom||'')}" placeholder="Nom du document" onchange="feUpdateDoc(${i},'nom',this.value)" style="flex:1">
      <input type="url" value="${esc(d.url||'')}" placeholder="https://drive.google.com/..." onchange="feUpdateDoc(${i},'url',this.value)" style="flex:2">
      <button onclick="feRemoveDoc(${i})" style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:14px">✕</button>
    </div>`).join('');
}

let _feDocs = [];
function feUpdateDoc(i, field, val){ _feDocs[i][field] = val; }
function feRemoveDoc(i){ _feDocs.splice(i,1); feRenderDocs(_feDocs); }
function feAddDoc(){
  _feDocs.push({ nom:'', url:'', type:'document' });
  feRenderDocs(_feDocs);
  const inputs = document.querySelectorAll('#fe-docs-list input[type="text"]');
  if(inputs.length) inputs[inputs.length-1].focus();
}
function feGetDocs(){ return _feDocs.filter(d => d.url && d.url.trim()); }

// Dépose une facture PDF pour le client dont l'email est dans #fe-email.
// Écrit directement en base (via /api/upload-facture), puis reflète le
// document dans _feDocs pour que le bouton "Enregistrer" de la fiche —
// qui écrase c.documents avec feGetDocs() — n'efface pas ce qui vient
// d'être déposé.
async function uploadFactureCourante(){
  const fileInput = document.getElementById('fe-facture-file');
  const statusEl = document.getElementById('fe-facture-status');
  const email = (document.getElementById('fe-email')?.value || '').trim();
  const file = fileInput?.files?.[0];

  if(!email){ notify('⚠️ Renseigne d\'abord l\'email du client', 'warn'); return; }
  if(!file){ notify('⚠️ Choisis un fichier PDF', 'warn'); return; }
  if(file.type !== 'application/pdf'){ notify('⚠️ Le fichier doit être un PDF', 'warn'); return; }

  if(statusEl) statusEl.textContent = 'Envoi en cours…';
  try{
    const form = new FormData();
    form.append('file', file);
    form.append('clientEmail', email);
    form.append('nom', 'Facture — ' + file.name.replace(/\.pdf$/i, ''));

    const resp = await fetch('/api/upload-facture', {
      method: 'POST',
      headers: await _authHeaders(),
      body: form
    });
    const data = await resp.json().catch(() => ({}));

    if(!resp.ok || !data.success){
      notify('❌ ' + (data.error || 'Échec du dépôt'), 'err');
      if(statusEl) statusEl.textContent = '';
      return;
    }

    _feDocs.push({ nom: data.nom, url: data.path, type: 'facture' });
    feRenderDocs(_feDocs);
    notify('✅ Facture déposée !');
    if(statusEl) statusEl.textContent = 'Dernier dépôt : ' + file.name;
    fileInput.value = '';
  }catch(e){
    notify('❌ Erreur réseau lors du dépôt', 'err');
    if(statusEl) statusEl.textContent = '';
  }
}

function fmtEntrants(list){
  if(!Array.isArray(list) || !list.length) return '\u2014';
  return list.map(e => `${[esc(e.prenom), esc(e.nom)].filter(Boolean).join(' ')}${e.tel ? ' \u00b7 \U0001F4F1 '+esc(e.tel) : ''}${e.email ? ' \u00b7 \u2709\uFE0F '+esc(e.email) : ''}`).join('<br>');
}

// ═══════════════════════════════════════════════════════════
// ─── STATISTIQUES RÉSERVATIONS ─────────────────────────────
// ═══════════════════════════════════════════════════════════

function renderResaStats(){
  if(!_allReservations.length) return;
  
  const period = document.getElementById('resa-stats-period')?.value || 'all';
  const now = new Date();
  
  let list = _allReservations;
  if(period === 'month'){
    list = list.filter(r => {
      if(!r.createdAt) return false;
      const d = new Date(r.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  } else if(period === 'week'){
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    list = list.filter(r => r.createdAt && new Date(r.createdAt) >= weekAgo);
  }

  // Stats par type
  const byType = {};
  list.forEach(r => {
    const type = r.typeEdl || r.type || 'Non précisé';
    byType[type] = (byType[type] || 0) + 1;
  });
  document.getElementById('stats-by-type').innerHTML = Object.entries(byType)
    .sort((a,b) => b[1]-a[1])
    .map(([type, count]) => {
      const pct = Math.round(count / list.length * 100);
      const emoji = type.toLowerCase().includes('entrant') ? '🔑' : type.toLowerCase().includes('sortant') ? '🚪' : '🔍';
      return `<div style="margin-bottom:4px">
        ${emoji} ${esc(type)} <strong>${count}</strong>
        <div style="background:var(--border);border-radius:4px;height:4px;margin-top:2px">
          <div style="background:var(--blue);height:4px;border-radius:4px;width:${pct}%"></div>
        </div>
      </div>`;
    }).join('') || '<span style="color:var(--text2)">—</span>';

  // Stats par agence (top 5)
  const byAgency = {};
  list.forEach(r => {
    const agency = r.agence || 'Inconnue';
    byAgency[agency] = (byAgency[agency] || 0) + 1;
  });
  document.getElementById('stats-by-agency').innerHTML = Object.entries(byAgency)
    .sort((a,b) => b[1]-a[1]).slice(0,5)
    .map(([agency, count]) => {
      const pct = Math.round(count / list.length * 100);
      return `<div style="margin-bottom:4px">
        🏢 ${esc(agency.length > 20 ? agency.substring(0,20)+'…' : agency)} <strong>${count}</strong>
        <div style="background:var(--border);border-radius:4px;height:4px;margin-top:2px">
          <div style="background:var(--green);height:4px;border-radius:4px;width:${pct}%"></div>
        </div>
      </div>`;
    }).join('') || '<span style="color:var(--text2)">—</span>';

  // Stats par mois (6 derniers mois)
  const byMonth = {};
  const allResa = _allReservations; // toujours sur toutes les réservations
  allResa.forEach(r => {
    if(!r.createdAt) return;
    const d = new Date(r.createdAt);
    const key = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    byMonth[key] = (byMonth[key] || 0) + 1;
  });
  const months = Object.entries(byMonth).slice(-6);
  const maxMonth = Math.max(...months.map(m => m[1]), 1);
  document.getElementById('stats-by-month').innerHTML = months
    .map(([month, count]) => `
      <div style="text-align:center;min-width:40px">
        <div style="font-size:11px;font-weight:700;color:var(--blue)">${count}</div>
        <div style="background:var(--blue);border-radius:4px;width:32px;height:${Math.max(4, Math.round(count/maxMonth*40))}px;margin:2px auto"></div>
        <div style="font-size:10px;color:var(--text2)">${esc(month)}</div>
      </div>`).join('') || '<span style="color:var(--text2)">Pas encore de données</span>';

  document.getElementById('resa-stats').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════
// ─── NOTIFICATIONS PUSH ────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function checkNotifPermission(){
  if(!('Notification' in window)) return;
  if(localStorage.getItem('edlc_notif_banner_dismissed') === '1') return;
  if(Notification.permission === 'default'){
    // Afficher le banner d'invitation
    const banner = document.getElementById('resa-notif-banner');
    if(banner) banner.style.display = 'flex';
  }
}

function dismissNotifBanner(){
  localStorage.setItem('edlc_notif_banner_dismissed', '1');
  const banner = document.getElementById('resa-notif-banner');
  if(banner) banner.style.display = 'none';
}

async function requestNotifPermission(){
  if(!('Notification' in window)){
    notify('⚠️ Votre navigateur ne supporte pas les notifications', 'warn');
    return;
  }
  const permission = await Notification.requestPermission();
  const banner = document.getElementById('resa-notif-banner');
  if(permission === 'granted'){
    if(banner) banner.style.display = 'none';
    notify('✅ Notifications activées ! Vous serez alerté des nouvelles réservations.');
    // Envoyer une notification de test
    new Notification('Lokentia', {
      body: '🔔 Notifications activées ! Vous recevrez les alertes de réservation.',
      icon: '/favicon-192.png'
    });
  } else {
    notify('⚠️ Notifications refusées — vous pouvez les activer dans les paramètres du navigateur', 'warn');
    if(banner) banner.style.display = 'none';
  }
}

function sendPushNotification(title, body){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/favicon-192.png',
      badge: '/favicon-192.png',
      tag: 'edlconnect-resa',
      requireInteraction: true
    });
  } catch(e) { /* silencieux */ }
}

// ─── RÉSERVATIONS ENTRANTES ────────────────────────────────
