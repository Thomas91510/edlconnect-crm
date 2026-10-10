// ════════════════════════════════════════════════════════════════
// Contrat de sous-traitance RGPD (api/contrat-rgpd.js)
// ════════════════════════════════════════════════════════════════
// Signé par chaque abonné dès la souscription : case obligatoire à
// l'inscription, puis signature électronique à la première connexion
// (fenêtre bloquante tant que la version en cours n'est pas signée).
// Réglages › Contrat RGPD : statut, date de signature, relecture.
// Le compte admin (éditeur de la plateforme) n'a pas à signer.

let _contratRgpd = null;

async function chargerContratRgpd(){
  const headers = (typeof _currentUser !== 'undefined' && _currentUser) ? await _authHeaders({}) : {};
  const r = await fetch('/api/contrat-rgpd', { headers });
  if(!r.ok) throw new Error('Contrat indisponible');
  const c = await r.json();
  if(!c || !c.version || typeof c.html !== 'string') throw new Error('Contrat indisponible');
  _contratRgpd = c;
  return _contratRgpd;
}

function _overlayContrat(){
  let el = document.getElementById('contrat-rgpd-overlay');
  if(el) return el;
  el = document.createElement('div');
  el.id = 'contrat-rgpd-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'contrat-rgpd-titre');
  el.innerHTML = `
    <div class="contrat-boite">
      <div class="contrat-entete">
        <div id="contrat-rgpd-titre" class="contrat-titre"><i class="ti ti-file-certificate"></i> Contrat de sous-traitance RGPD</div>
        <button type="button" class="btn btn-sm" id="contrat-rgpd-fermer" onclick="fermerContratRgpd()" aria-label="Fermer"><i class="ti ti-x"></i></button>
      </div>
      <div id="contrat-rgpd-intro" class="contrat-intro"></div>
      <div id="contrat-rgpd-texte" class="contrat-texte" tabindex="0"></div>
      <div id="contrat-rgpd-pied" class="contrat-pied"></div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function fermerContratRgpd(){
  const el = document.getElementById('contrat-rgpd-overlay');
  if(el && !el.dataset.bloquant) el.classList.remove('open');
}

// mode : 'signature' (bloquant, case + bouton Signer) ou 'lecture'.
function afficherContratRgpd(contrat, mode){
  const el = _overlayContrat();
  const signature = mode === 'signature';
  if(signature) el.dataset.bloquant = '1'; else delete el.dataset.bloquant;
  document.getElementById('contrat-rgpd-fermer').style.display = signature ? 'none' : '';
  document.getElementById('contrat-rgpd-intro').innerHTML = signature
    ? 'Pour utiliser le CRM, vous devez signer le contrat qui encadre le traitement des données de vos clients, locataires et agents par la plateforme (article 28 du RGPD). Une copie vous sera envoyée par email.'
    : (contrat.signature
        ? `✅ Signé le ${esc(new Date(contrat.signature.date).toLocaleString('fr-FR'))} (version du ${esc(String(contrat.version || '').split('-').reverse().join('/'))}).`
        : 'Version en vigueur du contrat.');
  // Texte produit par le serveur à partir de constantes (api/_lib/contrat-rgpd.js), sans saisie utilisateur.
  document.getElementById('contrat-rgpd-texte').innerHTML = contrat.html;
  document.getElementById('contrat-rgpd-pied').innerHTML = signature ? `
      <label class="contrat-case"><input type="checkbox" id="contrat-rgpd-case" onchange="document.getElementById('contrat-rgpd-signer').disabled=!this.checked">
        <span>J’ai lu le contrat de sous-traitance et je l’accepte au nom de ma société.</span></label>
      <div id="contrat-rgpd-erreur" class="contrat-erreur" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button type="button" class="btn" onclick="imprimerContratRgpd()"><i class="ti ti-printer"></i>Imprimer</button>
        <button type="button" class="btn btn-primary" id="contrat-rgpd-signer" disabled onclick="signerContratRgpd()"><i class="ti ti-signature"></i>Signer électroniquement</button>
      </div>` : `
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick="imprimerContratRgpd()"><i class="ti ti-printer"></i>Imprimer / PDF</button>
        <button type="button" class="btn btn-primary" onclick="fermerContratRgpd()">Fermer</button>
      </div>`;
  el.classList.add('open');
  document.getElementById('contrat-rgpd-texte').scrollTop = 0;
}

async function signerContratRgpd(){
  const btn = document.getElementById('contrat-rgpd-signer');
  const err = document.getElementById('contrat-rgpd-erreur');
  if(!document.getElementById('contrat-rgpd-case').checked) return;
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i>Signature…';
  err.textContent = '';
  try{
    const r = await fetch('/api/contrat-rgpd', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ accepte: true, version: _contratRgpd.version, empreinte: _contratRgpd.empreinte }),
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Signature impossible');
    _contratRgpd.signature = d.signature;
    const el = document.getElementById('contrat-rgpd-overlay');
    delete el.dataset.bloquant;
    el.classList.remove('open');
    notify(d.copieEnvoyee ? '✅ Contrat signé — copie envoyée par email' : '✅ Contrat signé');
    renderSectionContrat();
  }catch(e){
    err.textContent = e.message;
    btn.disabled = false; btn.innerHTML = '<i class="ti ti-signature"></i>Signer électroniquement';
  }
}

function imprimerContratRgpd(){
  if(!_contratRgpd) return;
  const w = window.open('', '_blank');
  if(!w){ notify('Autorisez les fenêtres pour imprimer', 'warn'); return; }
  const sig = _contratRgpd.signature ? `<p style="font-size:12px;color:#555">Signé électroniquement le ${esc(new Date(_contratRgpd.signature.date).toLocaleString('fr-FR'))} — empreinte ${esc(_contratRgpd.empreinte)}</p>` : '';
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Contrat de sous-traitance RGPD</title><style>body{font-family:Arial,sans-serif;font-size:12px;line-height:1.55;max-width:760px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}h2{font-size:18px}h3{font-size:13.5px;margin-top:16px}</style></head><body>${_contratRgpd.html}${sig}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// Appelé à chaque connexion (onAuthSuccess) : fenêtre bloquante si la
// version en cours n'est pas signée par ce compte.
async function verifierContratRgpd(){
  try{
    const c = await chargerContratRgpd();
    renderSectionContrat();
    if(!c.actif || c.exempt || c.signature || c.erreur) return;
    afficherContratRgpd(c, 'signature');
  }catch(e){ console.warn('verifierContratRgpd:', e); }
}

async function ouvrirContratRgpd(){
  try{
    const c = _contratRgpd || await chargerContratRgpd();
    if(c.actif && !c.exempt && !c.signature && typeof _currentUser !== 'undefined' && _currentUser) afficherContratRgpd(c, 'signature');
    else afficherContratRgpd(c, 'lecture');
  }catch(e){ notify('Contrat indisponible pour le moment', 'warn'); }
}

function renderSectionContrat(){
  const el = document.getElementById('reglages-contrat');
  if(!el) return;
  const c = _contratRgpd;
  let statut;
  if(!c) statut = '<span style="color:var(--text3)">Chargement…</span>';
  else if(c.exempt) statut = 'Compte éditeur de la plateforme : vos abonnés signent ce contrat avec vous.';
  else if(c.signature) statut = `<span style="color:var(--green-text,#25602F);font-weight:600">✅ Signé le ${esc(new Date(c.signature.date).toLocaleString('fr-FR'))}</span>`;
  else if(!c.actif) statut = 'Le contrat sera bientôt proposé à la signature.';
  else statut = '<span style="color:var(--red-text);font-weight:600">À signer</span>';
  el.innerHTML = `
    <div class="settings-title"><i class="ti ti-file-certificate" style="font-size:18px"></i>Contrat de sous-traitance RGPD</div>
    <p style="font-size:12.5px;color:var(--text2);margin:0 0 10px">Encadre le traitement des données de vos clients, locataires et agents par la plateforme (article 28 du RGPD).${c && c.version ? ' Version du ' + esc(String(c.version).split('-').reverse().join('/')) + '.' : ''}</p>
    <div style="font-size:13px;margin-bottom:10px">${statut}</div>
    <button type="button" class="btn" onclick="ouvrirContratRgpd()"><i class="ti ti-eye"></i>${c && c.actif && !c.exempt && !c.signature ? 'Lire et signer' : 'Lire le contrat'}</button>`;
}

// Inscription : la case d'acceptation n'apparaît que lorsque le contrat est
// proposé à la signature (identité légale de l'éditeur complète).
(async function afficherCaseInscriptionRgpd(){
  try{
    const r = await fetch('/api/contrat-rgpd');
    if(!r.ok) return;
    const c = await r.json();
    if(!c || !c.version) return;
    if(!_contratRgpd) _contratRgpd = c;
    const ligne = document.getElementById('signup-rgpd-ligne');
    if(ligne && c.actif) ligne.style.display = 'flex';
  }catch(e){}
})();
