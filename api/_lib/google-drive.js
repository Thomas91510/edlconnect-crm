// Copie des sauvegardes automatiques du CRM sur Google Drive
// (api/backup-auto.js, déclenchée chaque jour par api/cron-trial.js).
//
// Compte Google « humain » + jeton OAuth (refresh token) de portée
// drive.file : l'application ne voit QUE les fichiers et le dossier qu'elle
// a elle-même créés, jamais le reste du Drive. (Un compte de service n'a pas
// de quota Drive : voir google-service-account.js.)
//
// Variables d'environnement (Vercel) — absentes = étape ignorée :
//   GOOGLE_DRIVE_REFRESH_TOKEN  jeton obtenu une fois (docs/sauvegarde-google-drive.md)
//   GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET (sinon GOOGLE_CLIENT_ID / _SECRET)
//   GOOGLE_DRIVE_FOLDER_ID      facultatif — sinon dossier « Sauvegardes Lokentia CRM » créé
//   GOOGLE_DRIVE_RETENTION_JOURS facultatif — 90 par défaut

export const NOM_DOSSIER_DRIVE = 'Sauvegardes Lokentia CRM';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export function configDrive(env = process.env) {
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN || '';
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '';
  if (!refreshToken || !clientId || !clientSecret) return null;
  const retention = Number(env.GOOGLE_DRIVE_RETENTION_JOURS);
  return {
    refreshToken, clientId, clientSecret,
    dossierId: env.GOOGLE_DRIVE_FOLDER_ID || '',
    retentionJours: Number.isFinite(retention) && retention > 0 ? retention : 90,
  };
}

// Corps multipart/related (métadonnées JSON + contenu) de l'API d'upload.
export function corpsMultipart(metadonnees, contenu, frontiere, typeContenu = 'application/json') {
  return `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadonnees)}\r\n`
    + `--${frontiere}\r\nContent-Type: ${typeContenu}\r\n\r\n${contenu}\r\n--${frontiere}--`;
}

// Fichiers « lokentia-AAAA-MM-JJ.json » antérieurs à la date limite.
export function fichiersAPurger(fichiers, limiteIso) {
  return (fichiers || []).filter(f => {
    const m = /^lokentia-(\d{4}-\d{2}-\d{2})\.json$/.exec((f && f.name) || '');
    return m && m[1] < limiteIso;
  });
}

const echapperRequete = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function jetonAcces(cfg, fetchFn) {
  const r = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken, grant_type: 'refresh_token',
    }).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error('Jeton Google Drive refusé (' + (d.error || r.status) + ')');
  return d.access_token;
}

async function chercher(q, auth, fetchFn) {
  const r = await fetchFn(`${API}?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200&spaces=drive`, { headers: auth });
  if (!r.ok) throw new Error('Recherche Drive impossible (' + r.status + ')');
  return ((await r.json()).files) || [];
}

async function dossierSauvegardes(cfg, auth, fetchFn) {
  if (cfg.dossierId) return cfg.dossierId;
  const existants = await chercher(`name='${echapperRequete(NOM_DOSSIER_DRIVE)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, auth, fetchFn);
  if (existants[0]) return existants[0].id;
  const r = await fetchFn(`${API}?fields=id`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOM_DOSSIER_DRIVE, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!r.ok) throw new Error('Création du dossier Drive impossible (' + r.status + ')');
  return (await r.json()).id;
}

// Dépose (ou remplace, même nom le même jour) la sauvegarde, puis purge
// les copies plus anciennes que la rétention. Lance une exception en cas
// d'échec : l'appelant la consigne dans son journal sans bloquer la
// sauvegarde principale (bucket Supabase).
export async function sauvegarderSurDrive(nom, contenu, cfg, { fetchFn = fetch, maintenant = new Date() } = {}) {
  const auth = { Authorization: 'Bearer ' + await jetonAcces(cfg, fetchFn) };
  const dossierId = await dossierSauvegardes(cfg, auth, fetchFn);
  const existant = (await chercher(`name='${echapperRequete(nom)}' and '${echapperRequete(dossierId)}' in parents and trashed=false`, auth, fetchFn))[0];

  const frontiere = 'lokentia' + maintenant.getTime();
  const meta = existant ? { name: nom } : { name: nom, parents: [dossierId], mimeType: 'application/json' };
  const r = await fetchFn(`${UPLOAD}${existant ? '/' + existant.id : ''}?uploadType=multipart&fields=id,name`, {
    method: existant ? 'PATCH' : 'POST',
    headers: { ...auth, 'Content-Type': 'multipart/related; boundary=' + frontiere },
    body: corpsMultipart(meta, contenu, frontiere),
  });
  if (!r.ok) throw new Error('Envoi vers Google Drive refusé (' + r.status + ')');
  const fichier = await r.json();

  let purges = 0;
  const limite = new Date(maintenant.getTime() - cfg.retentionJours * 86400000).toISOString().slice(0, 10);
  const anciens = fichiersAPurger(await chercher(`'${echapperRequete(dossierId)}' in parents and name contains 'lokentia-' and trashed=false`, auth, fetchFn), limite);
  for (const f of anciens) {
    const d = await fetchFn(`${API}/${encodeURIComponent(f.id)}`, { method: 'DELETE', headers: auth });
    if (d.ok || d.status === 204) purges++;
  }
  return { fichierId: fichier.id, dossierId, remplace: !!existant, purges };
}
