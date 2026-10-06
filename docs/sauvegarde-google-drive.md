# Sauvegarde automatique du CRM sur Google Drive

Chaque nuit, `api/backup-auto.js` (appelée par le cron quotidien
`api/cron-trial.js`) exporte toutes les tables du CRM dans
`lokentia-AAAA-MM-JJ.json` :

1. dans le bucket Supabase privé `sauvegardes` (30 jours) — inchangé ;
2. **en plus**, si c'est configuré, dans un dossier Google Drive
   « Sauvegardes Lokentia CRM » (90 jours par défaut).

Un échec côté Drive est noté dans le journal de la sauvegarde mais n'annule
jamais la sauvegarde Supabase.

## Mise en place (une seule fois, ~5 minutes)

L'accès utilise la portée `drive.file` : l'application ne voit que les
fichiers et le dossier qu'elle a créés, jamais le reste du Drive.

1. Google Cloud Console → projet déjà utilisé pour Google Agenda →
   *API et services* → activer **Google Drive API**.
2. *Identifiants* → client OAuth « Application Web » existant (celui de
   `GOOGLE_CLIENT_ID`) → ajouter l'URI de redirection
   `https://developers.google.com/oauthplayground`.
3. Ouvrir <https://developers.google.com/oauthplayground> → roue crantée →
   *Use your own OAuth credentials* → coller l'ID et le secret du client.
4. Étape 1 : saisir la portée `https://www.googleapis.com/auth/drive.file`
   → *Authorize APIs* → se connecter avec le compte Google qui doit recevoir
   les sauvegardes (ex. contact@edl-idf.com).
5. Étape 2 : *Exchange authorization code for tokens* → copier le
   **Refresh token**.
6. Vercel → projet → *Settings › Environment Variables* (Production
   uniquement) :

| Variable | Valeur |
| --- | --- |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | le refresh token copié |
| `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` | facultatif — sinon `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| `GOOGLE_DRIVE_FOLDER_ID` | facultatif — sinon le dossier est créé automatiquement |
| `GOOGLE_DRIVE_RETENTION_JOURS` | facultatif — 90 par défaut |

Pour vérifier : lancer une sauvegarde manuelle (compte administrateur) ; la
réponse contient `journal.drive.fichierId`, et le fichier apparaît dans le
dossier « Sauvegardes Lokentia CRM » du Drive.

Si l'application OAuth est en mode « Test » dans Google Cloud, le refresh
token expire au bout de 7 jours : la passer en « Production » (aucune
validation Google n'est nécessaire pour la portée `drive.file`).
