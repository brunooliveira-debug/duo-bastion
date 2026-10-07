-- DUO BASTION — Défi du jour (classement). PRÉPARÉ, NON APPLIQUÉ.
-- À exécuter dans Supabase → SQL Editor quand le classement en ligne sera activé.
-- Le jeu fonctionne sans : les records du défi du jour sont gardés localement.
-- Free tier : une ligne par joueur et par jour (meilleur score), lecture publique, écriture via RPC contrôlée.

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

alter table public.daily_scores enable row level security;

-- everybody (signed in, including anonymous players) can read the leaderboard
create policy "daily read" on public.daily_scores for select to authenticated using (true);
-- no direct insert / update: only through the function below (keeps the best score, validates the day)

create or replace function public.submit_daily(p_day date, p_pseudo text, p_wave int, p_core_hp int, p_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- only today's (or yesterday's, for players around midnight) challenge
  if p_day < (now() at time zone 'utc')::date - 1 or p_day > (now() at time zone 'utc')::date then raise exception 'bad_day'; end if;
  insert into public.daily_scores (day, user_id, pseudo, wave, core_hp, seconds)
  values (p_day, auth.uid(), left(p_pseudo, 16), p_wave, p_core_hp, p_seconds)
  on conflict (day, user_id) do update
    set pseudo = excluded.pseudo, wave = excluded.wave, core_hp = excluded.core_hp, seconds = excluded.seconds, updated_at = now()
    where excluded.wave > daily_scores.wave
       or (excluded.wave = daily_scores.wave and excluded.core_hp > daily_scores.core_hp);
end;
$$;

revoke all on function public.submit_daily(date, text, int, int, int) from public;
grant execute on function public.submit_daily(date, text, int, int, int) to authenticated;

-- Remarque : un score envoyé par le client reste déclaratif (le jeu solo tourne sur l'appareil du joueur).
-- Pour un classement compétitif, rejouer côté serveur le journal déterministe (graine + commandes) — piste v0.5.
