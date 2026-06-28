<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Demande d'état des lieux — EDLConnect</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --blue:#185FA5;--blue-light:#E6F1FB;--blue-dark:#0C447C;
  --green:#3B6D11;--green-bg:#EAF3DE;
  --text:#1a1a1a;--text2:#6b6b6b;--text3:#999;
  --border:#e5e5e2;--bg:#f8f8f6;--white:#fff;
  --radius:10px;--radius-lg:16px;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:var(--text);background:var(--bg);min-height:100vh}

/* HEADER */
.header{background:var(--white);border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;gap:12px}
.logo-box{background:var(--blue-light);width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-box span{font-size:15px;font-weight:700;color:var(--blue);letter-spacing:-1px}
.header-title{font-size:15px;font-weight:600;color:var(--text)}
.header-sub{font-size:12px;color:var(--text2)}
.header-right{margin-left:auto;font-size:12px;color:var(--text2);text-align:right}

/* MAIN */
.container{max-width:640px;margin:0 auto;padding:32px 16px 60px}

/* HERO */
.hero{background:var(--blue);border-radius:var(--radius-lg);padding:28px;margin-bottom:28px;color:#fff}
.hero-agency{font-size:12px;opacity:.75;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
.hero-name{font-size:22px;font-weight:700;margin-bottom:8px}
.hero-desc{font-size:13px;opacity:.85;line-height:1.6}

/* STEPS */
.steps{display:flex;gap:0;margin-bottom:28px;background:var(--white);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden}
.step{flex:1;padding:12px 8px;text-align:center;font-size:11px;font-weight:600;color:var(--text3);border-right:1px solid var(--border);transition:all .2s}
.step:last-child{border-right:none}
.step.active{color:var(--blue);background:var(--blue-light)}
.step.done{color:var(--green);background:var(--green-bg)}
.step-num{display:block;font-size:16px;margin-bottom:2px}

/* CARD */
.card{background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--border);padding:24px;margin-bottom:16px}
.card-title{font-size:14px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;color:var(--blue)}
.card-title i{font-size:18px}

/* FORM */
.form-group{margin-bottom:14px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
label{font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
label .req{color:#e53e3e}
input,select,textarea{width:100%;border:1.5px solid var(--border);border-radius:var(--radius);padding:10px 12px;font-size:13px;background:var(--white);color:var(--text);font-family:inherit;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(24,95,165,.1)}
textarea{min-height:80px;resize:vertical}
select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}

/* TYPE EDL BUTTONS */
.type-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.type-btn{border:1.5px solid var(--border);border-radius:var(--radius);padding:12px;cursor:pointer;background:var(--white);text-align:left;transition:all .15s;font-family:inherit}
.type-btn:hover{border-color:var(--blue);background:var(--blue-light)}
.type-btn.selected{border-color:var(--blue);background:var(--blue-light);color:var(--blue)}
.type-btn-icon{font-size:20px;display:block;margin-bottom:4px}
.type-btn-label{font-size:12px;font-weight:600;display:block}
.type-btn-desc{font-size:10px;color:var(--text2);display:block;margin-top:2px}
.type-btn.selected .type-btn-desc{color:var(--blue-dark)}

/* DATE SECTION */
.date-hint{font-size:11px;color:var(--text2);margin-top:5px;display:flex;align-items:center;gap:4px}

/* SUBMIT */
.submit-btn{width:100%;background:var(--blue);color:#fff;border:none;border-radius:var(--radius);padding:16px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px}
.submit-btn:hover{background:var(--blue-dark)}
.submit-btn:disabled{opacity:.6;cursor:not-allowed}
.submit-btn i{font-size:18px}

/* SUCCESS */
.success-screen{display:none;text-align:center;padding:48px 24px}
.success-icon{width:72px;height:72px;background:var(--green-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px}
.success-title{font-size:22px;font-weight:700;margin-bottom:8px}
.success-sub{font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:24px}
.success-card{background:var(--blue-light);border-radius:var(--radius);padding:16px;text-align:left;font-size:13px;color:var(--blue-dark);line-height:1.8}

/* INFO BOX */
.info-box{background:var(--blue-light);border-radius:var(--radius);padding:12px 14px;font-size:12px;color:var(--blue-dark);margin-top:16px;line-height:1.7}

/* ERROR */
.error-msg{background:#FCEBEB;color:#A32D2D;border-radius:var(--radius);padding:12px 14px;font-size:12px;margin-bottom:16px;display:none}
.error-msg.show{display:block}

/* FOOTER */
.footer{text-align:center;font-size:11px;color:var(--text3);margin-top:32px;padding-top:16px;border-top:1px solid var(--border)}
.footer a{color:var(--blue);text-decoration:none}

/* MOBILE */
@media(max-width:480px){
  .form-row{grid-template-columns:1fr}
  .type-grid{grid-template-columns:1fr 1fr}
  .hero{padding:20px}
  .card{padding:18px}
}
</style>
</head>
<body>

<div class="header">
  <div class="logo-box"><span>ED</span></div>
  <div>
    <div class="header-title">EDLConnect</div>
    <div class="header-sub">Demande d'état des lieux</div>
  </div>
  <div class="header-right">
    📞 <a href="tel:0189291429" style="color:var(--blue);text-decoration:none">01 89 29 14 29</a><br>
    <span style="font-size:11px">Lun–Sam · 8h–20h</span>
  </div>
</div>

<div class="container">

  <!-- Hero dynamique selon l'agence -->
  <div class="hero" id="hero-block">
    <div class="hero-agency" id="hero-agency-label">Portail agence</div>
    <div class="hero-name" id="hero-agency-name">Demande d'état des lieux</div>
    <div class="hero-desc">Remplissez ce formulaire pour soumettre votre demande. Nous vous confirmons la prise en charge sous 2h et vous contactons pour planifier l'intervention.</div>
  </div>

  <!-- Étapes -->
  <div class="steps" id="steps-bar">
    <div class="step active" id="step1-ind"><span class="step-num">📋</span>Votre demande</div>
    <div class="step" id="step2-ind"><span class="step-num">🏠</span>Le bien</div>
    <div class="step" id="step3-ind"><span class="step-num">👤</span>Le locataire</div>
  </div>

  <!-- ERREUR -->
  <div class="error-msg" id="error-msg"></div>

  <!-- FORMULAIRE -->
  <form id="booking-form" onsubmit="return false">

    <!-- ÉTAPE 1 : Votre demande -->
    <div id="page-1">
      <div class="card">
        <div class="card-title"><i class="ti ti-building-store"></i>Votre agence</div>
        <div class="form-row">
          <div class="form-group">
            <label>Nom de l'agence <span class="req">*</span></label>
            <input type="text" id="f-agence" placeholder="Orpi Évry" required>
          </div>
          <div class="form-group">
            <label>Votre nom <span class="req">*</span></label>
            <input type="text" id="f-contact" placeholder="Marie Dupont" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Email <span class="req">*</span></label>
            <input type="email" id="f-email" placeholder="m.dupont@orpi.com" required>
          </div>
          <div class="form-group">
            <label>Téléphone</label>
            <input type="tel" id="f-tel" placeholder="06 12 34 56 78">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><i class="ti ti-file-check"></i>Type d'état des lieux</div>
        <div class="type-grid">
          <button type="button" class="type-btn" onclick="selectType('EDL entrant',this)">
            <span class="type-btn-icon">🔑</span>
            <span class="type-btn-label">EDL Entrant</span>
            <span class="type-btn-desc">Entrée du locataire</span>
          </button>
          <button type="button" class="type-btn" onclick="selectType('EDL sortant',this)">
            <span class="type-btn-icon">🚪</span>
            <span class="type-btn-label">EDL Sortant</span>
            <span class="type-btn-desc">Sortie du locataire</span>
          </button>
          <button type="button" class="type-btn" onclick="selectType('EDL Sortant / Entrant',this)">
            <span class="type-btn-icon">🔄</span>
            <span class="type-btn-label">Sortant + Entrant</span>
            <span class="type-btn-desc">Les deux le même jour</span>
          </button>
          <button type="button" class="type-btn" onclick="selectType('Pré-état des lieux',this)">
            <span class="type-btn-icon">🔍</span>
            <span class="type-btn-label">Pré-état des lieux</span>
            <span class="type-btn-desc">Avant la sortie</span>
          </button>
        </div>
        <input type="hidden" id="f-type-edl">
      </div>

      <button type="button" class="submit-btn" onclick="nextStep(1)">
        Suivant <i class="ti ti-arrow-right"></i>
      </button>
    </div>

    <!-- ÉTAPE 2 : Le bien -->
    <div id="page-2" style="display:none">
      <div class="card">
        <div class="card-title"><i class="ti ti-home"></i>Adresse du bien</div>
        <div class="form-group">
          <label>Adresse complète <span class="req">*</span></label>
          <input type="text" id="f-adresse" placeholder="12 rue de la Paix, 91000 Évry" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Type de bien</label>
            <select id="f-bien-type">
              <option value="">— Choisir —</option>
              <option>Appartement</option>
              <option>Maison</option>
            </select>
          </div>
          <div class="form-group">
            <label>Typologie</label>
            <select id="f-bien-typo">
              <option value="">— Choisir —</option>
              <option>Studio</option>
              <option>T1</option>
              <option>T2</option>
              <option>T3</option>
              <option>T4</option>
              <option>T5</option>
              <option>T6+</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Meublé / Nu</label>
            <select id="f-meuble">
              <option value="">— Choisir —</option>
              <option>Meublé</option>
              <option>Nu</option>
            </select>
          </div>
          <div class="form-group">
            <label>Accès (digicode, interphone…)</label>
            <input type="text" id="f-acces" placeholder="Code : A1234">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><i class="ti ti-calendar"></i>Date souhaitée</div>
        <div class="form-row">
          <div class="form-group">
            <label>Date <span class="req">*</span></label>
            <input type="date" id="f-date" required>
            <div class="date-hint"><i class="ti ti-info-circle" style="font-size:12px"></i>Sous réserve de disponibilité</div>
          </div>
          <div class="form-group">
            <label>Heure souhaitée</label>
            <select id="f-heure">
              <option value="">— Flexible —</option>
              <option>08h00</option>
              <option>09h00</option>
              <option>10h00</option>
              <option>11h00</option>
              <option>14h00</option>
              <option>15h00</option>
              <option>16h00</option>
              <option>17h00</option>
              <option>18h00</option>
              <option>19h00</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Informations complémentaires</label>
          <textarea id="f-notes" placeholder="Présence du propriétaire, clés à récupérer à l'agence, accès particulier…"></textarea>
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button type="button" class="submit-btn" onclick="prevStep(2)" style="background:var(--bg);color:var(--text);border:1.5px solid var(--border);flex:1">
          <i class="ti ti-arrow-left"></i> Retour
        </button>
        <button type="button" class="submit-btn" onclick="nextStep(2)" style="flex:2">
          Suivant <i class="ti ti-arrow-right"></i>
        </button>
      </div>
    </div>

    <!-- ÉTAPE 3 : Le locataire -->
    <div id="page-3" style="display:none">
      <div class="card">
        <div class="card-title"><i class="ti ti-user"></i>Locataire entrant</div>
        <div class="form-row">
          <div class="form-group">
            <label>Nom complet <span class="req">*</span></label>
            <input type="text" id="f-loc-nom" placeholder="Jean Martin" required>
          </div>
          <div class="form-group">
            <label>Téléphone <span class="req">*</span></label>
            <input type="tel" id="f-loc-tel" placeholder="06 12 34 56 78" required>
          </div>
        </div>
        <div class="form-group">
          <label>Email du locataire</label>
          <input type="email" id="f-loc-email" placeholder="jean.martin@email.fr">
          <div class="date-hint"><i class="ti ti-info-circle" style="font-size:12px"></i>Il recevra la confirmation de RDV une fois planifié</div>
        </div>
      </div>

      <!-- Récap -->
      <div class="card" id="recap-card">
        <div class="card-title"><i class="ti ti-clipboard-check"></i>Récapitulatif</div>
        <div id="recap-content" style="font-size:13px;line-height:2;color:var(--text2)"></div>
      </div>

      <div class="info-box">
        <strong>📬 Après envoi :</strong><br>
        Vous recevrez un email de confirmation sous 2h. Thomas vous contactera pour confirmer la date définitive. Le locataire recevra sa convocation une fois le RDV planifié.
      </div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <button type="button" class="submit-btn" onclick="prevStep(3)" style="background:var(--bg);color:var(--text);border:1.5px solid var(--border);flex:1">
          <i class="ti ti-arrow-left"></i> Retour
        </button>
        <button type="button" class="submit-btn" id="submit-btn" onclick="submitForm()" style="flex:2">
          <i class="ti ti-send"></i> Envoyer ma demande
        </button>
      </div>
    </div>

  </form>

  <!-- SUCCÈS -->
  <div class="success-screen" id="success-screen">
    <div class="success-icon">✅</div>
    <div class="success-title">Demande envoyée !</div>
    <div class="success-sub">
      Votre demande d'état des lieux a bien été reçue.<br>
      Thomas vous contactera sous <strong>2h</strong> pour confirmer la date.
    </div>
    <div class="success-card">
      <div id="success-recap"></div>
    </div>
    <div style="margin-top:24px;font-size:13px;color:var(--text2)">
      Une question ? 📞 <a href="tel:0189291429" style="color:var(--blue)">01 89 29 14 29</a>
    </div>
  </div>

  <div class="footer">
    <strong>EDLConnect</strong> — Expert en état des lieux en Île-de-France<br>
    <a href="mailto:contact@edlconnect.fr">contact@edlconnect.fr</a> · 
    <a href="tel:0189291429">01 89 29 14 29</a>
  </div>

</div>

<script>
// ─── PARAMÈTRES URL ────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const agencyId  = params.get('agency') || '';
const agencyName = params.get('name')  || '';

// Pré-remplir le nom de l'agence si passé en URL
if(agencyName){
  document.getElementById('f-agence').value = decodeURIComponent(agencyName);
  document.getElementById('f-agence').readOnly = true;
  document.getElementById('hero-agency-label').textContent = 'Portail exclusif';
  document.getElementById('hero-agency-name').textContent = decodeURIComponent(agencyName);
}

// Date minimum = demain
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
document.getElementById('f-date').min = tomorrow.toISOString().split('T')[0];

// ─── TYPE EDL ─────────────────────────────────────────────
let selectedType = '';
function selectType(type, btn){
  selectedType = type;
  document.getElementById('f-type-edl').value = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ─── NAVIGATION ÉTAPES ────────────────────────────────────
let currentStep = 1;

function showStep(n){
  [1,2,3].forEach(i => {
    document.getElementById('page-'+i).style.display = i===n ? 'block' : 'none';
    const ind = document.getElementById('step'+i+'-ind');
    ind.className = 'step' + (i===n?' active':i<n?' done':'');
  });
  currentStep = n;
  window.scrollTo({top:0, behavior:'smooth'});
  hideError();
}

function nextStep(from){
  if(from === 1){
    if(!document.getElementById('f-agence').value.trim()){return showError('Le nom de l\'agence est requis.');}
    if(!document.getElementById('f-contact').value.trim()){return showError('Votre nom est requis.');}
    if(!document.getElementById('f-email').value.trim()){return showError('Votre email est requis.');}
    if(!selectedType){return showError('Veuillez choisir un type d\'état des lieux.');}
    showStep(2);
  } else if(from === 2){
    if(!document.getElementById('f-adresse').value.trim()){return showError('L\'adresse du bien est requise.');}
    if(!document.getElementById('f-date').value){return showError('La date souhaitée est requise.');}
    buildRecap();
    showStep(3);
  }
}

function prevStep(from){
  showStep(from - 1);
}

function showError(msg){
  const el = document.getElementById('error-msg');
  el.textContent = '⚠️ ' + msg;
  el.classList.add('show');
  el.scrollIntoView({behavior:'smooth', block:'center'});
}
function hideError(){
  document.getElementById('error-msg').classList.remove('show');
}

// ─── RÉCAP ────────────────────────────────────────────────
function buildRecap(){
  const agence  = document.getElementById('f-agence').value;
  const type    = selectedType;
  const adresse = document.getElementById('f-adresse').value;
  const date    = document.getElementById('f-date').value;
  const heure   = document.getElementById('f-heure').value || 'Flexible';
  const bien    = [document.getElementById('f-bien-type').value, document.getElementById('f-bien-typo').value, document.getElementById('f-meuble').value].filter(Boolean).join(' · ');

  document.getElementById('recap-content').innerHTML = `
    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px">
      <span style="color:var(--text3);font-size:11px;font-weight:600;text-transform:uppercase;padding-top:2px">Agence</span><span style="font-weight:600">${agence}</span>
      <span style="color:var(--text3);font-size:11px;font-weight:600;text-transform:uppercase;padding-top:2px">Type</span><span>${type}</span>
      <span style="color:var(--text3);font-size:11px;font-weight:600;text-transform:uppercase;padding-top:2px">Adresse</span><span>${adresse}</span>
      ${bien?`<span style="color:var(--text3);font-size:11px;font-weight:600;text-transform:uppercase;padding-top:2px">Bien</span><span>${bien}</span>`:''}
      <span style="color:var(--text3);font-size:11px;font-weight:600;text-transform:uppercase;padding-top:2px">Date</span><span>${new Date(date).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} · ${heure}</span>
    </div>`;
}

// ─── ENVOI ────────────────────────────────────────────────
async function submitForm(){
  const locNom = document.getElementById('f-loc-nom').value.trim();
  const locTel = document.getElementById('f-loc-tel').value.trim();
  if(!locNom){return showError('Le nom du locataire est requis.');}
  if(!locTel){return showError('Le téléphone du locataire est requis.');}

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> Envoi en cours…';

  const payload = {
    agencyId,
    agence   : document.getElementById('f-agence').value.trim(),
    contact  : document.getElementById('f-contact').value.trim(),
    email    : document.getElementById('f-email').value.trim(),
    tel      : document.getElementById('f-tel').value.trim(),
    typeEdl  : selectedType,
    adresse  : document.getElementById('f-adresse').value.trim(),
    bienType : document.getElementById('f-bien-type').value,
    bienTypo : document.getElementById('f-bien-typo').value,
    meuble   : document.getElementById('f-meuble').value,
    acces    : document.getElementById('f-acces').value.trim(),
    dateSouhaitee : document.getElementById('f-date').value,
    heure    : document.getElementById('f-heure').value,
    notes    : document.getElementById('f-notes').value.trim(),
    locataire: {
      nom   : locNom,
      tel   : locTel,
      email : document.getElementById('f-loc-email').value.trim()
    }
  };

  try{
    const resp = await fetch('/api/booking-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if(resp.ok){
      // Afficher l'écran de succès
      document.getElementById('booking-form').style.display = 'none';
      document.getElementById('steps-bar').style.display = 'none';
      document.getElementById('error-msg').style.display = 'none';

      const dateStr = new Date(payload.dateSouhaitee).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
      document.getElementById('success-recap').innerHTML = `
        <strong>📋 ${payload.typeEdl}</strong><br>
        📍 ${payload.adresse}<br>
        📅 ${dateStr} · ${payload.heure||'Horaire flexible'}<br>
        👤 Locataire : ${locNom} · ${locTel}
      `;
      document.getElementById('success-screen').style.display = 'block';
      window.scrollTo({top:0, behavior:'smooth'});
    } else {
      showError('Erreur lors de l\'envoi. Veuillez réessayer ou nous appeler au 01 89 29 14 29.');
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
    }
  } catch(e){
    showError('Connexion impossible. Veuillez nous appeler au 01 89 29 14 29.');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Envoyer ma demande';
  }
}
</script>

</body>
</html>
