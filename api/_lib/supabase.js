// Constantes Supabase partagées par toutes les fonctions api/*.js.
//
// Un fichier/dossier commençant par "_" n'est jamais déployé comme fonction
// Vercel à part entière — il peut seulement être importé par les autres
// fichiers du dossier api/. C'est le mécanisme documenté par Vercel pour
// partager du code entre Edge/Serverless Functions sans créer de route.
//
// La clé "anon" Supabase est publique par conception (elle est de toute
// façon envoyée au navigateur côté client, cf. js/app-cloud.js) — la
// centraliser ici ne change rien à sa confidentialité, mais évite d'avoir
// à modifier une quinzaine de fichiers un par un en cas de rotation.
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pvuctwflxvvxdawsxceu.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dWN0d2ZseHZ2eGRhd3N4Y2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MjgyMjcsImV4cCI6MjA5NzQwNDIyN30.ged0FhO2mPW-FRWdL0r5_fOInMqzZnTC0YRuUOqQ7ic';
