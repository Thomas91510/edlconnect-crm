export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const agencyId = url.searchParams.get('agency') || '';
  const agencyName = url.searchParams.get('name') || '';

  const html = `<!DOCTYPE html>
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
  --green:#3B6D11;--green-bg:#EAF3DE;--green-text:#27500A;
  --text:#1a1a1a;--text2:#6b6b6b;--text3:#999;
  --border:#e5e5e2;--bg:#f8f8f6;--white:#fff;
  --radius:10px;--radius-lg:16px;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:var(--text);background:var(--bg);min-height:100vh}
.header{background:var(--white);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:10}
.logo-box{background:var(--blue-light);width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-box span{font-size:13px;font-weight:700;color:var(--blue);letter-spacing:-1px}
.container{max-width:600px;margin:0 auto;padding:24px 16px 60px}
.hero{background:var(--blue);border-radius:var(--radius-lg);padding:24px;margin-bottom:22px;color:#fff}
.steps{display:flex;background:var(--white);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden;margin-bottom:18px}
.step{flex:1;padding:10px 6px;text-align:center;font-size:10px;font-weight:600;color:var(--text3);border-right:1px solid var(--border);transition:all .2s}
.step:last-child{border-right:none}
.step.active{color:var(--blue);background:var(--blue-light)}
.step.done{color:var(--green);background:var(--green-bg)}
.card{background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--border);margin-bottom:14px;overflow:hidden}
.card-head{padding:12px 16px;font-size:12px;font-weight:600;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;color:var(--blue)}
.card-body{padding:16px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
label{font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:4px;margin-top:10px;text-transform:uppercase;letter-spacing:.04em}
label:first-child{margin-top:0}
label .req{color:#e53e3e}
input,select,textarea{width:100%;border:1.5px solid var(--border);border-radius:var(--radius);padding:9px 12px;font-size:13px;background:var(--white);color:var(--text);font-family:inherit;outline:none;transition:border-color .15s}
input:focus,select:focus,textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(24,95,165,.1)}
textarea{min-height:75px;resize:vertical}
.type-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.type-btn{border:1.5px solid var(--border);border-radius:var(--radius);padding:12px;cursor:pointer;background:#fff;text-align:left;transition:all .15s;font-family:inherit;width:100%}
.type-btn:hover,.type-btn.sel{border-color:var(--blue);background:var(--blue-light)}
.type-btn.sel .tdesc{color:var(--blue-dark)}
.ticon{font-size:18px;display:block;margin-bottom:3px}
.tlabel{font-size:12px;font-weight:600;display:block}
.tdesc{font-size:10px;color:var(--text2);display:block;margin-top:1px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:13px 20px;border-radius:var(--radius);border:1.5px solid var(--border);background:var(--white);cursor:pointer;font-size:14px;font-weight:600;color:var(--text);transition:all .12s;font-family:inherit;width:100%}
.btn:hover{background:var(--bg)}
.btn-primary{background:var(--blue);color:#fff;border-color:var(--blue)}
.btn-primary:hover{background:var(--blue-dark)}
.btn-primary:disabled{opacity:.6;cursor:not-allowed}
.btn-row{display:flex;gap:10px}
.btn-row .btn{flex:1}
.btn-row .btn-primary{flex:2}
.error{display:none;background:#FCEBEB;color:#A32D2D;border-radius:var(--radius);padding:10px 14px;font-size:12px;margin-bottom:14px}
.error.show{display:block}
.hint{font-size:10px;color:var(--text2);margin-top:4px}
.info-box{background:var(--blue-light);border-radius:var(--radius);padding:12px 14px;font-size:11px;color:var(--blue-dark);margin-bottom:16px;line-height:1.7}
.success{display:none;text-align:center;padding:56px 24px}
.success-icon{width:70px;height:70px;background:var(--green-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:30px}
.recap-box{background:var(--blue-light);border-radius:var(--radius);padding:16px;text-align:left;font-size:12px;color:var(--blue-dark);line-height:2;margin-top:20px}
.footer{text-align:center;font-size:11px;color:var(--text3);margin-top:28px;padding-top:14px;border-top:1px solid var(--border)}
@media(max-width:480px){
  .form-row{grid-template-columns:1fr}
  .card-body{padding:14px}
  .hero{padding:18px}
}
</style>
</head>
<body>

<div class="header">
  <div class="logo-box"><span>ED</span></div>
  <div>
    <div style="font-size:14px;font-weight:600">EDLConnect</div>
    <div style="font-size:11px;color:var(--text2)">Demande d'état des lieux</div>
  </div>
  <div style="margin-left:auto;font-size:11px;color:var(--text2);text-align:right">
    📞 <a href="tel:0189291429" style="color:var(--blue);text-decoration:none">01 89 29 14 29</a><br>
    <span style="font-size:10px">Lun–Sam · 9h–19h30</span>
  </div>
</div>

<div class="container">

  <div class="hero">
    <div style="font-size:11px;opacity:.75;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em" id="hero-label">${agencyName ? 'Portail exclusif' : 'Portail agence'}</div>
    <div style="font-size:20px;font-weight:700;margin-bottom:6px">${agencyName ? agencyName : 'Demande d\'état des lieux'}</div>
    <div style="font-size:12px;opacity:.85;line-height:1.6">Remplissez ce formulaire pour soumettre votre demande. Nous vous confirmons la prise en charge sous 2h et vous contactons pour planifier l'intervention.</div>
  </div>

  <div class="steps">
    <div class="step active" id="s1"><div style="font-size:14px;margin-bottom:2px">📋</div>Votre demande</div>
    <div class="step" id="s2"><div style="font-size:14px;margin-bottom:2px">🏠</div>Le bien</div>
    <div class="step" id="s3"><div style="font-size:14px;margin-bottom:2px">👤</div>Le locataire</div>
  </div>

  <div class="error" id="err"></div>

  <!-- PAGE 1 -->
  <div id="p1">
    <div class="card">
      <div class="card-head"><i class="ti ti-building-store"></i>Votre agence</div>
      <div class="card-body">
        <div class="form-row">
          <div><label>Nom de l'agence <span class="req">*</span></label><input type="text" id="agence" placeholder="Orpi Évry" value="${agencyName}" ${agencyName ? 'readonly' : ''}></div>
          <div><label>Votre nom <span class="req">*</span></label><input type="text" id="contact" placeholder="Marie Dupont"></div>
        </div>
        <div class="form-row">
          <div><label>Email <span class="req">*</span></label><input type="email" id="email" placeholder="m.dupont@orpi.com"></div>
          <div><label>Téléphone</label><input type="tel" id="tel" placeholder="06 12 34 56 78"></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><i class="ti ti-file-check"></i>Type d'état des lieux <span class="req">*</span></div>
      <div class="card-body">
        <div class="type-grid">
          <button class="type-btn" onclick="selType('EDL entrant',this)"><span class="ticon">🔑</span><span class="tlabel">EDL Entrant</span><span class="tdesc">Entrée du locataire</span></button>
          <button class="type-btn" onclick="selType('EDL sortant',this)"><span class="ticon">🚪</span><span class="tlabel">EDL Sortant</span><span class="tdesc">Sortie du locataire</span></button>
          <button class="type-btn" onclick="selType('EDL Sortant / Entrant',this)"><span class="ticon">🔄</span><span class="tlabel">Sortant + Entrant</span><span class="tdesc">Les deux le même jour</span></button>
          <button class="type-btn" onclick="selType('Pré-état des lieux',this)"><span class="ticon">🔍</span><span class="tlabel">Pré-état des lieux</span><span class="tdesc">Avant la sortie</span></button>
        </div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="next(1)">Suivant <i class="ti ti-arrow-right"></i></button>
  </div>

  <!-- PAGE 2 -->
  <div id="p2" style="display:none">
    <div class="card">
      <div class="card-head"><i class="ti ti-home"></i>Adresse du bien</div>
      <div class="card-body">
        <label>Adresse complète <span class="req">*</span></label>
        <input type="text" id="adresse" placeholder="12 rue de la Paix, 91000 Évry">
        <div class="form-row">
          <div><label>Type de bien</label><select id="btype"><option value="">— Choisir —</option><option>Appartement</option><option>Maison</option></select></div>
          <div><label>Typologie</label><select id="btypo"><option value="">— Choisir —</option><option>Studio</option><option>T1</option><option>T2</option><option>T3</option><option>T4</option><option>T5</option><option>T6+</option></select></div>
        </div>
        <div class="form-row">
          <div><label>Meublé / Nu</label><select id="meuble"><option value="">— Choisir —</option><option>Meublé</option><option>Nu</option></select></div>
          <div><label>Accès (digicode…)</label><input type="text" id="acces" placeholder="Code : A1234"></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><i class="ti ti-calendar"></i>Date souhaitée</div>
      <div class="card-body">
        <div class="form-row">
          <div>
            <label>Date <span class="req">*</span></label>
            <input type="date" id="date">
            <div class="hint">Sous réserve de disponibilité</div>
          </div>
          <div>
            <label>Heure souhaitée</label>
            <select id="heure">
              <option value="">— Flexible —</option>
              <option>08h00</option><option>09h00</option><option>10h00</option><option>11h00</option>
              <option>14h00</option><option>15h00</option><option>16h00</option><option>17h00</option><option>18h00</option><option>19h00</option>
            </select>
          </div>
        </div>
        <label>Informations complémentaires</label>
        <textarea id="notes" placeholder="Clés à récupérer à l'agence, présence du propriétaire…"></textarea>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn" onclick="prev(2)"><i class="ti ti-arrow-left"></i> Retour</button>
      <button class="btn btn-primary" onclick="next(2)">Suivant <i class="ti ti-arrow-right"></i></button>
    </div>
  </div>

  <!-- PAGE 3 -->
  <div id="p3" style="display:none">
    <div class="card">
      <div class="card-head"><i class="ti ti-user"></i>Locataire</div>
      <div class="card-body">
        <div class="form-row">
          <div><label>Nom complet <span class="req">*</span></label><input type="text" id="loc-nom" placeholder="Jean Martin"></div>
          <div><label>Téléphone <span class="req">*</span></label><input type="tel" id="loc-tel" placeholder="06 12 34 56 78"></div>
        </div>
        <label>Email du locataire</label>
        <input type="email" id="loc-email" placeholder="jean.martin@email.fr">
        <div class="hint">Il recevra sa convocation une fois le RDV planifié</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><i class="ti ti-clipboard-check"></i>Récapitulatif</div>
      <div class="card-body" id="recap" style="font-size:12px;line-height:2;color:var(--text2)"></div>
    </div>
    <div class="info-box">
      <strong>📬 Après envoi :</strong> Vous recevrez un email de confirmation sous 2h. Thomas vous contactera pour confirmer la date définitive. Le locataire recevra sa convocation une fois le RDV planifié.
    </div>
    <div class="btn-row">
      <button class="btn" onclick="prev(3)"><i class="ti ti-arrow-left"></i> Retour</button>
      <button class="btn btn-primary" id="submit-btn" onclick="submit()"><i class="ti ti-send"></i> Envoyer ma demande</button>
    </div>
  </div>

  <!-- SUCCÈS -->
  <div class="success" id="success">
    <div class="success-icon">✅</div>
    <div style="font-size:22px;font-weight:700;margin-bottom:8px">Demande envoyée !</div>
    <div style="font-size:13px;color:var(--text2);line-height:1.7">Thomas vous contactera sous <strong>2h</strong> pour confirmer la date définitive.</div>
    <div class="recap-box" id="success-recap"></div>
    <div style="margin-top:20px;font-size:12px;color:var(--text2)">
      Une question ? 📞 <a href="tel:0189291429" style="color:var(--blue)">01 89 29 14 29</a>
    </div>
  </div>

  <div class="footer">
    <strong>EDLConnect</strong> — Expert en État des Lieux<br>
    <a href="mailto:contact@edlconnect.fr" style="color:var(--blue)">contact@edlconnect.fr</a> · <a href="tel:0189291429" style="color:var(--blue)">01 89 29 14 29</a>
  </div>

</div>

<script>
const AGENCY_ID = '${agencyId}';
let type = '';

// Date min = demain
const tom = new Date(); tom.setDate(tom.getDate()+1);
document.getElementById('date').min = tom.toISOString().split('T')[0];

function selType(t, btn){
  type = t;
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
}

function showErr(msg){ const e=document.getElementById('err'); e.textContent='⚠️ '+msg; e.classList.add('show'); e.scrollIntoView({behavior:'smooth',block:'center'}); }
function hideErr(){ document.getElementById('err').classList.remove('show'); }

function setStep(n){
  [1,2,3].forEach(i=>{
    document.getElementById('p'+i).style.display = i===n?'block':'none';
    const s = document.getElementById('s'+i);
    s.className = 'step'+(i===n?' active':i<n?' done':'');
  });
  window.scrollTo({top:0,behavior:'smooth'});
  hideErr();
}

function next(from){
  if(from===1){
    if(!document.getElementById('agence').value.trim()) return showErr("Le nom de l'agence est requis.");
    if(!document.getElementById('contact').value.trim()) return showErr("Votre nom est requis.");
    if(!document.getElementById('email').value.trim()) return showErr("Votre email est requis.");
    if(!type) return showErr("Veuillez choisir un type d'état des lieux.");
    setStep(2);
  } else if(from===2){
    if(!document.getElementById('adresse').value.trim()) return showErr("L'adresse du bien est requise.");
    if(!document.getElementById('date').value) return showErr("La date souhaitée est requise.");
    buildRecap(); setStep(3);
  }
}
function prev(from){ setStep(from-1); }

function buildRecap(){
  const date = document.getElementById('date').value;
  const dateStr = date ? new Date(date).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : '';
  const heure = document.getElementById('heure').value || 'Flexible';
  const bien = [document.getElementById('btype').value, document.getElementById('btypo').value, document.getElementById('meuble').value].filter(Boolean).join(' · ');
  var r = '<table style="width:100%;border-collapse:collapse">';
  r += '<tr><td style="color:#999;padding:2px 0;width:35%">Agence</td><td style="font-weight:600">'+document.getElementById('agence').value+'</td></tr>';
  r += '<tr><td style="color:#999;padding:2px 0">Type</td><td style="font-weight:600">'+type+'</td></tr>';
  r += '<tr><td style="color:#999;padding:2px 0">Adresse</td><td>'+document.getElementById('adresse').value+'</td></tr>';
  if(bien) r += '<tr><td style="color:#999;padding:2px 0">Bien</td><td>'+bien+'</td></tr>';
  r += '<tr><td style="color:#999;padding:2px 0">Date</td><td style="font-weight:600;color:#185FA5">'+dateStr+' · '+heure+'</td></tr>';
  r += '</table>';
  document.getElementById('recap').innerHTML = r;
}

async function submit(){
  const locNom = document.getElementById('loc-nom').value.trim();
  const locTel = document.getElementById('loc-tel').value.trim();
  if(!locNom) return showErr('Le nom du locataire est requis.');
  if(!locTel) return showErr('Le téléphone du locataire est requis.');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Envoi…';
  const payload = {
    agencyId: AGENCY_ID,
    agence: document.getElementById('agence').value.trim(),
    contact: document.getElementById('contact').value.trim(),
    email: document.getElementById('email').value.trim(),
    tel: document.getElementById('tel').value.trim(),
    typeEdl: type,
    adresse: document.getElementById('adresse').value.trim(),
    bienType: document.getElementById('btype').value,
    bienTypo: document.getElementById('btypo').value,
    meuble: document.getElementById('meuble').value,
    acces: document.getElementById('acces').value.trim(),
    dateSouhaitee: document.getElementById('date').value,
    heure: document.getElementById('heure').value,
    notes: document.getElementById('notes').value.trim(),
    locataire: { nom: locNom, tel: locTel, email: document.getElementById('loc-email').value.trim() }
  };
  try {
    const resp = await fetch('/api/booking-request', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if(resp.ok){
      document.getElementById('p3').style.display='none';
      document.getElementById('success').style.display='block';
      const dateStr = new Date(payload.dateSouhaitee).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
      document.getElementById('success-recap').innerHTML = '<strong>📋 '+payload.typeEdl+'</strong><br>📍 '+payload.adresse+'<br>📅 '+dateStr+' · '+(payload.heure||'Flexible')+'<br>👤 '+locNom+' · '+locTel;
      window.scrollTo({top:0,behavior:'smooth'});
    } else {
      showErr("Erreur lors de l'envoi. Veuillez nous appeler au 01 89 29 14 29.");
      btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> Envoyer ma demande';
    }
  } catch(e){
    showErr("Connexion impossible. Veuillez nous appeler au 01 89 29 14 29.");
    btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> Envoyer ma demande';
  }
}
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
