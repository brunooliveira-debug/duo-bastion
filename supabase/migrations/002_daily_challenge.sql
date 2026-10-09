-- DUO BASTION v0.8 — Défi du jour : classement en ligne VALIDÉ PAR LE SERVEUR.
-- À exécuter dans Supabase → SQL Editor (après 001_init.sql ; indépendant de 003).
--
-- Principe : le client n'écrit JAMAIS directement un score. Il envoie le journal de ses commandes à la fonction Edge
-- `submit-daily`, qui rejoue la partie (même graine, même simulation) et enregistre le score qu'elle a calculé
-- elle-même, avec la clé service_role (côté serveur uniquement). Les joueurs (anonymes compris) lisent le classement.
-- Les parties longues sont vérifiées en plusieurs passes : point de reprise dans `daily_pending`.

create table if not exists public.daily_scores (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 16),
  wave int not null check (wave between 1 and 999),
  core_hp int not null check (core_hp between 0 and 100000),
  seconds int not null check (seconds between 0 and 86400),
  updated_at timestamptz not null default now(),
  primary key (day, user_id)
);
create index if not exists daily_scores_rank_idx on public.daily_scores (day, wave desc, seconds asc);

alter table public.daily_scores enable row level security;
-- everybody signed in (anonymous players included) can read the leaderboard; nobody can write through the API
drop policy if exists "daily read" on public.daily_scores;
create policy "daily read" on public.daily_scores for select to authenticated using (true);

-- the old declarative RPC (scores sent by the client) must not exist any more
drop function if exists public.submit_daily(date, text, int, int, int);

-- checkpoints of games being verified (service role only: RLS enabled, no policy)
create table if not exists public.daily_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  day date not null,
  pseudo text not null default 'Joueur',
  log jsonb not null,
  state jsonb not null,
  cursor int not null default 0,
  claim jsonb,
  updated_at timestamptz not null default now()
);
alter table public.daily_pending enable row level security;

-- past leaderboards are not needed: keep the free database tiny (callable by the service role only)
create or replace function public.purge_daily() returns void
language sql security definer set search_path = public as $$
  delete from public.daily_scores where day < (now() at time zone 'utc')::date - 7;
  delete from public.daily_pending where updated_at < now() - interval '15 minutes';
$$;
revoke all on function public.purge_daily() from public, anon, authenticated;
