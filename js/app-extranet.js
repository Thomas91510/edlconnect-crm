// === Lokentia CRM — app-extranet.js ===
// Booking public, extranet client, statistiques, notifications
// Genere depuis index.html — NE PAS reordonner les fichiers dans index.html

// ─── BOOKING PUBLIC ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

// Détecter si on est sur la page booking via URL
function checkBookingMode(){
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if(path === '/booking' || params.get('booking') === '1'){
    // Masquer l'écran auth IMMÉDIATEMENT
    const authScreen = document.getElementById('auth-screen');
    if(authScreen){ authScreen.style.cssText = 'display:none!important'; authScreen.classList.remove('show'); }
    // Afficher le CRM
    const crmEl = document.querySelector('.crm');
    if(crmEl){ crmEl.style.display = 'flex'; }
    // Masquer sidebar et mobile nav
    const sidebar = document.querySelector('.sidebar');
    const mobileNav = document.getElementById('mobile-nav-bar');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if(sidebar) sidebar.style.display = 'none';
    if(mobileNav) mobileNav.style.display = 'none';
    if(mobileBtn) mobileBtn.style.display = 'none';
    // Masquer le main et afficher uniquement la vue booking
    const mainEl = document.querySelector('.main');
    if(mainEl) mainEl.style.cssText = 'flex:1;overflow-y:auto;background:#f8f8f6';
    // Activer la vue booking
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.style.display='none'; });
    const bkView = document.getElementById('view-booking');
    if(bkView){ bkView.classList.add('active'); bkView.style.display='block'; }
    // Pré-remplir agence si passée en URL
    const agencyName = params.get('name');
    if(agencyName){
      const agenceEl = document.getElementById('bk-agence');
      if(agenceEl){ agenceEl.value = decodeURIComponent(agencyName); agenceEl.readOnly = true; }
      const heroName = document.getElementById('bk-agency-name');
      if(heroName) heroName.textContent = decodeURIComponent(agencyName);
      const heroLabel = document.getElementById('bk-agency-label');
      if(heroLabel) heroLabel.textContent = 'Portail exclusif';
    }
    // Date min = demain
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateEl = document.getElementById('bk-date');
    if(dateEl) dateEl.min = tomorrow.toISOString().split('T')[0];
    window._bkAgencyId = params.get('agency') || '';
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// ─── EXTRANET CLIENT ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function checkExtranetMode(){
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if(path === '/extranet' || params.get('extranet') === '1'){
    const authScreen = document.getElementById('auth-screen');
    if(authScreen){ authScreen.style.cssText = 'display:none!important'; authScreen.classList.remove('show'); }
    const crmEl = document.querySelector('.crm');
    if(crmEl){ crmEl.style.display = 'flex'; }
    const sidebar = document.querySelector('.sidebar');
    const mobileNav = document.getElementById('mobile-nav-bar');
    const mobileBtn = document.getElementById('mobile-menu-btn');
    if(sidebar) sidebar.style.display = 'none';
    if(mobileNav) mobileNav.style.display = 'none';
    if(mobileBtn) mobileBtn.style.display = 'none';
    const mainEl = document.querySelector('.main');
    if(mainEl) mainEl.style.cssText = 'flex:1;overflow-y:auto;background:#f8f8f6';
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.style.display='none'; });
    const exView = document.getElementById('view-extranet');
    if(exView){ exView.classList.add('active'); exView.style.display='block'; }
    initExtranetAuth();
    return true;
  }
  return false;
}

async function initExtranetAuth(){
  if(!supabaseClient){
    document.getElementById('extranet-login-msg').textContent = 'Service momentanément indisponible, réessayez plus tard.';
    return;
  }
  // Écouter les changements d'état auth (notamment le retour après magic link)
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.email){
      showExtranetDashboard(session.user.email, session.access_token);
    }
  });
  // Vérifier aussi la session déjà active
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(session && session.user && session.user.email){
    showExtranetDashboard(session.user.email, session.access_token);
  } else {
    document.getElementById('extranet-login-card').style.display = 'block';
    document.getElementById('extranet-dashboard').style.display = 'none';
  }
}

