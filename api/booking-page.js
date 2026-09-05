export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const agencyId = url.searchParams.get('agency') || '';
  const agencyName = url.searchParams.get('name') || '';
  const contactId = (url.searchParams.get('c') || '').replace(/[^a-zA-Z0-9_-]/g, '');

  // Identite du proprietaire de cette page (via le contact du lien, sinon le nom d'agence)
  let IDENT = { nom: 'Lokentia', tel: '', email: 'contact@lokentia.fr' };
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (key) {
      const SUPA = 'https://pvuctwflxvvxdawsxceu.supabase.co';
      const h = { 'apikey': key, 'Authorization': 'Bearer ' + key };
      let ownerId = '';
      if (contactId) {
        const r1 = await fetch(SUPA + '/rest/v1/contacts?select=user_id&id=eq.' + encodeURIComponent(contactId) + '&limit=1', { headers: h });
        if (r1.ok) { const rows = await r1.json(); ownerId = (rows[0] && rows[0].user_id) || ''; }
      }
      if (!ownerId && agencyName) {
        const r2 = await fetch(SUPA + '/rest/v1/contacts?select=user_id&data-%3E%3Eentreprise=ilike.' + encodeURIComponent(agencyName) + '&limit=1', { headers: h });
        if (r2.ok) { const rows = await r2.json(); ownerId = (rows[0] && rows[0].user_id) || ''; }
      }
      if (ownerId) {
        const r3 = await fetch(SUPA + '/rest/v1/settings?select=data&user_id=eq.' + encodeURIComponent(ownerId), { headers: h });
        if (r3.ok) {
          const rows = await r3.json();
          const d = (rows[0] && rows[0].data) || {};
          IDENT = {
            nom: (d.expediteurNom || d.companyName || '').trim() || 'Lokentia',
            tel: (d.expediteurTel || '').trim(),
            email: (d.expediteurEmail || d.userEmail || '').trim() || 'contact@lokentia.fr'
          };
        }
      }
    }
  } catch (e) { /* identite neutre */ }
  const identTelHref = IDENT.tel.replace(/[^0-9+]/g, '');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Demande d'état des lieux — Lokentia</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --blue:#1A5FA8;--blue-light:#F4F7FA;--blue-dark:#0C447C;
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
.cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.cal-nav-btn{width:30px;height:30px;border-radius:8px;border:1.5px solid var(--border);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text2);transition:all .15s;flex-shrink:0}
.cal-nav-btn:hover:not(:disabled){border-color:var(--blue);color:var(--blue)}
.cal-nav-btn:disabled{opacity:.35;cursor:not-allowed}
.cal-nav-btn svg{width:16px;height:16px}
.cal-mois-label{font-size:12px;font-weight:600;color:var(--text2);text-align:center}
.cal-jours-semaine{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px}
.cal-jours-semaine span{text-align:center;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.03em}
.cal-grille{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-jour{aspect-ratio:1;display:flex;align-items:center;justify-content:center;position:relative;border-radius:8px;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;border:none;background:none;font-family:inherit;color:var(--text)}
.cal-jour--indispo{color:var(--text3);font-weight:400;cursor:default}
.cal-jour--horsFenetre{opacity:.35}
.cal-jour--dispo{background:var(--blue-light);color:var(--blue-dark);cursor:pointer;transition:all .12s}
.cal-jour--dispo:hover{background:#E4EDF7}
.cal-jour--aujourdhui::after{content:'';position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--text3)}
.cal-jour--dispo.cal-jour--aujourdhui::after{background:var(--blue)}
.cal-jour--selection{background:var(--blue) !important;color:#fff !important}
.cal-jour--selection.cal-jour--aujourdhui::after{background:#fff}
.slots-zone{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.slots-zone-titre{font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
.slots-zone-vide{font-size:12px;color:var(--text2);padding:8px 0}
.slot-row{display:flex;flex-wrap:wrap;gap:8px}
.slot-btn{border:1.5px solid var(--border);border-radius:var(--radius);padding:8px 14px;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:var(--text);transition:all .12s}
.slot-btn:hover{border-color:var(--blue);background:var(--blue-light)}
.slot-btn.sel{border-color:var(--blue);background:var(--blue);color:#fff}
@media(max-width:480px){
  .form-row{grid-template-columns:1fr}
  .card-body{padding:14px}
  .hero{padding:18px}
}
</style>
</head>
<body>

<div class="header">
  <svg viewBox="0 0 120 120" width="36" height="36" style="flex-shrink:0"><rect width="120" height="120" rx="26" fill="#0F1E2E"/><path d="M36 26 h12 v56 h42 v12 H36 Z" fill="#F4F7FA"/><path d="M86 32 A34 34 0 0 1 52 66" fill="none" stroke="#C29A5B" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="32" r="4" fill="#C29A5B"/></svg>
  <div>
    <div style="font-size:14px;font-weight:600">Lokentia</div>
    <div style="font-size:11px;color:var(--text2)">Demande d'état des lieux</div>
  </div>
  <div style="margin-left:auto;font-size:11px;color:var(--text2);text-align:right">
    ${IDENT.tel ? `📞 <a href="tel:${identTelHref}" style="color:var(--blue);text-decoration:none">${IDENT.tel}</a>` : ``}<br>
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
    <!-- Piège à bots : invisible pour un humain (hors écran, jamais display:none
         que certains bots savent détecter), un champ rempli signale un script -->
    <input type="text" id="site" name="site" value="" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">
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
          <div><label>Typologie</label><select id="btypo" onchange="chargerCreneauxSiPossible()"><option value="">— Choisir —</option><option>Studio</option><option>T1</option><option>T2</option><option>T3</option><option>T4</option><option>T5</option><option>T6</option><option>T7</option></select></div>
        </div>
        <div class="form-row">
          <div><label>Meublé / Nu</label><select id="meuble" onchange="chargerCreneauxSiPossible()"><option value="">— Choisir —</option><option>Meublé</option><option>Nu</option></select></div>
          <div><label>Superficie (m²)</label><input type="number" id="superficie" placeholder="Ex: 45" min="1" step="0.1"></div>
        </div>
        <div class="form-row">
          <div><label>Accès (digicode…)</label><input type="text" id="acces" placeholder="Code : A1234"></div>
          <div><label>Nom du propriétaire</label><input type="text" id="proprietaire" placeholder="Ex: M. Dupont"></div>
        </div>
        <div class="form-row">
          <div id="date-entree-wrap" style="display:none">
            <label>Date d&#39;entrée dans le logement</label>
            <input type="date" id="date-entree">
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><i class="ti ti-calendar"></i>Date souhaitée</div>
      <div class="card-body">
        <div id="slots-panel" style="display:none;margin-bottom:14px">
          <label style="margin-bottom:8px">Créneaux disponibles <span class="req">*</span></label>
          <div class="cal-nav">
            <button type="button" class="cal-nav-btn" id="slots-prev" onclick="changerPeriodeCreneaux(-1)" aria-label="Période précédente" disabled>
              <svg viewBox="0 0 20 20" fill="none"><path d="M12.5 5l-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="cal-mois-label" id="slots-periode-label"></span>
            <button type="button" class="cal-nav-btn" id="slots-next" onclick="changerPeriodeCreneaux(1)" aria-label="Période suivante">
              <svg viewBox="0 0 20 20" fill="none"><path d="M7.5 5l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="cal-jours-semaine"><span>Lun</span><span>Mar</span><span>Mer</span><span>Jeu</span><span>Ven</span><span>Sam</span><span>Dim</span></div>
          <div class="cal-grille" id="cal-grille"></div>
          <div class="slots-zone">
            <div class="slots-zone-titre" id="slots-titre">Choisissez d'abord une date</div>
            <div class="slot-row" id="slots-row"></div>
            <div class="slots-zone-vide" id="slots-vide" style="display:none"></div>
          </div>
          <div class="hint">Les jours en bleu ont au moins un créneau disponible. Ces créneaux sont proposés à partir de 48h suivant votre demande.</div>
          <div style="background:#FFF3CD;border-radius:8px;padding:10px 12px;margin-top:8px;font-size:11.5px;color:#633806;line-height:1.6">
            ⚡ Besoin d'un état des lieux en urgence (aujourd'hui ou demain) ? Contactez-nous directement${IDENT.tel ? ` au <a href="tel:${identTelHref}" style="color:#633806;font-weight:600">${IDENT.tel}</a>` : ` par email à <a href="mailto:${IDENT.email}" style="color:#633806;font-weight:600">${IDENT.email}</a>`} plutôt que via ce formulaire.
          </div>
        </div>
        <div id="slots-loading" style="display:none;font-size:12px;color:var(--text2);margin-bottom:14px">⏳ Recherche des créneaux disponibles…</div>
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
              <option>08h00</option><option>08h30</option><option>09h00</option><option>09h30</option><option>10h00</option><option>10h30</option><option>11h00</option><option>11h30</option><option>12h00</option><option>12h30</option><option>13h00</option><option>13h30</option><option>14h00</option><option>14h30</option><option>15h00</option><option>15h30</option><option>16h00</option><option>16h30</option><option>17h00</option><option>17h30</option><option>18h00</option><option>18h30</option><option>19h00</option>
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
      <div class="card-head" id="loc-card-head"><i class="ti ti-user"></i>Locataire</div>
      <div class="card-body">
        <!-- Locataire 1 (principal) -->
        <div id="locataires-list">
          <div class="locataire-block" data-idx="0" style="border:1.5px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:8px">👤 Locataire 1</div>
            <div class="form-row">
              <div>
                <label>Civilité <span class="req">*</span></label>
                <select class="loc-civilite">
                  <option value="">— Choisir —</option>
                  <option value="M.">M. (Monsieur)</option>
                  <option value="Mme">Mme (Madame)</option>
                </select>
              </div>
              <div><label>Nom complet <span class="req">*</span></label><input type="text" class="loc-nom" placeholder="Jean Martin"></div>
            </div>
            <div class="form-row">
              <div><label>Téléphone <span class="req">*</span></label><input type="tel" class="loc-tel" placeholder="06 12 34 56 78"></div>
              <div><label>Email</label><input type="email" class="loc-email" placeholder="jean.martin@email.fr"></div>
            </div>
          </div>
        </div>
        <button type="button" onclick="addLocataire()" style="width:100%;border:1.5px dashed var(--blue);border-radius:var(--radius);padding:10px;background:var(--blue-light);color:var(--blue);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:4px">
          + Ajouter un locataire
        </button>
        <div class="hint">Chaque locataire recevra sa convocation par email une fois le RDV planifié</div>
      </div>
    </div>
    <div class="card" id="entrants-card" style="display:none">
      <div class="card-head"><i class="ti ti-key"></i>Locataire(s) entrant(s)</div>
      <div class="card-body">
        <div id="entrants-list"></div>
        <button type="button" onclick="addEntrant()" style="width:100%;border:1.5px dashed var(--blue);border-radius:var(--radius);padding:10px;background:var(--blue-light);color:var(--blue);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:4px">
          + Ajouter un locataire entrant
        </button>
        <div class="hint">Coordonnées du ou des locataires qui entrent dans le logement</div>
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
      ${IDENT.tel ? `Une question ? 📞 <a href="tel:${identTelHref}" style="color:var(--blue)">${IDENT.tel}</a>` : ``}
    </div>
  </div>

  <div class="footer">
    <strong>Lokentia</strong> — Expert en État des Lieux<br>
    <a href="mailto:${IDENT.email}" style="color:var(--blue)">${IDENT.email}</a>${IDENT.tel ? ` · <a href="tel:${identTelHref}" style="color:var(--blue)">${IDENT.tel}</a>` : ``}
  </div>

</div>

<script>
const AGENCY_ID = '${agencyId}';
const CONTACT_ID = '${contactId}';
let type = '';

// Date min = demain
const tom = new Date(); tom.setDate(tom.getDate()+1);
document.getElementById('date').min = tom.toISOString().split('T')[0];

function selType(t, btn){
  type = t;
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  // Afficher le champ date d'entrée uniquement pour EDL sortant
  const isSortant = t.toLowerCase().includes('sortant');
  document.getElementById('date-entree-wrap').style.display = isSortant ? 'block' : 'none';
  const isSE = (t === 'EDL Sortant / Entrant');
  document.getElementById('entrants-card').style.display = isSE ? 'block' : 'none';
  document.getElementById('loc-card-head').innerHTML = '<i class="ti ti-user"></i>' + (isSE ? 'Locataire sortant' : 'Locataire');
  if(isSE && document.querySelectorAll('.entrant-block').length === 0) addEntrant();
}

// ─── Créneaux Cal.com (optionnel — dégrade silencieusement) ────────────
// N'affiche des créneaux que si /api/cal-availability répond des disponibilités
// réelles. Tant que la fonctionnalité n'est pas activée côté serveur (ou en
// cas de souci), le formulaire se comporte exactement comme avant : simple
// champ date libre, aucune régression possible.
//
// Navigation par mois calendaire complet (miroir du paramètre "mois" côté
// serveur) : le calendrier affiche tout un mois à la fois (ex. tout
// septembre), sans limite dans le temps vers l'avenir — jamais avant le mois
// courant vers le passé.
let _creneauxRequeteEnCours = 0;
let _creneauxMoisAffiche = null; // { annee, mois } — mois 1-12
let _creneauxMoisInitial = null; // mois courant au premier chargement, pour désactiver "précédent"

async function chargerCreneauxSiPossible(reinitialiserPeriode){
  const btypo = document.getElementById('btypo').value;
  const meubleVal = document.getElementById('meuble').value;
  const panel = document.getElementById('slots-panel');
  const loading = document.getElementById('slots-loading');
  if(!btypo || !meubleVal){ panel.style.display = 'none'; return; }
  if(reinitialiserPeriode !== false || !_creneauxMoisAffiche){
    const maintenant = new Date();
    _creneauxMoisAffiche = { annee: maintenant.getFullYear(), mois: maintenant.getMonth() + 1 };
    _creneauxMoisInitial = { ..._creneauxMoisAffiche };
  }

  const requeteId = ++_creneauxRequeteEnCours; // évite qu'une réponse tardive écrase une sélection plus récente
  panel.style.display = 'none';
  loading.style.display = 'block';
  try{
    const moisParam = _creneauxMoisAffiche.annee + '-' + String(_creneauxMoisAffiche.mois).padStart(2,'0');
    const resp = await fetch('/api/cal-availability?bienTypo=' + encodeURIComponent(btypo) + '&meuble=' + encodeURIComponent(meubleVal) + '&mois=' + moisParam);
    if(requeteId !== _creneauxRequeteEnCours) return; // une sélection plus récente a déjà relancé une requête
    loading.style.display = 'none';
    if(!resp.ok){ return; }
    const data = await resp.json();
    // "configured=false" = fonctionnalité non activée côté serveur (ou type
    // de bien non reconnu) : comportement inchangé, on reste sur la saisie
    // de date libre. "configured=true" = la fonctionnalité répond bel et
    // bien, même si cette fenêtre précise n'a aucun créneau — dans ce cas on
    // garde le panneau visible (avec la navigation) plutôt que de le cacher,
    // sinon les flèches deviennent inutilisables dès qu'une période est vide.
    if(!data || !data.configured || !Array.isArray(data.slots)){ return; }
    afficherCreneaux(data.slots);
  }catch(e){
    if(requeteId === _creneauxRequeteEnCours) loading.style.display = 'none';
    // Silencieux : le champ date libre reste utilisable dans tous les cas.
  }
}

function changerPeriodeCreneaux(direction){
  let annee = _creneauxMoisAffiche.annee, mois = _creneauxMoisAffiche.mois + direction;
  if(mois < 1){ mois = 12; annee--; }
  else if(mois > 12){ mois = 1; annee++; }
  // Jamais avant le mois courant, quel que soit le nombre de clics "précédent".
  if(annee < _creneauxMoisInitial.annee || (annee === _creneauxMoisInitial.annee && mois < _creneauxMoisInitial.mois)){
    annee = _creneauxMoisInitial.annee; mois = _creneauxMoisInitial.mois;
  }
  _creneauxMoisAffiche = { annee, mois };
  chargerCreneauxSiPossible(false);
}

// Regroupement par jour LOCAL (pas le jour UTC de l'ISO) : Cal.com renvoie
// des horodatages UTC, et un créneau tard le soir peut correspondre au
// lendemain en UTC tout en restant le même jour dans le fuseau horaire de
// l'agence — cohérent avec choisirCreneau() qui utilise aussi les
// composants de date locaux (getFullYear/getMonth/getDate).
let _creneauxParJour = {};
let _creneauxJourSelectionne = null;
const _pad2 = n => String(n).padStart(2,'0');
const _cleJourLocal = d => d.getFullYear() + '-' + _pad2(d.getMonth()+1) + '-' + _pad2(d.getDate());

function afficherCreneaux(slotsIso){
  const panel = document.getElementById('slots-panel');
  const label = document.getElementById('slots-periode-label');
  const btnPrev = document.getElementById('slots-prev');

  if(label && _creneauxMoisAffiche){
    const d = new Date(_creneauxMoisAffiche.annee, _creneauxMoisAffiche.mois - 1, 1);
    label.textContent = d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
  }
  if(btnPrev) btnPrev.disabled = _creneauxMoisAffiche.annee === _creneauxMoisInitial.annee && _creneauxMoisAffiche.mois === _creneauxMoisInitial.mois;

  // Limité aux 2000 premiers créneaux (un mois complet, toutes typologies
  // confondues, n'en approche jamais autant) pour ne pas surcharger la page.
  _creneauxParJour = {};
  slotsIso.slice(0, 2000).forEach(iso => {
    const d = new Date(iso);
    if(isNaN(d)) return;
    const cle = _cleJourLocal(d);
    (_creneauxParJour[cle] = _creneauxParJour[cle] || []).push({ iso, date: d });
  });
  _creneauxJourSelectionne = null;

  rendreCalendrierCreneaux();
  rendreSlotsJour();
  panel.style.display = 'block';
}

function rendreCalendrierCreneaux(){
  const grille = document.getElementById('cal-grille');
  if(!grille || !_creneauxMoisAffiche) return;

  const { annee, mois } = _creneauxMoisAffiche; // mois 1-12
  const premierJourMois = new Date(annee, mois - 1, 1);
  const dernierJourMois = new Date(annee, mois, 0); // jour 0 du mois suivant = dernier jour de ce mois

  const auDebutSemaine = d => { const x = new Date(d); x.setHours(0,0,0,0); const j = (x.getDay()+6)%7; x.setDate(x.getDate()-j); return x; };
  const auFinSemaine = d => { const x = new Date(d); x.setHours(0,0,0,0); const j = (x.getDay()+6)%7; x.setDate(x.getDate()+(6-j)); return x; };

  const startGrid = auDebutSemaine(premierJourMois);
  const endGrid = auFinSemaine(dernierJourMois);
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);

  let html = '';
  for(let d = new Date(startGrid); d <= endGrid; d.setDate(d.getDate()+1)){
    const cle = _cleJourLocal(d);
    const dansMois = d.getMonth() === (mois - 1) && d.getFullYear() === annee;
    const dispo = dansMois && _creneauxParJour[cle] && _creneauxParJour[cle].length > 0;
    const estAujourdhui = d.getTime() === aujourdhui.getTime();
    const estSelection = _creneauxJourSelectionne === cle;
    const classes = ['cal-jour'];
    if(!dansMois) classes.push('cal-jour--horsFenetre');
    classes.push(dispo ? 'cal-jour--dispo' : 'cal-jour--indispo');
    if(estAujourdhui) classes.push('cal-jour--aujourdhui');
    if(estSelection) classes.push('cal-jour--selection');
    const onclick = dispo ? ' onclick="choisirJourCreneau(\\'' + cle + '\\')"' : '';
    html += '<button type="button" class="' + classes.join(' ') + '"' + onclick + '>' + d.getDate() + '</button>';
  }
  grille.innerHTML = html;
}

function choisirJourCreneau(cle){
  _creneauxJourSelectionne = cle;
  rendreCalendrierCreneaux();
  rendreSlotsJour();
}

function rendreSlotsJour(){
  const titre = document.getElementById('slots-titre');
  const row = document.getElementById('slots-row');
  const vide = document.getElementById('slots-vide');
  if(!titre || !row || !vide) return;

  if(!Object.keys(_creneauxParJour).length){
    titre.style.display = 'none';
    row.innerHTML = '';
    vide.textContent = 'Aucun créneau disponible sur cette période — essayez « Période suivante », ou indiquez une date libre ci-dessous.';
    vide.style.display = 'block';
    return;
  }
  titre.style.display = 'block';
  vide.style.display = 'none';

  if(!_creneauxJourSelectionne){
    titre.textContent = "Choisissez d'abord une date";
    row.innerHTML = '';
    return;
  }
  const creneaux = _creneauxParJour[_creneauxJourSelectionne] || [];
  const dateLabel = new Date(_creneauxJourSelectionne + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
  titre.textContent = 'Créneaux du ' + dateLabel;
  if(!creneaux.length){
    row.innerHTML = '';
    vide.textContent = 'Aucun créneau disponible ce jour-là.';
    vide.style.display = 'block';
    return;
  }
  row.innerHTML = creneaux.map(({iso, date}) => {
    const heureLabel = date.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    return '<button type="button" class="slot-btn" data-iso="' + iso + '" onclick="choisirCreneau(this)">' + heureLabel + '</button>';
  }).join('');
}

function choisirCreneau(btn){
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  const d = new Date(btn.getAttribute('data-iso'));
  if(isNaN(d)) return;
  const pad = n => String(n).padStart(2,'0');
  document.getElementById('date').value = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());

  const heureVal = pad(d.getHours()) + 'h' + pad(d.getMinutes());
  const heureSelect = document.getElementById('heure');
  if(![...heureSelect.options].some(o => o.value === heureVal)){
    // Le créneau réel ne tombe pas forcément sur un horaire fixe du menu
    // (00/30 min) : on ajoute l'option manquante plutôt que de la perdre.
    const opt = document.createElement('option');
    opt.value = heureVal; opt.textContent = heureVal;
    heureSelect.appendChild(opt);
  }
  heureSelect.value = heureVal;
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
    chargerCreneauxSiPossible(); // au cas où typologie/meublé étaient déjà remplis (retour arrière)
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
  const superficie = document.getElementById('superficie').value.trim();
  const dateEntree = document.getElementById('date-entree').value;
  let bien = [document.getElementById('btype').value, document.getElementById('btypo').value, document.getElementById('meuble').value].filter(Boolean).join(' · ');
  if(superficie) bien += (bien ? ' · ' : '') + superficie + ' m²';
  var r = '<table style="width:100%;border-collapse:collapse">';
  r += '<tr><td style="color:#999;padding:2px 0;width:35%">Agence</td><td style="font-weight:600">'+document.getElementById('agence').value+'</td></tr>';
  r += '<tr><td style="color:#999;padding:2px 0">Type</td><td style="font-weight:600">'+type+'</td></tr>';
  r += '<tr><td style="color:#999;padding:2px 0">Adresse</td><td>'+document.getElementById('adresse').value+'</td></tr>';
  if(dateEntree){
    const dEntreeStr = new Date(dateEntree).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
    r += '<tr><td style="color:#999;padding:2px 0">Date d&#39;entrée</td><td>'+dEntreeStr+'</td></tr>';
  }
  if(bien) r += '<tr><td style="color:#999;padding:2px 0">Bien</td><td>'+bien+'</td></tr>';
  r += '<tr><td style="color:#999;padding:2px 0">Date</td><td style="font-weight:600;color:#1A5FA8">'+dateStr+' · '+heure+'</td></tr>';
  r += '</table>';
  document.getElementById('recap').innerHTML = r;
}

let _locCount = 1;
function addLocataire(){
  _locCount++;
  const list = document.getElementById('locataires-list');
  const div = document.createElement('div');
  div.className = 'locataire-block';
  div.style.cssText = 'border:1.5px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px';
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:#1A5FA8">👤 Locataire '+_locCount+'</div><button type="button" onclick="removeLocataire(this)" style="background:none;border:none;cursor:pointer;color:#A32D2D;font-size:16px;padding:0">✕</button></div>'
    +'<div class="form-row"><div><label>Civilité</label><select class="loc-civilite"><option value="">— Choisir —</option><option value="M.">M.</option><option value="Mme">Mme</option></select></div>'
    +'<div><label>Nom complet</label><input type="text" class="loc-nom" placeholder="Marie Martin"></div></div>'
    +'<div class="form-row"><div><label>Téléphone</label><input type="tel" class="loc-tel" placeholder="06 12 34 56 78"></div>'
    +'<div><label>Email</label><input type="email" class="loc-email" placeholder="marie.martin@email.fr"></div></div>';
  list.appendChild(div);
}
let _entCount = 0;
function addEntrant(){
  _entCount++;
  const list = document.getElementById('entrants-list');
  const div = document.createElement('div');
  div.className = 'entrant-block';
  div.style.cssText = 'border:1.5px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px';
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="ent-label" style="font-size:11px;font-weight:600;color:#1A5FA8">🔑 Entrant '+_entCount+'</div><button type="button" onclick="removeEntrant(this)" style="background:none;border:none;cursor:pointer;color:#A32D2D;font-size:16px;padding:0">✕</button></div>'
    +'<div class="form-row"><div><label>Prénom <span class="req">*</span></label><input type="text" class="ent-prenom" placeholder="Marie"></div>'
    +'<div><label>Nom <span class="req">*</span></label><input type="text" class="ent-nom" placeholder="Martin"></div></div>'
    +'<div class="form-row"><div><label>Mobile <span class="req">*</span></label><input type="tel" class="ent-tel" placeholder="06 12 34 56 78"></div>'
    +'<div><label>Email</label><input type="email" class="ent-email" placeholder="marie.martin@email.fr"></div></div>';
  list.appendChild(div);
  renumEntrants();
}
function removeEntrant(btn){ btn.closest('.entrant-block').remove(); renumEntrants(); }
function renumEntrants(){
  document.querySelectorAll('.ent-label').forEach(function(t,i){ t.textContent = '🔑 Entrant '+(i+1); });
}
function removeLocataire(btn){
  btn.closest('.locataire-block').remove();
  document.querySelectorAll('.locataire-block').forEach((b,i)=>{
    const t=b.querySelector('[style*="185FA5"]');
    if(t) t.textContent='👤 Locataire '+(i+1);
  });
}
async function submit(){
  // Collecter tous les locataires
  const locBlocks = document.querySelectorAll('.locataire-block');
  const locataires = [];
  for(let i = 0; i < locBlocks.length; i++){
    const block = locBlocks[i];
    const civ = block.querySelector('.loc-civilite').value;
    const nom = block.querySelector('.loc-nom').value.trim();
    const tel = block.querySelector('.loc-tel').value.trim();
    const email = block.querySelector('.loc-email').value.trim();
    if(i === 0){
      if(!civ) return showErr('La civilité du locataire principal est requise.');
      if(!nom) return showErr('Le nom du locataire principal est requis.');
      if(!tel) return showErr('Le téléphone du locataire principal est requis.');
    }
    if(nom || tel) locataires.push({ civilite: civ, nom, tel, email });
  }
  // Locataires entrants (uniquement type Sortant / Entrant)
  let locatairesEntrants = [];
  if(type === 'EDL Sortant / Entrant'){
    const entBlocks = document.querySelectorAll('.entrant-block');
    for(let j = 0; j < entBlocks.length; j++){
      const b = entBlocks[j];
      const prenom = b.querySelector('.ent-prenom').value.trim();
      const nomE = b.querySelector('.ent-nom').value.trim();
      const telE = b.querySelector('.ent-tel').value.trim();
      const emailE = b.querySelector('.ent-email').value.trim();
      if(!prenom && !nomE && !telE && !emailE) continue;
      if(!prenom || !nomE) return showErr('Prénom et nom sont requis pour chaque locataire entrant.');
      if(!telE) return showErr('Le mobile est requis pour chaque locataire entrant.');
      locatairesEntrants.push({ prenom: prenom, nom: nomE, tel: telE, email: emailE });
    }
    if(locatairesEntrants.length === 0) return showErr('Ajoutez au moins un locataire entrant.');
  }
  const locNom = locataires[0]?.nom || '';
  const locTel = locataires[0]?.tel || '';
  const locCivilite = locataires[0]?.civilite || '';
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Envoi…';
  const payload = {
    site: document.getElementById('site').value,
    agencyId: AGENCY_ID,
    contactId: CONTACT_ID,
    agence: document.getElementById('agence').value.trim(),
    contact: document.getElementById('contact').value.trim(),
    email: document.getElementById('email').value.trim(),
    tel: document.getElementById('tel').value.trim(),
    typeEdl: type,
    adresse: document.getElementById('adresse').value.trim(),
    bienType: document.getElementById('btype').value,
    bienTypo: document.getElementById('btypo').value,
    meuble: document.getElementById('meuble').value,
    superficie: document.getElementById('superficie').value.trim(),
    dateEntree: document.getElementById('date-entree').value,
    acces: document.getElementById('acces').value.trim(),
    proprietaire: document.getElementById('proprietaire').value.trim(),
    dateSouhaitee: document.getElementById('date').value,
    heure: document.getElementById('heure').value,
    notes: document.getElementById('notes').value.trim(),
    locataire: locataires[0] || {},
    locataires: locataires,
    locatairesEntrants: locatairesEntrants
  };
  try {
    const resp = await fetch('/api/booking-request', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    if(resp.ok){
      document.getElementById('p3').style.display='none';
      document.getElementById('success').style.display='block';
      const dateStr = new Date(payload.dateSouhaitee).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
      const locsList = (payload.locataires||[locataires[0]]).map(l => l.civilite+' '+l.nom+' · '+l.tel).join('<br>👤 ');
      document.getElementById('success-recap').innerHTML = '<strong>📋 '+payload.typeEdl+'</strong><br>📍 '+payload.adresse+'<br>📅 '+dateStr+' · '+(payload.heure||'Flexible')+'<br>👤 '+locsList;
      window.scrollTo({top:0,behavior:'smooth'});
    } else {
      showErr("Erreur lors de l'envoi. Veuillez réessayer ou nous contacter directement.");
      btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> Envoyer ma demande';
    }
  } catch(e){
    showErr("Connexion impossible. Veuillez réessayer ou nous contacter directement.");
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
