// ════════════════════════════════════════════════════════════════
// Réglages › Mon compte : export complet des données et suppression
// définitive du compte (RGPD : portabilité et effacement).
// ════════════════════════════════════════════════════════════════
const TABLES_EXPORT = ['contacts', 'missions', 'prospects', 'deals', 'rdvs', 'campagnes', 'trackings', 'invoices', 'settings', 'user_plans', 'bookings'];

// Données lues avec la session de l'abonné : les règles d'accès de la base
// (RLS) ne renvoient que les siennes.
async function exporterMesDonnees(){
  if(!_supaReady || !_currentUser){ notify('Connexion requise', 'warn'); return; }
  const btn = document.getElementById('btn-export-compte');
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i>Préparation…'; }
  try{
    const donnees = {};
    for(const table of TABLES_EXPORT){
      let lignes = [], depuis = 0;
      for(let page = 0; page < 50; page++){
        const { data, error } = await supabaseClient.from(table).select('*').range(depuis, depuis + 999);
        if(error){ donnees[table] = { erreur: error.message }; lignes = null; break; }
        lignes = lignes.concat(data || []);
        if(!data || data.length < 1000) break;
        depuis += 1000;
      }
      if(lignes) donnees[table] = lignes;
    }
    // Les clés techniques éventuellement stockées dans les réglages ne sont pas utiles à l'export.
    const fichier = { genereLe: new Date().toISOString(), compte: _currentUser.email, plateforme: 'Lokentia', donnees };
    const blob = new Blob([JSON.stringify(fichier, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lokentia-mes-donnees-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    notify('✅ Export téléchargé');
  }catch(e){
    notify('Export impossible : ' + (e.message || e), 'warn');
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ti ti-download"></i>Télécharger toutes mes données'; }
  }
}

async function supprimerMonCompte(){
  const saisie = prompt('Cette action est définitive : vos clients, missions, réservations, agents et fichiers seront supprimés, ainsi que votre compte.\n\nTéléchargez d’abord vos données si besoin.\n\nPour confirmer, tapez SUPPRIMER :');
  if(saisie === null) return;
  if(saisie.trim() !== 'SUPPRIMER'){ notify('Suppression annulée (mot de confirmation incorrect)', 'warn'); return; }
  const btn = document.getElementById('btn-suppr-compte');
  if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i>Suppression…'; }
  try{
    const r = await fetch('/api/supprimer-compte', {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ confirmation: 'SUPPRIMER' }),
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || 'Suppression impossible');
    try{ localStorage.clear(); }catch(_){}
    alert('Votre compte et vos données ont été supprimés. Un email de confirmation vous a été envoyé.');
    try{ await supabaseClient.auth.signOut(); }catch(_){}
    window.location.reload();
  }catch(e){
    notify('⚠️ ' + e.message, 'warn');
    if(btn){ btn.disabled = false; btn.innerHTML = '<i class="ti ti-trash"></i>Supprimer mon compte'; }
  }
}

function renderSectionCompte(){
  const el = document.getElementById('reglages-compte');
  if(!el) return;
  const estAdmin = typeof isAdmin === 'function' && isAdmin();
  el.innerHTML = `
    <div class="settings-title"><i class="ti ti-user-circle" style="font-size:18px"></i>Mon compte & mes données</div>
    <p style="font-size:12.5px;color:var(--text2);margin:0 0 12px">Compte : <b>${esc((typeof _currentUser !== 'undefined' && _currentUser && _currentUser.email) || '')}</b></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px">
      <button type="button" class="btn" id="btn-export-compte" onclick="exporterMesDonnees()"><i class="ti ti-download"></i>Télécharger toutes mes données</button>
      <span style="font-size:12px;color:var(--text2)">Fichier JSON : clients, missions, réservations, réglages…</span>
    </div>
    ${estAdmin ? '<p style="font-size:12px;color:var(--text3)">Compte éditeur de la plateforme : la suppression n’est pas proposée ici.</p>' : `
    <div style="border:1px solid var(--red-text);border-radius:var(--radius);padding:12px 14px;background:var(--red-bg)">
      <div style="font-size:13px;font-weight:600;color:var(--red-text);margin-bottom:4px">Supprimer mon compte</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Supprime définitivement votre compte et toutes vos données. Les copies de sauvegarde sont effacées sous 30 jours.</div>
      <button type="button" class="btn" id="btn-suppr-compte" onclick="supprimerMonCompte()" style="color:var(--red-text);border-color:var(--red-text)"><i class="ti ti-trash"></i>Supprimer mon compte</button>
    </div>`}`;
}