async function extranetSendMagicLink(){
  const emailEl = document.getElementById('extranet-email');
  const email = emailEl.value.trim();
  const msgEl = document.getElementById('extranet-login-msg');
  if(!email || !email.includes('@')){
    msgEl.style.color = 'var(--red-text)';
    msgEl.textContent = '⚠️ Merci de saisir une adresse email valide.';
    return;
  }
  const btn = document.getElementById('extranet-login-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Envoi en cours…';
  try{
    const { error: otpError } = await supabaseClient.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: window.location.origin + '/extranet-app' }
    });
    const result = { success: !otpError, error: otpError ? otpError.message : null };
    if(result.success){
      msgEl.style.color = 'var(--green-text)';
      msgEl.textContent = '✅ Un lien de connexion vient de vous être envoyé par email. Cliquez dessus pour accéder à votre espace (vérifiez vos spams si besoin).';
      btn.style.display = 'none';
      emailEl.disabled = true;
    } else {
      throw new Error(result.error || 'Erreur inconnue');
    }
  } catch(e){
    msgEl.style.color = 'var(--red-text)';
    msgEl.textContent = '❌ Erreur lors de l\'envoi du lien : ' + (e.message || 'réessayez plus tard.');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-mail"></i> Recevoir mon lien de connexion';
  }
}

async function showExtranetDashboard(userEmail, accessToken){
  document.getElementById('extranet-login-card').style.display = 'none';
  document.getElementById('extranet-dashboard').style.display = 'block';
  const headerRight = document.getElementById('extranet-header-right');
  if(headerRight) headerRight.style.display = 'flex';
  const welcomeEl = document.getElementById('extranet-user-email');
  if(welcomeEl) welcomeEl.textContent = userEmail;

  const listEl = document.getElementById('extranet-orders-list');
  listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)"><i class="ti ti-loader"></i> Chargement de vos commandes…</div>';

  try{
    const token = accessToken || '';
    if(!token){
      listEl.innerHTML = '<div class="card" style="padding:30px;text-align:center;color:var(--red-text)">Session expirée. Veuillez vous reconnecter.</div>';
      setTimeout(() => {
        document.getElementById('extranet-login-card').style.display = 'block';
        document.getElementById('extranet-dashboard').style.display = 'none';
      }, 2000);
      return;
    }

    const resp = await fetch('/api/client-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    });
    if(!resp.ok) throw new Error('Erreur ' + resp.status);
    const orders = await resp.json();

    document.getElementById('extranet-total').textContent = orders.length;
    document.getElementById('extranet-pending').textContent = orders.filter(o => o.statut !== 'realise' && o.statut !== 'confirmee').length;
    document.getElementById('extranet-done').textContent = orders.filter(o => o.statut === 'realise').length;

    if(!orders.length){
      listEl.innerHTML = '<div class="card" style="padding:30px;text-align:center;color:var(--text3)">Aucune commande trouvée pour cette adresse email.</div>';
      extranetRenderStats([]);
      return;
    }

    extranetRenderStats(orders);
    extranetRenderDocuments(userEmail);

    const statutLabel = (s) => {
      if(s === 'realise') return '<span style="color:var(--green-text);background:var(--green-bg);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600">✅ Réalisé</span>';
      if(s === 'confirmee' || s === 'importee') return '<span style="color:var(--blue-text);background:var(--blue-bg);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600">📅 Confirmé</span>';
      return '<span style="color:var(--amber-text);background:var(--amber-bg);padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600">⏳ En attente</span>';
    };

    listEl.innerHTML = orders.map(o => {
      const statutBadge = (s) => {
        if(s === 'realise') return '<span style="background:rgba(56,161,105,0.2);color:#68d391;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:0.5px solid rgba(56,161,105,0.3)">✅ Réalisé</span>';
        if(s === 'confirmee' || s === 'importee') return '<span style="background:rgba(24,95,165,0.2);color:#7bb8ef;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:0.5px solid rgba(55,138,221,0.3)">📅 Confirmé</span>';
        return '<span style="background:rgba(186,117,23,0.2);color:#f6c05e;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;border:0.5px solid rgba(186,117,23,0.3)">⏳ En attente</span>';
      };
      const dateRdv = o.dateSouhaitee ? new Date(o.dateSouhaitee).toLocaleDateString('fr-FR', {day:'numeric',month:'long'}) : '';
      const heureRdv = o.heure || '';
      return `<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:all .15s"
           onmouseover="this.style.background='rgba(24,95,165,0.15)';this.style.borderColor='rgba(55,138,221,0.3)'"
           onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.borderColor='rgba(255,255,255,0.1)'"
           onclick="openExtranetOrderDetail(${JSON.stringify(o).replace(/"/g,'&quot;')})">
        <div style="padding:14px 16px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px">
            <div style="font-weight:600;font-size:13px;color:#fff">${o.typeEdl || 'État des lieux'}</div>
            <div style="display:flex;align-items:center;gap:6px">
              ${statutBadge(o.statut)}
              <i class="ti ti-chevron-right" style="color:rgba(255,255,255,0.25);font-size:13px"></i>
            </div>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:4px;margin-bottom:4px">
            <i class="ti ti-map-pin" style="font-size:11px"></i> ${o.adresse || '—'}
          </div>
          ${(dateRdv || heureRdv) ? `<div style="font-size:11px;color:#7bb8ef;display:flex;align-items:center;gap:4px;margin-bottom:4px">
            <i class="ti ti-calendar" style="font-size:11px"></i> ${dateRdv}${heureRdv ? ' à ' + heureRdv : ''}
          </div>` : ''}
          <div style="font-size:11px;color:rgba(255,255,255,0.25)">Demandé le ${o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : '—'}</div>
        </div>
      </div>`;
    }).join('');
  } catch(e){
    listEl.innerHTML = '<div class="card" style="padding:30px;text-align:center;color:var(--red-text)">Erreur lors du chargement de vos commandes. Réessayez plus tard.</div>';
  }
}

