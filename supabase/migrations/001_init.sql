-- DUO BASTION — initial schema (Supabase Free).
-- Realtime traffic (game sync) uses Broadcast channels, NOT table writes.
-- Postgres only stores: profiles, lobbies (+1 save per wave), history, records.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null default 'Joueur' check (char_length(pseudo) between 1 and 24),
  avatar text not null default '🙂' check (char_length(avatar) <= 8),
  level int not null default 1,
  xp int not null default 0,
  games int not null default 0,
  wins int not null default 0,
  best_survival int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- lobbies
create table if not exists public.lobbies (
  code text primary key check (code ~ '^[A-Z0-9]{5}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'vsai' check (mode in ('vsai', 'survival', 'duel')),
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'playing', 'ended')),
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lobbies_created_idx on public.lobbies (created_at);

create table if not exists public.lobby_players (
  code text not null references public.lobbies(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pseudo text not null default 'Joueur',
  slot int not null check (slot in (0, 1)),
  joined_at timestamptz not null default now(),
  primary key (code, user_id),
  unique (code, slot)
);

alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;

create or replace function public.is_lobby_member(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lobby_players where code = p_code and user_id = auth.uid());
$$;

drop policy if exists "lobbies read members" on public.lobbies;
create policy "lobbies read members" on public.lobbies for select to authenticated using (public.is_lobby_member(code));
drop policy if exists "lobbies update host" on public.lobbies;
create policy "lobbies update host" on public.lobbies for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists "lobbies delete host" on public.lobbies;
create policy "lobbies delete host" on public.lobbies for delete to authenticated using (host_id = auth.uid());
-- inserts only through create_lobby()

drop policy if exists "lobby_players read members" on public.lobby_players;
create policy "lobby_players read members" on public.lobby_players for select to authenticated using (public.is_lobby_member(code));
drop policy if exists "lobby_players leave" on public.lobby_players;
create policy "lobby_players leave" on public.lobby_players for delete to authenticated using (user_id = auth.uid());
-- inserts only through create_lobby() / join_lobby()

-- Server-generated short code (no ambiguous characters). Also purges old lobbies (keeps the free DB tiny).
create or replace function public.create_lobby(p_mode text, p_settings jsonb, p_pseudo text) returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from lobbies where updated_at < now() - interval '2 days';
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from lobbies where code = v_code);
  end loop;
  insert into lobbies (code, host_id, mode, settings) values (v_code, auth.uid(), coalesce(p_mode, 'vsai'), coalesce(p_settings, '{}'::jsonb));
  insert into lobby_players (code, user_id, pseudo, slot) values (v_code, auth.uid(), left(coalesce(nullif(p_pseudo, ''), 'Joueur'), 24), 0);
  return v_code;
end;
$$;

create or replace function public.join_lobby(p_code text, p_pseudo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l lobbies%rowtype;
  n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from lobbies where code = upper(p_code);
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from lobby_players where code = l.code and user_id = auth.uid()) then
    return jsonb_build_object('mode', l.mode, 'settings', l.settings, 'host_id', l.host_id, 'status', l.status);
  end if;
  if l.status = 'ended' then raise exception 'not_found'; end if;
  if l.status = 'playing' then raise exception 'started'; end if;
  select count(*) into n from lobby_players where code = l.code;
  if n >= 2 then raise exception 'full'; end if;
  insert into lobby_players (code, user_id, pseudo, slot) values (l.code, auth.uid(), left(coalesce(nullif(p_pseudo, ''), 'Joueur'), 24), 1);
  update lobbies set updated_at = now() where code = l.code;
  return jsonb_build_object('mode', l.mode, 'settings', l.settings, 'host_id', l.host_id, 'status', l.status);
end;
$$;

revoke all on function public.create_lobby(text, jsonb, text) from public, anon;
revoke all on function public.join_lobby(text, text) from public, anon;
grant execute on function public.create_lobby(text, jsonb, text) to authenticated;
grant execute on function public.join_lobby(text, text) to authenticated;

-- ---------------------------------------------------------------- history & records
create table if not exists public.match_history (
  id bigserial primary key,
  code text,
  mode text not null,
  outcome text not null check (outcome in ('victory', 'defeat')),
  wave int not null,
  player_ids uuid[] not null default '{}',
  names text[] not null default '{}',
  stats jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.match_history enable row level security;
drop policy if exists "history read own" on public.match_history;
create policy "history read own" on public.match_history for select to authenticated using (auth.uid() = any(player_ids) or created_by = auth.uid());
drop policy if exists "history insert host" on public.match_history;
create policy "history insert host" on public.match_history for insert to authenticated
  with check (created_by = auth.uid() and auth.uid() = any(player_ids) and (code is null or exists (select 1 from lobbies where lobbies.code = match_history.code and lobbies.host_id = auth.uid())));

create table if not exists public.duo_records (
  pair_key text primary key,
  user_a uuid not null,
  user_b uuid not null,
  names text not null,
  best_wave int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.duo_records enable row level security;
drop policy if exists "records read" on public.duo_records;
create policy "records read" on public.duo_records for select to authenticated using (true);

create or replace function public.submit_duo_record(p_other uuid, p_names text, p_wave int) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid;
begin
  if auth.uid() is null or p_other is null or p_wave < 0 or p_wave > 1000 then return; end if;
  a := least(auth.uid(), p_other); b := greatest(auth.uid(), p_other);
  insert into duo_records (pair_key, user_a, user_b, names, best_wave)
  values (a::text || ':' || b::text, a, b, left(p_names, 60), p_wave)
  on conflict (pair_key) do update set best_wave = greatest(duo_records.best_wave, excluded.best_wave), names = excluded.names, updated_at = now();
end;
$$;
revoke all on function public.submit_duo_record(uuid, text, int) from public, anon;
grant execute on function public.submit_duo_record(uuid, text, int) to authenticated;
