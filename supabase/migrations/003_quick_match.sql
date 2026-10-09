-- DUO BASTION v0.8 — Partie rapide (salons publics).
-- À exécuter dans Supabase → SQL Editor (après 001_init.sql).
-- Un salon « public » est visible par tous les joueurs connectés (anonymes compris) tant qu'il est ouvert,
-- qu'il lui manque un joueur et que l'hôte a donné signe de vie depuis moins de 2 minutes (battement de cœur).
-- L'appariement se fait côté base (quick_join : verrou ligne, pas de double rejoint).

alter table public.lobbies add column if not exists is_public boolean not null default false;
alter table public.lobbies add column if not exists host_pseudo text not null default 'Joueur';
alter table public.lobbies add column if not exists version text not null default '';
create index if not exists lobbies_public_idx on public.lobbies (is_public, status, updated_at);

-- everybody signed in can see the open public lobbies (never the saved game state: it is null while open)
drop policy if exists "lobbies read public" on public.lobbies;
create policy "lobbies read public" on public.lobbies for select to authenticated
  using (is_public and status = 'open' and updated_at > now() - interval '2 minutes');

-- create_lobby gains two optional parameters (public lobby, client version); the old signature is removed
drop function if exists public.create_lobby(text, jsonb, text);
create or replace function public.create_lobby(p_mode text, p_settings jsonb, p_pseudo text, p_public boolean default false, p_version text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_pseudo text;
  i int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from lobbies where updated_at < now() - interval '2 days';
  -- one open lobby per host: a previous one still open is closed (refresh, back button…)
  update lobbies set status = 'ended', is_public = false where host_id = auth.uid() and status = 'open';
  v_pseudo := left(coalesce(nullif(p_pseudo, ''), 'Joueur'), 24);
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from lobbies where code = v_code);
  end loop;
  insert into lobbies (code, host_id, mode, settings, is_public, host_pseudo, version)
  values (v_code, auth.uid(), coalesce(p_mode, 'vsai'), coalesce(p_settings, '{}'::jsonb), coalesce(p_public, false), v_pseudo, left(coalesce(p_version, ''), 32));
  insert into lobby_players (code, user_id, pseudo, slot) values (v_code, auth.uid(), v_pseudo, 0);
  return v_code;
end;
$$;
revoke all on function public.create_lobby(text, jsonb, text, boolean, text) from public, anon;
grant execute on function public.create_lobby(text, jsonb, text, boolean, text) to authenticated;

-- join_lobby: a lobby that becomes full leaves the public list
create or replace function public.join_lobby(p_code text, p_pseudo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l lobbies%rowtype;
  n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from lobbies where code = upper(p_code) for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from lobby_players where code = l.code and user_id = auth.uid()) then
    return jsonb_build_object('mode', l.mode, 'settings', l.settings, 'host_id', l.host_id, 'status', l.status);
  end if;
  if l.status = 'ended' then raise exception 'not_found'; end if;
  if l.status = 'playing' then raise exception 'started'; end if;
  select count(*) into n from lobby_players where code = l.code;
  if n >= 2 then raise exception 'full'; end if;
  insert into lobby_players (code, user_id, pseudo, slot) values (l.code, auth.uid(), left(coalesce(nullif(p_pseudo, ''), 'Joueur'), 24), 1);
  update lobbies set updated_at = now(), is_public = false where code = l.code;
  return jsonb_build_object('mode', l.mode, 'settings', l.settings, 'host_id', l.host_id, 'status', l.status);
end;
$$;

-- Partie rapide: joins the oldest open public lobby of the same game version (same mode first), atomically.
-- Returns null when nobody is waiting (the caller then hosts a public lobby itself).
create or replace function public.quick_join(p_pseudo text, p_mode text, p_version text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l lobbies%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into l from lobbies
    where is_public and status = 'open' and host_id <> auth.uid()
      and updated_at > now() - interval '2 minutes'
      and version = coalesce(p_version, '')
      and (select count(*) from lobby_players lp where lp.code = lobbies.code) < 2
      and not exists (select 1 from lobby_players lp where lp.code = lobbies.code and lp.user_id = auth.uid())
    order by (mode = coalesce(p_mode, mode)) desc, created_at asc
    limit 1
    for update skip locked;
  if not found then return null; end if;
  insert into lobby_players (code, user_id, pseudo, slot) values (l.code, auth.uid(), left(coalesce(nullif(p_pseudo, ''), 'Joueur'), 24), 1);
  update lobbies set updated_at = now(), is_public = false where code = l.code;
  return jsonb_build_object('code', l.code, 'mode', l.mode, 'settings', l.settings, 'host_id', l.host_id);
end;
$$;
revoke all on function public.quick_join(text, text, text) from public, anon;
grant execute on function public.quick_join(text, text, text) to authenticated;

-- The host frees the guest slot when its partner leaves the lobby (the guest's own row can also be deleted by the guest).
create or replace function public.free_slot(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from lobby_players where code = upper(p_code) and slot = 1
    and exists (select 1 from lobbies where lobbies.code = upper(p_code) and lobbies.host_id = auth.uid() and lobbies.status = 'open');
end;
$$;
revoke all on function public.free_slot(text) from public, anon;
grant execute on function public.free_slot(text) to authenticated;