function extranetLogout(){
  if(supabaseClient) supabaseClient.auth.signOut();
  document.getElementById('extranet-login-card').style.display = 'block';
  document.getElementById('extranet-dashboard').style.display = 'none';
  const headerRight = document.getElementById('extranet-header-right');
  if(headerRight) headerRight.style.display = 'none';
  document.getElementById('extranet-email').value = '';
  document.getElementById('extranet-login-msg').textContent = '';
  const btn = document.getElementById('extranet-login-btn');
  btn.style.display = '';
  document.getElementById('extranet-email').disabled = false;
}

let _exSelectedType = '';
function exSelectType(type, btn){
  _exSelectedType = type;
  document.querySelectorAll('.ex-type-btn').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = '#fff';
  });
  btn.style.borderColor = 'var(--blue)';
  btn.style.background = 'var(--blue-bg)';
}

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
      <input type="text" value="${d.nom||''}" placeholder="Nom du document" onchange="feUpdateDoc(${i},'nom',this.value)" style="flex:1">
      <input type="url" value="${d.url||''}" placeholder="https://drive.google.com/..." onchange="feUpdateDoc(${i},'url',this.value)" style="flex:2">
      <button onclick="feRemoveDoc(${i})" style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:14px">✕</button>
    </div>`).join('');
}

let _feDocs = [];
function feUpdateDoc(i, field, val){ _feDocs[i][field] = val; }
function feRemoveDoc(i){ _feDocs.splice(i,1); feRenderDocs(_feDocs); }
function feAddDoc(){
  _feDocs.push({ nom:'', url:'' });
  feRenderDocs(_feDocs);
  const inputs = document.querySelectorAll('#fe-docs-list input[type="text"]');
  if(inputs.length) inputs[inputs.length-1].focus();
}
function feGetDocs(){ return _feDocs.filter(d => d.url && d.url.trim()); }

function fmtEntrants(list){
  if(!Array.isArray(list) || !list.length) return '\u2014';
  return list.map(e => `${[e.prenom, e.nom].filter(Boolean).join(' ')}${e.tel ? ' \u00b7 \U0001F4F1 '+e.tel : ''}${e.email ? ' \u00b7 \u2709\uFE0F '+e.email : ''}`).join('<br>');
}

function openExtranetOrderDetail(o){
  const modal = document.getElementById('extranet-order-detail-modal');
  const title = document.getElementById('extranet-detail-title');
  const body = document.getElementById('extranet-detail-body');

  title.textContent = o.typeEdl || 'État des lieux';

  const statutBadge = (s) => {
    if(s === 'realise') return '<span style="color:#27AE60;background:#EAF3DE;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">✅ Réalisé</span>';
    if(s === 'confirmee' || s === 'importee') return '<span style="color:#1A5FA8;background:#F4F7FA;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">📅 Confirmé</span>';
    return '<span style="color:#B45309;background:#FEF3C7;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">⏳ En attente</span>';
  };

  const rows = [
    ['📋 Type', o.typeEdl || '—'],
    ['📍 Adresse', o.adresse || '—'],
    ['🏠 Bien', [o.bienType, o.bienTypo, o.meuble].filter(Boolean).join(' · ') || '—'],
    ['📅 Date souhaitée', o.dateSouhaitee ? new Date(o.dateSouhaitee).toLocaleDateString('fr-FR') : '—'],
    ['🕐 Heure', o.heure || '—'],
    ['🧑 Locataire', o.locataireNom || '—'],
    ['📱 Tél. locataire', o.locataireTel || '—'],
    ['🔑 Locataire(s) entrant(s)', fmtEntrants(o.locatairesEntrants)],
  ].filter(([,v]) => v !== '—');

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">${statutBadge(o.statut)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
      ${rows.map(([k,v]) => `
        <tr style="border-bottom:1px solid #f0f0f0">
          <td style="color:#6b6b6b;padding:10px 0;width:40%;vertical-align:top">${k}</td>
          <td style="font-weight:500;padding:10px 0">${v}</td>
        </tr>`).join('')}
    </table>
    <div style="font-size:11px;color:#999;text-align:center">
      Commande reçue le ${o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'}) : '—'}
    </div>
    <div style="margin-top:16px">
      <button onclick="closeExtranetOrderDetail()" 
        style="width:100%;padding:12px;background:#1A5FA8;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
        Fermer
      </button>
    </div>`;

  modal.style.display = 'flex';
}

