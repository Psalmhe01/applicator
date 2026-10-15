-- Run in Supabase SQL Editor. Safe to rerun; existing workspace data is retained.
create table if not exists public.applicator_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,updated_at timestamptz not null default now(),
 constraint applicator_data_limit check(octet_length(data::text)<8000000),
 constraint applicator_data_shape check(jsonb_typeof(data)='object' and coalesce(data->>'version','')='1')
);
alter table public.applicator_workspaces add column if not exists revision bigint not null default 0;
-- Private membership and platform configuration: browsers have no direct table access.
create table if not exists public.applicator_members (
 email text primary key check(email=lower(email)),user_id uuid unique references auth.users(id) on delete set null,
 role text not null default 'member' check(role in ('admin','member')),active boolean not null default true,
 invite_digest text unique,expires_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.applicator_settings(id boolean primary key default true check(id),settings jsonb not null default '{}');
insert into public.applicator_settings(id) values(true) on conflict do nothing;
create table if not exists public.applicator_usage(user_id uuid not null references auth.users(id) on delete cascade,day date not null,ai_calls integer not null default 0,primary key(user_id,day));
create table if not exists public.applicator_search_cache(cache_key text primary key,data jsonb not null,expires_at timestamptz not null);
create table if not exists public.applicator_provider_usage(period text primary key,calls integer not null default 0);
alter table public.applicator_workspaces enable row level security;
alter table public.applicator_members enable row level security;
alter table public.applicator_settings enable row level security;
alter table public.applicator_usage enable row level security;
alter table public.applicator_search_cache enable row level security;
alter table public.applicator_provider_usage enable row level security;
revoke all on public.applicator_provider_usage from anon,authenticated;
grant all on public.applicator_provider_usage to service_role;
revoke all on public.applicator_workspaces,public.applicator_members,public.applicator_settings,public.applicator_usage,public.applicator_search_cache from anon,authenticated;
grant select on public.applicator_workspaces to authenticated;
grant all on public.applicator_workspaces,public.applicator_members,public.applicator_settings,public.applicator_usage,public.applicator_search_cache to service_role;
create or replace function public.applicator_is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.applicator_members where user_id=(select auth.uid()) and active);
$$;
revoke all on function public.applicator_is_member() from public,anon;
grant execute on function public.applicator_is_member() to authenticated;
drop policy if exists "Read own workspace" on public.applicator_workspaces;
drop policy if exists "Create own workspace" on public.applicator_workspaces;
drop policy if exists "Update own workspace" on public.applicator_workspaces;
drop policy if exists "Delete own workspace" on public.applicator_workspaces;
create policy "Read own workspace" on public.applicator_workspaces for select to authenticated using((select auth.uid())=user_id and (select public.applicator_is_member()));
-- Compare-and-swap revisions reject stale device saves without erasing either version.
create or replace function public.applicator_save_workspace(p_user_id uuid,p_data jsonb,p_revision bigint) returns bigint
 language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 if not exists(select 1 from public.applicator_members where user_id=p_user_id and active) then raise exception 'Membership required' using errcode='42501'; end if;
 update public.applicator_workspaces set data=p_data,revision=revision+1,updated_at=now() where user_id=p_user_id and revision=p_revision returning revision into result;
 if result is null and p_revision=0 then
  insert into public.applicator_workspaces(user_id,data,revision) values(p_user_id,p_data,1) on conflict do nothing returning revision into result;
 end if;
 -- A stale edit is an HTTP conflict, not a retryable database serialization failure.
 if result is null then raise exception 'Workspace conflict' using errcode='PT409'; end if;
 return result;
end;
$$;
-- Lock the invitation row before claiming it; a token is bound to its invited email and works once.
create or replace function public.applicator_accept_invitation(p_digest text,p_user_id uuid,p_email text) returns void
 language plpgsql security definer set search_path='' as $$
declare invite public.applicator_members%rowtype;
begin
 select * into invite from public.applicator_members where invite_digest=p_digest for update;
 if not found or not invite.active or invite.expires_at is null or invite.expires_at<now() or invite.user_id is not null or invite.email<>lower(p_email) then raise exception 'Invalid invitation' using errcode='42501'; end if;
 update public.applicator_members set user_id=p_user_id,invite_digest=null,expires_at=null where email=invite.email;
end;
$$;
-- A shared transaction lock prevents concurrent users from exceeding the daily AI allowance.
create or replace function public.applicator_reserve_ai(p_user_id uuid,p_user_limit integer,p_global_limit integer) returns boolean
 language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'UTC')::date; used integer; total integer;
begin
 perform pg_advisory_xact_lock(918374);
 if not exists(select 1 from public.applicator_members where user_id=p_user_id and active) then raise exception 'Membership required' using errcode='42501'; end if;
 delete from public.applicator_usage where day<today-31;
 select coalesce(sum(ai_calls),0)::integer into total from public.applicator_usage where day=today;
 select ai_calls into used from public.applicator_usage where user_id=p_user_id and day=today;
 if coalesce(used,0)>=p_user_limit or total>=p_global_limit then return false; end if;
 insert into public.applicator_usage(user_id,day,ai_calls) values(p_user_id,today,1) on conflict(user_id,day) do update set ai_calls=public.applicator_usage.ai_calls+1;
 return true;
end;
$$;
revoke all on function public.applicator_save_workspace(uuid,jsonb,bigint),public.applicator_accept_invitation(text,uuid,text),public.applicator_reserve_ai(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.applicator_save_workspace(uuid,jsonb,bigint),public.applicator_accept_invitation(text,uuid,text),public.applicator_reserve_ai(uuid,integer,integer) to service_role;
-- Stay below the provider default minute/day/week/month limits across serverless instances.
create or replace function public.applicator_reserve_search() returns boolean language plpgsql security definer set search_path='' as $$
declare stamp timestamptz:=now() at time zone 'UTC'; periods text[]; caps integer[]:=array[20,200,800,2000]; i integer; used integer;
begin
 perform pg_advisory_xact_lock(918375);
 periods:=array['minute:'||to_char(stamp,'YYYY-MM-DD HH24:MI'),'day:'||to_char(stamp,'YYYY-MM-DD'),'week:'||to_char(stamp,'IYYY-IW'),'month:'||to_char(stamp,'YYYY-MM')];
 for i in 1..4 loop
  select calls into used from public.applicator_provider_usage where period=periods[i];
  if coalesce(used,0)>=caps[i] then return false; end if;
 end loop;
 for i in 1..4 loop
  insert into public.applicator_provider_usage(period,calls) values(periods[i],1) on conflict(period) do update set calls=public.applicator_provider_usage.calls+1;
 end loop;
 delete from public.applicator_provider_usage where period like 'minute:%' and period<>periods[1];
 return true;
end;
$$;
revoke all on function public.applicator_reserve_search() from public,anon,authenticated;
grant execute on function public.applicator_reserve_search() to service_role;
