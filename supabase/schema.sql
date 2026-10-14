-- Run once in the SQL Editor of your Supabase Free project.
-- JSON keeps this personal workspace simple and portable. No storage bucket needed.
create table if not exists public.applicator_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint applicator_data_limit check (octet_length(data::text) < 8000000),
  constraint applicator_data_shape check (jsonb_typeof(data) = 'object' and coalesce(data->>'version', '') = '1')
);

alter table public.applicator_workspaces enable row level security;
revoke all on public.applicator_workspaces from anon;
grant select, insert, update, delete on public.applicator_workspaces to authenticated;

drop policy if exists "Read own workspace" on public.applicator_workspaces;
create policy "Read own workspace" on public.applicator_workspaces for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Create own workspace" on public.applicator_workspaces;
create policy "Create own workspace" on public.applicator_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Update own workspace" on public.applicator_workspaces;
create policy "Update own workspace" on public.applicator_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own workspace" on public.applicator_workspaces;
create policy "Delete own workspace" on public.applicator_workspaces for delete to authenticated using ((select auth.uid()) = user_id);
