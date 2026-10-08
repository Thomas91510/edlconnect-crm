-- ═══════════════════════════════════════════════════════════════════════
-- Équipe & droits (refonte V2) — BROUILLON, NON APPLIQUÉ
-- ═══════════════════════════════════════════════════════════════════════
-- À NE PAS exécuter sur la base de production avant validation de la V1.
-- À tester d'abord sur une branche Supabase ou un projet de test.
--
-- Objectif : permettre à un titulaire de compte (administrateur) d'inviter
-- une assistante qui se connecte avec SON PROPRE compte et accède aux
-- données du titulaire selon les droits qu'il lui accorde.
--
-- Principes :
--   * les politiques existantes (user_id = auth.uid()) ne sont pas touchées :
--     on AJOUTE des politiques permissives pour les membres ;
--   * un membre n'accède à rien sans double authentification validée dans
--     la session (aal2) — la 2FA devient obligatoire pour l'équipe ;
--   * les droits « réservés à l'administrateur » (utilisateurs, export,
--     intégrations…) ne sont jamais accordés par ces politiques.
--
-- Reste à faire côté application (non inclus) : utiliser l'identifiant du
-- titulaire (et non celui de l'assistante) dans les requêtes .eq('user_id')
-- de js/app-cloud.js et dans les fonctions /api qui résolvent le compte.

create table if not exists public.equipe_membres (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  membre_id    uuid references auth.users(id) on delete cascade,
  invite_email text not null,
  role         text not null default 'assistante' check (role in ('assistante')),
  droits       jsonb not null default '{
    "reservations": true, "missions": true, "facturation": true, "ca": false,
    "clients": true, "fusion": false, "prospection": false, "emails": true,
    "campagnes": false, "agents": false, "reglages": false, "export": false
  }'::jsonb,
  statut       text not null default 'invitee' check (statut in ('invitee','active','revoquee')),
  created_at   timestamptz not null default now(),
  unique (owner_id, invite_email)
);

alter table public.equipe_membres enable row level security;

-- Le titulaire gère son équipe ; le membre lit sa propre ligne.
create policy equipe_titulaire_gere on public.equipe_membres
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy equipe_membre_lit on public.equipe_membres
  for select using (membre_id = auth.uid());

-- Vrai si l'utilisateur connecté est un membre actif de l'équipe de
-- p_owner, avec le droit demandé, ET une session en double authentification.
create or replace function public.membre_a_droit(p_owner uuid, p_droit text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (
       select 1 from public.equipe_membres m
        where m.owner_id = p_owner
          and m.membre_id = auth.uid()
          and m.statut = 'active'
          and coalesce((m.droits ->> p_droit)::boolean, false)
     );
$$;

-- Politiques additionnelles par table (lecture + écriture selon le droit).
create policy membre_missions on public.missions for all
  using (public.membre_a_droit(user_id, 'missions'))
  with check (public.membre_a_droit(user_id, 'missions'));
create policy membre_rdvs on public.rdvs for all
  using (public.membre_a_droit(user_id, 'missions'))
  with check (public.membre_a_droit(user_id, 'missions'));
create policy membre_contacts on public.contacts for all
  using (public.membre_a_droit(user_id, 'clients'))
  with check (public.membre_a_droit(user_id, 'clients'));
create policy membre_prospects on public.prospects for all
  using (public.membre_a_droit(user_id, 'prospection'))
  with check (public.membre_a_droit(user_id, 'prospection'));
create policy membre_trackings on public.trackings for all
  using (public.membre_a_droit(user_id, 'emails'))
  with check (public.membre_a_droit(user_id, 'emails'));
create policy membre_campagnes on public.campagnes for all
  using (public.membre_a_droit(user_id, 'campagnes'))
  with check (public.membre_a_droit(user_id, 'campagnes'));
create policy membre_invoices on public.invoices for all
  using (public.membre_a_droit(user_id, 'facturation'))
  with check (public.membre_a_droit(user_id, 'facturation'));
-- Réglages : lecture seule pour l'assistante (identité des emails, agents
-- nécessaires aux confirmations de RDV) ; modification réservée au titulaire.
create policy membre_settings_lecture on public.settings for select
  using (public.membre_a_droit(user_id, 'missions'));
