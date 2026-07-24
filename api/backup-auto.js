export const config = { runtime: 'edge' };

const BUCKET = 'sauvegardes';
const TABLES = ['contacts', 'missions', 'prospects', 'deals', 'rdvs', 'campagnes', 'trackings', 'invoices', 'settings'];
const RETENTION_JOURS = 30;
const PAGE = 1000;

const ADMIN_EMAILS = ['contact@edl-idf.com'];
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';

export default async function handler(req) {
  // Acces : le cron Vercel, ou un administrateur connecte
  const authHeader = req.headers.get('authorization') || '';
  let autorise = (authHeader === `Bearer ${process.env.CRON_SECRET}`);
  let declencheur = 'cron';

  if (!autorise) {
    const token = authHeader.replace('Bearer ', '').trim();
    if (token) {
      try {
        const uResp = await fetch('https://pvuctwflxvvxdawsxceu.supabase.co/auth/v1/user', {
          headers: { 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + token }
        });
        if (uResp.ok) {
          const u = await uResp.json();
          if (u && u.email && ADMIN_EMAILS.includes(u.email)) {
            autorise = true;
            declencheur = 'manuel';
          }
        }
      } catch (e) { /* jeton invalide */ }
    }
  }

  if (!autorise) {
    return new Response(JSON.stringify({ error: 'Non autorise' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const SUPA_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_KEY manquante' }), { status: 500 });
  }

  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json'
  };

  const journal = { declencheur: declencheur, tables: {}, erreurs: [] };

  try {
    // ── 1. Exporter chaque table, par pages de 1000 lignes ──
    const contenu = {
      genereLe: new Date().toISOString(),
      version: 1,
      donnees: {}
    };

    for (const table of TABLES) {
      let lignes = [];
      let depuis = 0;
      for (let page = 0; page < 50; page++) {
        const resp = await fetch(
          SUPA_URL + '/rest/v1/' + table + '?select=*&order=id',
          { headers: Object.assign({}, headers, { 'Range': depuis + '-' + (depuis + PAGE - 1) }) }
        );
        if (!resp.ok) {
          journal.erreurs.push('Table ' + table + ' : HTTP ' + resp.status);
          break;
        }
        const lot = await resp.json();
        if (!Array.isArray(lot) || lot.length === 0) break;
        lignes = lignes.concat(lot);
        if (lot.length < PAGE) break;
        depuis += PAGE;
      }
      contenu.donnees[table] = lignes;
      journal.tables[table] = lignes.length;
    }

    // ── 2. Ecrire la sauvegarde dans le bucket ──
    const maintenant = new Date();
    const jour = maintenant.toISOString().slice(0, 10);
    const chemin = 'lokentia-' + jour + '.json';
    const corps = JSON.stringify(contenu);
    journal.poidsKo = Math.round(corps.length / 1024);

    const upResp = await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + chemin, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        'x-upsert': 'true'
      },
      body: corps
    });
    if (!upResp.ok) {
      const t = await upResp.text();
      return new Response(JSON.stringify({
        error: 'Ecriture de la sauvegarde impossible',
        status: upResp.status,
        details: t.slice(0, 200),
        journal: journal
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    journal.fichier = chemin;

    // ── 3. Purger les sauvegardes de plus de 30 jours ──
    try {
      const listResp = await fetch(SUPA_URL + '/storage/v1/object/list/' + BUCKET, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ prefix: '', limit: 200, sortBy: { column: 'name', order: 'asc' } })
      });
      if (listResp.ok) {
        const fichiers = await listResp.json();
        const limite = new Date(maintenant.getTime() - RETENTION_JOURS * 86400000)
          .toISOString().slice(0, 10);
        const aSupprimer = (fichiers || [])
          .map(f => f && f.name)
          .filter(n => n && n.startsWith('lokentia-') && n.slice(9, 19) < limite);
        if (aSupprimer.length > 0) {
          await fetch(SUPA_URL + '/storage/v1/object/' + BUCKET, {
            method: 'DELETE',
            headers: headers,
            body: JSON.stringify({ prefixes: aSupprimer })
          });
          journal.purgees = aSupprimer.length;
        } else {
          journal.purgees = 0;
        }
      }
    } catch (e) {
      journal.erreurs.push('Purge : ' + String(e && e.message || e));
    }

    return new Response(JSON.stringify({ success: true, journal: journal }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Erreur serveur',
      details: String(e && e.message || e),
      journal: journal
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