function closeExtranetOrderDetail(){
  document.getElementById('extranet-order-detail-modal').style.display = 'none';
}

function extranetToggleStats(){
  const statsEl = document.getElementById('extranet-stats');
  const btn = document.getElementById('extranet-stats-toggle');
  const visible = statsEl.style.display !== 'none';
  statsEl.style.display = visible ? 'none' : 'block';
  btn.innerHTML = visible ? '📊 Voir mes statistiques' : '📊 Masquer les statistiques';
}

function extranetRenderDocuments(userEmail){
  const section = document.getElementById('extranet-docs-section');
  const listEl = document.getElementById('extranet-docs-list');
  if(!section || !listEl) return;
  supabaseClient.auth.getSession().then(({ data }) => fetch('/api/client-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (data?.session?.access_token || '') },
    body: JSON.stringify({ email: userEmail })
  })).then(r => r.json()).then(docs => {
    if(!docs || !docs.length){ section.style.display = 'none'; return; }
    section.style.display = 'block';
    listEl.innerHTML = docs.map(d => `
      <a href="${d.url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,0.1);margin-bottom:8px;background:rgba(255,255,255,0.05);transition:all .15s"
         onmouseover="this.style.background='rgba(24,95,165,0.15)';this.style.borderColor='rgba(55,138,221,0.3)'"
         onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(255,255,255,0.1)'">
        <span style="font-size:20px">📄</span>
        <span style="flex:1;font-size:13px;font-weight:500">${d.nom}</span>
        <span style="font-size:11px;color:#7bb8ef">Ouvrir →</span>
      </a>`).join('');
  }).catch(() => { section.style.display = 'none'; });
}

