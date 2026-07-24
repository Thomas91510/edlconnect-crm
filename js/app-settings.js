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

  // Contexte EDL IDF pour Claude
  const systemPrompt = `Tu es l'assistant commercial de Thomas Langlade, Directeur Général d'EDL IDF, expert en états des lieux professionnels basé à Lardy (91510) en Île-de-France. 
Tu rédiges des emails professionnels B2B en français pour des agences immobilières.
Ton style est : professionnel, bienveillant, concis, sans fioritures.
Tu ne mets JAMAIS de formules creuses comme "j'espère que ce message vous trouve en bonne santé".
Tu signes toujours : Thomas Langlade — EDL IDF.
Tu retournes UNIQUEMENT le texte de l'email (objet sur la première ligne précédé de "Objet: ", puis le corps), sans aucune explication ni commentaire.`;

  const userPrompt = `Rédige un email professionnel.
${to ? 'Destinataire : ' + to : ''}
Contexte / instructions : ${prompt}

Format de réponse :
Objet: [objet de l'email]

[corps de l'email]`;

  try {
   const response = await fetch('/api/mistral', {
      method : 'POST',
      headers: await _authHeaders({ 'Content-Type' : 'application/json' }),
      body: JSON.stringify({
        model      : 'mistral-small-latest',
        temperature: 0.7,
        max_tokens : 1000,
        messages   : [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   }
        ]
      })
    });

    const data = await response.json();

    if(!response.ok){
      const errMsg = data.message || data.error?.message || 'Erreur API Mistral';
      if(response.status === 400 || response.status === 401){
        status.textContent = '⚠️ Clé API invalide — vérifie dans Paramètres';
        generateLocalEmail(prompt, to, subjEl, bodyEl);
        btn.disabled = false; label.textContent = 'Générer';
        return;
      }
      throw new Error(errMsg);
    }

    const text = data.choices?.[0]?.message?.content || '';

    // Parser objet et corps
    const lines     = text.split('\n');
    const objetLine = lines.find(l => l.toLowerCase().startsWith('objet:'));
    const objetVal  = objetLine ? objetLine.replace(/^objet:\s*/i,'').trim() : '';
    const bodyStart = objetLine ? lines.indexOf(objetLine) + 1 : 0;
    const bodyText  = lines.slice(bodyStart).join('\n').trim();

    if(objetVal && subjEl && !subjEl.value) subjEl.value = objetVal;
    if(bodyText && bodyEl) bodyEl.value = bodyText;

    status.textContent = '✅ Email généré !';
    notify('✨ Email rédigé par Mistral IA !');
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
  const agence = to ? `(${to})` : '';
  let objet = '';
  let body  = '';

  // Détecter le type d'email demandé et générer le bon template
  if(p.includes('facture') || p.includes('règlement') || p.includes('reglement') || p.includes('paiement')){
    objet = 'EDL IDF — Confirmation de réception de votre règlement';
    body  = `Bonjour,

Je vous confirme la bonne réception de votre règlement et vous en remercie.

Vous trouverez en pièce jointe la facture acquittée correspondante à notre prestation d'état des lieux.

N'hésitez pas à me contacter pour toute question.

Cordialement,
Thomas Langlade
EDL IDF — Expert en état des lieux
📞 01 89 29 14 29 | contact@edl-idf.com`;

  } else if(p.includes('relance') || p.includes('pas répondu') || p.includes('pas repondu') || p.includes('suivi')){
    objet = 'EDL IDF — Suite à notre échange';
    body  = `Bonjour,

Je me permets de revenir vers vous suite à mon précédent message, sans vouloir vous importuner.

Notre service d'états des lieux externalisés permet à de nombreuses agences de l'Essonne de gagner 2 à 3 heures par dossier. Seriez-vous disponible pour un échange rapide de 15 minutes ?

Cordialement,
Thomas Langlade
EDL IDF — Expert en état des lieux
📞 01 89 29 14 29 | contact@edl-idf.com`;

  } else if(p.includes('rdv') || p.includes('rendez-vous') || p.includes('rendez vous') || p.includes('réunion')){
    objet = 'EDL IDF — Confirmation de rendez-vous';
    body  = `Bonjour,

Je vous confirme notre rendez-vous à la date et l'heure convenues.

N'hésitez pas à me contacter si vous avez des questions en amont.

À très bientôt,
Thomas Langlade
EDL IDF — Expert en état des lieux
📞 01 89 29 14 29 | contact@edl-idf.com`;

  } else if(p.includes('devis') || p.includes('tarif') || p.includes('prix')){
    objet = 'EDL IDF — Votre devis personnalisé';
    body  = `Bonjour,

Suite à notre échange, veuillez trouver ci-joint notre proposition tarifaire pour la réalisation de vos états des lieux.

Nos prestations comprennent l'EDL entrant, sortant et le pré-état des lieux, avec remise du rapport sous 24h.

Je reste disponible pour tout renseignement complémentaire.

Cordialement,
Thomas Langlade
EDL IDF — Expert en état des lieux
📞 01 89 29 14 29 | contact@edl-idf.com`;

  } else if(p.includes('confirmation') || p.includes('confirmer') || p.includes('mission')){
    objet = 'EDL IDF — Confirmation de votre mission';
    body  = `Bonjour,

Je vous confirme la prise en charge de votre mission d'état des lieux.

Nous vous contacterons dans les plus brefs délais pour convenir des modalités d'intervention.

Cordialement,
Thomas Langlade
EDL IDF — Expert en état des lieux
📞 01 89 29 14 29 | contact@edl-idf.com`;

  } else {
    // Générique
    objet = 'EDL IDF — Externalisation de vos états des lieux';
    body  = `Bonjour,

Je me permets de vous contacter au sujet de l'externalisation de vos états des lieux.

EDL IDF accompagne les agences immobilières de l'Essonne pour réaliser leurs états des lieux entrants et sortants, avec rapport remis sous 24h.

Seriez-vous disponible pour un échange de 15 minutes ?

Cordialement,
Thomas Langlade
EDL IDF — Expert en état des lieux
📞 01 89 29 14 29 | contact@edl-idf.com`;
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
function renderAgentsSettings(){
  const wrap = document.getElementById('agents-list');
  if(!wrap) return;
  if(!DB.agents || !DB.agents.length){
    wrap.innerHTML = '<div style="font-size:11px;color:var(--text3)">Aucun agent enregistré pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = DB.agents.map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px">
      <div style="flex:1">
        <div style="font-size:12px;font-weight:600">${a.nom}</div>
        <div style="font-size:11px;color:var(--text2)">📱 ${a.tel || '—'}</div>
      </div>
      <button class="btn btn-sm" onclick="removeAgent('${a.id}')" style="color:#c0392b;border-color:#c0392b"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}

function addAgent(){
  const nomEl = document.getElementById('new-agent-nom');
  const telEl = document.getElementById('new-agent-tel');
  const nom = nomEl.value.trim();
  const tel = telEl.value.trim();
  if(!nom){ notify('⚠️ Le nom de l\'agent est requis', 'warn'); return; }
  if(!DB.agents) DB.agents = [];
  DB.agents.push({ id: 'agent_' + Date.now(), nom, tel });
  saveToStorage();
  nomEl.value = '';
  telEl.value = '';
  renderAgentsSettings();
  notify('✅ Agent ajouté');
}

function removeAgent(id){
  if(!confirm('Retirer cet agent de la liste ?')) return;
  DB.agents = DB.agents.filter(a => a.id !== id);
  saveToStorage();
  renderAgentsSettings();
}

// ─── SETTINGS ─────────────────────────────────────────────
function loadSettingsForm(){
  renderAgentsSettings();
  document.getElementById('set-notion-token').value=CFG.notionToken||'';
  document.getElementById('set-notion-page').value=CFG.notionPageId||'';
  document.getElementById('set-brevo-key').value=CFG.brevoKey||'';
  // Profil et identite d'envoi
  const _set=(id,v)=>{const e=document.getElementById(id); if(e) e.value=v||'';};
  _set('set-name',CFG.userName);
  _set('set-email',CFG.userEmail);
  _set('set-company',CFG.companyName);
  _set('set-exp-nom',CFG.expediteurNom);
  _set('set-exp-email',CFG.expediteurEmail);
  _set('set-exp-tel',CFG.expediteurTel);
  _set('set-exp-signature',CFG.expediteurSignature);
  const ck=document.getElementById('set-claude-key');
  if(ck) ck.value=localStorage.getItem('edl_claude_key')||'';
  // Champs de facturation
  document.getElementById('set-co-address').value=CFG.companyAddress||'';
  document.getElementById('set-co-siret').value=CFG.companySiret||'';
  document.getElementById('set-co-tva').value=CFG.companyTva||'';
  document.getElementById('set-co-capital').value=CFG.companyCapital||'';
  document.getElementById('set-co-iban').value=CFG.companyIban||'';
  document.getElementById('set-co-bic').value=CFG.companyBic||'';
  document.getElementById('set-co-payterms').value=CFG.companyPaymentTerms||'';
  if(CFG.companyLogo){
    document.getElementById('logo-preview').src=CFG.companyLogo;
    document.getElementById('logo-preview-wrap').style.display='block';
  }
  // Afficher une alerte si les clés ne sont pas configurées
  if(!CFG.brevoKey){
    setTimeout(()=>notify('⚠️ Clé API Brevo non configurée — va dans Paramètres','warn'),1000);
  }
}
function handleLogoUpload(e){
  const file=e.target.files[0];
  if(!file)return;
  if(file.size>1500000){notify('⚠️ Logo trop volumineux (max 1,5 Mo)','warn');return;}
  const reader=new FileReader();
  reader.onload=function(ev){
    CFG.companyLogo=ev.target.result;
    document.getElementById('logo-preview').src=ev.target.result;
    document.getElementById('logo-preview-wrap').style.display='block';
    notify('✅ Logo chargé !');
  };
  reader.readAsDataURL(file);
}
function removeLogo(){
  CFG.companyLogo='';
  document.getElementById('logo-preview-wrap').style.display='none';
  document.getElementById('set-logo-upload').value='';
  notify('🗑️ Logo retiré');
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
  CFG.expediteurNom=_get('set-exp-nom');
  CFG.expediteurEmail=_get('set-exp-email');
  CFG.expediteurTel=_get('set-exp-tel');
  CFG.expediteurSignature=_get('set-exp-signature');
  const claudeKey=document.getElementById('set-claude-key')?.value.trim();
  if(claudeKey) localStorage.setItem('edl_claude_key', claudeKey);
  // Facturation
  CFG.companyAddress=document.getElementById('set-co-address').value.trim();
  CFG.companySiret=document.getElementById('set-co-siret').value.trim();
  CFG.companyTva=document.getElementById('set-co-tva').value.trim();
  CFG.companyCapital=document.getElementById('set-co-capital').value.trim();
  CFG.companyIban=document.getElementById('set-co-iban').value.trim();
  CFG.companyBic=document.getElementById('set-co-bic').value.trim();
  CFG.companyPaymentTerms=document.getElementById('set-co-payterms').value.trim()||'Paiement à réception de facture';
  // Sauvegarder dans Supabase (lié au user_id)
  const settingsData={
    brevoKey:CFG.brevoKey,
    notionToken:CFG.notionToken,
    notionPageId:CFG.notionPageId,
    claudeKey:claudeKey||'',
    companyName:document.getElementById('set-name')?.value||CFG.companyName,
    companyAddress:CFG.companyAddress,
    companySiret:CFG.companySiret,
    companyTva:CFG.companyTva,
    companyIban:CFG.companyIban,
    companyBic:CFG.companyBic,
    companyLogo:CFG.companyLogo||'',
    companyPaymentTerms:CFG.companyPaymentTerms,
    userName:CFG.userName||'',
    userEmail:CFG.userEmail||'',
    expediteurNom:CFG.expediteurNom||'',
    expediteurEmail:CFG.expediteurEmail||'',
    expediteurTel:CFG.expediteurTel||'',
    expediteurSignature:CFG.expediteurSignature||''
  };
  saveSettingsToSupabase(settingsData);
  // Rafraîchir le nom de la sidebar
  const sidebarName = document.getElementById('sidebar-company-name');
  if(sidebarName && settingsData.companyName) sidebarName.textContent = settingsData.companyName;
  notify('✅ Paramètres enregistrés et synchronisés !');
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
  // Vérifier si mode booking AVANT tout le reste
  if(checkBookingMode()) return; // Si mode booking, on s'arrête ici
  if(checkExtranetMode()) return; // Si mode extranet client, on s'arrête ici aussi

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
// Démarrer la sync automatique toutes les 5 min (seulement en mode CRM)
setTimeout(()=>{
  if(window._EXTRANET_MODE) return;
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
    const row = {
      email, plan, status, notes,
      expires_at: expires ? new Date(expires).toISOString() : null,
      updated_at: new Date().toISOString()
    };
    if(_editingUserId){
      row.user_id = _editingUserId;
    } else {
      // Chercher le user_id depuis l'email
      const { data: users } = await supabaseClient
        .from('user_plans')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();
      if(users) row.user_id = users.user_id;
      else {
        notify('⚠️ Utilisateur non trouvé — il doit se connecter au moins une fois','warn');
        return;
      }
    }
    const prevStatus = document.getElementById('adm-status').dataset.prevStatus || '';
    await supabaseClient.from('user_plans').upsert(row, { onConflict: 'user_id' });

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
    const address=document.getElementById('ob-address').value.trim();
    if(address) localStorage.setItem('edl_co_address', address);
    const sidebarName=document.getElementById('sidebar-company-name');
    if(sidebarName) sidebarName.textContent=company;
    document.getElementById('ob-page-1').style.display='none';
    document.getElementById('ob-page-2').style.display='block';
    obUpdateSteps(2);
  } else if(step===2){
    // Sauvegarder étape 2
    const siret=document.getElementById('ob-siret').value.trim();
    const tva=document.getElementById('ob-tva').value.trim();
    const iban=document.getElementById('ob-iban').value.trim();
    const bic=document.getElementById('ob-bic').value.trim();
    if(siret) localStorage.setItem('edl_co_siret', siret);
    if(tva) localStorage.setItem('edl_co_tva', tva);
    if(iban) localStorage.setItem('edl_co_iban', iban);
    if(bic) localStorage.setItem('edl_co_bic', bic);
    document.getElementById('ob-page-2').style.display='none';
    document.getElementById('ob-page-3').style.display='block';
    obUpdateSteps(3);
  }
}
function obBack(step){
  if(step===2){
    document.getElementById('ob-page-2').style.display='none';
    document.getElementById('ob-page-1').style.display='block';
    obUpdateSteps(1);
  } else if(step===3){
    document.getElementById('ob-page-3').style.display='none';
    document.getElementById('ob-page-2').style.display='block';
    obUpdateSteps(2);
  }
}
async function obFinish(){
  // Sauvegarder étape 3
  const brevo=document.getElementById('ob-brevo').value.trim();
  const mistral=document.getElementById('ob-mistral').value.trim();
  if(brevo) localStorage.setItem('edl_brevo_key', brevo);
  if(mistral) localStorage.setItem('edl_claude_key', mistral);
  // Marquer l'onboarding comme complété
  localStorage.setItem('edl_onboarding_done_'+(_currentUser?.id||''), '1');
  // Pousser les settings vers Supabase
  const settingsData={
    companyName: localStorage.getItem('edl_co_name')||'',
    companyAddress: localStorage.getItem('edl_co_address')||'',
    companySiret: localStorage.getItem('edl_co_siret')||'',
    companyTva: localStorage.getItem('edl_co_tva')||'',
    companyIban: localStorage.getItem('edl_co_iban')||'',
    companyBic: localStorage.getItem('edl_co_bic')||'',
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
    onAuthSuccess(data.user);
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
  if(sidebarSub)  sidebarSub.textContent  = 'CRM Pro';
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
  if(txt){txt.textContent='Sync cloud active';txt.style.color='rgba(255,255,255,0.25)';}
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
  // Charger le plan de l'utilisateur
  await loadUserPlan();
  // Charger les paramètres depuis Supabase d'abord
  await loadSettingsFromSupabase();
  // Puis charger les données
  loadFromSupabase().then(async synced => {
    if(synced){
      renderDashboard();
      renderCalendar();
      if(typeof renderProspection==='function') renderProspection();
      if(typeof renderMissions==='function') renderMissions();
      if(typeof renderPipeline==='function') renderPipeline();
    } else {
      // Première connexion → pousser les données locales
      pushAllToSupabase();
    }
    // Enregistrer le client dans user_plans s'il n'existe pas encore
    if(!isAdmin()){
      try{
        const { data: existingPlan } = await supabaseClient
          .from('user_plans').select('user_id').eq('user_id', user.id).maybeSingle();
        if(!existingPlan){
          await supabaseClient.from('user_plans').insert({
            user_id: user.id, email: user.email,
            plan: 'free', status: 'active',
            created_at: new Date().toISOString()
          });
        }
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
  document.getElementById('auth-screen').classList.add('show');
  const b=document.getElementById('logout-btn');if(b)b.remove();
  notify('Déconnecté');
}
async function checkAuth(){
  if(!_supaReady)return;
  // Écouter les changements d'auth EN PREMIER
  supabaseClient.auth.onAuthStateChange((event,session)=>{
    // Si on est en mode extranet, ignorer complètement cet événement
    if(window._EXTRANET_MODE) return;
    if(event==='SIGNED_IN'&&session){_currentUser=session.user;onAuthSuccess(session.user);}
    if(event==='SIGNED_OUT'){_currentUser=null;document.getElementById('auth-screen').classList.add('show');}
  });
  // Puis vérifier la session existante
  const{data:{session}}=await supabaseClient.auth.getSession();
  // En mode extranet, ne pas ouvrir le CRM même si session active
  if(window._EXTRANET_MODE) return;
  if(session){
    _currentUser=session.user;
    onAuthSuccess(session.user);
  } else {
    document.getElementById('auth-screen').classList.add('show');
    document.querySelector('.crm').style.display='none';
  }
}


// ═══════════════════════════════════════════════════════════