function extranetRenderStats(orders){
  const btn = document.getElementById('extranet-stats-toggle');
  if(!orders || !orders.length){ if(btn) btn.style.display='none'; return; }
  if(btn) btn.style.display='flex';

  const year = new Date().getFullYear();
  document.getElementById('extranet-stats-year').textContent = year;

  const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  const byMonth = Array.from({length:12}, () => ({ entrant:0, sortant:0, autre:0 }));
  const byType = {};
  const byTypo = {};

  orders.forEach(o => {
    const d = new Date(o.createdAt);
    if(d.getFullYear() !== year) return;
    const m = d.getMonth();
    const type = (o.typeEdl || '').toLowerCase();
    if(type.includes('entrant')) byMonth[m].entrant++;
    else if(type.includes('sortant')) byMonth[m].sortant++;
    else byMonth[m].autre++;
    const typeLabel = o.typeEdl || 'Non précisé';
    byType[typeLabel] = (byType[typeLabel] || 0) + 1;
    const typoLabel = o.bienType || 'Non précisé';
    byTypo[typoLabel] = (byTypo[typoLabel] || 0) + 1;
  });

  const maxVal = Math.max(1, ...byMonth.map(m => m.entrant + m.sortant + m.autre));
  const barsEl = document.getElementById('extranet-chart-bars');
  barsEl.innerHTML = MONTHS.map((label, i) => {
    const total = byMonth[i].entrant + byMonth[i].sortant + byMonth[i].autre;
    const hE = Math.round((byMonth[i].entrant / maxVal) * 100);
    const hS = Math.round((byMonth[i].sortant / maxVal) * 100);
    const hA = Math.round((byMonth[i].autre / maxVal) * 100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px">
      <div style="font-size:9px;color:var(--text2);margin-bottom:2px">${total||''}</div>
      <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:90px;gap:1px">
        ${hA?`<div style="height:${hA}%;background:#27AE60;border-radius:2px 2px 0 0;min-height:2px"></div>`:''}
        ${hS?`<div style="height:${hS}%;background:#E67E22;border-radius:${hA?'0':'2px 2px'} 0 0;min-height:2px"></div>`:''}
        ${hE?`<div style="height:${hE}%;background:#1A5FA8;border-radius:${(hS||hA)?'0':'2px 2px'} 0 0;min-height:2px"></div>`:''}
        ${!total?`<div style="height:2px;background:var(--border);border-radius:2px"></div>`:''}
      </div>
      <div style="font-size:9px;color:var(--text2);margin-top:3px">${label}</div>
    </div>`;
  }).join('');

  const totalYear = orders.filter(o => new Date(o.createdAt).getFullYear() === year).length || 1;
  const typesEl = document.getElementById('extranet-stats-types');
  typesEl.innerHTML = Object.entries(byType).length
    ? Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>${k}</span><span style="font-weight:600">${v}</span></div>
          <div style="background:var(--border);border-radius:4px;height:4px"><div style="background:var(--blue);height:4px;border-radius:4px;width:${Math.round(v/totalYear*100)}%"></div></div>
        </div>`).join('')
    : '<div style="color:var(--text3)">Aucune donnée</div>';

  const typoEl = document.getElementById('extranet-stats-typo');
  typoEl.innerHTML = Object.entries(byTypo).length
    ? Object.entries(byTypo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span>${k}</span><span style="font-weight:600">${v}</span></div>
          <div style="background:var(--border);border-radius:4px;height:4px"><div style="background:#27AE60;height:4px;border-radius:4px;width:${Math.round(v/totalYear*100)}%"></div></div>
        </div>`).join('')
    : '<div style="color:var(--text3)">Aucune donnée</div>';
}

function extranetShowOrderForm(){
  _exSelectedType = '';
  document.querySelectorAll('.ex-type-btn').forEach(b => { b.style.borderColor='var(--border)'; b.style.background='#fff'; });
  ['ex-adresse','ex-acces','ex-loc-nom','ex-loc-tel','ex-loc-email','ex-notes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('ex-date').value = '';
  document.getElementById('ex-heure').value = '';
  document.getElementById('ex-superficie').value = '';
  document.getElementById('ex-date-entree').value = '';
  document.getElementById('ex-success').style.display = 'none';
  document.getElementById('extranet-form-error').style.display = 'none';
  const btn = document.getElementById('ex-submit-btn');
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
  document.getElementById('extranet-order-form').style.display = 'block';
  document.getElementById('extranet-order-form').scrollIntoView({ behavior: 'smooth' });
}

function extranetHideOrderForm(){
  document.getElementById('extranet-order-form').style.display = 'none';
}

async function extranetSubmitOrder(){
  const adresse = document.getElementById('ex-adresse').value.trim();
  const locNom = document.getElementById('ex-loc-nom').value.trim();
  const locTel = document.getElementById('ex-loc-tel').value.trim();
  const errEl = document.getElementById('extranet-form-error');

  if(!_exSelectedType){ errEl.textContent = 'Veuillez sélectionner un type d\'état des lieux.'; errEl.style.display='block'; return; }
  if(!adresse){ errEl.textContent = 'L\'adresse du bien est requise.'; errEl.style.display='block'; return; }
  if(!locNom){ errEl.textContent = 'Le nom du locataire est requis.'; errEl.style.display='block'; return; }
  if(!locTel){ errEl.textContent = 'Le téléphone du locataire est requis.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';

  const btn = document.getElementById('ex-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Envoi en cours…';

  const userEmail = document.getElementById('extranet-user-email').textContent;
  const { data: { session } } = await supabaseClient.auth.getSession();

  const locataire = { nom: locNom, tel: locTel, email: document.getElementById('ex-loc-email').value.trim() };

  const payload = {
    agencyId: '',
    agence: userEmail,
    contact: userEmail,
    email: userEmail,
    tel: '',
    typeEdl: _exSelectedType,
    adresse,
    bienType: document.getElementById('ex-bien-type').value,
    bienTypo: '',
    meuble: document.getElementById('ex-meuble').value,
    superficie: document.getElementById('ex-superficie')?.value || '',
    dateEntree: document.getElementById('ex-date-entree')?.value || '',
    acces: document.getElementById('ex-acces').value.trim(),
    dateSouhaitee: document.getElementById('ex-date').value,
    heure: document.getElementById('ex-heure').value,
    notes: document.getElementById('ex-notes').value.trim(),
    locataire,
    locataires: [locataire],
    source: 'extranet'
  };

  try{
    const resp = await fetch('/api/booking-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await resp.json();
    if(result.success || resp.ok){
      document.getElementById('ex-success').style.display = 'block';
      btn.style.display = 'none';
      // Recharger la liste des commandes après 2s
      setTimeout(() => {
        if(session?.access_token) showExtranetDashboard(userEmail, session.access_token);
        extranetHideOrderForm();
      }, 2500);
    } else {
      errEl.textContent = result.error || 'Erreur lors de l\'envoi. Réessayez.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
    }
  } catch(e){
    errEl.textContent = 'Erreur réseau. Vérifiez votre connexion et réessayez.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
  }
}





let _bkSelectedType = '';
function bkSelectType(type, btn){
  _bkSelectedType = type;
  document.querySelectorAll('#bk-page1 button[onclick^="bkSelectType"]').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = '#fff';
    b.style.color = 'var(--text)';
  });
  btn.style.borderColor = 'var(--blue)';
  btn.style.background = 'var(--blue-bg)';
  btn.style.color = 'var(--blue)';
}

function bkShowError(msg){
  const el = document.getElementById('bk-error');
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
  el.scrollIntoView({behavior:'smooth', block:'center'});
}
function bkHideError(){ document.getElementById('bk-error').style.display = 'none'; }

function bkSetStep(n){
  [1,2,3].forEach(i => {
    document.getElementById('bk-page'+i).style.display = i===n ? 'block' : 'none';
    const stepEl = document.getElementById('bk-step'+i);
    if(i===n){ stepEl.style.color='var(--blue)'; stepEl.style.background='var(--blue-bg)'; }
    else if(i<n){ stepEl.style.color='var(--green)'; stepEl.style.background='var(--green-bg)'; }
    else { stepEl.style.color='var(--text3)'; stepEl.style.background='#fff'; }
  });
  window.scrollTo({top:0, behavior:'smooth'});
  bkHideError();
}

function bkNext(from){
  if(from === 1){
    if(!document.getElementById('bk-agence').value.trim()) return bkShowError("Le nom de l'agence est requis.");
    if(!document.getElementById('bk-contact').value.trim()) return bkShowError("Votre nom est requis.");
    if(!document.getElementById('bk-email').value.trim()) return bkShowError("Votre email est requis.");
    if(!_bkSelectedType) return bkShowError("Veuillez choisir un type d'état des lieux.");
    bkSetStep(2);
  } else if(from === 2){
    if(!document.getElementById('bk-adresse').value.trim()) return bkShowError("L'adresse du bien est requise.");
    if(!document.getElementById('bk-date').value) return bkShowError("La date souhaitée est requise.");
    bkBuildRecap();
    bkSetStep(3);
  }
}
function bkPrev(from){ bkSetStep(from - 1); }

let _bkExtraLocCount = 0;
function bkAddLocataire(){
  _bkExtraLocCount++;
  const id = _bkExtraLocCount;
  const div = document.createElement('div');
  div.className = 'card';
  div.id = 'bk-loc-extra-' + id;
  div.style.marginBottom = '14px';
  div.innerHTML = `
    <div class="card-head">
      <span><i class="ti ti-user"></i> Locataire supplémentaire</span>
      <button type="button" onclick="bkRemoveLocataire(${id})" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:11px;font-weight:600">✕ Retirer</button>
    </div>
    <div style="padding:16px">
      <div class="form-grid">
        <div><label>Nom complet</label><input type="text" id="bk-loc-nom-${id}" placeholder="Marie Martin"></div>
        <div><label>Téléphone</label><input type="tel" id="bk-loc-tel-${id}" placeholder="06 12 34 56 78"></div>
      </div>
      <label style="margin-top:10px">Email</label>
      <input type="email" id="bk-loc-email-${id}" placeholder="marie.martin@email.fr">
    </div>`;
  document.getElementById('bk-loc-extra-container').appendChild(div);
}
function bkRemoveLocataire(id){
  const el = document.getElementById('bk-loc-extra-' + id);
  if(el) el.remove();
}

function bkBuildRecap(){
  const agence  = document.getElementById('bk-agence').value;
  const adresse = document.getElementById('bk-adresse').value;
  const date    = document.getElementById('bk-date').value;
  const heure   = document.getElementById('bk-heure').value || 'Flexible';
  const bien    = [document.getElementById('bk-bien-type').value, document.getElementById('bk-bien-typo').value, document.getElementById('bk-meuble').value].filter(Boolean).join(' · ');
  const dateStr = new Date(date).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('bk-recap').innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><td style="color:var(--text3);padding:3px 0;width:35%">Agence</td><td style="font-weight:600">${agence}</td></tr>
      <tr><td style="color:var(--text3);padding:3px 0">Type</td><td style="font-weight:600">${_bkSelectedType}</td></tr>
      <tr><td style="color:var(--text3);padding:3px 0">Adresse</td><td>${adresse}</td></tr>
      ${bien?`<tr><td style="color:var(--text3);padding:3px 0">Bien</td><td>${bien}</td></tr>`:''}
      <tr><td style="color:var(--text3);padding:3px 0">Date</td><td style="font-weight:600;color:var(--blue)">${dateStr} · ${heure}</td></tr>
    </table>`;
}

async function bkSubmit(){
  const locNom = document.getElementById('bk-loc-nom').value.trim();
  const locTel = document.getElementById('bk-loc-tel').value.trim();
  if(!locNom) return bkShowError('Le nom du locataire est requis.');
  if(!locTel) return bkShowError('Le téléphone du locataire est requis.');

  // Locataire principal + locataires supplémentaires éventuels
  const locataires = [{
    nom: locNom,
    tel: locTel,
    email: document.getElementById('bk-loc-email').value.trim()
  }];
  document.querySelectorAll('[id^="bk-loc-extra-"]').forEach(div => {
    const id = div.id.replace('bk-loc-extra-', '');
    const nom = document.getElementById('bk-loc-nom-' + id)?.value.trim() || '';
    const tel = document.getElementById('bk-loc-tel-' + id)?.value.trim() || '';
    const email = document.getElementById('bk-loc-email-' + id)?.value.trim() || '';
    if(nom || tel || email) locataires.push({ nom, tel, email });
  });

  const btn = document.getElementById('bk-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Envoi en cours…';

  const payload = {
    agencyId : window._bkAgencyId || '',
    agence   : document.getElementById('bk-agence').value.trim(),
    contact  : document.getElementById('bk-contact').value.trim(),
    email    : document.getElementById('bk-email').value.trim(),
    tel      : document.getElementById('bk-tel').value.trim(),
    typeEdl  : _bkSelectedType,
    adresse  : document.getElementById('bk-adresse').value.trim(),
    bienType : document.getElementById('bk-bien-type').value,
    bienTypo : document.getElementById('bk-bien-typo').value,
    meuble   : document.getElementById('bk-meuble').value,
    superficie: document.getElementById('bk-superficie')?.value || '',
    dateEntree: document.getElementById('bk-date-entree')?.value || '',
    acces    : document.getElementById('bk-acces').value.trim(),
    dateSouhaitee : document.getElementById('bk-date').value,
    heure    : document.getElementById('bk-heure').value,
    notes    : document.getElementById('bk-notes').value.trim(),
    locataire: locataires[0],
    locataires
  };

  try {
    const resp = await fetch('/api/booking-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(resp.ok){
      document.getElementById('booking-app').style.display = 'none';
      const dateStr = new Date(payload.dateSouhaitee).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
      document.getElementById('bk-success-recap').innerHTML = `
        <strong>📋 ${payload.typeEdl}</strong><br>
        📍 ${payload.adresse}<br>
        📅 ${dateStr} · ${payload.heure||'Horaire flexible'}<br>
        👤 ${locNom} · ${locTel}`;
      document.getElementById('bk-success').style.display = 'block';
      window.scrollTo({top:0, behavior:'smooth'});
    } else {
      bkShowError("Erreur lors de l'envoi. Veuillez nous appeler au 01 89 29 14 29.");
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
    }
  } catch(e){
    bkShowError("Connexion impossible. Veuillez nous appeler au 01 89 29 14 29.");
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
  }
}



// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ─── STATISTIQUES BOOKING ──────────────────────────────────
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
        ${emoji} ${type} <strong>${count}</strong>
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
        🏢 ${agency.length > 20 ? agency.substring(0,20)+'…' : agency} <strong>${count}</strong>
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
        <div style="font-size:10px;color:var(--text2)">${month}</div>
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